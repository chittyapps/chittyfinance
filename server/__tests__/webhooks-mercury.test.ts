/**
 * Tests for POST /api/webhooks/mercury
 *
 * Exercises the real-time classification flow end-to-end:
 *   - service auth
 *   - envelope validation (zod)
 *   - KV dedup
 *   - auto-classification via findAccountCode()
 *   - ChittySchema advisory validation (never blocks)
 *   - DB persistence with suggestedCoaCode populated
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';

// Module-level mocks — the webhook handler imports these directly, so we
// intercept before the route module loads. vi.mock() is hoisted above
// variable declarations, so we use vi.hoisted() for any fn we reference
// from inside the mock factory.
const {
  mockCreateTransaction,
  mockGetByExternalId,
  mockLookupAccountByExternalId,
  mockGetAccounts,
  mockGetAccount,
  mockCreateAccount
} = vi.hoisted(() => ({
  mockCreateTransaction: vi.fn(),
  mockGetByExternalId: vi.fn(),
  mockLookupAccountByExternalId: vi.fn(),
  mockGetAccounts: vi.fn(),
  mockGetAccount: vi.fn(),
  mockCreateAccount: vi.fn()
}));

vi.mock('../db/connection', () => ({
  createDb: vi.fn(() => ({ /* drizzle stub */ })),
}));

// This stand-in must cover every storage method the route calls. When the route
// grew account resolution, the two methods below were all that existed here, so
// every request TypeError'd into a 500 -- which these tests caught correctly and
// which nobody saw, because no CI job ran them. See the storage-surface guard
// at the bottom of this file, which fails if the route gains another call.
vi.mock('../storage/system', () => ({
  SystemStorage: class MockSystemStorage {
    getTransactionByExternalId = mockGetByExternalId;
    createTransaction = mockCreateTransaction;
    lookupAccountByExternalId = mockLookupAccountByExternalId;
    getAccounts = mockGetAccounts;
    getAccount = mockGetAccount;
    createAccount = mockCreateAccount;
  },
}));

vi.mock('../lib/ledger-client', () => ({
  ledgerLog: vi.fn(),
}));

const originalFetch = global.fetch;

// Fake KV implementation — in-memory Map with ttl ignored
function makeKv() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    put: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
  } as any;
}

const baseEnv = {
  CHITTY_AUTH_SERVICE_TOKEN: 'svc-token',
  DATABASE_URL: 'fake://db',
  FINANCE_KV: makeKv(),
  FINANCE_R2: {} as any,
  ASSETS: {} as any,
} as any;

// Lazy-import the webhook routes so module mocks above take effect
async function getApp() {
  const { webhookRoutes } = await import('../books/webhooks');
  const app = new Hono<HonoEnv>();
  app.route('/', webhookRoutes);
  return app;
}

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ACCOUNT_ID = '22222222-2222-2222-2222-222222222222';

function buildEnvelope(partial: Partial<any> = {}): any {
  return {
    id: 'evt-1',
    type: 'transaction.created',
    data: {
      transaction: {
        tenantId: TENANT_ID,
        accountId: ACCOUNT_ID,
        mercuryTransactionId: 'mtx-abc',
        description: 'Home Depot #1234',
        amount: -125.4,
        category: 'Repairs',
        postedAt: '2026-04-10T12:00:00Z',
        ...partial,
      },
    },
  };
}

beforeEach(() => {
  mockCreateTransaction.mockReset();
  mockGetByExternalId.mockReset();
  mockLookupAccountByExternalId.mockReset();
  mockGetAccounts.mockReset();
  mockGetAccount.mockReset();
  mockCreateAccount.mockReset();

  // Default: the tenant already has one account, which is the ordinary path.
  // Individual tests override where they care.
  mockLookupAccountByExternalId.mockResolvedValue(null);
  mockGetAccounts.mockResolvedValue([{ id: ACCOUNT_ID, tenantId: TENANT_ID, isActive: true, metadata: null }]);
  mockGetAccount.mockResolvedValue({ id: ACCOUNT_ID, tenantId: TENANT_ID, isActive: true, metadata: null });
  mockCreateAccount.mockResolvedValue({ id: ACCOUNT_ID, tenantId: TENANT_ID, isActive: true, metadata: null });
  mockCreateTransaction.mockImplementation(async (row: Record<string, unknown>) => ({ id: 'tx-created', ...row }));
  mockGetByExternalId.mockResolvedValue(null);

  global.fetch = originalFetch;
  baseEnv.FINANCE_KV = makeKv();
});

afterEach(() => {
  global.fetch = originalFetch;
});

async function mercurySignature(rawBody: string, secret: string, timestamp = String(Math.floor(Date.now() / 1000))) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${timestamp}.${rawBody}`),
  );
  const hex = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${timestamp},v1=${hex}`;
}

describe('POST /api/webhooks/mercury/organization/:organizationId canonical provider receiver', () => {
  const ORG_ID = '9082ea0c-07a8-11ef-b331-734021561438';
  const PATH = '/api/webhooks/mercury/organization/' + ORG_ID;
  const event = {
    id: 'provider-event-1', resourceType: 'transaction',
    resourceId: 'provider-tx-1', operationType: 'update',
    occurredAt: '2026-10-11T13:00:00Z',
    mergePatch: { status: 'pending' },
  };

  const durableReceipt = (providerEventId: string) => ({
    accepted: true,
    durable: true,
    organizationId: ORG_ID,
    idempotencyKey: 'webhook:mercury:org:' + ORG_ID + ':' + providerEventId,
    receiptId: 'broker-receipt-' + providerEventId,
  });

  it('fails closed without a deployed private ChittyConnect verifier', async () => {
    const env = { ...baseEnv, FINANCE_KV: makeKv() };
    const app = await getApp();
    const res = await app.request(PATH, {
      method: 'POST',
      headers: { 'Mercury-Signature': 't=1791234000,v1=deadbeef' },
      body: JSON.stringify(event),
    }, env);
    expect(res.status).toBe(503);
    expect(env.FINANCE_KV.put).not.toHaveBeenCalled();
  });

  it('does not trust caller-controlled org identity without broker confirmation', async () => {
    const verifier = { verifyMercuryWebhookSignature: vi.fn().mockResolvedValue({
      verified: true, organizationId: 'e15f4a46-e328-11ee-9e22-5f2c16c0b48b',
    }) };
    const env = { ...baseEnv, FINANCE_KV: makeKv(), SVC_MERCURY_WEBHOOK_VERIFIER: verifier };
    const app = await getApp();
    const res = await app.request(PATH, {
      method: 'POST',
      headers: { 'Mercury-Signature': 't=1791234000,v1=deadbeef' },
      body: JSON.stringify(event),
    }, env);
    expect(res.status).toBe(401);
    expect(env.FINANCE_KV.put).not.toHaveBeenCalled();
  });

  it('verified pending transaction is a reconciliation trigger, never a direct ledger row', async () => {
    const verifier = {
      verifyMercuryWebhookSignature: vi.fn().mockResolvedValue({
        verified: true, organizationId: ORG_ID,
      }),
      acceptMercuryReconciliationIntent: vi.fn().mockResolvedValue(durableReceipt('provider-event-1')),
    };
    const env = { ...baseEnv, FINANCE_KV: makeKv(), SVC_MERCURY_WEBHOOK_VERIFIER: verifier };
    const app = await getApp();
    const raw = JSON.stringify(event);
    const request = () => app.request(PATH, {
      method: 'POST',
      headers: { 'Mercury-Signature': 't=1791234000,v1=' + 'a'.repeat(64) },
      body: raw,
    }, env);
    const first = await request();
    expect(first.status).toBe(202);
    const body = await first.json() as any;
    expect(body.reconciliationRequired).toBe(true);
    expect(body.mercuryOrganizationId).toBe(ORG_ID);
    expect(verifier.verifyMercuryWebhookSignature).toHaveBeenCalledWith({
      organizationId: ORG_ID, rawBody: raw,
      signatureHeader: 't=1791234000,v1=' + 'a'.repeat(64),
    });
    expect(verifier.acceptMercuryReconciliationIntent).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      providerEventId: 'provider-event-1',
      resourceType: 'transaction',
      resourceId: 'provider-tx-1',
      operationType: 'update',
      resourceVersion: null,
      occurredAt: '2026-10-11T13:00:00Z',
      idempotencyKey: 'webhook:mercury:org:' + ORG_ID + ':provider-event-1',
    });
    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockCreateAccount).not.toHaveBeenCalled();
    expect(env.FINANCE_KV.put).toHaveBeenCalledTimes(1);
    expect(env.FINANCE_KV.put).toHaveBeenCalledWith(
      'webhook:mercury:org:' + ORG_ID + ':provider-event-1',
      JSON.stringify({
        state: 'reconciliation_required',
        mercuryOrganizationId: ORG_ID,
        resourceType: 'transaction',
        resourceId: 'provider-tx-1',
        operationType: 'update',
        resourceVersion: null,
        occurredAt: '2026-10-11T13:00:00Z',
        dispatchReceiptId: 'broker-receipt-provider-event-1',
      }), { expirationTtl: 604800 },
    );
    const second = await request();
    expect(second.status).toBe(200);
    const duplicate = await second.json() as any;
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.dispatchAccepted).toBe(true);
    expect(duplicate).not.toHaveProperty('reconciliationRequired');
    expect(verifier.acceptMercuryReconciliationIntent).toHaveBeenCalledTimes(2);
    expect(env.FINANCE_KV.put).toHaveBeenCalledTimes(1);
  });

  it('accepts signed provider creation events with previousValues null as reconciliation intent', async () => {
    const verifier = {
      verifyMercuryWebhookSignature: vi.fn().mockResolvedValue({
        verified: true, organizationId: ORG_ID,
      }),
      acceptMercuryReconciliationIntent: vi.fn().mockResolvedValue(durableReceipt('provider-created-null-1')),
    };
    const env = { ...baseEnv, FINANCE_KV: makeKv(), SVC_MERCURY_WEBHOOK_VERIFIER: verifier };
    const app = await getApp();
    const created = { ...event, id: 'provider-created-null-1', operationType: 'create', previousValues: null };
    const res = await app.request(PATH, {
      method: 'POST',
      headers: { 'Mercury-Signature': 't=1791234000,v1=' + 'a'.repeat(64) },
      body: JSON.stringify(created),
    }, env);
    expect(res.status).toBe(202);
    expect((await res.json() as any).reconciliationRequired).toBe(true);
    const stored = JSON.parse(await env.FINANCE_KV.get(
      'webhook:mercury:org:' + ORG_ID + ':provider-created-null-1',
    ));
    expect(stored.state).toBe('reconciliation_required');
    expect(stored.mercuryOrganizationId).toBe(ORG_ID);
    expect(stored.resourceId).toBe('provider-tx-1');
    expect(stored.dispatchReceiptId).toBe('broker-receipt-provider-created-null-1');
    expect(verifier.acceptMercuryReconciliationIntent).toHaveBeenCalledTimes(1);
    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockCreateAccount).not.toHaveBeenCalled();
  });

  it('fails closed on a valid signed event when no durable consumer is deployed', async () => {
    const verifier = { verifyMercuryWebhookSignature: vi.fn().mockResolvedValue({
      verified: true, organizationId: ORG_ID,
    }) };
    const env = { ...baseEnv, FINANCE_KV: makeKv(), SVC_MERCURY_WEBHOOK_VERIFIER: verifier };
    const app = await getApp();
    const res = await app.request(PATH, {
      method: 'POST', headers: { 'Mercury-Signature': 't=1791234000,v1=' + 'a'.repeat(64) },
      body: JSON.stringify(event),
    }, env);
    expect(res.status).toBe(503);
    expect((await res.json() as any).error).toBe('mercury_reconciliation_consumer_unavailable');
    expect(env.FINANCE_KV.put).not.toHaveBeenCalled();
    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockCreateAccount).not.toHaveBeenCalled();
  });

  it('refuses non-durable, misbound or receipt-less broker confirmations without persisting intent', async () => {
    const app = await getApp();
    for (const incomplete of [
      { ...durableReceipt(event.id), durable: false },
      { ...durableReceipt(event.id), accepted: false },
      null,
      { ...durableReceipt(event.id), organizationId: 'e15f4a46-e328-11ee-9e22-5f2c16c0b48b' },
      { ...durableReceipt(event.id), receiptId: '' },
      { ...durableReceipt(event.id), idempotencyKey: 'wrong-event-key' },
    ]) {
      const env = {
        ...baseEnv, FINANCE_KV: makeKv(),
        SVC_MERCURY_WEBHOOK_VERIFIER: {
          verifyMercuryWebhookSignature: vi.fn().mockResolvedValue({
            verified: true, organizationId: ORG_ID,
          }),
          acceptMercuryReconciliationIntent: vi.fn().mockResolvedValue(incomplete),
        },
      };
      const res = await app.request(PATH, {
        method: 'POST',
        headers: { 'Mercury-Signature': 't=1791234000,v1=' + 'a'.repeat(64) },
        body: JSON.stringify(event),
      }, env);
      expect(res.status).toBe(503);
      expect((await res.json() as any).error).toBe('mercury_reconciliation_dispatch_not_durable');
      expect(env.FINANCE_KV.put).not.toHaveBeenCalled();
    }
  });

  it('retries source delivery when the broker throws without creating a KV marker', async () => {
    const env = {
      ...baseEnv, FINANCE_KV: makeKv(),
      SVC_MERCURY_WEBHOOK_VERIFIER: {
        verifyMercuryWebhookSignature: vi.fn().mockResolvedValue({ verified: true, organizationId: ORG_ID }),
        acceptMercuryReconciliationIntent: vi.fn().mockRejectedValue(new Error('broker unavailable')),
      },
    };
    const app = await getApp();
    const res = await app.request(PATH, {
      method: 'POST', headers: { 'Mercury-Signature': 't=1791234000,v1=' + 'a'.repeat(64) },
      body: JSON.stringify(event),
    }, env);
    expect(res.status).toBe(503);
    expect((await res.json() as any).error).toBe('mercury_reconciliation_dispatch_unavailable');
    expect(env.FINANCE_KV.put).not.toHaveBeenCalled();
  });

  it('retries the same idempotent dispatch when FINANCE_KV write fails after acceptance', async () => {
    const kv = makeKv();
    const realPut = kv.put;
    kv.put = vi.fn()
      .mockRejectedValueOnce(new Error('kv write unavailable'))
      .mockImplementation(realPut);
    const verifier = {
      verifyMercuryWebhookSignature: vi.fn().mockResolvedValue({
        verified: true, organizationId: ORG_ID,
      }),
      acceptMercuryReconciliationIntent: vi.fn().mockResolvedValue(durableReceipt(event.id)),
    };
    const env = { ...baseEnv, FINANCE_KV: kv, SVC_MERCURY_WEBHOOK_VERIFIER: verifier };
    const app = await getApp();
    const request = () => app.request(PATH, {
      method: 'POST',
      headers: { 'Mercury-Signature': 't=1791234000,v1=' + 'a'.repeat(64) },
      body: JSON.stringify(event),
    }, env);

    const first = await request();
    expect(first.status).toBe(503);
    expect((await first.json() as any).error).toBe('mercury_reconciliation_kv_unavailable');
    expect(await kv.get('webhook:mercury:org:' + ORG_ID + ':' + event.id)).toBeNull();

    const retry = await request();
    expect(retry.status).toBe(202);
    expect((await retry.json() as any).dispatchAccepted).toBe(true);
    expect(verifier.acceptMercuryReconciliationIntent).toHaveBeenCalledTimes(2);
    const stored = JSON.parse(await kv.get('webhook:mercury:org:' + ORG_ID + ':' + event.id));
    expect(stored.dispatchReceiptId).toBe('broker-receipt-' + event.id);
  });

  it('does not acknowledge a broker receipt if the KV replay read fails', async () => {
    const kv = makeKv();
    kv.get = vi.fn().mockRejectedValue(new Error('kv read unavailable'));
    const verifier = {
      verifyMercuryWebhookSignature: vi.fn().mockResolvedValue({
        verified: true, organizationId: ORG_ID,
      }),
      acceptMercuryReconciliationIntent: vi.fn().mockResolvedValue(durableReceipt(event.id)),
    };
    const env = { ...baseEnv, FINANCE_KV: kv, SVC_MERCURY_WEBHOOK_VERIFIER: verifier };
    const app = await getApp();
    const res = await app.request(PATH, {
      method: 'POST',
      headers: { 'Mercury-Signature': 't=1791234000,v1=' + 'a'.repeat(64) },
      body: JSON.stringify(event),
    }, env);
    expect(res.status).toBe(503);
    expect((await res.json() as any).error).toBe('mercury_reconciliation_kv_unavailable');
    expect(kv.put).not.toHaveBeenCalled();
    expect(verifier.acceptMercuryReconciliationIntent).toHaveBeenCalledTimes(1);
  });

  it('legacy KV receipt marker cannot bypass missing downstream consumer', async () => {
    const kv = makeKv();
    await kv.put('webhook:mercury:org:' + ORG_ID + ':' + event.id, '1');
    const env = {
      ...baseEnv, FINANCE_KV: kv,
      SVC_MERCURY_WEBHOOK_VERIFIER: {
        verifyMercuryWebhookSignature: vi.fn().mockResolvedValue({ verified: true, organizationId: ORG_ID }),
      },
    };
    const app = await getApp();
    const res = await app.request(PATH, {
      method: 'POST', headers: { 'Mercury-Signature': 't=1791234000,v1=' + 'a'.repeat(64) },
      body: JSON.stringify(event),
    }, env);
    expect(res.status).toBe(503);
    expect((await res.json() as any).error).toBe('mercury_reconciliation_consumer_unavailable');
    // The sole put is the test's own setup, never a handler write.
    expect(kv.put).toHaveBeenCalledTimes(1);
    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockCreateAccount).not.toHaveBeenCalled();
  });

  it('enforces provider webhook payload limit by UTF-8 bytes before invoking verifier', async () => {
    const verifier = { verifyMercuryWebhookSignature: vi.fn() };
    const env = { ...baseEnv, FINANCE_KV: makeKv(), SVC_MERCURY_WEBHOOK_VERIFIER: verifier };
    const app = await getApp();
    const res = await app.request(PATH, {
      method: 'POST',
      headers: { 'Mercury-Signature': 't=1791234000,v1=' + 'a'.repeat(64) },
      body: 'é'.repeat(262145),
    }, env);
    expect(res.status).toBe(413);
    expect(verifier.verifyMercuryWebhookSignature).not.toHaveBeenCalled();
    expect(env.FINANCE_KV.put).not.toHaveBeenCalled();
  });

  it('rejects a declared oversize webhook before reading body or calling verifier', async () => {
    const verifier = { verifyMercuryWebhookSignature: vi.fn() };
    const env = { ...baseEnv, FINANCE_KV: makeKv(), SVC_MERCURY_WEBHOOK_VERIFIER: verifier };
    const app = await getApp();
    const res = await app.request(PATH, {
      method: 'POST',
      headers: {
        'Mercury-Signature': 't=1791234000,v1=' + 'a'.repeat(64),
        'Content-Length': '524289',
      },
      body: JSON.stringify(event),
    }, env);
    expect(res.status).toBe(413);
    expect(verifier.verifyMercuryWebhookSignature).not.toHaveBeenCalled();
    expect(env.FINANCE_KV.put).not.toHaveBeenCalled();
  });

  it('invalid broker verdict cannot create an activity signal', async () => {
    const env = {
      ...baseEnv, FINANCE_KV: makeKv(),
      SVC_MERCURY_WEBHOOK_VERIFIER: {
        verifyMercuryWebhookSignature: vi.fn().mockResolvedValue({
          verified: false, organizationId: ORG_ID,
        }),
      },
    };
    const app = await getApp();
    const res = await app.request(PATH, {
      method: 'POST',
      headers: { 'Mercury-Signature': 't=1791234000,v1=deadbeef' },
      body: JSON.stringify(event),
    }, env);
    expect(res.status).toBe(401);
    expect(env.FINANCE_KV.put).not.toHaveBeenCalled();
  });
});

describe('PUT /api/webhooks/mercury/:tenantId/secret — retired', () => {
  it('cannot persist a one-time Mercury signing secret to tenant KV', async () => {
    const env = { ...baseEnv, FINANCE_KV: makeKv() };
    const app = await getApp();
    const res = await app.request(
      '/api/webhooks/mercury/' + TENANT_ID + '/secret',
      {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer svc-token',
        },
        body: JSON.stringify({ secret: 'do-not-persist' }),
      },
      env,
    );
    expect(res.status).toBe(410);
    expect((await res.json() as any).error).toBe(
      'MERCURY_SIGNING_SECRET_BROKER_REQUIRED',
    );
    expect(env.FINANCE_KV.put).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhooks/mercury/:tenantId native lifecycle', () => {
  function nativeEvent(mergePatch: Record<string, unknown>, partial: Record<string, unknown> = {}) {
    return {
      id: 'native-evt-1',
      resourceType: 'transaction',
      resourceId: 'mtx-native-1',
      operationType: 'create',
      occurredAt: '2026-10-05T18:00:00Z',
      mergePatch,
      ...partial,
    };
  }

  it('fails closed when the tenant signing secret is absent', async () => {
    const app = await getApp();
    const res = await app.request(
      `/api/webhooks/mercury/${TENANT_ID}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(nativeEvent({ status: 'failed' })),
      },
      baseEnv,
    );

    expect(res.status).toBe(503);
    expect((await res.json() as any).error).toBe('webhook_secret_not_configured');
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('rejects an invalid Mercury signature', async () => {
    const env = { ...baseEnv, FINANCE_KV: makeKv() };
    await env.FINANCE_KV.put(`webhook:mercury:secret:${TENANT_ID}`, 'native-secret');
    const app = await getApp();
    const res = await app.request(
      `/api/webhooks/mercury/${TENANT_ID}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Mercury-Signature': 't=1791234000,v1=deadbeef',
        },
        body: JSON.stringify(nativeEvent({ status: 'failed' })),
      },
      env,
    );

    expect(res.status).toBe(401);
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('uses a verified transaction webhook only as a reconciliation trigger', async () => {
    const env = { ...baseEnv, FINANCE_KV: makeKv() };
    const secret = 'native-secret';
    await env.FINANCE_KV.put(`webhook:mercury:secret:${TENANT_ID}`, secret);
    const rawBody = JSON.stringify(nativeEvent({
      amount: -59.5,
      status: 'pending',
      accountId: 'mercury-account-1',
      bankDescription: 'OpenPhone',
    }));
    const signature = await mercurySignature(rawBody, secret);

    const app = await getApp();
    const res = await app.request(
      `/api/webhooks/mercury/${TENANT_ID}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Mercury-Signature': signature,
        },
        body: rawBody,
      },
      env,
    );

    expect(res.status).toBe(202);
    const body = await res.json() as any;
    expect(body.reconciliationRequired).toBe(true);
    expect(body.mercuryTransactionId).toBe('mtx-native-1');
    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockGetByExternalId).not.toHaveBeenCalled();
    const key = `webhook:mercury:${TENANT_ID}:native-evt-1`;
    const stored = JSON.parse(await env.FINANCE_KV.get(key));
    expect(stored).toEqual({
      state: 'reconciliation_required',
      resourceType: 'transaction',
      resourceId: 'mtx-native-1',
      operationType: 'create',
      resourceVersion: null,
      occurredAt: '2026-10-05T18:00:00Z',
    });
    expect(JSON.stringify(stored)).not.toContain('OpenPhone');
    expect(JSON.stringify(stored)).not.toContain('mergePatch');
  });

  it('rejects valid but expired Mercury signatures without writing a pending intent', async () => {
    const env = { ...baseEnv, FINANCE_KV: makeKv() };
    const secret = 'native-secret';
    await env.FINANCE_KV.put(`webhook:mercury:secret:${TENANT_ID}`, secret);
    const rawBody = JSON.stringify(nativeEvent({ status: 'sent' }));
    const expired = String(Math.floor(Date.now() / 1000) - 301);
    const signature = await mercurySignature(rawBody, secret, expired);
    const app = await getApp();
    const res = await app.request(`/api/webhooks/mercury/${TENANT_ID}`, {
      method: 'POST',
      headers: { 'Mercury-Signature': signature, 'content-type': 'application/json' },
      body: rawBody,
    }, env);
    expect(res.status).toBe(401);
    expect(await env.FINANCE_KV.get(`webhook:mercury:${TENANT_ID}:native-evt-1`)).toBeNull();
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('rejects valid future-dated Mercury signatures outside clock skew allowance', async () => {
    const env = { ...baseEnv, FINANCE_KV: makeKv() };
    const secret = 'native-secret';
    await env.FINANCE_KV.put(`webhook:mercury:secret:${TENANT_ID}`, secret);
    const rawBody = JSON.stringify(nativeEvent({ status: 'sent' }));
    const signature = await mercurySignature(rawBody, secret, String(Math.floor(Date.now() / 1000) + 61));
    const app = await getApp();
    const res = await app.request(`/api/webhooks/mercury/${TENANT_ID}`, {
      method: 'POST',
      headers: { 'Mercury-Signature': signature, 'content-type': 'application/json' },
      body: rawBody,
    }, env);
    expect(res.status).toBe(401);
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('deduplicates verified native events before triggering reconciliation twice', async () => {
    const env = { ...baseEnv, FINANCE_KV: makeKv() };
    const secret = 'native-secret';
    await env.FINANCE_KV.put(`webhook:mercury:secret:${TENANT_ID}`, secret);
    const rawBody = JSON.stringify(nativeEvent({ status: 'sent' }));
    const signature = await mercurySignature(rawBody, secret);
    const app = await getApp();

    const request = () => app.request(
      `/api/webhooks/mercury/${TENANT_ID}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Mercury-Signature': signature,
        },
        body: rawBody,
      },
      env,
    );

    expect((await request()).status).toBe(202);
    const second = await request();
    expect(second.status).toBe(200);
    expect((await second.json() as any).duplicate).toBe(true);
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhooks/mercury — retired normalized input', () => {
  it('rejects missing Bearer credentials without invoking a financial operation', async () => {
    const app = await getApp();
    const res = await app.request('/api/webhooks/mercury', {
      method: 'POST',
      body: JSON.stringify(buildEnvelope()),
    }, baseEnv);
    expect(res.status).toBe(401);
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('rejects the wrong service credential', async () => {
    const app = await getApp();
    const res = await app.request('/api/webhooks/mercury', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong', 'content-type': 'application/json' },
      body: JSON.stringify(buildEnvelope()),
    }, baseEnv);
    expect(res.status).toBe(401);
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('fails explicitly for authorized callers rather than acknowledging an unsourced transaction', async () => {
    const app = await getApp();
    const res = await app.request('/api/webhooks/mercury', {
      method: 'POST',
      headers: { authorization: 'Bearer svc-token', 'content-type': 'application/json' },
      body: JSON.stringify(buildEnvelope()),
    }, baseEnv);
    expect(res.status).toBe(410);
    expect((await res.json() as any).error).toBe('LEGACY_MERCURY_INGEST_RETIRED');
    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockGetByExternalId).not.toHaveBeenCalled();
  });

  it('never parses or writes unverified/malformed normalized events into finance', async () => {
    const app = await getApp();
    const env = { ...baseEnv, FINANCE_KV: makeKv() };
    const res = await app.request('/api/webhooks/mercury', {
      method: 'POST',
      headers: { authorization: 'Bearer svc-token', 'content-type': 'application/json' },
      body: '{malformed',
    }, env);
    expect(res.status).toBe(410);
    expect(mockCreateTransaction).not.toHaveBeenCalled();
    expect(mockGetByExternalId).not.toHaveBeenCalled();
  });

  it('fails closed when service authorization is not configured', async () => {
    const app = await getApp();
    const env = { ...baseEnv, CHITTY_AUTH_SERVICE_TOKEN: undefined };
    const res = await app.request('/api/webhooks/mercury', {
      method: 'POST',
      headers: { authorization: 'Bearer svc-token' },
    }, env);
    expect(res.status).toBe(500);
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });
});

describe('storage surface', () => {
  it('implements every storage method the webhook route calls', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.promises.readFile(new URL('../books/webhooks.ts', import.meta.url), 'utf8'),
    );
    const called = new Set([...src.matchAll(/storage\.([a-zA-Z]+)\(/g)].map((m) => m[1]));
    const { SystemStorage } = await import('../storage/system');
    const stub = new (SystemStorage as unknown as new () => Record<string, unknown>)();
    for (const method of called) {
      expect(typeof stub[method], `MockSystemStorage is missing ${method}()`).toBe('function');
    }
  });
});
