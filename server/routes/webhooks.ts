import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const webhookRoutes = new Hono<HonoEnv>();

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

// POST /api/webhooks/mercury — Mercury webhook endpoint
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

  const body = await c.req.json().catch(() => null);
  const eventId = c.req.header('x-event-id') || (body && (body.id || body.eventId));
  if (!eventId) {
    return c.json({ error: 'missing_event_id' }, 400);
  }

  const kv = c.env.FINANCE_KV;
  const existing = await kv.get(`webhook:mercury:${eventId}`);
  if (existing) {
    return c.json({ received: true, duplicate: true }, 202);
  }

  await kv.put(`webhook:mercury:${eventId}`, JSON.stringify(body || {}), { expirationTtl: 604800 });

  return c.json({ received: true }, 202);
});
