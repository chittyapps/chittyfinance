import { describe, expect, it, vi } from 'vitest';
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
  currency: 'USD',
  type: 'income',
  category: null,
  description: 'Deposit',
  date: new Date('2026-10-10T01:00:00Z'),
  payee: null,
  reconciled: false,
  externalId: 'mercury:source-tx-1',
  metadata: { sourceIdentity: 'source-tx-1' },
};

/** Build an isolated storage double for the private projection. */
function makeStorage(overrides: Record<string, unknown> = {}) {
  return {
    getTenants: vi.fn(async () => [tenant]),
    getAccounts: vi.fn(async (tenantId: string) => tenantId === tenant.id ? [account] : []),
    getBalanceSummaryByCurrency: vi.fn(async () => ({
      USD: { total_cash: 125.5, total_owed: 0, net: 125.5 },
    })),
    getTransactionsForTenantWindow: vi.fn(async (tenantId: string) => tenantId === tenant.id ? [transaction] : []),
    getCashFlowForTenantWindow: vi.fn(async () => [
      { currency: 'USD', type: 'income', total: '100', transactionCount: 2 },
      { currency: 'USD', type: 'expense', total: '-20', transactionCount: 1 },
      { currency: 'COP', type: 'income', total: '1000', transactionCount: 1 },
      { currency: 'USD', type: 'transfer', total: '50', transactionCount: 1 },
    ]),
    ...overrides,
  };
}

/** Mount the private projection with a supplied storage double. */
function makeApp(storage = makeStorage()) {
  const app = new Hono<HonoEnv>();
  app.use('*', async (c, next) => {
    c.set('storage', storage as any);
    await next();
  });
  app.route('/', internalChittyConnectRoutes);
  return app;
}

const internalHeaders = { 'X-ChittyOS-Caller': 'chittyconnect' };

describe('private ChittyConnect finance projection', () => {
  it('does not advertise the internal surface on the public finance host', async () => {
    const res = await makeApp().request(
      'https://finance.chitty.cc/internal/chittyconnect/entities',
      { headers: internalHeaders },
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

  it('returns canonical tenant/account mappings without account-number material', async () => {
    const res = await makeApp().request(
      'https://internal/internal/chittyconnect/entities',
      { headers: internalHeaders },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.entities).toHaveLength(1);
    expect(body.entities[0]).toMatchObject({
      id: tenant.id,
      name: 'ARIBIA LLC',
      slug: 'aribia-llc',
      accounts: [{ id: account.id, externalId: 'mercury-account-1', institution: 'Mercury' }],
    });
    expect(body.entities[0].accounts[0].accountNumber).toBeUndefined();
  });

  it('returns balance summaries grouped by currency', async () => {
    const res = await makeApp().request(
      'https://internal/internal/chittyconnect/entities/aribia-llc/balances',
      { headers: internalHeaders },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      entity: { id: tenant.id, name: 'ARIBIA LLC' },
      summaryByCurrency: { USD: { net: 125.5 } },
    });
  });

  it('preserves currency/source identity and converts date-only end to next-day exclusive bound', async () => {
    const storage = makeStorage();
    const res = await makeApp(storage).request(
      'https://internal/internal/chittyconnect/entities/aribia-llc/transactions?start=2026-10-01&end=2026-10-31',
      { headers: internalHeaders },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      transactions: [{
        currency: 'USD',
        externalId: 'mercury:source-tx-1',
        metadata: { sourceIdentity: 'source-tx-1' },
      }],
      page: { limit: 200, offset: 0, nextOffset: null },
    });
    expect(storage.getTransactionsForTenantWindow).toHaveBeenCalledWith(tenant.id, {
      startDateIso: '2026-10-01T00:00:00.000Z',
      endDateExclusiveIso: '2026-11-01T00:00:00.000Z',
      limit: 201,
      offset: 0,
    });
  });

  it('paginates transaction reads instead of returning an unbounded history', async () => {
    const rows = [
      transaction,
      { ...transaction, id: 'tx-2', externalId: 'mercury:source-tx-2' },
      { ...transaction, id: 'tx-3', externalId: 'mercury:source-tx-3' },
    ];
    const storage = makeStorage({
      getTransactionsForTenantWindow: vi.fn(async () => rows),
    });
    const res = await makeApp(storage).request(
      'https://internal/internal/chittyconnect/entities/aribia-llc/transactions?limit=2&offset=0',
      { headers: internalHeaders },
    );
    const body = await res.json() as any;
    expect(res.status).toBe(200);
    expect(body.transactions).toHaveLength(2);
    expect(body.page).toEqual({ limit: 2, offset: 0, nextOffset: 2 });
    expect(storage.getTransactionsForTenantWindow).toHaveBeenCalledWith(
      tenant.id,
      { startDateIso: undefined, endDateExclusiveIso: undefined, limit: 3, offset: 0 },
    );
  });

  it('rejects invalid windows and reversed ranges before storage reads', async () => {
    const storage = makeStorage();
    const app = makeApp(storage);

    const invalid = await app.request(
      'https://internal/internal/chittyconnect/entities/aribia-llc/transactions?end=2026-02-31',
      { headers: internalHeaders },
    );
    const reversed = await app.request(
      'https://internal/internal/chittyconnect/entities/aribia-llc/cash-flow?start=2026-11-02&end=2026-11-01',
      { headers: internalHeaders },
    );

    expect(invalid.status).toBe(400);
    expect(reversed.status).toBe(400);
    expect(storage.getTransactionsForTenantWindow).not.toHaveBeenCalled();
    expect(storage.getCashFlowForTenantWindow).not.toHaveBeenCalled();
  });

  it('fails closed on an ambiguous exact tenant name', async () => {
    const storage = makeStorage({
      getTenants: vi.fn(async () => [
        { ...tenant, id: 'tenant-a', slug: 'shared-a', name: 'Shared Name' },
        { ...tenant, id: 'tenant-b', slug: 'shared-b', name: 'Shared Name' },
      ]),
    });
    const res = await makeApp(storage).request(
      'https://internal/internal/chittyconnect/entities/Shared%20Name/balances',
      { headers: internalHeaders },
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'entity_ambiguous' });
  });

  it('accepts a literal percent sign in an already-decoded slug without double-decoding', async () => {
    const percentTenant = { ...tenant, slug: 'percent%tenant' };
    const storage = makeStorage({
      getTenants: vi.fn(async () => [percentTenant]),
      getAccounts: vi.fn(async () => []),
      getBalanceSummaryByCurrency: vi.fn(async () => ({})),
    });
    const res = await makeApp(storage).request(
      'https://internal/internal/chittyconnect/entities/percent%25tenant/balances',
      { headers: internalHeaders },
    );
    expect(res.status).toBe(200);
  });

  it('keeps cash-flow totals separate by currency and counts transfers independently', async () => {
    const storage = makeStorage();
    const res = await makeApp(storage).request(
      'https://internal/internal/chittyconnect/entities/aribia-llc/cash-flow?start=2026-10-01&end=2026-10-31',
      { headers: internalHeaders },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      byCurrency: {
        USD: { inflows: 100, outflows: 20, net: 80, transactionCount: 4, transferCount: 1 },
        COP: { inflows: 1000, outflows: 0, net: 1000, transactionCount: 1, transferCount: 0 },
      },
    });
    expect(storage.getCashFlowForTenantWindow).toHaveBeenCalledWith(tenant.id, {
      startDateIso: '2026-10-01T00:00:00.000Z',
      endDateExclusiveIso: '2026-11-01T00:00:00.000Z',
    });
  });
});
