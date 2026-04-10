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
const { mockCreateTransaction, mockGetByExternalId } = vi.hoisted(() => ({
  mockCreateTransaction: vi.fn(),
  mockGetByExternalId: vi.fn(),
}));

vi.mock('../db/connection', () => ({
  createDb: vi.fn(() => ({ /* drizzle stub */ })),
}));

vi.mock('../storage/system', () => ({
  SystemStorage: class MockSystemStorage {
    getTransactionByExternalId = mockGetByExternalId;
    createTransaction = mockCreateTransaction;
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
  const { webhookRoutes } = await import('../routes/webhooks');
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
  global.fetch = originalFetch;
  baseEnv.FINANCE_KV = makeKv();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('POST /api/webhooks/mercury', () => {
  it('rejects missing Bearer token with 401', async () => {
    const app = await getApp();
    const res = await app.request(
      '/api/webhooks/mercury',
      { method: 'POST', body: JSON.stringify(buildEnvelope()) },
      baseEnv,
    );
    expect(res.status).toBe(401);
  });

  it('rejects wrong token with 401', async () => {
    const app = await getApp();
    const res = await app.request(
      '/api/webhooks/mercury',
      {
        method: 'POST',
        headers: { authorization: 'Bearer wrong', 'content-type': 'application/json' },
        body: JSON.stringify(buildEnvelope()),
      },
      baseEnv,
    );
    expect(res.status).toBe(401);
  });

  it('rejects invalid envelope with 400', async () => {
    const app = await getApp();
    const res = await app.request(
      '/api/webhooks/mercury',
      {
        method: 'POST',
        headers: { authorization: 'Bearer svc-token', 'content-type': 'application/json' },
        body: JSON.stringify({ data: { transaction: { bad: 'shape' } } }),
      },
      baseEnv,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toBe('invalid_envelope');
  });

  it('persists transaction with auto-classified suggestedCoaCode', async () => {
    mockGetByExternalId.mockResolvedValue(null);
    mockCreateTransaction.mockResolvedValue({ id: 'new-tx-id' });
    // ChittySchema returns valid
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ valid: true }), { status: 200 }),
    ) as any;

    const app = await getApp();
    const res = await app.request(
      '/api/webhooks/mercury',
      {
        method: 'POST',
        headers: { authorization: 'Bearer svc-token', 'content-type': 'application/json' },
        body: JSON.stringify(buildEnvelope()),
      },
      baseEnv,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.received).toBe(true);
    expect(body.transactionId).toBe('new-tx-id');
    // "Home Depot" maps to supplies (5080) via TURBOTENANT_CATEGORY_MAP
    // and "Repairs" category also matches 5070 — category takes precedence
    expect(body.suggestedCoaCode).toBe('5070');
    expect(body.classificationConfidence).toBe('0.700');
    expect(body.schemaAdvisory).toBe(false);

    expect(mockCreateTransaction).toHaveBeenCalledOnce();
    const call = mockCreateTransaction.mock.calls[0][0];
    expect(call.tenantId).toBe(TENANT_ID);
    expect(call.accountId).toBe(ACCOUNT_ID);
    expect(call.externalId).toBe('mercury:mtx-abc');
    expect(call.suggestedCoaCode).toBe('5070');
    expect(call.type).toBe('expense'); // negative amount
    expect(call.metadata).toEqual({
      source: 'mercury_webhook',
      mercuryTransactionId: 'mtx-abc',
      eventId: 'evt-1',
    });
  });

  it('assigns suspense 9010 with low confidence for unmatchable descriptions', async () => {
    mockGetByExternalId.mockResolvedValue(null);
    mockCreateTransaction.mockResolvedValue({ id: 'new-tx-id' });
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ valid: true }), { status: 200 }),
    ) as any;

    const app = await getApp();
    const res = await app.request(
      '/api/webhooks/mercury',
      {
        method: 'POST',
        headers: { authorization: 'Bearer svc-token', 'content-type': 'application/json' },
        body: JSON.stringify(
          buildEnvelope({ description: 'xyz unknown merchant', category: null }),
        ),
      },
      baseEnv,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.suggestedCoaCode).toBe('9010');
    expect(body.classificationConfidence).toBe('0.100');
  });

  it('dedups via KV on repeat event id', async () => {
    mockGetByExternalId.mockResolvedValue(null);
    mockCreateTransaction.mockResolvedValue({ id: 'new-tx-id' });
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ valid: true }), { status: 200 }),
    ) as any;

    const app = await getApp();
    const env = { ...baseEnv, FINANCE_KV: makeKv() };

    // First request creates
    const res1 = await app.request(
      '/api/webhooks/mercury',
      {
        method: 'POST',
        headers: { authorization: 'Bearer svc-token', 'content-type': 'application/json' },
        body: JSON.stringify(buildEnvelope()),
      },
      env,
    );
    expect(res1.status).toBe(201);

    // Second request with same event id is deduped
    const res2 = await app.request(
      '/api/webhooks/mercury',
      {
        method: 'POST',
        headers: { authorization: 'Bearer svc-token', 'content-type': 'application/json' },
        body: JSON.stringify(buildEnvelope()),
      },
      env,
    );
    expect(res2.status).toBe(202);
    const body = (await res2.json()) as any;
    expect(body.duplicate).toBe(true);
    expect(mockCreateTransaction).toHaveBeenCalledOnce(); // only the first one persisted
  });

  it('dedups via externalId if KV write was lost between retries', async () => {
    mockGetByExternalId.mockResolvedValue({ id: 'existing-tx-id' });
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ valid: true }), { status: 200 }),
    ) as any;

    const app = await getApp();
    const res = await app.request(
      '/api/webhooks/mercury',
      {
        method: 'POST',
        headers: { authorization: 'Bearer svc-token', 'content-type': 'application/json' },
        body: JSON.stringify(buildEnvelope()),
      },
      baseEnv,
    );

    expect(res.status).toBe(202);
    const body = (await res.json()) as any;
    expect(body.duplicate).toBe(true);
    expect(body.transactionId).toBe('existing-tx-id');
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('persists even when ChittySchema validation fails (advisory, not blocking)', async () => {
    mockGetByExternalId.mockResolvedValue(null);
    mockCreateTransaction.mockResolvedValue({ id: 'new-tx-id' });
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ valid: false, errors: [{ path: 'amount', message: 'bad' }] }),
          { status: 200 },
        ),
    ) as any;

    const app = await getApp();
    const res = await app.request(
      '/api/webhooks/mercury',
      {
        method: 'POST',
        headers: { authorization: 'Bearer svc-token', 'content-type': 'application/json' },
        body: JSON.stringify(buildEnvelope()),
      },
      baseEnv,
    );

    // Still persisted despite schema failure — advisory, not blocking
    expect(res.status).toBe(201);
    expect(mockCreateTransaction).toHaveBeenCalledOnce();
  });

  it('persists even when ChittySchema is unreachable', async () => {
    mockGetByExternalId.mockResolvedValue(null);
    mockCreateTransaction.mockResolvedValue({ id: 'new-tx-id' });
    global.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as any;

    const app = await getApp();
    const res = await app.request(
      '/api/webhooks/mercury',
      {
        method: 'POST',
        headers: { authorization: 'Bearer svc-token', 'content-type': 'application/json' },
        body: JSON.stringify(buildEnvelope()),
      },
      baseEnv,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.schemaAdvisory).toBe(true);
    expect(mockCreateTransaction).toHaveBeenCalledOnce();
  });

  it('acks envelope-only events (no transaction) with 202', async () => {
    const app = await getApp();
    const res = await app.request(
      '/api/webhooks/mercury',
      {
        method: 'POST',
        headers: { authorization: 'Bearer svc-token', 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'evt-noop', type: 'account.created' }),
      },
      baseEnv,
    );
    expect(res.status).toBe(202);
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });
});
