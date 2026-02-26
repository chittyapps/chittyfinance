import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const transactionRoutes = new Hono<HonoEnv>();

// GET /api/transactions — list transactions for the tenant
transactionRoutes.get('/api/transactions', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined;

  const transactions = await storage.getTransactions(tenantId, limit);

  return c.json(transactions.map((t) => ({
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
  })));
});
