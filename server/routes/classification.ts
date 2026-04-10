import { Hono } from 'hono';
import { z } from 'zod';
import type { HonoEnv } from '../env';
import { ledgerLog } from '../lib/ledger-client';
import { findAccountCode } from '../../database/chart-of-accounts';
import { ClassificationError } from '../storage/system';

export const classificationRoutes = new Hono<HonoEnv>();

/**
 * Map a ClassificationError to a stable HTTP response.
 * Unknown errors are re-thrown to hit the shared error handler (500).
 */
function mapClassificationError(err: unknown, c: any): Response {
  if (err instanceof ClassificationError) {
    switch (err.code) {
      case 'reconciled_locked':
        return c.json({ error: 'reconciled_locked', message: err.message }, 403);
      case 'not_classified':
        return c.json({ error: 'not_classified', message: err.message }, 400);
      case 'transaction_not_found':
        return c.json({ error: 'not_found', message: err.message }, 404);
    }
  }
  throw err;
}

// Roles permitted to modify the Chart of Accounts (L4 Govern).
// Only tenant owners and admins can add/edit/retire COA accounts.
const L4_ROLES = new Set(['owner', 'admin']);

// Query param schemas
const limitQuerySchema = z.coerce.number().int().min(1).max(500).default(50);
const batchLimitQuerySchema = z.coerce.number().int().min(1).max(500).default(100);

// Body schemas
const classifyBodySchema = z.object({
  transactionId: z.string().uuid(),
  coaCode: z.string().min(1),
  confidence: z.string().optional(),
  reason: z.string().optional(),
});

const reconcileBodySchema = z.object({
  transactionId: z.string().uuid(),
});

const coaCreateSchema = z.object({
  code: z.string().min(1).max(10),
  name: z.string().min(1),
  type: z.enum(['asset', 'liability', 'equity', 'income', 'expense']),
  subtype: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  scheduleELine: z.string().optional().nullable(),
  taxDeductible: z.boolean().optional(),
  parentCode: z.string().optional().nullable(),
});

const coaUpdateSchema = coaCreateSchema.partial();

/** Require L4 (tenant owner/admin) for COA mutations. Returns null if allowed, or a 403 Response. */
async function requireL4(c: any): Promise<Response | null> {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const role = await storage.getUserRoleForTenant(userId, tenantId);
  if (!role || !L4_ROLES.has(role)) {
    return c.json({ error: 'forbidden', message: 'L4 (owner or admin) role required to modify Chart of Accounts' }, 403);
  }
  return null;
}

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
  const forbidden = await requireL4(c);
  if (forbidden) return forbidden;

  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');

  const parsed = coaCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400);
  }
  const body = parsed.data;

  const existing = await storage.getChartOfAccountByCode(body.code, tenantId);
  if (existing && existing.tenantId === tenantId) {
    return c.json({ error: `Account code ${body.code} already exists for this tenant` }, 409);
  }

  const account = await storage.createChartOfAccount({
    tenantId,
    code: body.code,
    name: body.name,
    type: body.type,
    subtype: body.subtype ?? null,
    description: body.description ?? null,
    scheduleELine: body.scheduleELine ?? null,
    taxDeductible: body.taxDeductible ?? false,
    parentCode: body.parentCode ?? null,
    isActive: true,
    modifiedBy: userId,
  });

  ledgerLog(c, {
    entityType: 'audit',
    action: 'coa.create',
    metadata: { tenantId, code: body.code, name: body.name, type: body.type, actorId: userId },
  }, c.env);

  return c.json(account, 201);
});

// PATCH /api/coa/:id — update a tenant-specific COA account (L4 only, tenant-scoped)
classificationRoutes.patch('/api/coa/:id', async (c) => {
  const forbidden = await requireL4(c);
  if (forbidden) return forbidden;

  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const id = c.req.param('id');

  const parsed = coaUpdateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400);
  }

  const account = await storage.updateChartOfAccount(id, tenantId, {
    ...parsed.data,
    modifiedBy: userId,
  });

  if (!account) return c.json({ error: 'Account not found or not owned by this tenant' }, 404);

  ledgerLog(c, {
    entityType: 'audit',
    action: 'coa.update',
    metadata: { id, changes: Object.keys(parsed.data), actorId: userId },
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
  const limitParsed = limitQuerySchema.safeParse(c.req.query('limit'));
  if (!limitParsed.success) {
    return c.json({ error: 'invalid_limit', message: 'limit must be an integer between 1 and 500' }, 400);
  }
  const txns = await storage.getUnclassifiedTransactions(tenantId, limitParsed.data);
  return c.json(txns);
});

// POST /api/classification/suggest — L1: AI/keyword suggestion (does NOT set authoritative coa_code)
classificationRoutes.post('/api/classification/suggest', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');

  const parsed = classifyBodySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400);
  }
  const { transactionId, coaCode, confidence, reason } = parsed.data;

  // Validate COA code exists — prevents dangling suggestions that can never be resolved
  const account = await storage.getChartOfAccountByCode(coaCode, tenantId);
  if (!account) {
    return c.json({ error: `COA code ${coaCode} not found` }, 400);
  }

  try {
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
  } catch (err) {
    return mapClassificationError(err, c);
  }
});

// POST /api/classification/classify — L2: set authoritative coa_code
classificationRoutes.post('/api/classification/classify', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');

  const parsed = classifyBodySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400);
  }
  const { transactionId, coaCode, confidence, reason } = parsed.data;

  // Validate COA code exists (tenant-specific or global)
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
    return mapClassificationError(err, c);
  }
});

// POST /api/classification/reconcile — L3: lock a classified transaction
classificationRoutes.post('/api/classification/reconcile', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');

  const parsed = reconcileBodySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', details: parsed.error.flatten() }, 400);
  }
  const { transactionId } = parsed.data;

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
    return mapClassificationError(err, c);
  }
});

// POST /api/classification/batch-suggest — L1: auto-suggest COA codes for unclassified transactions
classificationRoutes.post('/api/classification/batch-suggest', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  const limitParsed = batchLimitQuerySchema.safeParse(c.req.query('limit'));
  if (!limitParsed.success) {
    return c.json({ error: 'invalid_limit', message: 'limit must be an integer between 1 and 500' }, 400);
  }

  const txns = await storage.getUnclassifiedTransactions(tenantId, limitParsed.data);
  let suggested = 0;

  for (const tx of txns) {
    // Skip if already has a suggestion
    if (tx.suggestedCoaCode) continue;

    const code = findAccountCode(tx.description, tx.category ?? undefined);
    try {
      await storage.classifyTransaction(tx.id, tenantId, code, {
        actorId: 'auto:keyword-match',
        actorType: 'system',
        trustLevel: 'L1',
        confidence: code === '9010' ? '0.100' : '0.700',
        reason: `Keyword match from description/category`,
        isSuggestion: true,
      });
      suggested++;
    } catch (err) {
      // Skip reconciled rows only — other errors should propagate so we
      // don't silently hide bugs like DB outages behind a batch endpoint.
      if (err instanceof ClassificationError && err.code === 'reconciled_locked') {
        continue;
      }
      throw err;
    }
  }

  return c.json({ processed: txns.length, suggested });
});

// GET /api/classification/audit/:transactionId — audit trail for a transaction (tenant-scoped)
classificationRoutes.get('/api/classification/audit/:transactionId', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const transactionId = c.req.param('transactionId');
  const audit = await storage.getClassificationAudit(transactionId, tenantId);
  return c.json(audit);
});
