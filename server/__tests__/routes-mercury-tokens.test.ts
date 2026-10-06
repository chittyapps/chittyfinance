import { describe, it, expect } from 'vitest';
import { createApp } from '../app';
import { KV_RUN_LATEST, MERCURY_TOKEN_BINDINGS } from '../lib/mercury-token-keepalive';

/**
 * Covers the gate and the shape of /api/v1/mercury-tokens through the real app, so
 * the middleware wiring in server/app.ts is exercised rather than assumed.
 *
 * `createDb` is injected (an app seam, not a module mock) because createApp's
 * storageMiddleware builds a drizzle client for every request — these routes touch
 * no DB, but the app factory still needs a client it can construct.
 */
function makeKv(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    store,
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => { store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
  } as unknown as KVNamespace & { store: Map<string, string> };
}

const SERVICE_TOKEN = 'service-token-for-test';

function makeEnv(kv: KVNamespace) {
  return {
    MODE: 'system',
    NODE_ENV: 'test',
    APP_VERSION: '2.0.0-test',
    CHITTY_AUTH_SERVICE_TOKEN: SERVICE_TOKEN,
    DATABASE_URL: 'postgres://user:pw@localhost/db',
    FINANCE_KV: kv,
    FINANCE_R2: {} as any,
    ASSETS: {} as any,
  } as any;
}

const app = createApp({ createDb: (() => ({})) as any });

describe('GET /api/v1/mercury-tokens — auth gate', () => {
  // An unauthenticated endpoint enumerating which banking tokens are alive would be
  // an information leak, so this must not follow its public /api/v1/* neighbours.
  it('rejects an unauthenticated request', async () => {
    const res = await app.request('/api/v1/mercury-tokens', {}, makeEnv(makeKv()));
    expect(res.status).toBe(401);
  });

  it('rejects a wrong bearer token', async () => {
    const res = await app.request(
      '/api/v1/mercury-tokens',
      { headers: { authorization: 'Bearer wrong' } },
      makeEnv(makeKv()),
    );
    expect(res.status).toBe(401);
  });

  it('rejects an unauthenticated probe trigger', async () => {
    const res = await app.request('/api/v1/mercury-tokens/probe', { method: 'POST' }, makeEnv(makeKv()));
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/mercury-tokens — response', () => {
  it('reports no_run_recorded before the first run, and lists the bindings it will probe', async () => {
    const res = await app.request(
      '/api/v1/mercury-tokens',
      { headers: { authorization: `Bearer ${SERVICE_TOKEN}` } },
      makeEnv(makeKv()),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('no_run_recorded');
    expect(body.tokens).toEqual([...MERCURY_TOKEN_BINDINGS]);
  });

  it('returns the recorded run with per-token liveness and no credential material', async () => {
    const report = {
      ranAt: '2026-10-03T09:00:00.000Z',
      probeUrl: 'https://api.mercury.com/api/v1/accounts?limit=1',
      counts: { alive: 1, dead: 1, indeterminate: 5 },
      results: [
        { token: 'MERCURY_TOKEN_ARIBIA_LLC', liveness: 'alive', reason: 'ok: HTTP 200', status: 200, errorCode: null, checkedAt: '2026-10-03T09:00:00.000Z' },
        { token: 'MERCURY_TOKEN_CHITTY_SERVICES', liveness: 'dead', reason: 'rejected: HTTP 401 (noTokenInDB)', status: 401, errorCode: 'noTokenInDB', checkedAt: '2026-10-03T09:00:00.000Z' },
      ],
    };
    const kv = makeKv({ [KV_RUN_LATEST]: JSON.stringify(report) });

    const res = await app.request(
      '/api/v1/mercury-tokens',
      { headers: { authorization: `Bearer ${SERVICE_TOKEN}` } },
      makeEnv(kv),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('ok');
    expect(body.counts).toEqual({ alive: 1, dead: 1, indeterminate: 5 });
    expect(body.results[1].liveness).toBe('dead');
    expect(body.results[1].errorCode).toBe('noTokenInDB');
    expect(JSON.stringify(body)).not.toContain('secret-token:');
  });
});
