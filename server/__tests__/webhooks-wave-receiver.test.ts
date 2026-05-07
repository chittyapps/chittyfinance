/**
 * Tests for POST /api/webhooks/wave/:tenantId/:businessId — Wave native receiver.
 *
 * Exercises the documented Wave webhook flow:
 *   - x-wave-signature: t=<ts>,v1=<hex_hmac_sha256>
 *   - HMAC-SHA256 over `<timestamp>.<raw_body>` using per-(tenant,business) secret
 *   - 5-minute replay window
 *   - business_id in payload must match URL parameter
 *   - KV-based dedup via event_id (7-day TTL)
 *
 * No DB or service modules — only KV (Map-backed) and ledger-client (real, but
 * configured to skip network in test env via CHITTY_LEDGER_BASE).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { webhookRoutes } from '../routes/webhooks';

// Real ledger-client code runs; only the network boundary (fetch) is intercepted.
// Per project rule: no mocking of service modules — but stubbing the global
// fetch boundary keeps the real ledger-client logic exercised while preventing
// outbound calls to ledger.chitty.cc during unit tests.
const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ id: 't', sequenceNumber: '0', hash: '' }), { status: 200 }),
  );
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const SERVICE_TOKEN = 'test-service-token';
const SECRET = 'wave-test-secret-32bytes';
const TENANT = '11111111-1111-1111-1111-111111111111';
const BUSINESS = 'biz-deadbeef';
const KEY = `webhook:wave:secret:${TENANT}:${BUSINESS}`;

function makeKv() {
  const store = new Map<string, string>();
  return {
    store,
    binding: {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string, _opts?: unknown) => {
        store.set(k, v);
      },
      delete: async (k: string) => {
        store.delete(k);
      },
    } as unknown as KVNamespace,
  };
}

function makeEnv(kv: KVNamespace) {
  return {
    CHITTY_AUTH_SERVICE_TOKEN: SERVICE_TOKEN,
    FINANCE_KV: kv,
  } as Parameters<typeof webhookRoutes.fetch>[1];
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function buildSignedRequest(opts: {
  body: object | string;
  secret?: string;
  timestamp?: number;
  signatureOverride?: string;
  tenantId?: string;
  businessId?: string;
}): Promise<Request> {
  const tenantId = opts.tenantId ?? TENANT;
  const businessId = opts.businessId ?? BUSINESS;
  const rawBody = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  const ts = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const headers: Record<string, string> = { 'content-type': 'application/json' };

  if (opts.signatureOverride !== undefined) {
    headers['x-wave-signature'] = opts.signatureOverride;
  } else if (opts.secret !== undefined) {
    const sig = await hmacHex(opts.secret, `${ts}.${rawBody}`);
    headers['x-wave-signature'] = `t=${ts},v1=${sig}`;
    headers['x-wave-timestamp'] = String(ts);
  }

  return new Request(`http://x/api/webhooks/wave/${tenantId}/${businessId}`, {
    method: 'POST',
    headers,
    body: rawBody,
  });
}

function validInvoiceOverdueEvent(overrides: Partial<{ event_id: string; business_id: string }> = {}) {
  return {
    event_id: overrides.event_id ?? 'evt-1',
    event_type: 'invoice.overdue',
    business_id: overrides.business_id ?? BUSINESS,
    data: {
      invoice_id: 'inv-1',
      customer_id: 'cust-1',
      currency_code: 'USD',
      due_date: '2026-04-30',
      invoice_balance: '200.00',
      issue_date: '2026-04-30',
    },
  };
}

async function storeSecret(kv: ReturnType<typeof makeKv>, secret = SECRET) {
  kv.store.set(KEY, secret);
}

describe('Wave webhook receiver', () => {
  describe('signature verification', () => {
    it('rejects when secret is stored but signature header is missing', async () => {
      const kv = makeKv();
      await storeSecret(kv);
      const env = makeEnv(kv.binding);
      const req = new Request(`http://x/api/webhooks/wave/${TENANT}/${BUSINESS}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validInvoiceOverdueEvent()),
      });
      const res = await webhookRoutes.fetch(req, env);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'invalid_signature' });
    });

    it('rejects when signature is wrong', async () => {
      const kv = makeKv();
      await storeSecret(kv);
      const env = makeEnv(kv.binding);
      const ts = Math.floor(Date.now() / 1000);
      const req = await buildSignedRequest({
        body: validInvoiceOverdueEvent(),
        signatureOverride: `t=${ts},v1=deadbeefdeadbeef`,
      });
      const res = await webhookRoutes.fetch(req, env);
      expect(res.status).toBe(401);
    });

    it('rejects when signature header is malformed (no v1)', async () => {
      const kv = makeKv();
      await storeSecret(kv);
      const env = makeEnv(kv.binding);
      const req = await buildSignedRequest({
        body: validInvoiceOverdueEvent(),
        signatureOverride: `t=${Math.floor(Date.now() / 1000)}`,
      });
      const res = await webhookRoutes.fetch(req, env);
      expect(res.status).toBe(401);
    });

    it('rejects when timestamp is outside the 5-minute replay window', async () => {
      const kv = makeKv();
      await storeSecret(kv);
      const env = makeEnv(kv.binding);
      const oldTs = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const req = await buildSignedRequest({
        body: validInvoiceOverdueEvent(),
        secret: SECRET,
        timestamp: oldTs,
      });
      const res = await webhookRoutes.fetch(req, env);
      expect(res.status).toBe(401);
    });

    it('accepts request with valid signature and current timestamp', async () => {
      const kv = makeKv();
      await storeSecret(kv);
      const env = makeEnv(kv.binding);
      const req = await buildSignedRequest({ body: validInvoiceOverdueEvent(), secret: SECRET });
      const res = await webhookRoutes.fetch(req, env);
      expect(res.status).toBe(202);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.received).toBe(true);
      expect(body.eventId).toBe('evt-1');
      expect(body.eventType).toBe('invoice.overdue');
    });

    it('rejects schema-valid events when no secret is stored (forgery guard)', async () => {
      const kv = makeKv();
      const env = makeEnv(kv.binding);
      const req = new Request(`http://x/api/webhooks/wave/${TENANT}/${BUSINESS}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validInvoiceOverdueEvent()),
      });
      const res = await webhookRoutes.fetch(req, env);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'webhook_not_configured' });
    });

    it('rejects same-length wrong signature (constant-time path)', async () => {
      const kv = makeKv();
      await storeSecret(kv);
      const env = makeEnv(kv.binding);
      const ts = Math.floor(Date.now() / 1000);
      const realSig = await hmacHex(SECRET, `${ts}.${JSON.stringify(validInvoiceOverdueEvent())}`);
      const wrongSameLen = realSig.replace(/^./, (ch) => (ch === 'a' ? 'b' : 'a'));
      const req = await buildSignedRequest({
        body: validInvoiceOverdueEvent(),
        signatureOverride: `t=${ts},v1=${wrongSameLen}`,
      });
      const res = await webhookRoutes.fetch(req, env);
      expect(res.status).toBe(401);
    });

    it('rejects future-dated timestamp beyond skew tolerance', async () => {
      const kv = makeKv();
      await storeSecret(kv);
      const env = makeEnv(kv.binding);
      const futureTs = Math.floor(Date.now() / 1000) + 600;
      const req = await buildSignedRequest({
        body: validInvoiceOverdueEvent(),
        secret: SECRET,
        timestamp: futureTs,
      });
      const res = await webhookRoutes.fetch(req, env);
      expect(res.status).toBe(401);
    });

    it('rejects when timestamp is not a number', async () => {
      const kv = makeKv();
      await storeSecret(kv);
      const env = makeEnv(kv.binding);
      const req = await buildSignedRequest({
        body: validInvoiceOverdueEvent(),
        signatureOverride: `t=notanumber,v1=deadbeef`,
      });
      const res = await webhookRoutes.fetch(req, env);
      expect(res.status).toBe(401);
    });
  });

  describe('payload handling', () => {
    it('acks empty body as a setup ping (200, not error)', async () => {
      const kv = makeKv();
      const env = makeEnv(kv.binding);
      const req = new Request(`http://x/api/webhooks/wave/${TENANT}/${BUSINESS}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '',
      });
      const res = await webhookRoutes.fetch(req, env);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('acks unrecognized payload shape as setup ping (no error)', async () => {
      const kv = makeKv();
      const env = makeEnv(kv.binding);
      const req = new Request(`http://x/api/webhooks/wave/${TENANT}/${BUSINESS}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ping: 'hello' }),
      });
      const res = await webhookRoutes.fetch(req, env);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('acks non-JSON body (Wave dashboard probe) as setup ping', async () => {
      const kv = makeKv();
      const env = makeEnv(kv.binding);
      const req = new Request(`http://x/api/webhooks/wave/${TENANT}/${BUSINESS}`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'not-json',
      });
      const res = await webhookRoutes.fetch(req, env);
      expect(res.status).toBe(200);
    });

    it('rejects when business_id in payload does not match URL', async () => {
      const kv = makeKv();
      await storeSecret(kv);
      const env = makeEnv(kv.binding);
      const event = validInvoiceOverdueEvent({ business_id: 'biz-other' });
      const req = await buildSignedRequest({ body: event, secret: SECRET });
      const res = await webhookRoutes.fetch(req, env);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: 'business_id_mismatch',
        expected: BUSINESS,
        got: 'biz-other',
      });
    });

    it('handles signed invoice.viewed event', async () => {
      const kv = makeKv();
      await storeSecret(kv);
      const env = makeEnv(kv.binding);
      const req = await buildSignedRequest({
        body: {
          event_id: 'evt-viewed-1',
          event_type: 'invoice.viewed',
          business_id: BUSINESS,
          data: { invoice_id: 'inv-1', view_timestamp: '2026-04-30T06:18:01.212000+00:00' },
        },
        secret: SECRET,
      });
      const res = await webhookRoutes.fetch(req, env);
      expect(res.status).toBe(202);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.eventType).toBe('invoice.viewed');
    });
  });

  describe('idempotency / dedup', () => {
    it('marks repeat event_id as duplicate', async () => {
      const kv = makeKv();
      await storeSecret(kv);
      const env = makeEnv(kv.binding);
      const event = validInvoiceOverdueEvent({ event_id: 'evt-dup' });
      const req1 = await buildSignedRequest({ body: event, secret: SECRET });
      const res1 = await webhookRoutes.fetch(req1, env);
      expect(res1.status).toBe(202);

      const req2 = await buildSignedRequest({ body: event, secret: SECRET });
      const res2 = await webhookRoutes.fetch(req2, env);
      expect(res2.status).toBe(202);
      expect(await res2.json()).toEqual({
        received: true,
        duplicate: true,
        eventId: 'evt-dup',
      });
    });

    it('does NOT dedup distinct event_ids', async () => {
      const kv = makeKv();
      await storeSecret(kv);
      const env = makeEnv(kv.binding);
      const req1 = await buildSignedRequest({
        body: validInvoiceOverdueEvent({ event_id: 'evt-a' }),
        secret: SECRET,
      });
      const req2 = await buildSignedRequest({
        body: validInvoiceOverdueEvent({ event_id: 'evt-b' }),
        secret: SECRET,
      });
      const res1 = await webhookRoutes.fetch(req1, env);
      const res2 = await webhookRoutes.fetch(req2, env);
      expect(res1.status).toBe(202);
      expect(res2.status).toBe(202);
      const b2 = (await res2.json()) as Record<string, unknown>;
      expect(b2.duplicate).toBeUndefined();
    });

    it('isolates dedup keys across (tenant, business) pairs', async () => {
      const kv = makeKv();
      const otherBusiness = 'biz-other';
      const otherSecret = 'other-secret';
      kv.store.set(KEY, SECRET);
      kv.store.set(`webhook:wave:secret:${TENANT}:${otherBusiness}`, otherSecret);
      const env = makeEnv(kv.binding);

      const sameId = 'evt-shared';
      const req1 = await buildSignedRequest({
        body: validInvoiceOverdueEvent({ event_id: sameId }),
        secret: SECRET,
      });
      const res1 = await webhookRoutes.fetch(req1, env);
      expect(res1.status).toBe(202);

      // Same event_id under a different business must NOT be deduplicated.
      const req2 = await buildSignedRequest({
        body: validInvoiceOverdueEvent({ event_id: sameId, business_id: otherBusiness }),
        secret: otherSecret,
        businessId: otherBusiness,
      });
      const res2 = await webhookRoutes.fetch(req2, env);
      expect(res2.status).toBe(202);
      const b2 = (await res2.json()) as Record<string, unknown>;
      expect(b2.duplicate).toBeUndefined();
    });
  });
});
