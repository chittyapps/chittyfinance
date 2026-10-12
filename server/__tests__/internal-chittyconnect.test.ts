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

  it('resolves an exact organization-scoped Mercury account without last-four inference', async () => {
    const organizationId = 'e15f4a46-e328-11ee-9e22-5f2c16c0b48b';
    const mercuryAccountId = '4ec84552-e56c-11ee-a22a-9b5c98caf948';
    const tenantId = '98d90754-c886-443a-b769-d6448c39c5fc';
    const financeAccountId = 'f0eedd21-1000-4000-8000-000000000001';
    const owner = {
      ...tenant, id: tenantId, name: 'ARIBIA LLC - MGMT', isActive: true,
      metadata: { canonicalBusinessIdentity: 'ARIBIA LLC - MGMT' },
    };
    const binding = {
      financeAccountId, tenantId, institution: 'Mercury', isActive: true,
      externalId: mercuryAccountId,
      metadata: { mercuryOrganizationId: organizationId, internalNote: 'MUST_NOT_LEAK' },
    };
    const lookup = vi.fn(async () => [binding]);
    const app = makeApp(makeStorage({
      getTenants: vi.fn(async () => [owner]),
      getMercuryAccountBindingCandidatesByExternalId: lookup,
    }));
    const url = 'https://internal/internal/chittyconnect/mercury/account-binding/' +
      mercuryAccountId + '?organizationId=' + organizationId +
      '&tenantId=' + tenantId + '&canonicalBusinessIdentity=' + encodeURIComponent('ARIBIA LLC - MGMT');
    const res = await app.request(url, { headers: internalHeaders });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      organizationId, accountId: mercuryAccountId, tenantId,
      canonicalBusinessIdentity: 'ARIBIA LLC - MGMT', financeAccountId,
    });
    expect(lookup).toHaveBeenCalledWith(mercuryAccountId);
  });

  it('rejects missing, duplicate, inactive, or incorrectly attributed Mercury account bindings', async () => {
    const organizationId = 'e15f4a46-e328-11ee-9e22-5f2c16c0b48b';
    const mercuryAccountId = '4ec84552-e56c-11ee-a22a-9b5c98caf948';
    const tenantId = '98d90754-c886-443a-b769-d6448c39c5fc';
    const owner = {
      ...tenant, id: tenantId, isActive: true,
      metadata: { canonicalBusinessIdentity: 'ARIBIA LLC - MGMT' },
    };
    const binding = {
      financeAccountId: 'f0eedd21-1000-4000-8000-000000000001',
      tenantId, institution: 'Mercury', isActive: true,
      externalId: mercuryAccountId, metadata: { mercuryOrgId: organizationId },
    };
    const url = 'https://internal/internal/chittyconnect/mercury/account-binding/' +
      mercuryAccountId + '?organizationId=' + organizationId +
      '&tenantId=' + tenantId + '&canonicalBusinessIdentity=' + encodeURIComponent('ARIBIA LLC - MGMT');
    const alternatives = [
      [],
      [binding, binding],
      [{ ...binding, isActive: false }],
      [{ ...binding, institution: 'Wave' }],
      [{ ...binding, tenantId: 'f0eedd21-1000-4000-8000-000000000002' }],
      [{ ...binding, externalId: '4ec84552-e56c-11ee-a22a-9b5c98caf949' }],
      [{ ...binding, metadata: {} }],
      [{ ...binding, metadata: { mercuryOrgId: '9082ea0c-07a8-11ef-b331-734021561438' } }],
      [{ ...binding, metadata: { mercuryOrgId: organizationId, mercuryOrganizationId: '9082ea0c-07a8-11ef-b331-734021561438' } }],
    ];
    for (const candidates of alternatives) {
      const app = makeApp(makeStorage({
        getTenants: vi.fn(async () => [owner]),
        getMercuryAccountBindingCandidatesByExternalId: vi.fn(async () => candidates),
      }));
      const res = await app.request(url, { headers: internalHeaders });
      expect(res.status).toBe(409);
    }

    const noCanonical = makeApp(makeStorage({
      getTenants: vi.fn(async () => [{ ...owner, metadata: {} }]),
      getMercuryAccountBindingCandidatesByExternalId: vi.fn(async () => [binding]),
    }));
    expect((await noCanonical.request(url, { headers: internalHeaders })).status).toBe(409);
    const dbFailure = makeApp(makeStorage({
      getTenants: vi.fn(async () => [owner]),
      getMercuryAccountBindingCandidatesByExternalId: vi.fn(async () => {
        throw new Error('private_database_credentials_MUST_NOT_LEAK');
      }),
    }));
    const failed = await dbFailure.request(url, { headers: internalHeaders });
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain('private_database_credentials');

    const publicRes = await makeApp(makeStorage()).request(
      url.replace('https://internal/', 'https://finance.chitty.cc/'),
      { headers: internalHeaders },
    );
    expect(publicRes.status).toBe(404);
  });

  it('resolves global Mercury source ownership without tenant or DBA guessing', async () => {
    const lookup = vi.fn(async (id: string) => id === 'mercury:source-tx-1'
      ? [{ tenantId: tenant.id, financeAccountId: account.id }] : []);
    const storage = makeStorage({ getTransactionOwnersByExternalId: lookup });
    const app = makeApp(storage);
    const url = 'https://internal/internal/chittyconnect/mercury/source-owner/mercury%3Asource-tx-1';
    const found = await app.request(url, { headers: internalHeaders });
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual({
      sourceIdentity: 'mercury:source-tx-1',
      owner: { tenantId: tenant.id, financeAccountId: account.id },
    });
    expect(lookup).toHaveBeenCalledWith('mercury:source-tx-1');
    const missing = await app.request(
      'https://internal/internal/chittyconnect/mercury/source-owner/mercury%3Asource-tx-2',
      { headers: internalHeaders },
    );
    expect(missing.status).toBe(200);
    expect(await missing.json()).toEqual({ sourceIdentity: 'mercury:source-tx-2', owner: null });
  });

  it('never exposes the source-owner preflight on the public host', async () => {
    const lookup = vi.fn(async () => [{ tenantId: tenant.id, financeAccountId: account.id }]);
    const app = makeApp(makeStorage({ getTransactionOwnersByExternalId: lookup }));
    const url = '/internal/chittyconnect/mercury/source-owner/mercury%3Asource-tx-1';
    expect((await app.request('https://finance.chitty.cc' + url, { headers: internalHeaders })).status).toBe(404);
    expect((await app.request('https://internal' + url, {
      headers: { 'X-ChittyOS-Caller': 'not-chittyconnect' },
    })).status).toBe(404);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('fails closed for invalid source identities, duplicate owners, and database errors', async () => {
    const duplicate = vi.fn(async () => [
      { tenantId: tenant.id, financeAccountId: account.id },
      { tenantId: 'tenant-2', financeAccountId: 'account-2' },
    ]);
    const app = makeApp(makeStorage({ getTransactionOwnersByExternalId: duplicate }));
    const url = 'https://internal/internal/chittyconnect/mercury/source-owner/';
    const bad = await app.request(url + 'APTA', { headers: internalHeaders });
    expect(bad.status).toBe(400);
    expect(duplicate).not.toHaveBeenCalled();
    const conflicting = await app.request(url + 'mercury%3Asource-tx-1', { headers: internalHeaders });
    expect(conflicting.status).toBe(409);
    expect(await conflicting.json()).toEqual({ error: 'finance_duplicate_source_ownership' });
    const unavailable = makeApp(makeStorage({
      getTransactionOwnersByExternalId: vi.fn(async () => { throw new Error('sensitive connection details'); }),
    }));
    const failed = await unavailable.request(url + 'mercury%3Asource-tx-1', { headers: internalHeaders });
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain('sensitive connection details');
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
