import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { getLegalPersonChittyId, isLegalPersonChittyId } from '../lib/legal-person-binding';

/**
 * Private ChittyConnect -> ChittyFinance read projection.
 *
 * This surface is reachable only through the Cloudflare service binding used by
 * ChittyConnect. It deliberately does not accept bearer secrets: the binding is
 * the transport boundary, the synthetic "internal" hostname prevents the public
 * finance.chitty.cc route from reaching it, and X-ChittyOS-Caller identifies the
 * owning broker.
 *
 * No writes live here. ChittyFinance remains the financial system of record.
 */
export const internalChittyConnectRoutes = new Hono<HonoEnv>();

internalChittyConnectRoutes.use('/internal/chittyconnect/*', async (c, next) => {
  const hostname = new URL(c.req.url).hostname.toLowerCase();
  const caller = c.req.header('x-chittyos-caller');

  if (hostname !== 'internal' || caller !== 'chittyconnect') {
    return c.json({ error: 'not_found' }, 404);
  }

  await next();
});

/** Return only the account fields needed for finance reconciliation. */
function formatAccount(account: any) {
  return {
    id: account.id,
    tenantId: account.tenantId,
    name: account.name,
    type: account.type,
    institution: account.institution || '',
    balance: Number(account.balance),
    currency: account.currency,
    externalId: account.externalId || undefined,
    isActive: account.isActive,
    metadata: account.metadata || undefined,
    updatedAt: account.updatedAt,
  };
}

/** Preserve provider/source identity and currency in the transaction projection. */
function formatTransaction(tx: any) {
  return {
    id: tx.id,
    tenantId: tx.tenantId,
    accountId: tx.accountId,
    amount: Number(tx.amount),
    currency: tx.currency,
    type: tx.type,
    category: tx.category || undefined,
    description: tx.description,
    date: tx.date,
    payee: tx.payee || undefined,
    reconciled: tx.reconciled,
    externalId: tx.externalId || undefined,
    metadata: tx.metadata || undefined,
  };
}

type TenantResolution =
  | { ok: true; tenant: any }
  | { ok: false; error: 'not_found' | 'ambiguous' };

/**
 * Resolve tenant references deterministically: UUID first, then unique slug, then
 * unique exact name. Ambiguous names fail closed instead of choosing a row.
 */
async function resolveTenant(storage: any, reference: string): Promise<TenantResolution> {
  const tenants = await storage.getTenants();
  const raw = reference.trim();
  const normalized = raw.toLowerCase();

  const byId = tenants.filter((tenant: any) => tenant.id === raw);
  if (byId.length === 1) return { ok: true, tenant: byId[0] };

  const bySlug = tenants.filter(
    (tenant: any) => String(tenant.slug || '').trim().toLowerCase() === normalized,
  );
  if (bySlug.length === 1) return { ok: true, tenant: bySlug[0] };
  if (bySlug.length > 1) return { ok: false, error: 'ambiguous' };

  const byName = tenants.filter(
    (tenant: any) => String(tenant.name || '').trim().toLowerCase() === normalized,
  );
  if (byName.length === 1) return { ok: true, tenant: byName[0] };
  if (byName.length > 1) return { ok: false, error: 'ambiguous' };

  return { ok: false, error: 'not_found' };
}

type WindowBounds = { startDateIso?: string; endDateExclusiveIso?: string };

/** Parse and validate a reconciliation window without silently normalizing bad dates. */
function parseWindow(start?: string, end?: string): WindowBounds {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

  const parseBound = (value: string, endBound: boolean) => {
    if (dateOnly.test(value)) {
      const ms = Date.parse(`${value}T00:00:00.000Z`);
      if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) {
        throw new Error(`invalid date: ${value}`);
      }
      return new Date(ms + (endBound ? 86_400_000 : 0)).toISOString();
    }

    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) throw new Error(`invalid date: ${value}`);
    // Existing semantics made an explicit timestamp inclusive. Represent that
    // as an exclusive bound one millisecond later for the SQL query.
    return new Date(ms + (endBound ? 1 : 0)).toISOString();
  };

  const startDateIso = start ? parseBound(start, false) : undefined;
  const endDateExclusiveIso = end ? parseBound(end, true) : undefined;

  if (startDateIso && endDateExclusiveIso && Date.parse(startDateIso) >= Date.parse(endDateExclusiveIso)) {
    throw new Error('start must be before or equal to end');
  }

  return { startDateIso, endDateExclusiveIso };
}

/** Parse bounded offset pagination for the private transaction projection. */
function parsePage(limitRaw?: string, offsetRaw?: string) {
  const limit = limitRaw === undefined ? 200 : Number(limitRaw);
  const offset = offsetRaw === undefined ? 0 : Number(offsetRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('limit must be an integer from 1 to 500');
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error('offset must be a non-negative integer');
  }
  return { limit, offset };
}

/** Translate tenant resolution failures into non-enumerating internal responses. */
function tenantError(error: 'not_found' | 'ambiguous') {
  return error === 'ambiguous'
    ? { body: { error: 'entity_ambiguous' }, status: 409 as const }
    : { body: { error: 'entity_not_found' }, status: 404 as const };
}

// System-mode projection used by ChittyConnect to resolve canonical tenant and
// financial-account bindings before reconciliation. Read-only by design.
/**
 * Globally resolve a Mercury transaction's existing owner in ChittyFinance.
 * A shared DBA or technical tenant partition must never establish identity.
 * Only the private ChittyConnect service-binding caller can use this route.
 * A null owner means an authoritative complete read found zero matches.
 * Storage errors and duplicate ownership fail closed, not as "not found".
 */
internalChittyConnectRoutes.get('/internal/chittyconnect/mercury/source-owner/:sourceIdentity', async (c) => {
  const sourceIdentity = c.req.param('sourceIdentity');
  if (!/^mercury:[A-Za-z0-9-]{1,256}$/.test(sourceIdentity)) {
    return c.json({ error: 'invalid_mercury_source_identity' }, 400);
  }
  let rows: Array<{ tenantId: string; financeAccountId: string }>;
  try {
    rows = await c.get('storage').getTransactionOwnersByExternalId(sourceIdentity);
  } catch {
    return c.json({ error: 'finance_source_owner_query_unavailable' }, 503);
  }
  if (!Array.isArray(rows) || rows.length > 2) {
    return c.json({ error: 'finance_source_owner_coverage_unavailable' }, 503);
  }
  if (rows.length > 1) {
    return c.json({ error: 'finance_duplicate_source_ownership' }, 409);
  }
  const owner = rows[0] ?? null;
  if (owner && (!owner.tenantId?.trim() || !owner.financeAccountId?.trim())) {
    return c.json({ error: 'finance_source_owner_coverage_unavailable' }, 503);
  }
  return c.json({ sourceIdentity, owner });
});

/**
 * Exact Mercury account -> Finance account binding, queried globally.
 *
 * A provider account ID alone cannot prove its organization or legal owner.
 * Require the stored Finance tenant's canonical business identity AND an
 * explicit matching Mercury organization ID in existing account metadata.
 * Never infer a match from a display name, account last four or DBA.
 * This is a read-only preflight; unmatched accounts stay unbound for review.
 */
const mercuryIdentityUuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
internalChittyConnectRoutes.get('/internal/chittyconnect/mercury/account-binding', async (c) => {
  const organizationId = c.req.query('organizationId') || '';
  const externalAccountId = c.req.query('accountId') || '';
  const tenantId = c.req.query('tenantId') || '';
  const canonicalBusinessIdentity = c.req.query('canonicalBusinessIdentity') || '';
  if (!mercuryIdentityUuid.test(organizationId) ||
      !mercuryIdentityUuid.test(externalAccountId) ||
      !mercuryIdentityUuid.test(tenantId) ||
      !canonicalBusinessIdentity.trim() || canonicalBusinessIdentity.length > 200) {
    return c.json({ error: 'invalid_mercury_binding_query' }, 400);
  }

  const storage = c.get('storage');
  try {
    // The tenant UUID is a technical partition, never proof of the owner.
    // Require its explicitly governed canonical identity in existing metadata;
    // a human-editable tenant display name is never binding evidence.
    const tenant = await storage.getTenant(tenantId);
    if (!tenant || tenant.isActive !== true) {
      return c.json({ error: 'finance_tenant_identity_conflict' }, 409);
    }
    const tenantMetadata = tenant.metadata as Record<string, unknown> | null;
    if (!tenantMetadata || typeof tenantMetadata !== 'object' ||
        Array.isArray(tenantMetadata) ||
        tenantMetadata.canonicalBusinessIdentity !== canonicalBusinessIdentity) {
      return c.json({ error: 'finance_tenant_identity_conflict' }, 409);
    }

    const rows = await storage.getMercuryAccountBindingsByExternalId(externalAccountId);
    if (!Array.isArray(rows) || rows.length > 2) {
      return c.json({ error: 'finance_account_coverage_unavailable' }, 503);
    }
    if (rows.length > 1) {
      return c.json({ error: 'mercury_account_ownership_ambiguous' }, 409);
    }
    if (!rows.length) {
      return c.json({ financeAccountId: null, status: 'unbound' }, 200);
    }

    const account = rows[0];
    if (!account || account.tenantId !== tenantId ||
        account.externalId !== externalAccountId ||
        !['mercury', 'mercury bank'].includes(String(account.institution || '').toLowerCase()) ||
        account.isActive !== true) {
      return c.json({ error: 'finance_account_binding_conflict' }, 409);
    }
    const metadata = account.metadata;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return c.json({ error: 'provider_organization_provenance_missing' }, 409);
    }
    const fields = metadata as Record<string, unknown>;
    const orgProvenance = [
      fields.mercuryOrganizationId, fields.mercuryOrgId, fields.providerOrganizationId,
    ].filter((v): v is string => typeof v === 'string');
    if (!orgProvenance.length ||
        !orgProvenance.every(v => v.toLowerCase() === organizationId.toLowerCase())) {
      return c.json({ error: 'provider_organization_binding_conflict' }, 409);
    }
    // Mercury multitenant contract requires an explicit Legal Person ChittyID
    // for a new governed reconciliation pass. Preserve the legacy webhook path:
    // its older rows are flagged but never silently promoted to trusted binds.
    if (!isLegalPersonChittyId(getLegalPersonChittyId(account))) {
      return c.json({ error: 'legal_person_binding_missing' }, 409);
    }
    if (typeof account.id !== 'string' || !mercuryIdentityUuid.test(account.id)) {
      return c.json({ error: 'finance_account_binding_invalid' }, 503);
    }
    return c.json({
      financeAccountId: account.id, tenantId,
      organizationId, externalAccountId,
    });
  } catch (error) {
    // Do not log account metadata, private provider payloads or credentials.
    console.error('[mercury:account-binding] authoritative lookup failed', {
      errorClass: error instanceof Error ? error.name : 'unknown',
    });
    return c.json({ error: 'finance_account_coverage_unavailable' }, 503);
  }
});

internalChittyConnectRoutes.get('/internal/chittyconnect/entities', async (c) => {
  const storage = c.get('storage');
  const tenants = await storage.getTenants();

  const entities = await Promise.all(tenants.map(async (tenant: any) => {
    const accounts = await storage.getAccounts(tenant.id);
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      type: tenant.type,
      parentId: tenant.parentId || undefined,
      isActive: tenant.isActive,
      metadata: tenant.metadata || undefined,
      accounts: accounts.map(formatAccount),
    };
  }));

  return c.json({ entities });
});

internalChittyConnectRoutes.get('/internal/chittyconnect/entities/:entity/balances', async (c) => {
  const storage = c.get('storage');
  const resolved = await resolveTenant(storage, c.req.param('entity'));
  if (!resolved.ok) {
    const failure = tenantError(resolved.error);
    return c.json(failure.body, failure.status);
  }
  const tenant = resolved.tenant;

  const [accounts, summaryByCurrency] = await Promise.all([
    storage.getAccounts(tenant.id),
    storage.getBalanceSummaryByCurrency(tenant.id),
  ]);

  return c.json({
    entity: { id: tenant.id, name: tenant.name, slug: tenant.slug, type: tenant.type },
    accounts: accounts.map(formatAccount),
    summaryByCurrency,
  });
});

internalChittyConnectRoutes.get('/internal/chittyconnect/entities/:entity/transactions', async (c) => {
  const storage = c.get('storage');
  const resolved = await resolveTenant(storage, c.req.param('entity'));
  if (!resolved.ok) {
    const failure = tenantError(resolved.error);
    return c.json(failure.body, failure.status);
  }
  const tenant = resolved.tenant;

  let window: WindowBounds;
  let page: { limit: number; offset: number };
  try {
    window = parseWindow(c.req.query('start'), c.req.query('end'));
    page = parsePage(c.req.query('limit'), c.req.query('offset'));
  } catch (error) {
    return c.json({ error: 'invalid_query', message: error instanceof Error ? error.message : 'invalid query' }, 400);
  }

  const rows = await storage.getTransactionsForTenantWindow(tenant.id, {
    ...window,
    limit: page.limit + 1,
    offset: page.offset,
  });
  const hasMore = rows.length > page.limit;
  const visible = hasMore ? rows.slice(0, page.limit) : rows;

  return c.json({
    entity: { id: tenant.id, name: tenant.name, slug: tenant.slug, type: tenant.type },
    transactions: visible.map(formatTransaction),
    page: {
      limit: page.limit,
      offset: page.offset,
      nextOffset: hasMore ? page.offset + page.limit : null,
    },
  });
});

internalChittyConnectRoutes.get('/internal/chittyconnect/entities/:entity/cash-flow', async (c) => {
  const storage = c.get('storage');
  const resolved = await resolveTenant(storage, c.req.param('entity'));
  if (!resolved.ok) {
    const failure = tenantError(resolved.error);
    return c.json(failure.body, failure.status);
  }
  const tenant = resolved.tenant;

  let window: WindowBounds;
  try {
    window = parseWindow(c.req.query('start'), c.req.query('end'));
  } catch (error) {
    return c.json({ error: 'invalid_query', message: error instanceof Error ? error.message : 'invalid query' }, 400);
  }

  const rows = await storage.getCashFlowForTenantWindow(tenant.id, window);
  const byCurrency: Record<string, { inflows: number; outflows: number; net: number; transactionCount: number; transferCount: number }> = {};

  for (const row of rows) {
    const currency = row.currency || 'USD';
    const total = Number(row.total);
    const count = Number(row.transactionCount);
    if (!Number.isFinite(total) || !Number.isFinite(count)) continue;
    const bucket = byCurrency[currency] ?? { inflows: 0, outflows: 0, net: 0, transactionCount: 0, transferCount: 0 };
    bucket.transactionCount += count;
    if (row.type === 'transfer') bucket.transferCount += count;
    else if (row.type === 'income') bucket.inflows += Math.abs(total);
    else if (row.type === 'expense') bucket.outflows += Math.abs(total);
    bucket.net = bucket.inflows - bucket.outflows;
    byCurrency[currency] = bucket;
  }

  return c.json({
    entity: { id: tenant.id, name: tenant.name, slug: tenant.slug, type: tenant.type },
    start: c.req.query('start') || null,
    end: c.req.query('end') || null,
    byCurrency,
  });
});
