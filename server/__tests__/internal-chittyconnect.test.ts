import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { internalChittyConnectRoutes } from '../routes/internal-chittyconnect';

const tenant = {
  id: 'tenant-1',
  name: 'ARIBIA LLC',
  slug: 'aribia-llc',
  type: 'entity',
  parentId: null,
  isActive: true,
  metadata: { canonicalBusinessIdentity: 'ARIBIA LLC' },
};

const account = {
  id: 'account-1',
  tenantId: tenant.id,
  name: 'Operating',
  type: 'checking',
  institution: 'Mercury',
  accountNumber: '1956',
  balance: '125.50',
  currency: 'USD',
  externalId: 'mercury-account-1',
  isActive: true,
  metadata: { connector: 'mercury' },
  updatedAt: new Date('2026-10-10T00:00:00Z'),
};

const transaction = {
  id: 'tx-1',
  tenantId: tenant.id,
  accountId: account.id,
  amount: '25.00',
  type: 'income',
  category: null,
  description: 'Deposit',
  date: new Date('2026-10-10T01:00:00Z'),
  payee: null,
  reconciled: false,
  externalId: 'mercury:source-tx-1',
  metadata: { sourceIdentity: 'source-tx-1' },
};

const storage = {
  getTenants: async () => [tenant],
  getAccounts: async (tenantId: string) => tenantId === tenant.id ? [account] : [],
  getSummary: async () => ({ total_cash: 125.5, total_owed: 0, net: 125.5 }),
  getTransactions: async (tenantId: string) => tenantId === tenant.id ? [transaction] : [],
};

function makeApp() {
  const app = new Hono<HonoEnv>();
  app.use('*', async (c, next) => {
    c.set('storage', storage as any);
    await next();
  });
  app.route('/', internalChittyConnectRoutes);
  return app;
}

describe('private ChittyConnect finance projection', () => {
  it('does not advertise the internal surface on the public finance host', async () => {
    const res = await makeApp().request(
      'https://finance.chitty.cc/internal/chittyconnect/entities',
      { headers: { 'X-ChittyOS-Caller': 'chittyconnect' } },
    );
    expect(res.status).toBe(404);
  });

  it('rejects a non-ChittyConnect caller even on the internal hostname', async () => {
    const res = await makeApp().request(
      'https://internal/internal/chittyconnect/entities',
      { headers: { 'X-ChittyOS-Caller': 'other-service' } },
    );
    expect(res.status).toBe(404);
  });

  it('returns canonical tenant and account mappings to the private service binding', async () => {
    const res = await makeApp().request(
      'https://internal/internal/chittyconnect/entities',
      { headers: { 'X-ChittyOS-Caller': 'chittyconnect' } },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.entities).toHaveLength(1);
    expect(body.entities[0]).toMatchObject({
      id: tenant.id,
      name: 'ARIBIA LLC',
      slug: 'aribia-llc',
      accounts: [{
        id: account.id,
        externalId: 'mercury-account-1',
        institution: 'Mercury',
      }],
    });
  });

  it('resolves an entity by slug for balances and source-backed transactions', async () => {
    const headers = { 'X-ChittyOS-Caller': 'chittyconnect' };
    const app = makeApp();

    const balances = await app.request(
      'https://internal/internal/chittyconnect/entities/aribia-llc/balances',
      { headers },
    );
    expect(balances.status).toBe(200);
    expect(await balances.json()).toMatchObject({
      entity: { id: tenant.id, name: 'ARIBIA LLC' },
      summary: { net: 125.5 },
    });

    const transactions = await app.request(
      'https://internal/internal/chittyconnect/entities/aribia-llc/transactions?start=2026-10-01&end=2026-10-31',
      { headers },
    );
    expect(transactions.status).toBe(200);
    expect(await transactions.json()).toMatchObject({
      transactions: [{
        externalId: 'mercury:source-tx-1',
        metadata: { sourceIdentity: 'source-tx-1' },
      }],
    });
  });
});
