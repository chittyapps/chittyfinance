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

const bindingOrgId = '11111111-1111-4111-8111-111111111111';
const bindingAccountId = '22222222-2222-4222-8222-222222222222';
const bindingTenantId = '33333333-3333-4333-8333-333333333333';
const bindingFinanceAccountId = '44444444-4444-4444-8444-444444444444';
const bindingBusiness = 'ARIBIA LLC - MGMT';
const testLegalPersonId = '26-A-LGL-0001-P-10-C-Z';
const bindingPath = 'https://internal/internal/chittyconnect/mercury/account-binding?' +
  new URLSearchParams({
    organizationId: bindingOrgId, accountId: bindingAccountId,
    tenantId: bindingTenantId, canonicalBusinessIdentity: bindingBusiness,
  }).toString();

function bindingStorage(overrides: Record<string, unknown> = {}) {
  return makeStorage({
    getTenant: vi.fn(async () => ({
      id: bindingTenantId, name: bindingBusiness, isActive: true,
      metadata: { canonicalBusinessIdentity: bindingBusiness },
    })),
    getMercuryAccountBindingsByExternalId: vi.fn(async () => [{
      id: bindingFinanceAccountId, tenantId: bindingTenantId,
      externalId: bindingAccountId, institution: 'Mercury', isActive: true,
      metadata: { mercuryOrganizationId: bindingOrgId, legal_person_chittyid: testLegalPersonId },
    }]),
    ...overrides,
  });
}

describe('Mercury exact finance account-binding guard', () => {
  it('returns an exact, read-only provider and canonical tenant match', async () => {
    const storage = bindingStorage();
    const response = await makeApp(storage).request(bindingPath, { headers: internalHeaders });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      financeAccountId: bindingFinanceAccountId, tenantId: bindingTenantId,
      organizationId: bindingOrgId, externalAccountId: bindingAccountId,
    });
    expect((storage as any).getMercuryAccountBindingsByExternalId).toHaveBeenCalledWith(bindingAccountId);
  });

  it('rejects public or spoofed request origin before reading any ledger rows', async () => {
    const storage = bindingStorage();
    const app = makeApp(storage);
    const publicPath = bindingPath.replace('https://internal/', 'https://finance.chitty.cc/');
    expect((await app.request(publicPath, { headers: internalHeaders })).status).toBe(404);
    expect((await app.request(bindingPath, { headers: { 'X-ChittyOS-Caller': 'unknown' } })).status).toBe(404);
    expect((storage as any).getMercuryAccountBindingsByExternalId).not.toHaveBeenCalled();
  });

  it('reports an unbound account without creating or guessing an account identity', async () => {
    const storage = bindingStorage({ getMercuryAccountBindingsByExternalId: vi.fn(async () => []) });
    const response = await makeApp(storage).request(bindingPath, { headers: internalHeaders });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ financeAccountId: null, status: 'unbound' });
  });

  it('rejects duplicate provider account rows, wrong tenant and wrong provider organization', async () => {
    const duplicate = bindingStorage({ getMercuryAccountBindingsByExternalId: vi.fn(async () => [
      { id: bindingFinanceAccountId }, { id: 'another' },
    ]) });
    const repeated = await makeApp(duplicate).request(bindingPath, { headers: internalHeaders });
    expect(repeated.status).toBe(409);
    expect(await repeated.json()).toEqual({ error: 'mercury_account_ownership_ambiguous' });

    for (const row of [
      { id: bindingFinanceAccountId, tenantId: 'other-tenant', externalId: bindingAccountId,
        institution: 'Mercury', isActive: true, metadata: { mercuryOrganizationId: bindingOrgId, legal_person_chittyid: testLegalPersonId } },
      { id: bindingFinanceAccountId, tenantId: bindingTenantId, externalId: bindingAccountId,
        institution: 'Mercury', isActive: true, metadata: { mercuryOrganizationId: 'other-organization' } },
      { id: bindingFinanceAccountId, tenantId: bindingTenantId, externalId: bindingAccountId,
        institution: 'Mercury', isActive: true, metadata: {} },
    ]) {
      const response = await makeApp(bindingStorage({
        getMercuryAccountBindingsByExternalId: vi.fn(async () => [row]),
      })).request(bindingPath, { headers: internalHeaders });
      expect(response.status).toBe(409);
    }
  });

  it('rejects tenants lacking explicit governed business identity even when display name matches', async () => {
    const storage = bindingStorage({
      getTenant: vi.fn(async () => ({
        id: bindingTenantId, name: bindingBusiness, isActive: true, metadata: {},
      })),
    });
    const res = await makeApp(storage).request(bindingPath, { headers: internalHeaders });
    expect(res.status).toBe(409);
    expect((storage as any).getMercuryAccountBindingsByExternalId).not.toHaveBeenCalled();
  });

  it('rejects inactive tenants/accounts, non-Mercury institutions and inconsistent org provenance', async () => {
    const disabledTenant = await makeApp(bindingStorage({
      getTenant: vi.fn(async () => ({
        id: bindingTenantId, name: bindingBusiness, isActive: false,
        metadata: { canonicalBusinessIdentity: bindingBusiness },
      })),
    })).request(bindingPath, { headers: internalHeaders });
    expect(disabledTenant.status).toBe(409);

    for (const row of [
      { id: bindingFinanceAccountId, tenantId: bindingTenantId, externalId: bindingAccountId,
        institution: 'Mercury', isActive: false, metadata: { mercuryOrganizationId: bindingOrgId } },
      { id: bindingFinanceAccountId, tenantId: bindingTenantId, externalId: bindingAccountId,
        institution: 'Wave', isActive: true, metadata: { mercuryOrganizationId: bindingOrgId } },
      { id: bindingFinanceAccountId, tenantId: bindingTenantId, externalId: bindingAccountId,
        institution: 'Mercury', isActive: true,
        metadata: { mercuryOrganizationId: bindingOrgId, mercuryOrgId: 'different-org' } },
    ]) {
      const res = await makeApp(bindingStorage({
        getMercuryAccountBindingsByExternalId: vi.fn(async () => [row]),
      })).request(bindingPath, { headers: internalHeaders });
      expect(res.status).toBe(409);
    }
  });

  it('blocks a provider account without a verified Legal Person ChittyID, despite exact Mercury IDs', async () => {
    const storage = bindingStorage({
      getMercuryAccountBindingsByExternalId: vi.fn(async () => [{
        id: bindingFinanceAccountId, tenantId: bindingTenantId,
        externalId: bindingAccountId, institution: 'Mercury', isActive: true,
        metadata: { mercuryOrganizationId: bindingOrgId },
      }]),
    });
    const res = await makeApp(storage).request(bindingPath, { headers: internalHeaders });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'legal_person_binding_missing' });
    expect((storage as any).createTransaction).toBeUndefined();
  });

  it('rejects a non-Person or malformed Legal Person assertion', async () => {
    for (const chittyId of ['26-A-LGL-0001-T-10-C-Z', 'APTA', '']) {
      const storage = bindingStorage({
        getMercuryAccountBindingsByExternalId: vi.fn(async () => [{
          id: bindingFinanceAccountId, tenantId: bindingTenantId,
          externalId: bindingAccountId, institution: 'Mercury', isActive: true,
          metadata: { mercuryOrganizationId: bindingOrgId, legal_person_chittyid: chittyId },
        }]),
      });
      const res = await makeApp(storage).request(bindingPath, { headers: internalHeaders });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: 'legal_person_binding_missing' });
    }
  });

  it('rejects a tenant identity collision, invalid IDs and Finance database read failures', async () => {
    const wrongTenant = await makeApp(bindingStorage({
      getTenant: vi.fn(async () => ({
        id: bindingTenantId, name: 'Incorrect Owner', isActive: true,
        metadata: { canonicalBusinessIdentity: 'Incorrect Owner' },
      })),
    })).request(bindingPath, { headers: internalHeaders });
    expect(wrongTenant.status).toBe(409);

    const storage = bindingStorage();
    const app = makeApp(storage);
    for (const invalidPath of [
      bindingPath.replace(bindingOrgId, 'APTA'),
      bindingPath.replace(bindingAccountId, 'invalid-account'),
      bindingPath.replace(bindingTenantId, 'invalid-tenant'),
    ]) {
      const invalid = await app.request(invalidPath, { headers: internalHeaders });
      expect(invalid.status).toBe(400);
    }
    expect((storage as any).getMercuryAccountBindingsByExternalId).not.toHaveBeenCalled();

    const unavailable = await makeApp(bindingStorage({
      getMercuryAccountBindingsByExternalId: vi.fn(async () => { throw new Error('private-db-secret'); }),
    })).request(bindingPath, { headers: internalHeaders });
    expect(unavailable.status).toBe(503);
    expect(JSON.stringify(await unavailable.json())).not.toContain('private-db-secret');
  });
});
