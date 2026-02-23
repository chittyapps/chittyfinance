import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const accountRoutes = new Hono<HonoEnv>();

// GET /api/accounts — list all accounts for the tenant (with optional ?type= filter)
accountRoutes.get('/api/accounts', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const typeFilter = c.req.query('type');

  const accounts = typeFilter
    ? await storage.getAccountsByType(tenantId, typeFilter)
    : await storage.getAccounts(tenantId);

  return c.json(accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    institution: a.institution || '',
    balance: parseFloat(a.balance),
    currency: a.currency,
    externalId: a.externalId || undefined,
    liabilityDetails: a.liabilityDetails || undefined,
    metadata: a.metadata || undefined,
  })));
});

// POST /api/accounts/liability — create or upsert a liability account
accountRoutes.post('/api/accounts/liability', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const body = await c.req.json();

  const VALID_LIABILITY_TYPES = ['mortgage', 'loan', 'tax_liability'];
  if (!body.type || !VALID_LIABILITY_TYPES.includes(body.type)) {
    return c.json({ error: `Invalid liability type. Must be one of: ${VALID_LIABILITY_TYPES.join(', ')}` }, 400);
  }
  if (!body.name) {
    return c.json({ error: 'name is required' }, 400);
  }

  // Upsert by externalId if provided
  if (body.externalId) {
    const existing = await storage.getAccountByExternalId(body.externalId, tenantId);
    if (existing) {
      const updated = await storage.updateAccount(existing.id, {
        name: body.name,
        type: body.type,
        institution: body.institution || existing.institution,
        balance: body.balance ?? existing.balance,
        currency: body.currency || existing.currency,
        liabilityDetails: body.liabilityDetails ?? existing.liabilityDetails,
        metadata: body.metadata ?? existing.metadata,
      });
      return c.json(updated, 200);
    }
  }

  // Create new liability account
  const created = await storage.createAccount({
    tenantId,
    name: body.name,
    type: body.type,
    institution: body.institution || null,
    accountNumber: body.accountNumber || null,
    balance: body.balance ?? '0',
    currency: body.currency || 'USD',
    externalId: body.externalId || null,
    liabilityDetails: body.liabilityDetails || null,
    metadata: body.metadata || null,
  });

  return c.json(created, 201);
});

// POST /api/accounts/:id/sync — update account balance/details from external source
accountRoutes.post('/api/accounts/:id/sync', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const accountId = c.req.param('id');

  // Verify account exists and belongs to tenant
  const account = await storage.getAccount(accountId, tenantId);
  if (!account) {
    return c.json({ error: 'Account not found' }, 404);
  }

  const body = await c.req.json();
  const updates: { balance?: string; liabilityDetails?: unknown; metadata?: unknown } = {};

  if (body.balance !== undefined) {
    updates.balance = String(body.balance);
  }
  if (body.liabilityDetails !== undefined) {
    updates.liabilityDetails = body.liabilityDetails;
  }
  if (body.metadata !== undefined) {
    // Merge metadata rather than overwrite
    updates.metadata = { ...(account.metadata as Record<string, unknown> || {}), ...body.metadata };
  }

  const synced = await storage.syncAccount(accountId, updates);
  return c.json(synced);
});

// GET /api/accounts/:id/transactions — transactions for a specific account
accountRoutes.get('/api/accounts/:id/transactions', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const accountId = c.req.param('id');
  const since = c.req.query('since');

  const txns = await storage.getTransactionsByAccount(accountId, tenantId, since);

  return c.json(txns.map((t) => ({
    id: t.id,
    account_id: t.accountId,
    amount: parseFloat(t.amount),
    direction: parseFloat(t.amount) >= 0 ? 'inflow' as const : 'outflow' as const,
    description: t.description,
    date: t.date,
    category: t.category || undefined,
    counterparty: t.payee || undefined,
  })));
});
