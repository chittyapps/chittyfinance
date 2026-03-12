import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const transactionRoutes = new Hono<HonoEnv>();

function formatTransaction(t: any) {
  return {
    id: t.id,
    accountId: t.accountId,
    amount: parseFloat(t.amount),
    type: t.type,
    category: t.category || undefined,
    description: t.description,
    date: t.date,
    payee: t.payee || undefined,
    propertyId: t.propertyId || undefined,
    unitId: t.unitId || undefined,
    reconciled: t.reconciled,
  };
}

// GET /api/transactions — list transactions for the tenant
transactionRoutes.get('/api/transactions', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined;

  const transactions = await storage.getTransactions(tenantId, limit);
  return c.json(transactions.map(formatTransaction));
});

// POST /api/transactions — create a transaction
transactionRoutes.post('/api/transactions', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const body = await c.req.json();

  if (!body.accountId) return c.json({ error: 'accountId is required' }, 400);
  if (!body.amount && body.amount !== 0) return c.json({ error: 'amount is required' }, 400);
  if (!body.type) return c.json({ error: 'type is required' }, 400);
  if (!body.description) return c.json({ error: 'description is required' }, 400);
  if (!body.date) return c.json({ error: 'date is required' }, 400);

  const created = await storage.createTransaction({
    tenantId,
    accountId: body.accountId,
    amount: String(body.amount),
    type: body.type,
    category: body.category || null,
    description: body.description,
    date: new Date(body.date),
    payee: body.payee || null,
    propertyId: body.propertyId || null,
    unitId: body.unitId || null,
    reconciled: body.reconciled ?? false,
    metadata: body.metadata || null,
  });

  return c.json(formatTransaction(created), 201);
});

// PATCH /api/transactions/:id — update a transaction
transactionRoutes.patch('/api/transactions/:id', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const body = await c.req.json();

  const updates: Record<string, unknown> = {};
  if (body.reconciled !== undefined) updates.reconciled = body.reconciled;
  if (body.category !== undefined) updates.category = body.category;
  if (body.description !== undefined) updates.description = body.description;
  if (body.payee !== undefined) updates.payee = body.payee;
  if (body.amount !== undefined) updates.amount = String(body.amount);
  if (body.type !== undefined) updates.type = body.type;
  if (body.date !== undefined) updates.date = new Date(body.date);
  if (body.propertyId !== undefined) updates.propertyId = body.propertyId;
  if (body.unitId !== undefined) updates.unitId = body.unitId;

  const updated = await storage.updateTransaction(id, tenantId, updates);
  if (!updated) return c.json({ error: 'Transaction not found' }, 404);

  return c.json(formatTransaction(updated));
});
