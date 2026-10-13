import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { ledgerLog } from '../lib/ledger-client';
import {
  buildReiHubReconciliationPlan,
  type ReiHubSnapshot,
} from '../books/rei-hub-reconciliation';

export const reiHubRoutes = new Hono<HonoEnv>();

// POST /api/import/rei-hub/compare
// Dry-run only. Compares a ChittyScrape REI Hub snapshot against the tenant's
// existing ChittyFinance transactions and returns bounded repair proposals.
// It never creates a second REI Hub transaction population and never mutates
// classification, reconciliation, property assignments, or the COA.
reiHubRoutes.post('/api/import/rei-hub/compare', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  let snapshot: ReiHubSnapshot;
  try {
    snapshot = await c.req.json<ReiHubSnapshot>();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  if (!snapshot?.bookedTransactions || !Array.isArray(snapshot.bookedTransactions.rows)) {
    return c.json({
      error: 'invalid_snapshot',
      message: 'Expected a ChittyScrape REI Hub snapshot with bookedTransactions.rows',
    }, 400);
  }

  const [transactions, properties] = await Promise.all([
    storage.getTransactions(tenantId),
    storage.getProperties(tenantId),
  ]);

  const plan = buildReiHubReconciliationPlan(snapshot, transactions, properties);

  ledgerLog(c, {
    entityType: 'audit',
    action: 'reihub.compare',
    metadata: {
      tenantId,
      snapshotSha256: snapshot.snapshotSha256,
      sourceRows: plan.sourceRows,
      parsedRows: plan.parsedRows,
      matchedRows: plan.matchedRows,
      unmatchedRows: plan.unmatchedSourceRows.length,
      ambiguousRows: plan.ambiguousSourceRows.length,
      proposedActions: plan.proposedActions.length,
    },
  }, c.env);

  return c.json({
    mode: 'dry-run',
    authority: {
      sourceOfTruth: 'chittyfinance',
      sourceRole: 'comparison-evidence',
      writesPerformed: false,
    },
    execution: {
      propertyAssignments: 'PATCH /api/transactions/:id (existing protected route)',
      classificationSuggestions: 'POST /api/classification/suggest (L1)',
      authoritativeClassification: 'POST /api/classification/classify (L2 role required)',
      reconciliation: 'POST /api/classification/reconcile (L2 role required)',
      coaMutation: 'POST/PATCH /api/coa (L4 owner/admin required)',
    },
    plan,
  });
});
