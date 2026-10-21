import { Hono } from 'hono';
import { z } from 'zod';
import type { HonoEnv } from '../env';
import { createDb } from '../db/connection';
import { SystemStorage } from '../storage/system';
import { findAccountCode } from '../../database/chart-of-accounts';
import { validateRow } from '../lib/chittyschema';
import { ledgerLog } from '../lib/ledger-client';

export const webhookRoutes = new Hono<HonoEnv>();

// ── Mercury native webhook types ──

const MERCURY_WEBHOOK_MAX_BYTES = 524288;

/** Mercury event envelope (JSON Merge Patch format). */
const mercuryEventSchema = z.object({
  id: z.string(),
  resourceType: z.string(), // 'transaction', 'account', etc.
  resourceId: z.string(),
  operationType: z.string(), // 'create', 'update', 'delete'
  resourceVersion: z.number().optional(),
  occurredAt: z.string().optional(),
  changedPaths: z.array(z.string()).optional(),
  mergePatch: z.record(z.unknown()).optional(),
  previousValues: z.record(z.unknown()).nullable().optional(),
});

/**
 * Verify Mercury-Signature header using Web Crypto (Workers-compatible).
 * Header format: t=<unix_timestamp>,v1=<hex_hmac>
 * Signed payload: <timestamp>.<raw_body>
 */
async function verifyMercurySignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  const parts = signatureHeader.split(',');
  let timestamp: string | undefined;
  let signature: string | undefined;

  for (const part of parts) {
    const [key, ...rest] = part.split('=');
    const value = rest.join('=');
    if (key === 't') timestamp = value;
    if (key === 'v1') signature = value;
  }

  if (!timestamp || !signature) return false;

  // Reject stale/future-dated signatures before HMAC verification, so a
  // leaked signed request cannot be replayed long after Mercury delivered it.
  if (!/^\d{1,12}$/.test(timestamp)) return false;
  const issuedAtSeconds = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(issuedAtSeconds) ||
      issuedAtSeconds < nowSeconds - 300 || issuedAtSeconds > nowSeconds + 60) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const expected = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');

  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Wave webhook transaction payload.
 *
 * Wave uses GraphQL push notifications. ChittyConnect normalizes to this
 * shape before forwarding, same as Mercury.
 */
const waveTransactionSchema = z.object({
  tenantId: z.string().uuid(),
  accountId: z.string().uuid(),
  waveTransactionId: z.string(),
  description: z.string(),
  amount: z.number(),
  category: z.string().optional().nullable(),
  postedAt: z.string(),
  payee: z.string().optional().nullable(),
});

const waveWebhookEnvelopeSchema = z.object({
  id: z.string().optional(),
  eventId: z.string().optional(),
  type: z.string().optional(),
  data: z
    .object({
      transaction: waveTransactionSchema.optional(),
    })
    .optional(),
});

// POST /api/webhooks/stripe — Stripe webhook endpoint
webhookRoutes.post('/api/webhooks/stripe', async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return c.json({ error: 'Stripe webhook not configured' }, 503);
  }

  const signature = c.req.header('stripe-signature');
  if (!signature) {
    return c.json({ error: 'Missing stripe-signature header' }, 400);
  }

  const rawBody = await c.req.text();

  // KV-based idempotency (lightweight, no DB needed for webhook dedup)
  const kv = c.env.FINANCE_KV;

  // Stripe sends event ID in the JSON payload
  let eventId: string;
  try {
    const parsed = JSON.parse(rawBody);
    eventId = parsed.id;
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  if (!eventId) {
    return c.json({ error: 'Missing event id' }, 400);
  }

  // Dedup via KV
  const existing = await kv.get(`webhook:stripe:${eventId}`);
  if (existing) {
    return c.json({ received: true, duplicate: true }, 202);
  }

  // Record event in KV (TTL 7 days for dedup window)
  await kv.put(`webhook:stripe:${eventId}`, rawBody, { expirationTtl: 604800 });

  return c.json({ received: true });
});

// POST /api/webhooks/mercury/organization/:organizationId
//
// Canonical provider-organization-scoped receiver. FC and CHIT can share a
// technical tenant partition, yet have different Mercury webhook signing keys.
// Signature validation happens INSIDE ChittySecrets through the existing
// ChittyConnect named service-binding. This route never touches Neon/Finance,
// imports a signing secret, or creates a new registry/checkpoint store.
webhookRoutes.post('/api/webhooks/mercury/organization/:organizationId', async (c) => {
  const organizationId = c.req.param('organizationId').toLowerCase();
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(organizationId)) {
    return c.json({ error: 'invalid_mercury_provider_organization' }, 400);
  }
  const verifier = c.env.SVC_MERCURY_WEBHOOK_VERIFIER;
  if (!verifier || typeof verifier.verifyMercuryWebhookSignature !== 'function') {
    return c.json({ error: 'mercury_signature_broker_unavailable' }, 503);
  }

  const signatureHeader = c.req.header('Mercury-Signature') || '';
  if (!signatureHeader) return c.json({ error: 'missing_mercury_signature' }, 401);
  // Reject declared oversize bodies before buffering; still measure actual
  // UTF-8 bytes after reading because Content-Length may be absent or false.
  const declaredLength = Number(c.req.header('Content-Length'));
  if (Number.isFinite(declaredLength) && declaredLength > MERCURY_WEBHOOK_MAX_BYTES) {
    return c.json({ error: 'mercury_webhook_payload_too_large' }, 413);
  }
  const rawBody = await c.req.text();
  if (new TextEncoder().encode(rawBody).byteLength > MERCURY_WEBHOOK_MAX_BYTES) {
    return c.json({ error: 'mercury_webhook_payload_too_large' }, 413);
  }

  let result: { verified: boolean; organizationId: string };
  try {
    result = await verifier.verifyMercuryWebhookSignature({
      organizationId, rawBody, signatureHeader,
    });
  } catch {
    return c.json({ error: 'mercury_signature_broker_unavailable' }, 503);
  }
  if (result?.verified !== true || result.organizationId !== organizationId) {
    return c.json({ error: 'invalid_mercury_signature' }, 401);
  }

  // Mercury's VerifyWebhook sends an event envelope, not an exempt ping.
  // Never acknowledge a signed, unparseable source event: it would escape
  // the Events API reconciliation path without leaving any durable intent.
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    console.error('[webhook:mercury:organization] unparseable signed envelope', { organizationId });
    return c.json({ error: 'mercury_invalid_event_envelope' }, 503);
  }
  const parsed = mercuryEventSchema.safeParse(body);
  if (!parsed.success) {
    console.error('[webhook:mercury:organization] incomplete signed envelope', { organizationId });
    return c.json({ error: 'mercury_invalid_event_envelope' }, 503);
  }
  const event = parsed.data;
  const kv = c.env.FINANCE_KV;
  if (!kv) return c.json({ error: 'mercury_webhook_dedupe_unavailable' }, 503);
  const eventKey = 'webhook:mercury:org:' + organizationId + ':' + event.id;
  // Never acknowledge an unconsumed intent. The Finance KV marker is only a
  // replay hint, and an async ledger audit is not a reconciler dispatch.
  // ChittyConnect must first durably accept this provider event through its
  // existing finance adapter, idempotent on the Mercury org and event ID.
  const acceptIntent = verifier.acceptMercuryReconciliationIntent;
  if (typeof acceptIntent !== 'function') {
    console.warn('[webhook:mercury:organization] durable dispatch unavailable', {
      organizationId, eventId: event.id, reason: 'consumer_method_missing',
    });
    return c.json({ error: 'mercury_reconciliation_consumer_unavailable' }, 503);
  }
  let dispatch: {
    accepted: boolean; durable: boolean; organizationId: string;
    idempotencyKey: string; receiptId: string;
  };
  try {
    dispatch = await acceptIntent.call(verifier, {
      organizationId,
      providerEventId: event.id,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      operationType: event.operationType,
      resourceVersion: event.resourceVersion ?? null,
      occurredAt: event.occurredAt ?? null,
      idempotencyKey: eventKey,
    });
  } catch (err) {
    // Never log raw bodies, signing material, or provider payload fragments.
    console.error('[webhook:mercury:organization] durable dispatch failed', {
      organizationId, eventId: event.id,
      errorClass: err instanceof Error ? err.name : 'unknown',
    });
    return c.json({ error: 'mercury_reconciliation_dispatch_unavailable' }, 503);
  }
  if (dispatch?.accepted !== true || dispatch.durable !== true ||
      dispatch.organizationId !== organizationId ||
      dispatch.idempotencyKey !== eventKey ||
      typeof dispatch.receiptId !== 'string' || !dispatch.receiptId.trim()) {
    console.warn('[webhook:mercury:organization] durable receipt rejected', {
      organizationId, eventId: event.id, reason: 'receipt_identity_or_durability_mismatch',
    });
    return c.json({ error: 'mercury_reconciliation_dispatch_not_durable' }, 503);
  }
  // Even duplicates must be reaccepted by the governed consumer. A historical
  // KV value of '1' cannot be treated as proof of dispatch.
  let existing: string | null;
  try {
    existing = await kv.get(eventKey);
  } catch {
    console.error('[webhook:mercury:organization] replay read unavailable', { organizationId, eventId: event.id });
    return c.json({ error: 'mercury_reconciliation_kv_unavailable' }, 503);
  }
  if (existing) {
    return c.json({ received: true, duplicate: true, dispatchAccepted: true }, 200);
  }
  // Existing event-idempotency record holds an outstanding source-linked intent,
  // NOT a reconciliation success receipt or a new checkpoint/ledger/store.
  // Never persist the signed event body, mergePatch or signing secret.
  try {
    await kv.put(eventKey, JSON.stringify({
      state: 'reconciliation_required',
      mercuryOrganizationId: organizationId,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      operationType: event.operationType,
      resourceVersion: event.resourceVersion ?? null,
      occurredAt: event.occurredAt ?? null,
      dispatchReceiptId: dispatch.receiptId,
    }), { expirationTtl: 604800 });
  } catch {
    // Broker acceptance was durable but local replay metadata could not be
    // recorded; ask Mercury to retry with the same provider idempotency key.
    console.error('[webhook:mercury:organization] replay write unavailable', { organizationId, eventId: event.id });
    return c.json({ error: 'mercury_reconciliation_kv_unavailable' }, 503);
  }

  ledgerLog(c, {
    entityType: 'audit',
    action: 'webhook.mercury.organization_reconciliation_required',
    metadata: {
      mercuryOrganizationId: organizationId,
      mercuryResourceId: event.resourceId,
      eventId: event.id,
      resourceType: event.resourceType,
      operationType: event.operationType,
      resourceVersion: event.resourceVersion ?? null,
      occurredAt: event.occurredAt ?? null,
      reason: 'verified_provider_event',
      dispatchReceiptId: dispatch.receiptId,
    },
  }, c.env);

  // A verified pending transaction or balance state change IS activity even
  // when no new posted transaction exists. Finance reads happen only after
  // chittyconnect-finance evaluates the downstream activity gate.
  return c.json({
    received: true,
    mercuryOrganizationId: organizationId,
    eventId: event.id,
    reconciliationRequired: true,
    dispatchAccepted: true,
    dispatchReceiptId: dispatch.receiptId,
  }, 202);
});

// PUT /api/webhooks/mercury/:tenantId/secret — RETIRED.
// A tenant_id is a technical partition, not a Mercury provider organization
// identity. Different Mercury organizations (e.g. FC and CHIT) may bind to
// the same canonical business and tenant but require distinct signing keys.
// Raw signing secrets must be sealed through the existing ChittyConnect ->
// ChittySecrets governed broker and ChittyFinance-matched provider scope.
// Never accept/store them in FINANCE_KV, Worker variables or application state.
//
// The existing native webhook receiver below temporarily reads legacy KV
// secrets to avoid dropping current authenticated deliveries. This is a
// migration blocker, NOT authorization to register another webhook or persist
// another secret through this route.
webhookRoutes.put('/api/webhooks/mercury/:tenantId/secret', (c) =>
  c.json({ error: 'MERCURY_SIGNING_SECRET_BROKER_REQUIRED' }, 410),
);

// POST /api/webhooks/mercury/:tenantId — Mercury native webhook (tenant in URL)
//
// Auth: Mercury-Signature HMAC-SHA256 verification via per-tenant KV secret
// Payload: Mercury event envelope (JSON Merge Patch format)
//
// Flow:
//   1. Require the per-tenant Mercury webhook signing secret
//   2. Verify Mercury-Signature HMAC
//   3. KV-based idempotency (7-day replay window)
//   4. Parse the Mercury event envelope
//   5. Treat transaction events as reconciliation triggers only
//
// Native webhook merge patches are partial and may arrive out of order, so this
// route never performs an authoritative financial mutation.
//
// Returns:
//   200 { received } — non-transaction or duplicate event
//   202 { received, reconciliationRequired } — verified transaction event
//   400 on malformed JSON
//   401 on signature failure
//   503 when the tenant webhook secret is not provisioned
webhookRoutes.post('/api/webhooks/mercury/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId');

  // Verify Mercury-Signature HMAC.
  // Each Mercury webhook registration returns a unique secret, so we store
  // per-tenant secrets in KV at `webhook:mercury:secret:<tenantId>`.
  // The signing secret returned when the webhook is registered must already be
  // stored for this tenant. Native Mercury events are never allowed to mutate
  // or trigger financial state without successful signature verification.
  const rawBody = await c.req.text();
  const kv = c.env.FINANCE_KV;
  const secret = await kv.get(`webhook:mercury:secret:${tenantId}`);
  const signatureHeader = c.req.header('Mercury-Signature') ?? '';

  if (!secret) {
    return c.json({ error: 'webhook_secret_not_configured' }, 503);
  }
  if (!signatureHeader || !(await verifyMercurySignature(rawBody, signatureHeader, secret))) {
    return c.json({ error: 'invalid_signature' }, 401);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    // Empty body or non-JSON — treat as verification ping
    return c.json({ received: true }, 200);
  }

  const parsed = mercuryEventSchema.safeParse(body);
  if (!parsed.success) {
    // Unrecognized payload (e.g. Mercury verification ping) — ack without error
    console.warn('[webhook:mercury] Unrecognized payload, acking', { tenantId, keys: typeof body === 'object' && body ? Object.keys(body) : typeof body });
    return c.json({ received: true }, 200);
  }

  const event = parsed.data;

  // KV idempotency — 7-day dedup window
  const dedupKey = `webhook:mercury:${tenantId}:${event.id}`;
  const existing = await kv.get(dedupKey);
  if (existing) {
    return c.json({ received: true, duplicate: true }, 200);
  }
  // Reuse the existing idempotency record to retain a minimal, source-linked
  // reconciliation intent. Do NOT store the raw bank event or its mergePatch
  // inside KV. This is an intent marker, not proof of finance reconciliation.
  await kv.put(dedupKey, JSON.stringify({
    state: 'reconciliation_required',
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    operationType: event.operationType,
    resourceVersion: event.resourceVersion ?? null,
    occurredAt: event.occurredAt ?? null,
  }), { expirationTtl: 604800 });

  // Mercury webhook payloads are activity signals, not authoritative ledger
  // records. JSON Merge Patch events may be partial and may arrive out of order.
  // The canonical ChittyConnect -> chittyconnect-finance reconciliation path
  // fetches the current provider record before any financial mutation.
  if (event.resourceType !== 'transaction') {
    return c.json({ received: true, resourceType: event.resourceType }, 200);
  }

  ledgerLog(c, {
    entityType: 'audit',
    action: 'webhook.mercury.transaction_reconciliation_required',
    metadata: {
      tenantId,
      mercuryTransactionId: event.resourceId,
      eventId: event.id,
      operationType: event.operationType,
      resourceVersion: event.resourceVersion ?? null,
      occurredAt: event.occurredAt ?? null,
      reason: 'authenticated_provider_event',
    },
  }, c.env);

  return c.json({
    received: true,
    operationType: event.operationType,
    mercuryTransactionId: event.resourceId,
    reconciliationRequired: true,
  }, 202);
});

// POST /api/webhooks/mercury — Retired legacy normalized-ingest endpoint.
//
// Never accept a normalized payload as sufficient evidence for a Mercury
// ledger write. The canonical path is a signed per-tenant Mercury webhook
// (/api/webhooks/mercury/:tenantId) followed by source-authoritative
// reconciliation through ChittyConnect. Return an explicit failure rather
// than silently acknowledge events that cannot be reconciled.
webhookRoutes.post('/api/webhooks/mercury', async (c) => {
  const expected = c.env.CHITTY_AUTH_SERVICE_TOKEN;
  if (!expected) return c.json({ error: 'auth_not_configured' }, 500);

  const auth = c.req.header('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || token !== expected) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  return c.json({
    error: 'LEGACY_MERCURY_INGEST_RETIRED',
    message: 'Use signed Mercury native webhook and canonical provider reconciliation',
  }, 410);
});

/**
 * True only for a unique violation on the transactions external-id index.
 *
 * Deliberately narrow. Matching any unique violation would absorb a collision on a
 * different constraint and report it as "already ingested"; matching on message text
 * alone would absorb anything whose message happens to contain the word. So this
 * requires the SQLSTATE and, when the driver exposes a constraint name, that it is
 * this index.
 */
export function isTransactionExternalIdViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; constraint?: unknown; message?: unknown };
  if (e.code !== '23505') return false;
  const named = typeof e.constraint === 'string' ? e.constraint : '';
  if (named) return named === 'transactions_tenant_external_idx';
  // Some drivers omit `constraint` and only carry the index name in the message.
  return typeof e.message === 'string' && e.message.includes('transactions_tenant_external_idx');
}

// POST /api/webhooks/wave — Wave Accounting webhook with real-time classification
// Same flow as Mercury: service-auth → zod → KV dedup → classify → ChittySchema advisory → persist
webhookRoutes.post('/api/webhooks/wave', async (c) => {
  const expected = c.env.CHITTY_AUTH_SERVICE_TOKEN;
  if (!expected) return c.json({ error: 'auth_not_configured' }, 500);

  const auth = c.req.header('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || token !== expected) return c.json({ error: 'unauthorized' }, 401);

  const rawBody = await c.req.json().catch(() => null);
  const envelope = waveWebhookEnvelopeSchema.safeParse(rawBody);
  if (!envelope.success) {
    return c.json({ error: 'invalid_envelope', details: envelope.error.flatten() }, 400);
  }

  const eventId = c.req.header('x-event-id') || envelope.data.id || envelope.data.eventId;
  if (!eventId) return c.json({ error: 'missing_event_id' }, 400);

  const kv = c.env.FINANCE_KV;
  const dedupKey = `webhook:wave:${eventId}`;
  const existing = await kv.get(dedupKey);
  if (existing) return c.json({ received: true, duplicate: true }, 202);
  await kv.put(dedupKey, JSON.stringify(rawBody || {}), { expirationTtl: 604800 });

  const tx = envelope.data.data?.transaction;
  if (!tx) return c.json({ received: true }, 202);

  // KNOWN GAP (tracked on #158): the Wave path has no transfer detection. Wave's
  // webhook payload carries no equivalent of Mercury's `kind`, so an internal
  // movement between two Wave-visible accounts still books as income or expense
  // here. This is the same defect the Mercury paths just fixed, on a source that
  // does not yet expose the fact needed to fix it. Detecting it from description
  // text would be a guess, and a wrong guess writes `type='transfer'` onto real
  // revenue — so the gap is recorded rather than papered over.
  const suggestedCoaCode = findAccountCode(tx.description, tx.category ?? undefined);
  const isSuspense = suggestedCoaCode === '9010';
  const classificationConfidence = isSuspense ? '0.100' : '0.700';
  const externalId = `wave:${tx.waveTransactionId}`;

  const schemaResult = await validateRow(c.env, 'FinancialTransactionsInsertSchema', {
    tenantId: tx.tenantId,
    accountId: tx.accountId,
    amount: String(tx.amount),
    type: tx.amount >= 0 ? 'income' : 'expense',
    description: tx.description,
    date: tx.postedAt,
    externalId,
  });

  if (!schemaResult.ok && schemaResult.errors) {
    console.warn('[webhook:wave] ChittySchema validation failed (advisory)', { eventId, errors: schemaResult.errors });
  }

  const db = createDb(c.env.DATABASE_URL);
  const storage = new SystemStorage(db);

  // The read-then-insert pair below is a check, not a guarantee. Two concurrent
  // deliveries of the same Wave event — which a retry produces by design — can both
  // read "no duplicate" and both insert. Before
  // `transactions_tenant_external_idx` existed, that silently wrote a second
  // transaction into the books; with it, the loser of the race raises a unique
  // violation. The constraint is the authority and this read is the fast path, so a
  // violation here means "already ingested", which is the same 202 the read returns.
  const dupRow = await storage.getTransactionByExternalId(externalId, tx.tenantId);
  if (dupRow) return c.json({ received: true, duplicate: true, transactionId: dupRow.id }, 202);

  let created: Awaited<ReturnType<typeof storage.createTransaction>>;
  try {
    created = await storage.createTransaction({
      tenantId: tx.tenantId,
      accountId: tx.accountId,
      amount: String(tx.amount),
      type: tx.amount >= 0 ? 'income' : 'expense',
      category: tx.category ?? null,
      description: tx.description,
      date: new Date(tx.postedAt),
      payee: tx.payee ?? null,
      externalId,
      suggestedCoaCode,
      classificationConfidence,
      metadata: { source: 'wave_webhook', waveTransactionId: tx.waveTransactionId, eventId },
    });
  } catch (err) {
    // ONLY the idempotency collision is absorbed. Anything else propagates: a broad
    // catch here would convert a genuine write failure into a 202 the sender never
    // retries, which is how an ingest silently loses a transaction.
    if (!isTransactionExternalIdViolation(err)) throw err;
    const raced = await storage.getTransactionByExternalId(externalId, tx.tenantId);
    if (!raced) {
      // The constraint rejected the row but it is not readable. Do not acknowledge:
      // claiming success here would drop the event with nothing recorded.
      throw err;
    }
    console.warn('[webhook:wave] idempotency collision absorbed', { eventId, externalId });
    return c.json({ received: true, duplicate: true, transactionId: raced.id }, 202);
  }

  ledgerLog(c, {
    entityType: 'audit',
    action: 'webhook.wave.transaction_ingested',
    metadata: {
      tenantId: tx.tenantId,
      accountId: tx.accountId,
      transactionId: created.id,
      suggestedCoaCode,
      confidence: classificationConfidence,
      schemaAdvisory: schemaResult.advisory,
    },
  }, c.env);

  return c.json({
    received: true,
    transactionId: created.id,
    suggestedCoaCode,
    classificationConfidence,
    schemaAdvisory: schemaResult.advisory,
  }, 201);
});

// ─── Wave per-(tenant, business) webhook secret storage ───
//
// Wave webhooks are scoped to a (tenant, business) pair because a single
// tenant can connect multiple Wave businesses (different LLCs sharing one
// chittyfinance tenant). Secrets are issued by Wave when a webhook
// subscription is created and must be supplied to the verification step
// of the receiver (added in a follow-up PR once Wave's signature schema
// is verified).
//
// KV layout:
//   webhook:wave:secret:<tenantId>:<businessId>     → HMAC secret (string)
//   webhook:wave:dedup:<eventId>                    → 7d TTL idempotency marker (set by receiver, not here)

function waveSecretKey(tenantId: string, businessId: string): string {
  return `webhook:wave:secret:${tenantId}:${businessId}`;
}

function isAuthorizedWaveSecretCaller(env: { CHITTY_AUTH_SERVICE_TOKEN?: string }, authHeader: string): boolean {
  const expected = env.CHITTY_AUTH_SERVICE_TOKEN;
  if (!expected) return false;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return token.length > 0 && token === expected;
}

/**
 * Verify Wave's webhook signature.
 *
 * Per Wave's Webhooks Setup Guide:
 *   - Header: x-wave-signature: t=<unix_timestamp>,v1=<hex_hmac_sha256>
 *   - Signed payload: <timestamp>.<raw_body>      (raw body, do not re-serialize)
 *   - Replay window: reject if |now - timestamp| > 300 seconds (5 min)
 *
 * Algorithm matches Mercury's signature scheme; kept as a separate function
 * so the two integrations can diverge independently as Wave's docs evolve.
 */
async function verifyWaveSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const parts = signatureHeader.split(',');
  let timestamp: string | undefined;
  let signature: string | undefined;

  for (const part of parts) {
    const [key, ...rest] = part.split('=');
    const value = rest.join('=');
    if (key === 't') timestamp = value;
    if (key === 'v1') signature = value;
  }

  if (!timestamp || !signature) return false;

  // Asymmetric replay window: tolerate 5 min of past skew, only 60s of future skew.
  // Future-dated timestamps shouldn't occur from Wave's signers and indicate
  // either clock drift or tampering — keep that window tight.
  const tsSeconds = Number(timestamp);
  if (!Number.isFinite(tsSeconds)) return false;
  const nowSec = Math.floor(nowMs / 1000);
  if (nowSec - tsSeconds > 300) return false;
  if (tsSeconds - nowSec > 60) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const expected = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');

  if (expected.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

/** Wave native webhook event envelope. Matches the format documented in Wave's Webhooks Setup Guide. */
const waveNativeEventSchema = z.object({
  event_id: z.string(),
  event_type: z.string(), // e.g. 'invoice.overdue', 'invoice.viewed', 'invoice.approved'
  business_id: z.string(),
  data: z.record(z.unknown()),
});

// PUT /api/webhooks/wave/:tenantId/:businessId/secret — store per-(tenant, business) webhook secret
// Auth: service token (internal use only)
webhookRoutes.put('/api/webhooks/wave/:tenantId/:businessId/secret', async (c) => {
  if (!c.env.CHITTY_AUTH_SERVICE_TOKEN) return c.json({ error: 'auth_not_configured' }, 500);
  if (!isAuthorizedWaveSecretCaller(c.env, c.req.header('authorization') ?? '')) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  let parsed: { secret?: unknown };
  try {
    parsed = await c.req.json<{ secret: unknown }>();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }
  const { secret } = parsed;
  if (typeof secret !== 'string' || secret.length === 0) {
    return c.json({ error: 'secret required' }, 400);
  }

  const tenantId = c.req.param('tenantId');
  const businessId = c.req.param('businessId');
  await c.env.FINANCE_KV.put(waveSecretKey(tenantId, businessId), secret);

  return c.json({ stored: true, tenantId, businessId });
});

// GET /api/webhooks/wave/:tenantId/:businessId/secret/exists — existence check (never returns the secret)
// Auth: service token (internal use only)
webhookRoutes.get('/api/webhooks/wave/:tenantId/:businessId/secret/exists', async (c) => {
  if (!c.env.CHITTY_AUTH_SERVICE_TOKEN) return c.json({ error: 'auth_not_configured' }, 500);
  if (!isAuthorizedWaveSecretCaller(c.env, c.req.header('authorization') ?? '')) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const tenantId = c.req.param('tenantId');
  const businessId = c.req.param('businessId');
  const value = await c.env.FINANCE_KV.get(waveSecretKey(tenantId, businessId));

  return c.json({ exists: value !== null, tenantId, businessId });
});

// DELETE /api/webhooks/wave/:tenantId/:businessId/secret — remove stored secret
// Auth: service token (internal use only)
webhookRoutes.delete('/api/webhooks/wave/:tenantId/:businessId/secret', async (c) => {
  if (!c.env.CHITTY_AUTH_SERVICE_TOKEN) return c.json({ error: 'auth_not_configured' }, 500);
  if (!isAuthorizedWaveSecretCaller(c.env, c.req.header('authorization') ?? '')) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const tenantId = c.req.param('tenantId');
  const businessId = c.req.param('businessId');
  await c.env.FINANCE_KV.delete(waveSecretKey(tenantId, businessId));

  return c.json({ deleted: true, tenantId, businessId });
});

/**
 * Sanitize webhook data before logging to ledger.
 * Extracts safe identifiers and masks sensitive information.
 */
function sanitizeWebhookData(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  // Whitelist of safe fields to include
  const safeFields = ['invoiceId', 'customerId', 'amount', 'status', 'id', 'type'];

  for (const field of safeFields) {
    if (field in data) {
      sanitized[field] = data[field];
    }
  }

  // Mask account numbers (any field containing 'account' and looking like a number)
  for (const [key, value] of Object.entries(data)) {
    if (key.toLowerCase().includes('account') && typeof value === 'string') {
      if (/^\d+$/.test(value) && value.length >= 4) {
        sanitized[key] = `***${value.slice(-4)}`;
      }
    }
  }

  // Generate a short summary of available keys (for debugging)
  const allKeys = Object.keys(data);
  if (allKeys.length > 0) {
    sanitized._keys = allKeys.slice(0, 10); // First 10 keys only
    if (allKeys.length > 10) {
      sanitized._keysOmitted = allKeys.length - 10;
    }
  }

  return sanitized;
}

// POST /api/webhooks/wave/:tenantId/:businessId — Wave native webhook receiver
//
// Auth: x-wave-signature HMAC-SHA256 verified against per-(tenant, business)
//       secret stored in KV. Skipped if no secret stored (allows initial
//       dashboard configuration ping).
//
// Configuration: Wave webhook subscriptions are configured per-business in
// the Wave dashboard (no programmatic API). Operators paste this URL into
// the Wave Webhooks page for each connected business:
//
//   https://finance.chitty.cc/api/webhooks/wave/<tenantId>/<businessId>
//
// Then store the secret Wave reveals via:
//   PUT /api/webhooks/wave/<tenantId>/<businessId>/secret { secret: "..." }
//
// Currently supported event types (per Wave's Webhooks Setup Guide):
//   invoice.overdue, invoice.viewed, invoice.approved
// "More supported events will be available soon" — handler audit-logs all
// recognized events; specific business logic is added as Wave expands the
// event surface.
webhookRoutes.post('/api/webhooks/wave/:tenantId/:businessId', async (c) => {
  const tenantId = c.req.param('tenantId');
  const businessId = c.req.param('businessId');

  // Raw body must be read once and used as-is for HMAC verification (per Wave docs).
  const rawBody = await c.req.text();
  const kv = c.env.FINANCE_KV;
  const secret = await kv.get(waveSecretKey(tenantId, businessId));
  const signatureHeader = c.req.header('x-wave-signature') ?? '';

  const sigVerified = secret
    ? signatureHeader.length > 0 && (await verifyWaveSignature(rawBody, signatureHeader, secret))
    : false;

  if (secret && !sigVerified) {
    return c.json({ error: 'invalid_signature' }, 401);
  }

  // Parse JSON; empty/non-JSON body is treated as a setup ping (Wave dashboard
  // sends a probe when the operator first saves the URL).
  let body: unknown;
  let parseFailed = false;
  try {
    body = rawBody.length === 0 ? null : JSON.parse(rawBody);
  } catch {
    parseFailed = true;
  }

  if (parseFailed) {
    if (sigVerified) {
      // Signed by Wave but unparseable — surface to the audit trail rather
      // than silently 200ing.
      ledgerLog(
        c,
        {
          entityType: 'audit',
          action: 'webhook.wave.parse_error',
          metadata: { tenantId, businessId, bodyBytes: rawBody.length },
        },
        c.env,
      );
    }
    return c.json({ received: true }, 200);
  }

  const parsed = body == null ? { success: false as const } : waveNativeEventSchema.safeParse(body);
  if (!parsed.success) {
    if (sigVerified) {
      // Signed Wave payload that doesn't match the documented envelope —
      // schema drift. Audit-log so it shows up in the ledger instead of
      // disappearing into stderr.
      ledgerLog(
        c,
        {
          entityType: 'audit',
          action: 'webhook.wave.unrecognized',
          metadata: {
            tenantId,
            businessId,
            shape: typeof body === 'object' && body ? Object.keys(body as object).slice(0, 10) : typeof body,
          },
        },
        c.env,
      );
    }
    return c.json({ received: true }, 200);
  }

  const event = parsed.data;

  // No secret stored, but the body looks like a real Wave event. Reject —
  // someone learning the URL must not be able to inject ledger entries.
  // The setup-ping bypass is reserved for non-event probe shapes.
  if (!secret) {
    return c.json({ error: 'webhook_not_configured' }, 401);
  }

  // URL-vs-payload business binding check (defense in depth)
  if (event.business_id !== businessId) {
    return c.json({ error: 'business_id_mismatch', expected: businessId, got: event.business_id }, 400);
  }

  // KV idempotency — 7-day dedup window keyed on (tenant, business, event_id).
  // Scoping prevents cross-business event_id collisions (Wave's event_ids are
  // unique per business, not globally).
  const dedupKey = `webhook:wave:dedup:${tenantId}:${businessId}:${event.event_id}`;
  if (await kv.get(dedupKey)) {
    return c.json({ received: true, duplicate: true, eventId: event.event_id }, 202);
  }
  await kv.put(dedupKey, '1', { expirationTtl: 604800 });

  ledgerLog(
    c,
    {
      entityType: 'audit',
      action: `webhook.wave.${event.event_type.replace(/[^a-z0-9_]/gi, '_')}`,
      metadata: {
        tenantId,
        businessId,
        eventId: event.event_id,
        eventType: event.event_type,
        data: sanitizeWebhookData(event.data),
      },
    },
    c.env,
  );

  return c.json(
    {
      received: true,
      eventId: event.event_id,
      eventType: event.event_type,
      tenantId,
      businessId,
    },
    202,
  );
});
