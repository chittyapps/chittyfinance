import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { ledgerLog } from '../lib/ledger-client';
import {
  DEFAULT_COMPTROLLER_BASE,
  INFRA_ACCOUNT_EXTERNAL_ID,
  fetchComptrollerMetrics,
  syncComptrollerCosts,
} from '../lib/comptroller-sync';

export const comptrollerRoutes = new Hono<HonoEnv>();

// ChittyComptroller is the source of truth for AI/infra cost. ChittyFinance
// CONSUMES its HTTP cost API and mirrors the daily per-service total into the
// books as an expense — it does NOT re-ingest gateway logs ("fed back, no
// duplication").
//
// POST /api/comptroller/sync — pull today's cost from ChittyComptroller and
// upsert one expense transaction per service (idempotent by external_id).
//
// Tenant: resolved from c.var.tenantId (tenant middleware). The infra cost is
// owned by IT CAN BE LLC, so the caller (admin / daily cron) passes that
// tenant's id via the X-Tenant-ID header. The "ChittyOS Infrastructure"
// account must exist for that tenant (external_id = 'chittyos-infra').
comptrollerRoutes.post('/api/comptroller/sync', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  const account = await storage.getAccountByExternalId(INFRA_ACCOUNT_EXTERNAL_ID, tenantId);
  if (!account) {
    return c.json(
      {
        error: 'infra_account_missing',
        message: `No account with external_id='${INFRA_ACCOUNT_EXTERNAL_ID}' for this tenant. Seed the "ChittyOS Infrastructure" account first.`,
      },
      400,
    );
  }

  const base = c.env.COMPTROLLER_API_BASE || DEFAULT_COMPTROLLER_BASE;
  let metrics;
  try {
    metrics = await fetchComptrollerMetrics(base);
  } catch (err) {
    return c.json(
      { error: 'comptroller_unavailable', message: err instanceof Error ? err.message : String(err) },
      502,
    );
  }

  const rows = await syncComptrollerCosts({ storage, tenantId, accountId: account.id, metrics });

  ledgerLog(
    c,
    {
      entityType: 'audit',
      action: 'comptroller.sync',
      metadata: {
        tenantId,
        date: new Date().toISOString().slice(0, 10),
        synced: rows.length,
        services: rows.map((r) => r.service),
      },
    },
    c.env,
  );

  return c.json({ synced: rows.length, date: new Date().toISOString().slice(0, 10), rows });
});
