import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import {
  buildScheduleEReport,
  buildForm1065Report,
  buildTaxPackage,
  sanitizeForm1065ForClient,
  serializeTaxPackageCsv,
  type PropertyInfo,
  type TenantInfo,
} from '../lib/tax-reporting';
import { ledgerLog } from '../lib/ledger-client';

export const taxRoutes = new Hono<HonoEnv>();

function parseTaxYear(value: unknown): number {
  const year = typeof value === 'string' ? parseInt(value, 10) : NaN;
  if (!Number.isFinite(year) || year < 2020 || year > 2099) {
    throw new Error('taxYear must be a valid year (2020-2099)');
  }
  return year;
}

function parseBool(value: unknown, defaultValue: boolean): boolean {
  if (typeof value !== 'string') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'no'].includes(normalized)) return false;
  return defaultValue;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseUuidList(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return undefined;
  for (const id of ids) {
    if (!UUID_RE.test(id)) throw new Error(`Invalid UUID in filter: ${id}`);
  }
  return ids;
}

async function loadTaxData(
  storage: any,
  tenantId: string,
  taxYear: number,
  includeDescendants: boolean,
  filterPropertyIds?: string[],
  filterTenantIds?: string[],
) {
  let tenantIds = includeDescendants
    ? await storage.getTenantDescendantIds(tenantId)
    : [tenantId];

  // Narrow tenants if filter provided
  if (filterTenantIds?.length) {
    const allowed = new Set(filterTenantIds);
    tenantIds = tenantIds.filter((id: string) => allowed.has(id));
  }

  const startDateIso = `${taxYear}-01-01T00:00:00.000Z`;
  const endDateIso = `${taxYear}-12-31T23:59:59.999Z`;

  const [transactions, tenants, properties] = await Promise.all([
    storage.getTransactionsForTenantScope(tenantIds, startDateIso, endDateIso),
    storage.getTenantsByIds(tenantIds),
    storage.getPropertiesForTenants(tenantIds),
  ]);

  const tenantInfos: TenantInfo[] = tenants.map((t: any) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    metadata: t.metadata,
  }));

  let propertyInfos: PropertyInfo[] = properties.map((p: any) => ({
    id: p.id,
    tenantId: p.tenantId,
    name: p.name,
    address: [p.address, p.city, p.state].filter(Boolean).join(', '),
    state: p.state || 'UNASSIGNED',
  }));

  // Narrow properties if filter provided
  if (filterPropertyIds?.length) {
    const allowed = new Set(filterPropertyIds);
    propertyInfos = propertyInfos.filter((p) => allowed.has(p.id));
  }

  return { tenantIds, transactions, tenantInfos, propertyInfos };
}

// GET /api/reports/tax/schedule-e — Per-property Schedule E report
taxRoutes.get('/api/reports/tax/schedule-e', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  try {
    const taxYear = parseTaxYear(c.req.query('taxYear'));
    const includeDescendants = parseBool(c.req.query('includeDescendants'), true);
    const filterPropertyIds = parseUuidList(c.req.query('propertyIds'));
    const filterTenantIds = parseUuidList(c.req.query('tenantIds'));

    const { transactions, tenantInfos, propertyInfos } = await loadTaxData(
      storage, tenantId, taxYear, includeDescendants,
      filterPropertyIds, filterTenantIds,
    );

    const report = buildScheduleEReport({
      taxYear,
      transactions,
      properties: propertyInfos,
      tenants: tenantInfos,
    });

    return c.json(report);
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Failed to generate Schedule E report',
    }, 400);
  }
});

// GET /api/reports/tax/form-1065 — Partnership return data with K-1 allocations
taxRoutes.get('/api/reports/tax/form-1065', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  try {
    const taxYear = parseTaxYear(c.req.query('taxYear'));
    const includeDescendants = parseBool(c.req.query('includeDescendants'), true);

    const { transactions, tenantInfos } = await loadTaxData(
      storage, tenantId, taxYear, includeDescendants,
    );

    const reports = buildForm1065Report({
      taxYear,
      entityTenants: tenantInfos,
      transactions,
    });

    // Strip sensitive fields for client display
    return c.json(sanitizeForm1065ForClient(reports));
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Failed to generate Form 1065 report',
    }, 400);
  }
});

// GET /api/reports/tax/export — Full tax package download (CSV or JSON)
taxRoutes.get('/api/reports/tax/export', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  try {
    const taxYear = parseTaxYear(c.req.query('taxYear'));
    const format = (c.req.query('format') || 'csv').toLowerCase();
    const includeDescendants = parseBool(c.req.query('includeDescendants'), true);
    const filterPropertyIds = parseUuidList(c.req.query('propertyIds'));
    const filterTenantIds = parseUuidList(c.req.query('tenantIds'));

    const { transactions, tenantInfos, propertyInfos } = await loadTaxData(
      storage, tenantId, taxYear, includeDescendants,
      filterPropertyIds, filterTenantIds,
    );

    const scheduleE = buildScheduleEReport({
      taxYear,
      transactions,
      properties: propertyInfos,
      tenants: tenantInfos,
    });

    const form1065 = buildForm1065Report({
      taxYear,
      entityTenants: tenantInfos,
      transactions,
    });

    const pkg = buildTaxPackage({
      taxYear,
      scheduleE,
      form1065,
      transactionCount: transactions.length,
    });

    // Audit log
    ledgerLog(c, {
      entityType: 'audit',
      action: 'tax.export',
      metadata: {
        tenantId,
        taxYear,
        format,
        entityCount: pkg.summary.entityCount,
        propertyCount: pkg.summary.propertyCount,
        transactionCount: pkg.summary.transactionCount,
      },
    }, c.env);

    if (format === 'json') {
      return c.json(pkg);
    }

    // CSV download
    const csv = serializeTaxPackageCsv(pkg);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="tax-package-${taxYear}.csv"`,
      },
    });
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Failed to export tax package',
    }, 400);
  }
});
