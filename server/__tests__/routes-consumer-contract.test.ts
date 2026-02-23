import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { accountRoutes } from '../routes/accounts';
import { summaryRoutes } from '../routes/summary';

const mockStorage = {
  getAccounts: vi.fn().mockResolvedValue([
    { id: 'a1', name: 'Checking', type: 'checking', institution: 'Mercury', balance: '5000.00', currency: 'USD', tenantId: 't1' },
  ]),
  getTransactionsByAccount: vi.fn().mockResolvedValue([
    { id: 'tx1', accountId: 'a1', amount: '-100.00', type: 'expense', description: 'Office supplies', date: '2026-01-15T00:00:00Z', payee: 'Staples' },
  ]),
  getSummary: vi.fn().mockResolvedValue({ total_cash: 5000, total_owed: 200, net: 4800 }),
};

describe('consumer contract routes', () => {
  const env = {
    CHITTY_AUTH_SERVICE_TOKEN: 'svc-token',
    DATABASE_URL: 'fake',
    FINANCE_KV: {} as any,
    FINANCE_R2: {} as any,
    ASSETS: {} as any,
    CF_AGENT: {} as any,
  };

  function withStorage(app: Hono<HonoEnv>) {
    app.use('*', async (c, next) => {
      c.set('tenantId', 't1');
      (c as any).storage = mockStorage;
      await next();
    });
    return app;
  }

  it('GET /api/accounts returns FinanceAccount[] shape', async () => {
    const app = withStorage(new Hono<HonoEnv>());
    app.route('/', accountRoutes);
    const res = await app.request('/api/accounts', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toEqual({
      id: 'a1',
      name: 'Checking',
      type: 'checking',
      institution: 'Mercury',
      balance: 5000,
      currency: 'USD',
    });
  });

  it('GET /api/accounts/:id/transactions returns FinanceTransaction[] shape', async () => {
    const app = withStorage(new Hono<HonoEnv>());
    app.route('/', accountRoutes);
    const res = await app.request('/api/accounts/a1/transactions', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].direction).toBe('outflow');
    expect(body[0].amount).toBe(-100);
    expect(body[0].counterparty).toBe('Staples');
  });

  it('GET /api/summary returns { total_cash, total_owed, net }', async () => {
    const app = withStorage(new Hono<HonoEnv>());
    app.route('/', summaryRoutes);
    const res = await app.request('/api/summary', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ total_cash: 5000, total_owed: 200, net: 4800 });
  });
});
