import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import {
  runAllocations,
  computePeriodBounds,
  validateAllocationRule,
  type AllocationRuleInput,
  type AllocationTransaction,
} from '../lib/allocation-engine';
import { ledgerLog } from '../lib/ledger-client';

export const allocationRoutes = new Hono<HonoEnv>();

// GET /api/allocations/rules — List active allocation rules for current tenant scope
allocationRoutes.get('/api/allocations/rules', async (c) => {
  const storage = c.get('storage') as any;
  const tenantId = c.get('tenantId');

  try {
    const tenantIds = await storage.getTenantDescendantIds(tenantId);
    const rules = await storage.getAllocationRulesForTenants(tenantIds);
    return c.json({ rules });
  } catch (error) {
    return c.json({ error: 'Failed to fetch allocation rules' }, 500);
  }
});

// POST /api/allocations/rules — Create a new allocation rule
allocationRoutes.post('/api/allocations/rules', async (c) => {
  const storage = c.get('storage') as any;

  try {
    const body = await c.req.json();
    const errors = validateAllocationRule(body);
    if (errors.length > 0) {
      return c.json({ error: 'Validation failed', details: errors }, 400);
    }

    const rule = await storage.createAllocationRule({
      name: body.name,
      description: body.description,
      ruleType: body.ruleType,
      sourceTenantId: body.sourceTenantId,
      targetTenantId: body.targetTenantId,
      percentage: body.percentage,
      fixedAmount: body.fixedAmount,
      frequency: body.frequency || 'monthly',
      sourceCategory: body.sourceCategory,
      allocationMethod: body.allocationMethod || 'percentage',
      metadata: body.metadata,
    });

    ledgerLog(c, {
      entityType: 'audit',
      action: 'allocation.rule.created',
      metadata: { ruleId: rule.id, ruleType: rule.ruleType, name: rule.name },
    }, c.env);

    return c.json({ rule }, 201);
  } catch (error) {
    return c.json({ error: 'Failed to create allocation rule' }, 500);
  }
});

// PATCH /api/allocations/rules/:id — Update an allocation rule
allocationRoutes.patch('/api/allocations/rules/:id', async (c) => {
  const storage = c.get('storage') as any;
  const { id } = c.req.param();

  try {
    const existing = await storage.getAllocationRule(id);
    if (!existing) return c.json({ error: 'Rule not found' }, 404);

    const body = await c.req.json();
    const rule = await storage.updateAllocationRule(id, body);
    return c.json({ rule });
  } catch (error) {
    return c.json({ error: 'Failed to update allocation rule' }, 500);
  }
});

// DELETE /api/allocations/rules/:id — Soft-delete an allocation rule
allocationRoutes.delete('/api/allocations/rules/:id', async (c) => {
  const storage = c.get('storage') as any;
  const { id } = c.req.param();

  try {
    const existing = await storage.getAllocationRule(id);
    if (!existing) return c.json({ error: 'Rule not found' }, 404);

    await storage.deleteAllocationRule(id);
    return c.json({ deleted: true });
  } catch (error) {
    return c.json({ error: 'Failed to delete allocation rule' }, 500);
  }
});

// POST /api/allocations/preview — Dry-run allocation for a period
allocationRoutes.post('/api/allocations/preview', async (c) => {
  const storage = c.get('storage') as any;
  const tenantId = c.get('tenantId');

  try {
    const body = await c.req.json();
    const periodStart = body.periodStart;
    const periodEnd = body.periodEnd;

    if (!periodStart || !periodEnd) {
      return c.json({ error: 'periodStart and periodEnd are required (YYYY-MM-DD)' }, 400);
    }

    const tenantIds = await storage.getTenantDescendantIds(tenantId);
    const rules = await storage.getAllocationRulesForTenants(tenantIds);

    const startIso = `${periodStart}T00:00:00.000Z`;
    const endIso = `${periodEnd}T23:59:59.999Z`;

    const transactions = await storage.getTransactionsForTenantScope(
      tenantIds, startIso, endIso,
    );

    const txInputs: AllocationTransaction[] = transactions.map((tx: any) => ({
      id: tx.id,
      tenantId: tx.tenantId,
      amount: tx.amount,
      type: tx.type,
      category: tx.category,
      date: tx.date,
    }));

    const ruleInputs: AllocationRuleInput[] = rules.map((r: any) => ({
      id: r.id,
      name: r.name,
      ruleType: r.ruleType,
      sourceTenantId: r.sourceTenantId,
      targetTenantId: r.targetTenantId,
      percentage: r.percentage,
      fixedAmount: r.fixedAmount,
      frequency: r.frequency,
      sourceCategory: r.sourceCategory,
      allocationMethod: r.allocationMethod,
      metadata: r.metadata,
    }));

    const preview = runAllocations({
      rules: ruleInputs,
      transactions: txInputs,
      periodStart,
      periodEnd,
    });

    return c.json(preview);
  } catch (error) {
    return c.json({ error: 'Failed to preview allocations' }, 500);
  }
});

// POST /api/allocations/execute — Run allocations and create intercompany transactions
allocationRoutes.post('/api/allocations/execute', async (c) => {
  const storage = c.get('storage') as any;
  const tenantId = c.get('tenantId');

  try {
    const body = await c.req.json();
    const periodStart = body.periodStart;
    const periodEnd = body.periodEnd;

    if (!periodStart || !periodEnd) {
      return c.json({ error: 'periodStart and periodEnd are required (YYYY-MM-DD)' }, 400);
    }

    const tenantIds = await storage.getTenantDescendantIds(tenantId);
    const rules = await storage.getAllocationRulesForTenants(tenantIds);

    const startIso = `${periodStart}T00:00:00.000Z`;
    const endIso = `${periodEnd}T23:59:59.999Z`;

    const transactions = await storage.getTransactionsForTenantScope(
      tenantIds, startIso, endIso,
    );

    const txInputs: AllocationTransaction[] = transactions.map((tx: any) => ({
      id: tx.id,
      tenantId: tx.tenantId,
      amount: tx.amount,
      type: tx.type,
      category: tx.category,
      date: tx.date,
    }));

    const ruleInputs: AllocationRuleInput[] = rules.map((r: any) => ({
      id: r.id,
      name: r.name,
      ruleType: r.ruleType,
      sourceTenantId: r.sourceTenantId,
      targetTenantId: r.targetTenantId,
      percentage: r.percentage,
      fixedAmount: r.fixedAmount,
      frequency: r.frequency,
      sourceCategory: r.sourceCategory,
      allocationMethod: r.allocationMethod,
      metadata: r.metadata,
    }));

    const preview = runAllocations({
      rules: ruleInputs,
      transactions: txInputs,
      periodStart,
      periodEnd,
    });

    // Create intercompany transactions + allocation run records
    const posted: string[] = [];
    for (const result of preview.results) {
      if (result.allocatedAmount === 0) continue;

      const icTx = await storage.createIntercompanyTransaction({
        fromTenantId: result.sourceTenantId,
        toTenantId: result.targetTenantId,
        amount: String(result.allocatedAmount),
        description: result.description,
        date: new Date(`${periodEnd}T23:59:59.000Z`),
      });

      const run = await storage.createAllocationRun({
        ruleId: result.ruleId,
        periodStart: new Date(`${periodStart}T00:00:00.000Z`),
        periodEnd: new Date(`${periodEnd}T23:59:59.000Z`),
        sourceAmount: String(result.sourceAmount),
        allocatedAmount: String(result.allocatedAmount),
        transactionCount: result.matchedTransactionCount,
        intercompanyTransactionId: icTx.id,
        status: 'posted',
      });

      // Update rule's lastRunAt
      await storage.updateAllocationRule(result.ruleId, {
        lastRunAt: new Date(),
      });

      posted.push(run.id);
    }

    ledgerLog(c, {
      entityType: 'audit',
      action: 'allocation.executed',
      metadata: {
        tenantId,
        periodStart,
        periodEnd,
        rulesExecuted: preview.ruleCount,
        totalAllocated: preview.totalAllocated,
        runsCreated: posted.length,
      },
    }, c.env);

    return c.json({
      ...preview,
      posted: posted.length,
      runIds: posted,
    });
  } catch (error) {
    return c.json({ error: 'Failed to execute allocations' }, 500);
  }
});

// GET /api/allocations/runs — List allocation runs for the current period
allocationRoutes.get('/api/allocations/runs', async (c) => {
  const storage = c.get('storage') as any;
  const tenantId = c.get('tenantId');

  try {
    const tenantIds = await storage.getTenantDescendantIds(tenantId);

    const refDate = new Date();
    const periodStart = c.req.query('periodStart') || `${refDate.getFullYear()}-01-01`;
    const periodEnd = c.req.query('periodEnd') || `${refDate.getFullYear()}-12-31`;

    const runs = await storage.getAllocationRunsForPeriod(tenantIds, periodStart, periodEnd);
    return c.json({ runs });
  } catch (error) {
    return c.json({ error: 'Failed to fetch allocation runs' }, 500);
  }
});

// PATCH /api/allocations/runs/:id/status — Update run status (approve/reverse)
allocationRoutes.patch('/api/allocations/runs/:id/status', async (c) => {
  const storage = c.get('storage') as any;
  const { id } = c.req.param();

  try {
    const body = await c.req.json();
    const validStatuses = ['pending', 'approved', 'posted', 'reversed'];
    if (!body.status || !validStatuses.includes(body.status)) {
      return c.json({ error: `status must be one of: ${validStatuses.join(', ')}` }, 400);
    }

    const run = await storage.updateAllocationRunStatus(id, body.status);
    if (!run) return c.json({ error: 'Run not found' }, 404);

    return c.json({ run });
  } catch (error) {
    return c.json({ error: 'Failed to update run status' }, 500);
  }
});
