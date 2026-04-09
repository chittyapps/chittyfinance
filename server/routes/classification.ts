import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { ledgerLog } from '../lib/ledger-client';
import { findAccountCode } from '../../database/chart-of-accounts';

export const classificationRoutes = new Hono<HonoEnv>();

// GET /api/coa — list Chart of Accounts for current tenant (includes global defaults)
classificationRoutes.get('/api/coa', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const accounts = await storage.getChartOfAccounts(tenantId);
  return c.json(accounts);
});

// GET /api/coa/global — list global (template) accounts only
classificationRoutes.get('/api/coa/global', async (c) => {
  const storage = c.get('storage');
  const accounts = await storage.getGlobalChartOfAccounts();
  return c.json(accounts);
});

// POST /api/coa — create a tenant-specific COA account (L4 only)
classificationRoutes.post('/api/coa', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const body = await c.req.json();

  const { code, name, type, subtype, description, scheduleELine, taxDeductible, parentCode } = body;
  if (!code || !name || !type) {
    return c.json({ error: 'code, name, and type are required' }, 400);
  }

  const existing = await storage.getChartOfAccountByCode(code, tenantId);
  if (existing && existing.tenantId === tenantId) {
    return c.json({ error: `Account code ${code} already exists for this tenant` }, 409);
  }

  const userId = c.get('userId');
  const account = await storage.createChartOfAccount({
    tenantId,
    code,
    name,
    type,
    subtype: subtype ?? null,
    description: description ?? null,
    scheduleELine: scheduleELine ?? null,
    taxDeductible: taxDeductible ?? false,
    parentCode: parentCode ?? null,
    isActive: true,
    modifiedBy: userId,
  });

  ledgerLog(c, {
    entityType: 'audit',
    action: 'coa.create',
    metadata: { tenantId, code, name, type, actorId: userId },
  }, c.env);

  return c.json(account, 201);
});

// PATCH /api/coa/:id — update a COA account (L4 only)
classificationRoutes.patch('/api/coa/:id', async (c) => {
  const storage = c.get('storage');
  const id = c.req.param('id');
  const body = await c.req.json();
  const userId = c.get('userId');

  const account = await storage.updateChartOfAccount(id, {
    ...body,
    modifiedBy: userId,
  });

  if (!account) return c.json({ error: 'Account not found' }, 404);

  ledgerLog(c, {
    entityType: 'audit',
    action: 'coa.update',
    metadata: { id, changes: Object.keys(body), actorId: userId },
  }, c.env);

  return c.json(account);
});

// GET /api/classification/stats — classification progress for current tenant
classificationRoutes.get('/api/classification/stats', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const stats = await storage.getClassificationStats(tenantId);
  const total = Number(stats.total);
  const classified = Number(stats.classified);
  return c.json({
    ...stats,
    unclassified: total - classified,
    classifiedPct: total > 0 ? Math.round((classified / total) * 100) : 0,
  });
});

// GET /api/classification/unclassified — transactions needing classification
classificationRoutes.get('/api/classification/unclassified', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const txns = await storage.getUnclassifiedTransactions(tenantId, limit);
  return c.json(txns);
});

// POST /api/classification/suggest — L1: AI/keyword suggestion (does NOT set authoritative coa_code)
classificationRoutes.post('/api/classification/suggest', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const { transactionId, coaCode, confidence, reason } = await c.req.json();

  if (!transactionId || !coaCode) {
    return c.json({ error: 'transactionId and coaCode are required' }, 400);
  }

  const result = await storage.classifyTransaction(transactionId, tenantId, coaCode, {
    actorId: userId,
    actorType: 'user',
    trustLevel: 'L1',
    confidence,
    reason,
    isSuggestion: true,
  });

  if (!result) return c.json({ error: 'Transaction not found' }, 404);
  return c.json(result);
});

// POST /api/classification/classify — L2: set authoritative coa_code
classificationRoutes.post('/api/classification/classify', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const { transactionId, coaCode, confidence, reason } = await c.req.json();

  if (!transactionId || !coaCode) {
    return c.json({ error: 'transactionId and coaCode are required' }, 400);
  }

  // Validate COA code exists
  const account = await storage.getChartOfAccountByCode(coaCode, tenantId);
  if (!account) {
    return c.json({ error: `COA code ${coaCode} not found` }, 400);
  }

  try {
    const result = await storage.classifyTransaction(transactionId, tenantId, coaCode, {
      actorId: userId,
      actorType: 'user',
      trustLevel: 'L2',
      confidence,
      reason,
    });
    if (!result) return c.json({ error: 'Transaction not found' }, 404);

    ledgerLog(c, {
      entityType: 'audit',
      action: 'classification.classify',
      metadata: { transactionId, coaCode, actorId: userId },
    }, c.env);

    return c.json(result);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 403);
  }
});

// POST /api/classification/reconcile — L3: lock a classified transaction
classificationRoutes.post('/api/classification/reconcile', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const { transactionId } = await c.req.json();

  if (!transactionId) {
    return c.json({ error: 'transactionId is required' }, 400);
  }

  try {
    const result = await storage.reconcileTransaction(transactionId, tenantId, userId);
    if (!result) return c.json({ error: 'Transaction not found' }, 404);

    ledgerLog(c, {
      entityType: 'audit',
      action: 'classification.reconcile',
      metadata: { transactionId, actorId: userId },
    }, c.env);

    return c.json(result);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 403);
  }
});

// POST /api/classification/batch-suggest — L1: auto-suggest COA codes for unclassified transactions
classificationRoutes.post('/api/classification/batch-suggest', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const limit = parseInt(c.req.query('limit') || '100', 10);

  const txns = await storage.getUnclassifiedTransactions(tenantId, limit);
  let suggested = 0;

  for (const tx of txns) {
    // Skip if already has a suggestion
    if (tx.suggestedCoaCode) continue;

    const code = findAccountCode(tx.description, tx.category ?? undefined);
    await storage.classifyTransaction(tx.id, tenantId, code, {
      actorId: 'auto:keyword-match',
      actorType: 'system',
      trustLevel: 'L1',
      confidence: code === '9010' ? '0.100' : '0.700',
      reason: `Keyword match from description/category`,
      isSuggestion: true,
    });
    suggested++;
  }

  return c.json({ processed: txns.length, suggested });
});

// GET /api/classification/audit/:transactionId — audit trail for a transaction
classificationRoutes.get('/api/classification/audit/:transactionId', async (c) => {
  const storage = c.get('storage');
  const transactionId = c.req.param('transactionId');
  const audit = await storage.getClassificationAudit(transactionId);
  return c.json(audit);
});
