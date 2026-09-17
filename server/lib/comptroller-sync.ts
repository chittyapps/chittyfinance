/**
 * ChittyComptroller cost bridge.
 *
 * ChittyComptroller (comptroller.chitty.cc) is the source of truth for AI/infra
 * cost. ChittyFinance CONSUMES its HTTP cost API and mirrors the daily
 * per-service total into the books as an expense transaction — it does NOT
 * re-ingest gateway logs ("fed back, no duplication").
 *
 * Shared by the POST /api/comptroller/sync route (request-scoped tenant) and
 * the daily cron in worker.ts (tenant resolved from the seeded infra account).
 */

import type { SystemStorage } from '../storage/system';

export const DEFAULT_COMPTROLLER_BASE = 'https://comptroller.chitty.cc';

// COA code for AI/infra subscriptions. 6010 "Software Subscriptions" (expense,
// tax-deductible) is the seeded ChittyFinance account for this cost class.
export const INFRA_COA_CODE = '6010';

// The financial account that owns infra expense. Resolved at runtime by its
// deterministic external_id (seeded once), so no UUID is baked into source.
export const INFRA_ACCOUNT_EXTERNAL_ID = 'chittyos-infra';

export interface ComptrollerTodayRow {
  service: string;
  tier: string;
  cost_usd: number;
  tokens_in: number;
  tokens_out: number;
  calls: number;
}

export interface ComptrollerMetrics {
  status: string;
  today: ComptrollerTodayRow[];
  ts?: string;
}

export interface SyncedRow {
  service: string;
  amount: string;
  exactCostUsd: number;
  externalId: string;
  id: string;
}

export async function fetchComptrollerMetrics(base: string): Promise<ComptrollerMetrics> {
  const res = await fetch(`${base}/api/v1/metrics`, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Comptroller returned ${res.status}`);
  }
  return (await res.json()) as ComptrollerMetrics;
}

/**
 * Aggregate the Comptroller's per-(service,tier) `today` rows into a single
 * total per service, then upsert one idempotent expense transaction per service
 * for the given date. Returns the recorded rows.
 */
export async function syncComptrollerCosts(opts: {
  storage: SystemStorage;
  tenantId: string;
  accountId: string;
  metrics: ComptrollerMetrics;
  date?: Date;
}): Promise<SyncedRow[]> {
  const { storage, tenantId, accountId, metrics } = opts;
  const date = opts.date ?? new Date();
  const day = date.toISOString().slice(0, 10);
  const today = metrics.today ?? [];

  // One row per (service, tier); aggregate to a per-service total so multi-tier
  // services (e.g. chittyclaw T0 + T3_sonnet + manual) don't overwrite each
  // other under a single external_id.
  const byService = new Map<
    string,
    { costUsd: number; tokensIn: number; tokensOut: number; calls: number; tiers: ComptrollerTodayRow[] }
  >();
  for (const row of today) {
    const agg = byService.get(row.service) ?? { costUsd: 0, tokensIn: 0, tokensOut: 0, calls: 0, tiers: [] };
    agg.costUsd += row.cost_usd || 0;
    agg.tokensIn += row.tokens_in || 0;
    agg.tokensOut += row.tokens_out || 0;
    agg.calls += row.calls || 0;
    agg.tiers.push(row);
    byService.set(row.service, agg);
  }

  const rows: SyncedRow[] = [];
  for (const [service, agg] of byService) {
    const saved = await storage.upsertComptrollerCost({
      tenantId,
      accountId,
      date,
      service,
      costUsd: agg.costUsd,
      coaCode: INFRA_COA_CODE,
      metadata: {
        tokensIn: agg.tokensIn,
        tokensOut: agg.tokensOut,
        calls: agg.calls,
        tiers: agg.tiers,
        comptrollerTs: metrics.ts,
      },
    });
    rows.push({
      service,
      amount: saved.amount,
      exactCostUsd: agg.costUsd,
      externalId: saved.externalId ?? `comptroller:${day}:${service}`,
      id: saved.id,
    });
  }
  return rows;
}
