import { Hono } from 'hono';
import { z } from 'zod';
import type { HonoEnv } from '../env';
import { createDb } from '../db/connection';
import { SystemStorage } from '../storage/system';
import { findAccountCode } from '../../database/chart-of-accounts';
import { validateRow } from '../lib/chittyschema';
import { ledgerLog } from '../lib/ledger-client';

export const webhookRoutes = new Hono<HonoEnv>();

/**
 * Mercury webhook transaction payload shape.
 *
 * ChittyConnect normalizes Mercury's native payload to this shape before
 * forwarding to us, so we can trust the field names here.
 *
 * `tenantId` and `accountId` must be resolved by ChittyConnect before it
 * POSTs to us — we don't have tenant middleware on webhook routes (they
 * use service auth, not session/role auth).
 */
const mercuryTransactionSchema = z.object({
  tenantId: z.string().uuid(),
  accountId: z.string().uuid(),
  mercuryTransactionId: z.string(),
  description: z.string(),
  amount: z.number(), // signed: negative = expense
  category: z.string().optional().nullable(),
  postedAt: z.string(), // ISO 8601
  payee: z.string().optional().nullable(),
});

const mercuryWebhookEnvelopeSchema = z.object({
  id: z.string().optional(),
  eventId: z.string().optional(),
  type: z.string().optional(), // e.g. 'transaction.created'
  data: z
    .object({
      transaction: mercuryTransactionSchema.optional(),
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

// POST /api/webhooks/mercury — Mercury webhook endpoint with real-time classification
//
// Flow:
//   1. Service-auth check (Bearer token == CHITTY_AUTH_SERVICE_TOKEN)
//   2. KV-based idempotency (7-day TTL dedup window)
//   3. Parse + validate envelope with zod
//   4. If payload carries a transaction, persist it to the DB with an
//      auto-suggested COA code (L0 → L1 keyword match at ingest)
//   5. Advisory validation against ChittySchema's FinancialTransactionsSchema
//      — never blocks the write, only logs warnings
//
// Returns:
//   200 { received, duplicate? } — envelope-only events (no transaction)
//   201 { received, transactionId, suggestedCoaCode, schemaAdvisory? } — persisted tx
//   400 on validation failure (envelope or payload)
webhookRoutes.post('/api/webhooks/mercury', async (c) => {
  // Service auth check
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
  const envelope = mercuryWebhookEnvelopeSchema.safeParse(rawBody);
  if (!envelope.success) {
    return c.json({ error: 'invalid_envelope', details: envelope.error.flatten() }, 400);
  }

  const eventId = c.req.header('x-event-id') || envelope.data.id || envelope.data.eventId;
  if (!eventId) {
    return c.json({ error: 'missing_event_id' }, 400);
  }

  // KV idempotency — 7-day dedup window
  const kv = c.env.FINANCE_KV;
  const dedupKey = `webhook:mercury:${eventId}`;
  const existing = await kv.get(dedupKey);
  if (existing) {
    return c.json({ received: true, duplicate: true }, 202);
  }
  await kv.put(dedupKey, JSON.stringify(rawBody || {}), { expirationTtl: 604800 });

  const tx = envelope.data.data?.transaction;
  if (!tx) {
    // Envelope-only event (e.g. account.created, webhook.ping) — just ack
    return c.json({ received: true }, 202);
  }

  // Auto-classify via keyword match at ingest (L0 → L1 suggestion).
  // Suspense (9010) gets low confidence, matched codes get 0.700.
  const suggestedCoaCode = findAccountCode(tx.description, tx.category ?? undefined);
  const isSuspense = suggestedCoaCode === '9010';
  const classificationConfidence = isSuspense ? '0.100' : '0.700';
  const externalId = `mercury:${tx.mercuryTransactionId}`;

  // Advisory ChittySchema validation — never blocks the write, only logs.
  // Uses FinancialTransactionsSchema from the chittyledger database.
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
    console.warn('[webhook:mercury] ChittySchema validation failed (advisory)', {
      eventId,
      errors: schemaResult.errors,
    });
  }

  // Persist via storage abstraction. Use a fresh DB/storage since webhook
  // routes don't go through the storageMiddleware (no tenant context).
  const db = createDb(c.env.DATABASE_URL);
  const storage = new SystemStorage(db);

  // Dedup at the DB level too — if ChittyConnect retries before the KV
  // entry was written, the externalId unique lookup catches it
  const dupRow = await storage.getTransactionByExternalId(externalId, tx.tenantId);
  if (dupRow) {
    return c.json(
      { received: true, duplicate: true, transactionId: dupRow.id },
      202,
    );
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

  ledgerLog(
    c,
    {
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
    },
    c.env,
  );

  return c.json(
    {
      received: true,
      transactionId: created.id,
      suggestedCoaCode,
      classificationConfidence,
      schemaAdvisory: schemaResult.advisory,
    },
    201,
  );
});
