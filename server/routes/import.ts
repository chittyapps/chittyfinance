import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { ledgerLog } from '../lib/ledger-client';
import { findAccountCode } from '../../database/chart-of-accounts';

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

// ═══════════════════════════════════════════════════════════════
// HD Pro Job Name → Tenant Entity Normalization
// ═══════════════════════════════════════════════════════════════

/** Canonical entity keys matching tenant slugs or property names */
type EntityKey =
  | 'aribia-mgmt'
  | 'city-studio'
  | 'apt-arlene'
  | 'cozy-castle'    // 550 W Surf 504
  | 'lakeside-loft'  // 541 W Addison 3S
  | 'villa-vista'    // renovation project
  | 'personal-nick'  // personal/non-entity purchases
  | 'colombia'       // Alejandro Arias / Morada Mami
  | 'surf-504'       // alias for Cozy Castle
  | 'addison'        // alias for Lakeside Loft
  | 'chitty-consumables'
  | 'chitty-furnishings'
  | 'chitty-tools'
  | 'suspense';      // untagged or junk

/**
 * Map HD Pro "Job Name" values (case-insensitive) to canonical entity keys.
 * Handles typos, abbreviations, and concatenation errors from the Pro account.
 */
const HD_JOB_NAME_MAP: Record<string, EntityKey> = {
  // ARIBIA MGMT — general management entity
  'aribia mgmt': 'aribia-mgmt',

  // CITY STUDIO — 550 W Surf C211
  'city studio': 'city-studio',

  // APT ARLENE — 4343 N Clarendon 1610
  'apt arlene': 'apt-arlene',

  // COZY CASTLE — 550 W Surf 504 (includes all renovation variants)
  'cozy castle': 'cozy-castle',
  'cozy renovation': 'cozy-castle',
  'cozy reno': 'cozy-castle',
  'cozy castle reno': 'cozy-castle',
  'cozy renocozy renovation': 'cozy-castle',  // concatenation typo
  'cozy rrenovation': 'cozy-castle',           // double-r typo

  // LAKESIDE LOFT — 541 W Addison 3S
  'lakeside loft': 'lakeside-loft',
  'addison': 'lakeside-loft',  // store vicinity alias

  // VILLA VISTA — renovation project (no matching tenant yet)
  'villa vista remodel': 'villa-vista',
  'villa vista remo': 'villa-vista',
  'villa vista': 'villa-vista',

  // SURF 504 — alias for Cozy Castle
  'surf 504': 'cozy-castle',

  // Colombia / Arias
  'alejandro arias': 'colombia',

  // Chitty operational categories
  'chitty consumables': 'chitty-consumables',
  'chitty furnishings': 'chitty-furnishings',
  'chitty tools': 'chitty-tools',

  // Personal
  'personal': 'personal-nick',
  'nick': 'personal-nick',
};

/** Junk values that should always go to suspense */
const HD_JUNK_JOB_NAMES = new Set(['0', '00']);

/**
 * Normalize an HD Pro Job Name to a canonical entity key.
 * Returns 'suspense' for blank, junk, or unknown values.
 */
export function normalizeHDJobName(raw: string): EntityKey {
  const trimmed = raw.trim();
  if (!trimmed || HD_JUNK_JOB_NAMES.has(trimmed)) return 'suspense';
  const key = trimmed.toLowerCase();
  return HD_JOB_NAME_MAP[key] ?? 'suspense';
}

// ═══════════════════════════════════════════════════════════════
// HD Pro Department/Class → COA Code Classification
// ═══════════════════════════════════════════════════════════════

/**
 * Map HD Pro Department Name to COA code.
 * Falls back to Class, then Subclass, then SKU description keywords.
 */
const HD_DEPARTMENT_COA: Record<string, string> = {
  // Repairs & maintenance materials
  'hardware': '5070',
  'plumbing': '5070',
  'electrical': '5070',
  'building materials': '5070',
  'doors & windows': '5070',
  'millwork': '5070',
  'lumber': '5070',

  // Paint & finishing — repairs
  'paint': '5070',

  // Flooring & surfaces — repairs unless full reno (manual override)
  'wall&floor cover.': '5070',
  'flooring': '5070',

  // Cleaning & maintenance
  'cleaning': '5020',

  // Supplies
  'tools': '5080',
  'storage & organization': '5080',
  'outdoor living': '5080',
  'holiday': '5080',

  // Appliances — capital improvement
  'appliances': '7030',

  // HVAC
  'heating & cooling': '7010',

  // Kitchen & Bath — repairs unless full remodel
  'kitchen': '5070',
  'bath': '5070',

  // Garden / Landscaping
  'garden center': '5080',
  'garden': '5080',
  'nursery': '5080',
};

/** More specific class-level overrides */
const HD_CLASS_COA: Record<string, string> = {
  'light bulbs': '5080',
  'cleaning products': '5020',
  'janitorial': '5020',
  'trash bags': '5020',
  'pest control': '5020',
  'air filters': '5080',
  'smoke detectors': '5070',
  'door locks': '5070',
  'organization': '5080',
};

/**
 * Classify an HD Pro line item to a COA code using department hierarchy.
 */
export function classifyHDProItem(
  department: string,
  className: string,
  subclass: string,
  description: string,
): { code: string; confidence: number } {
  const deptLower = department.toLowerCase().trim();
  const classLower = className.toLowerCase().trim();

  // Check class-level overrides first (more specific)
  for (const [key, code] of Object.entries(HD_CLASS_COA)) {
    if (classLower.includes(key)) {
      return { code, confidence: 0.800 };
    }
  }

  // Department-level mapping
  const deptCode = HD_DEPARTMENT_COA[deptLower];
  if (deptCode) {
    return { code: deptCode, confidence: 0.750 };
  }

  // Fall back to keyword matching from existing findAccountCode
  const fallback = findAccountCode(description, department);
  if (fallback !== '9010') {
    return { code: fallback, confidence: 0.600 };
  }

  // Suspense
  return { code: '9010', confidence: 0.100 };
}

// ═══════════════════════════════════════════════════════════════
// HD Pro CSV Parser
// ═══════════════════════════════════════════════════════════════

interface HDProRow {
  date: string;
  storeNumber: string;
  transactionId: string;
  registerNumber: string;
  jobName: string;
  skuNumber: string;
  skuDescription: string;
  quantity: number;
  unitPrice: number;
  departmentName: string;
  className: string;
  subclassName: string;
  programDiscountAmount: number;
  otherDiscountAmount: number;
  extendedRetail: number;
  netUnitPrice: number;
  internetSku: string;
  purchaser: string;
  orderNumber: string;
  invoiceNumber: string;
}

/**
 * Parse HD Pro Purchase History CSV.
 * HD Pro CSVs have 6 metadata rows (company, phone, source, date range, export date, blank)
 * followed by the actual header + data rows. Encoding is latin-1.
 */
export function parseHDProCSV(csv: string): HDProRow[] {
  // Normalize line endings
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Find the header row (starts with "Date,Store Number,Transaction ID")
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    if (lines[i].startsWith('Date,Store Number,Transaction ID')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const dataLines = lines.slice(headerIdx + 1).filter((l) => l.trim().length > 0);
  const rows: HDProRow[] = [];

  for (const line of dataLines) {
    const fields = parseCSVLine(line);
    if (fields.length < 16) continue;

    const parseNum = (s: string) => {
      const cleaned = s.replace(/[$,]/g, '').trim();
      return cleaned ? parseFloat(cleaned) : 0;
    };

    rows.push({
      date: fields[0],
      storeNumber: fields[1],
      transactionId: fields[2],
      registerNumber: fields[3],
      jobName: fields[4],
      skuNumber: fields[5],
      skuDescription: fields[6],
      quantity: parseNum(fields[7]) || 1,
      unitPrice: parseNum(fields[8]),
      departmentName: fields[9] || '',
      className: fields[10] || '',
      subclassName: fields[11] || '',
      programDiscountAmount: parseNum(fields[12]),
      otherDiscountAmount: parseNum(fields[14]),
      extendedRetail: parseNum(fields[15]),
      netUnitPrice: parseNum(fields[16]),
      internetSku: fields[17] || '',
      purchaser: fields[18] || '',
      orderNumber: fields[19] || '',
      invoiceNumber: fields[20] || '',
    });
  }

  return rows;
}

/** SHA-256 dedup hash for HD Pro items (transaction_id + sku + date) */
async function hdproDeduplicationHash(transactionId: string, sku: string, date: string): Promise<string> {
  const key = `hdpro|${transactionId}|${sku}|${date}`;
  const data = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  const hex = Array.from(hashArray).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `hd-${hex.slice(0, 16)}`;
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
      // L0 ingest: auto-suggest COA code via keyword matching
      const suggestedCode = findAccountCode(row.description, row.category);
      const isSuspense = suggestedCode === '9010';

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
        suggestedCoaCode: suggestedCode,
        classificationConfidence: isSuspense ? '0.100' : '0.700',
        metadata: { source: 'turbotenant', reference: row.reference },
      });
      imported++;
    } catch (err) {
      errors.push(`Row ${row.date} ${row.description}: ${(err as Error).message}`);
    }
  }

  ledgerLog(c, {
    entityType: 'audit',
    action: 'import.turbotenant',
    metadata: { tenantId, accountId, parsed: parsed.length, imported, skipped, errorCount: errors.length },
  }, c.env);

  const status = imported > 0 ? 200 : 422;
  return c.json({ parsed: parsed.length, imported, skipped, errors }, status);
});

// POST /api/import/hdpro — import Home Depot Pro Purchase History CSV
// Requires X-Account-ID header or ?accountId query param
importRoutes.post('/api/import/hdpro', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  const accountId = c.req.header('X-Account-ID') || c.req.query('accountId');
  if (!accountId) {
    return c.json({ error: 'accountId is required (X-Account-ID header or ?accountId query param)' }, 400);
  }

  const account = await storage.getAccount(accountId, tenantId);
  if (!account) {
    return c.json({ error: 'Account not found or does not belong to this tenant' }, 404);
  }

  const body = await c.req.text();
  const parsed = parseHDProCSV(body);

  if (parsed.length === 0) {
    return c.json({ error: 'No valid HD Pro transactions found in CSV. Expected header row starting with "Date,Store Number,Transaction ID".' }, 400);
  }

  // Build entity→tenant mapping by loading all tenants the caller can see
  const allTenants = await storage.getTenants();
  const entityTenantMap: Record<EntityKey, string | null> = {
    'aribia-mgmt': null,
    'city-studio': null,
    'apt-arlene': null,
    'cozy-castle': null,
    'lakeside-loft': null,
    'villa-vista': null,
    'personal-nick': null,
    'colombia': null,
    'surf-504': null,
    'addison': null,
    'chitty-consumables': null,
    'chitty-furnishings': null,
    'chitty-tools': null,
    'suspense': null,
  };

  // Match entity keys to tenant IDs by name pattern
  for (const t of allTenants) {
    const name = t.name.toLowerCase();
    if (name.includes('mgmt') || name.includes('management')) entityTenantMap['aribia-mgmt'] = t.id;
    if (name.includes('city studio')) entityTenantMap['city-studio'] = t.id;
    if (name.includes('apt arlene') || name.includes('clarendon')) entityTenantMap['apt-arlene'] = t.id;
    // Cozy Castle / Lakeside Loft are properties, not tenants — they belong to their parent
  }

  // Load properties for entity→property matching
  const properties = await storage.getProperties(tenantId);

  const propertyMap: Record<string, { id: string; tenantId: string }> = {};
  for (const p of properties) {
    const pName = p.name.toLowerCase();
    if (pName.includes('city studio')) propertyMap['city-studio'] = { id: p.id, tenantId: p.tenantId };
    if (pName.includes('arlene') || pName.includes('clarendon')) propertyMap['apt-arlene'] = { id: p.id, tenantId: p.tenantId };
    if (pName.includes('cozy') || pName.includes('surf')) propertyMap['cozy-castle'] = { id: p.id, tenantId: p.tenantId };
    if (pName.includes('lakeside') || pName.includes('addison')) propertyMap['lakeside-loft'] = { id: p.id, tenantId: p.tenantId };
  }

  let imported = 0;
  let skipped = 0;
  let suspenseCount = 0;
  const errors: string[] = [];
  const jobNameStats: Record<string, { count: number; entity: string }> = {};

  for (const row of parsed) {
    // Skip zero-amount or return-only rows
    const amount = row.netUnitPrice || row.extendedRetail || row.unitPrice;
    if (!amount && amount !== 0) continue;

    const externalId = await hdproDeduplicationHash(row.transactionId, row.skuNumber, row.date);
    const existing = await storage.getTransactionByExternalId(externalId, tenantId);
    if (existing) {
      skipped++;
      continue;
    }

    const entityKey = normalizeHDJobName(row.jobName);
    const classification = classifyHDProItem(row.departmentName, row.className, row.subclassName, row.skuDescription);
    const isSuspense = entityKey === 'suspense' || classification.code === '9010';
    if (isSuspense) suspenseCount++;

    // Track job name stats for the response
    const rawJob = row.jobName.trim() || '(blank)';
    if (!jobNameStats[rawJob]) jobNameStats[rawJob] = { count: 0, entity: entityKey };
    jobNameStats[rawJob].count++;

    // Resolve property if applicable
    const prop = propertyMap[entityKey];

    try {
      await storage.createTransaction({
        tenantId,
        accountId,
        amount: String(Math.abs(amount)),
        type: amount >= 0 ? 'expense' : 'income',  // HD Pro purchases are expenses; negative = returns
        category: row.departmentName || 'home_depot',
        description: `HD Pro: ${row.skuDescription}`,
        date: new Date(row.date),
        payee: 'Home Depot',
        propertyId: prop?.id || null,
        externalId,
        suggestedCoaCode: classification.code,
        classificationConfidence: String(isSuspense ? 0.100 : classification.confidence),
        metadata: {
          source: 'hdpro',
          storeNumber: row.storeNumber,
          transactionId: row.transactionId,
          skuNumber: row.skuNumber,
          department: row.departmentName,
          class: row.className,
          subclass: row.subclassName,
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          discounts: row.programDiscountAmount + row.otherDiscountAmount,
          purchaser: row.purchaser,
          invoiceNumber: row.invoiceNumber,
          jobName: row.jobName,
          normalizedEntity: entityKey,
        },
      });
      imported++;
    } catch (err) {
      errors.push(`Row ${row.date} SKU ${row.skuNumber}: ${(err as Error).message}`);
    }
  }

  ledgerLog(c, {
    entityType: 'audit',
    action: 'import.hdpro',
    metadata: {
      tenantId,
      accountId,
      parsed: parsed.length,
      imported,
      skipped,
      suspenseCount,
      errorCount: errors.length,
    },
  }, c.env);

  return c.json({
    parsed: parsed.length,
    imported,
    skipped,
    suspenseCount,
    errors: errors.slice(0, 50),
    jobNameMapping: jobNameStats,
  }, imported > 0 ? 200 : 422);
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
