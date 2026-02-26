import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const importRoutes = new Hono<HonoEnv>();

interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  category: string;
  propertyCode?: string;
  tenantName?: string;
  reference?: string;
}

/** Parse a CSV line respecting quoted fields (RFC 4180) */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

export function parseTurboTenantCSV(csv: string): ParsedTransaction[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase());
  const rows: ParsedTransaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });

    rows.push({
      date: row.date || '',
      description: row.description || '',
      amount: parseFloat(row.amount || '0'),
      category: row.category || 'uncategorized',
      propertyCode: row.property_code || row.propertycode || undefined,
      tenantName: row.tenant_name || row.tenantname || undefined,
      reference: row.reference || undefined,
    });
  }

  return rows.filter((r) => r.date && !isNaN(r.amount));
}

/** SHA-256 based deduplication hash (async, Web Crypto API) */
export async function deduplicationHash(date: string, amount: number, description: string): Promise<string> {
  const key = `${date}|${amount}|${description}`;
  const data = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  const hex = Array.from(hashArray).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `tt-${hex.slice(0, 16)}`;
}

// POST /api/import/turbotenant — import TurboTenant CSV ledger
// Requires X-Account-ID header or ?accountId query param to specify the target account
importRoutes.post('/api/import/turbotenant', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  const accountId = c.req.header('X-Account-ID') || c.req.query('accountId');
  if (!accountId) {
    return c.json({ error: 'accountId is required (X-Account-ID header or ?accountId query param)' }, 400);
  }

  // Verify the account exists and belongs to this tenant
  const account = await storage.getAccount(accountId, tenantId);
  if (!account) {
    return c.json({ error: 'Account not found or does not belong to this tenant' }, 404);
  }

  const body = await c.req.text();
  const parsed = parseTurboTenantCSV(body);

  if (parsed.length === 0) {
    return c.json({ error: 'No valid transactions found in CSV' }, 400);
  }

  const properties = await storage.getProperties(tenantId);

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of parsed) {
    const externalId = await deduplicationHash(row.date, row.amount, row.description);

    // Check for duplicate via storage abstraction
    const existing = await storage.getTransactionByExternalId(externalId, tenantId);
    if (existing) {
      skipped++;
      continue;
    }

    // Match property by code or name pattern
    const matchedProperty = properties.find((p: any) =>
      (row.propertyCode && p.metadata?.code === row.propertyCode) ||
      row.description.toLowerCase().includes(p.name.toLowerCase()),
    );

    try {
      await storage.createTransaction({
        tenantId,
        accountId,
        amount: String(row.amount),
        type: row.amount >= 0 ? 'income' : 'expense',
        category: row.category,
        description: row.description,
        date: new Date(row.date),
        payee: row.tenantName || null,
        propertyId: matchedProperty?.id || null,
        externalId,
        metadata: { source: 'turbotenant', reference: row.reference },
      });
      imported++;
    } catch (err) {
      errors.push(`Row ${row.date} ${row.description}: ${(err as Error).message}`);
    }
  }

  const status = imported > 0 ? 200 : 422;
  return c.json({ parsed: parsed.length, imported, skipped, errors }, status);
});

// POST /api/import/wave-sync — sync Wave transactions
importRoutes.post('/api/import/wave-sync', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  if (!c.env.WAVE_CLIENT_ID || !c.env.WAVE_CLIENT_SECRET) {
    return c.json({ error: 'Wave integration is not configured on this server' }, 503);
  }

  const integrations = await storage.getIntegrations(tenantId);
  const waveIntegration = integrations.find((i: any) => i.serviceType === 'wavapps' && i.connected);

  if (!waveIntegration) {
    return c.json({ error: 'Wave integration not connected' }, 400);
  }

  const { WaveAPIClient } = await import('../lib/wave-api');
  const creds = waveIntegration.credentials as any;

  if (!creds?.access_token) {
    return c.json({ error: 'Wave credentials missing access token — re-authorize the integration' }, 400);
  }

  const client = new WaveAPIClient({
    clientId: c.env.WAVE_CLIENT_ID,
    clientSecret: c.env.WAVE_CLIENT_SECRET,
    redirectUri: '',
  });
  client.setAccessToken(creds.access_token);

  try {
    const businesses = await client.getBusinesses();
    if (businesses.length === 0) {
      return c.json({ error: 'No Wave businesses found' }, 400);
    }

    const business = businesses[0];
    const invoices = await client.getInvoices(business.id);

    return c.json({
      business: business.name,
      invoiceCount: invoices.length,
      message: 'Wave sync completed. Transaction import from invoices is pending full implementation.',
    });
  } catch (err) {
    return c.json({ error: `Wave sync failed: ${(err as Error).message}` }, 502);
  }
});
