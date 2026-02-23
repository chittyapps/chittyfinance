import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import type { SystemStorage } from '../storage/system';

export const accountRoutes = new Hono<HonoEnv>();

// GET /api/accounts — list all accounts for the tenant
accountRoutes.get('/api/accounts', async (c) => {
  const storage: SystemStorage = (c as any).storage;
  const tenantId = c.get('tenantId');
  const accounts = await storage.getAccounts(tenantId);

  return c.json(accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    institution: a.institution || '',
    balance: parseFloat(a.balance),
    currency: a.currency,
  })));
});

// GET /api/accounts/:id/transactions — transactions for a specific account
accountRoutes.get('/api/accounts/:id/transactions', async (c) => {
  const storage: SystemStorage = (c as any).storage;
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
