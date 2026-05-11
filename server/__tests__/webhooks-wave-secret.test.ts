/**
 * Tests for the Wave per-(tenant, business) webhook secret-storage admin
 * endpoints (PUT/GET/DELETE /api/webhooks/wave/:tenantId/:businessId/secret).
 *
 * These routes only touch KV — no DB, no service modules, no DB-shape risk.
 * Tests use a Map-backed KV stand-in, matching the existing Mercury pattern.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { webhookRoutes } from '../routes/webhooks';

const SERVICE_TOKEN = 'test-service-token';
const TENANT = '11111111-1111-1111-1111-111111111111';
const BUSINESS = 'biz-deadbeef';
const KEY = `webhook:wave:secret:${TENANT}:${BUSINESS}`;

function makeKv() {
  const store = new Map<string, string>();
  return {
    store,
    binding: {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => {
        store.set(k, v);
      },
      delete: async (k: string) => {
        store.delete(k);
      },
    } as unknown as KVNamespace,
  };
}

function makeEnv(kv: KVNamespace, opts: { token?: string } = {}) {
  return {
    CHITTY_AUTH_SERVICE_TOKEN: opts.token ?? SERVICE_TOKEN,
    FINANCE_KV: kv,
  } as Parameters<typeof webhookRoutes.fetch>[1];
}

function authHeader(token = SERVICE_TOKEN) {
  return { authorization: `Bearer ${token}` };
}

async function callPut(env: ReturnType<typeof makeEnv>, body: unknown, headers: Record<string, string>) {
  return webhookRoutes.fetch(
    new Request(`http://x/api/webhooks/wave/${TENANT}/${BUSINESS}/secret`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    env,
  );
}

async function callExists(env: ReturnType<typeof makeEnv>, headers: Record<string, string>) {
  return webhookRoutes.fetch(
    new Request(`http://x/api/webhooks/wave/${TENANT}/${BUSINESS}/secret/exists`, {
      method: 'GET',
      headers,
    }),
    env,
  );
}

async function callDelete(env: ReturnType<typeof makeEnv>, headers: Record<string, string>) {
  return webhookRoutes.fetch(
    new Request(`http://x/api/webhooks/wave/${TENANT}/${BUSINESS}/secret`, {
      method: 'DELETE',
      headers,
    }),
    env,
  );
}

describe('Wave webhook secret storage', () => {
  let kv: ReturnType<typeof makeKv>;

  beforeEach(() => {
    kv = makeKv();
  });

  describe('PUT secret', () => {
    it('rejects when service token is not configured', async () => {
      const env = makeEnv(kv.binding, { token: '' });
      const res = await callPut(env, { secret: 'abc' }, authHeader());
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'auth_not_configured' });
    });

    it('rejects requests with no Authorization header', async () => {
      const env = makeEnv(kv.binding);
      const res = await callPut(env, { secret: 'abc' }, {});
      expect(res.status).toBe(401);
    });

    it('rejects requests with wrong token', async () => {
      const env = makeEnv(kv.binding);
      const res = await callPut(env, { secret: 'abc' }, authHeader('wrong-token'));
      expect(res.status).toBe(401);
      expect(kv.store.has(KEY)).toBe(false);
    });

    it('rejects malformed JSON body', async () => {
      const env = makeEnv(kv.binding);
      const res = await callPut(env, '{not-json', authHeader());
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_json' });
    });

    it('rejects missing secret field', async () => {
      const env = makeEnv(kv.binding);
      const res = await callPut(env, {}, authHeader());
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'secret required' });
    });

    it('rejects non-string secret', async () => {
      const env = makeEnv(kv.binding);
      const res = await callPut(env, { secret: 12345 }, authHeader());
      expect(res.status).toBe(400);
    });

    it('rejects empty-string secret', async () => {
      const env = makeEnv(kv.binding);
      const res = await callPut(env, { secret: '' }, authHeader());
      expect(res.status).toBe(400);
    });

    it('stores valid secret at the canonical KV key', async () => {
      const env = makeEnv(kv.binding);
      const res = await callPut(env, { secret: 'wave-hash-xyz' }, authHeader());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ stored: true, tenantId: TENANT, businessId: BUSINESS });
      expect(kv.store.get(KEY)).toBe('wave-hash-xyz');
    });

    it('overwrites existing secret on subsequent PUT', async () => {
      const env = makeEnv(kv.binding);
      await callPut(env, { secret: 'first' }, authHeader());
      await callPut(env, { secret: 'second' }, authHeader());
      expect(kv.store.get(KEY)).toBe('second');
    });
  });

  describe('GET secret/exists', () => {
    it('rejects unauthorized', async () => {
      const env = makeEnv(kv.binding);
      const res = await callExists(env, {});
      expect(res.status).toBe(401);
    });

    it('returns exists=false when no secret stored', async () => {
      const env = makeEnv(kv.binding);
      const res = await callExists(env, authHeader());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ exists: false, tenantId: TENANT, businessId: BUSINESS });
    });

    it('returns exists=true after PUT, never returning the secret value', async () => {
      const env = makeEnv(kv.binding);
      await callPut(env, { secret: 'super-secret' }, authHeader());
      const res = await callExists(env, authHeader());
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.exists).toBe(true);
      expect(JSON.stringify(body)).not.toContain('super-secret');
    });
  });

  describe('DELETE secret', () => {
    it('rejects unauthorized', async () => {
      const env = makeEnv(kv.binding);
      const res = await callDelete(env, {});
      expect(res.status).toBe(401);
    });

    it('removes a stored secret', async () => {
      const env = makeEnv(kv.binding);
      await callPut(env, { secret: 'abc' }, authHeader());
      expect(kv.store.has(KEY)).toBe(true);
      const res = await callDelete(env, authHeader());
      expect(res.status).toBe(200);
      expect(kv.store.has(KEY)).toBe(false);
    });

    it('is idempotent for non-existent secret', async () => {
      const env = makeEnv(kv.binding);
      const res = await callDelete(env, authHeader());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ deleted: true, tenantId: TENANT, businessId: BUSINESS });
    });
  });

  it('keeps secrets isolated across tenant/business pairs', async () => {
    const env = makeEnv(kv.binding);
    const otherTenant = '22222222-2222-2222-2222-222222222222';
    const otherBusiness = 'biz-other';

    await callPut(env, { secret: 'a-secret' }, authHeader());

    const otherRes = await webhookRoutes.fetch(
      new Request(`http://x/api/webhooks/wave/${otherTenant}/${otherBusiness}/secret/exists`, {
        method: 'GET',
        headers: authHeader(),
      }),
      env,
    );
    expect(otherRes.status).toBe(200);
    expect(await otherRes.json()).toEqual({
      exists: false,
      tenantId: otherTenant,
      businessId: otherBusiness,
    });
  });
});
