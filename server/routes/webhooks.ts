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
  previousValues: z.record(z.unknown()).optional(),
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

/** ChittyConnect-normalized transaction (legacy path, kept for backwards compat). */
const normalizedTransactionSchema = z.object({
  tenantId: z.string().uuid(),
  accountId: z.string().uuid(),
  mercuryTransactionId: z.string(),
  description: z.string(),
  amount: z.number(),
  category: z.string().optional().nullable(),
  postedAt: z.string(),
  payee: z.string().optional().nullable(),
});

const normalizedEnvelopeSchema = z.object({
  id: z.string().optional(),
  eventId: z.string().optional(),
  type: z.string().optional(),
  data: z.object({
    transaction: normalizedTransactionSchema.optional(),
  }).optional(),
});

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

// PUT /api/webhooks/mercury/:tenantId/secret — Store per-tenant webhook secret
// Auth: service token (internal use only)
webhookRoutes.put('/api/webhooks/mercury/:tenantId/secret', async (c) => {
  const expected = c.env.CHITTY_AUTH_SERVICE_TOKEN;
  if (!expected) return c.json({ error: 'auth_not_configured' }, 500);

  const auth = c.req.header('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || token !== expected) return c.json({ error: 'unauthorized' }, 401);

  let parsed: { secret?: string };
  try {
    parsed = await c.req.json<{ secret: string }>();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }
  const { secret } = parsed;
  if (!secret) return c.json({ error: 'secret required' }, 400);

  const tenantId = c.req.param('tenantId');
  const kv = c.env.FINANCE_KV;
  await kv.put(`webhook:mercury:secret:${tenantId}`, secret);

  return c.json({ stored: true, tenantId });
});

// POST /api/webhooks/mercury/:tenantId — Mercury native webhook (tenant in URL)
//
// Auth: Mercury-Signature HMAC-SHA256 verification via per-tenant KV secret
// Payload: Mercury event envelope (JSON Merge Patch format)
//
// Flow:
//   1. Verify Mercury-Signature header
//   2. KV-based idempotency (7-day TTL dedup window)
//   3. Parse Mercury event envelope
//   4. For transaction events: resolve account, classify, persist
//   5. Advisory ChittySchema validation (never blocks)
//
// Returns:
//   200 { received } — non-transaction events or envelope-only
//   201 { received, transactionId, suggestedCoaCode } — persisted tx
//   400 on validation failure
//   401 on signature failure
webhookRoutes.post('/api/webhooks/mercury/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId');

  // Verify Mercury-Signature HMAC.
  // Each Mercury webhook registration returns a unique secret, so we store
  // per-tenant secrets in KV at `webhook:mercury:secret:<tenantId>`.
  // Falls back to MERCURY_WEBHOOK_SECRET env var (shared/legacy).
  // Skips verification entirely if no secret found (allows registration ping).
  const rawBody = await c.req.text();
  const kv = c.env.FINANCE_KV;
  const secret = await kv.get(`webhook:mercury:secret:${tenantId}`);
  const signatureHeader = c.req.header('Mercury-Signature') ?? '';

  if (secret) {
    if (!signatureHeader || !(await verifyMercurySignature(rawBody, signatureHeader, secret))) {
      return c.json({ error: 'invalid_signature' }, 401);
    }
  } else {
    console.warn('[webhook:mercury] No secret for tenant', tenantId, '— signature verification skipped');
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
  const dedupKey = `webhook:mercury:${event.id}`;
  const existing = await kv.get(dedupKey);
  if (existing) {
    return c.json({ received: true, duplicate: true }, 200);
  }
  await kv.put(dedupKey, rawBody, { expirationTtl: 604800 });

  // Only process transaction events
  if (event.resourceType !== 'transaction') {
    return c.json({ received: true, resourceType: event.resourceType }, 200);
  }

  // For transaction creates/updates, extract fields from mergePatch
  const patch = (event.mergePatch ?? {}) as Record<string, unknown>;
  const amount = typeof patch.amount === 'number' ? patch.amount : null;
  const description = (patch.bankDescription as string) ?? (patch.counterpartyName as string) ?? '';
  const counterpartyName = (patch.counterpartyName as string) ?? null;
  const postedAt = (patch.postedAt as string) ?? (event.occurredAt as string) ?? null;
  const mercuryAccountId = (patch.accountId as string) ?? null;

  // For updates without amount (e.g. status change), just ack
  if (amount === null) {
    return c.json({ received: true, operationType: event.operationType }, 200);
  }

  const externalId = `mercury:${event.resourceId}`;

  // Auto-classify
  const suggestedCoaCode = findAccountCode(description);
  const isSuspense = suggestedCoaCode === '9010';
  const classificationConfidence = isSuspense ? '0.100' : '0.700';

  const db = createDb(c.env.DATABASE_URL);
  const storage = new SystemStorage(db);

  // DB-level dedup
  const dupRow = await storage.getTransactionByExternalId(externalId, tenantId);
  if (dupRow) {
    return c.json({ received: true, duplicate: true, transactionId: dupRow.id }, 200);
  }

  // Resolve local account from Mercury accountId, or use first active account for tenant
  let accountId: string | null = null;
  if (mercuryAccountId) {
    const acct = await storage.lookupAccountByExternalId(`mercury:${mercuryAccountId}`);
    if (acct && acct.tenantId === tenantId) {
      accountId = acct.id;
    }
  }
  if (!accountId) {
    // Fallback: use first active account for this tenant, or create a default
    const accounts = await storage.getAccounts(tenantId);
    const active = accounts.find((a) => a.isActive);
    if (active) {
      accountId = active.id;
    } else {
      const created = await storage.createAccount({
        tenantId,
        name: 'Mercury Checking',
        type: 'checking',
        institution: 'Mercury',
        externalId: mercuryAccountId ? `mercury:${mercuryAccountId}` : undefined,
      });
      accountId = created.id;
    }
  }

  // Advisory ChittySchema validation
  const schemaResult = await validateRow(c.env, 'FinancialTransactionsInsertSchema', {
    tenantId,
    accountId,
    amount: String(amount),
    type: amount >= 0 ? 'income' : 'expense',
    description,
    date: postedAt ?? new Date().toISOString(),
    externalId,
  });

  if (!schemaResult.ok && schemaResult.errors) {
    console.warn('[webhook:mercury] ChittySchema advisory', { eventId: event.id, errors: schemaResult.errors });
  }

  const created = await storage.createTransaction({
    tenantId,
    accountId,
    amount: String(amount),
    type: amount >= 0 ? 'income' : 'expense',
    category: null,
    description,
    date: postedAt ? new Date(postedAt) : new Date(),
    payee: counterpartyName,
    externalId,
    suggestedCoaCode,
    classificationConfidence,
    metadata: {
      source: 'mercury_webhook',
      mercuryTransactionId: event.resourceId,
      mercuryAccountId,
      eventId: event.id,
      operationType: event.operationType,
    },
  });

  ledgerLog(c, {
    entityType: 'audit',
    action: 'webhook.mercury.transaction_ingested',
    metadata: {
      tenantId,
      accountId,
      transactionId: created.id,
      suggestedCoaCode,
      confidence: classificationConfidence,
      schemaAdvisory: schemaResult.advisory,
      schemaValid: schemaResult.ok,
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

// POST /api/webhooks/mercury — Legacy ChittyConnect-normalized path (service-token auth)
webhookRoutes.post('/api/webhooks/mercury', async (c) => {
  const expected = c.env.CHITTY_AUTH_SERVICE_TOKEN;
  if (!expected) {
    return c.json({ error: 'auth_not_configured' }, 500);
  }

  const auth = c.req.header('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || token !== expected) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const rawBody = await c.req.json().catch(() => null);
  const envelope = normalizedEnvelopeSchema.safeParse(rawBody);
  if (!envelope.success) {
    return c.json({ error: 'invalid_envelope', details: envelope.error.flatten() }, 400);
  }

  const eventId = c.req.header('x-event-id') || envelope.data.id || envelope.data.eventId;
  if (!eventId) {
    return c.json({ error: 'missing_event_id' }, 400);
  }

  const kv = c.env.FINANCE_KV;
  const dedupKey = `webhook:mercury:${eventId}`;
  const existing = await kv.get(dedupKey);
  if (existing) {
    return c.json({ received: true, duplicate: true }, 202);
  }
  await kv.put(dedupKey, JSON.stringify(rawBody || {}), { expirationTtl: 604800 });

  const tx = envelope.data.data?.transaction;
  if (!tx) {
    return c.json({ received: true }, 202);
  }

  const suggestedCoaCode = findAccountCode(tx.description, tx.category ?? undefined);
  const isSuspense = suggestedCoaCode === '9010';
  const classificationConfidence = isSuspense ? '0.100' : '0.700';
  const externalId = `mercury:${tx.mercuryTransactionId}`;

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
    console.warn('[webhook:mercury] ChittySchema advisory', { eventId, errors: schemaResult.errors });
  }

  const db = createDb(c.env.DATABASE_URL);
  const storage = new SystemStorage(db);

  const dupRow = await storage.getTransactionByExternalId(externalId, tx.tenantId);
  if (dupRow) {
    return c.json({ received: true, duplicate: true, transactionId: dupRow.id }, 202);
  }

  const created = await storage.createTransaction({
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
    metadata: { source: 'mercury_webhook', mercuryTransactionId: tx.mercuryTransactionId, eventId },
  });

  ledgerLog(c, {
    entityType: 'audit',
    action: 'webhook.mercury.transaction_ingested',
    metadata: {
      tenantId: tx.tenantId,
      accountId: tx.accountId,
      transactionId: created.id,
      suggestedCoaCode,
      confidence: classificationConfidence,
      schemaAdvisory: schemaResult.advisory,
      schemaValid: schemaResult.ok,
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

  const dupRow = await storage.getTransactionByExternalId(externalId, tx.tenantId);
  if (dupRow) return c.json({ received: true, duplicate: true, transactionId: dupRow.id }, 202);

  const created = await storage.createTransaction({
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
