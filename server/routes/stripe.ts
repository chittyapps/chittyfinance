import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import Stripe from 'stripe';

export const stripeRoutes = new Hono<HonoEnv>();

function getStripe(secretKey: string) {
  return new Stripe(secretKey, { apiVersion: '2024-06-20' as any });
}

// POST /api/integrations/stripe/connect — create/fetch Stripe customer for tenant
stripeRoutes.post('/api/integrations/stripe/connect', async (c) => {
  if (!c.env.STRIPE_SECRET_KEY) {
    return c.json({ error: 'Stripe not configured' }, 503);
  }

  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);

  // Search for existing customer by tenantId metadata
  const search = await stripe.customers.search({
    query: `metadata['tenantId']:'${tenantId}'`,
  });

  let customerId: string;
  if (search.data[0]) {
    customerId = search.data[0].id;
  } else {
    const cust = await stripe.customers.create({
      metadata: { tenantId },
    });
    customerId = cust.id;
  }

  // Upsert integration record
  const integrations = await storage.getIntegrations(tenantId);
  let stripeInt = integrations.find((i) => i.serviceType === 'stripe');

  if (!stripeInt) {
    stripeInt = await storage.createIntegration({
      tenantId,
      serviceType: 'stripe',
      name: 'Stripe',
      description: 'Payments',
      connected: true,
      credentials: { customerId },
      lastSynced: new Date(),
    });
  } else {
    stripeInt = await storage.updateIntegration(stripeInt.id, {
      connected: true,
      credentials: { ...(stripeInt.credentials as Record<string, unknown> || {}), customerId },
      lastSynced: new Date(),
    });
  }

  return c.json({ connected: true, customerId });
});

// POST /api/integrations/stripe/checkout — create checkout session
stripeRoutes.post('/api/integrations/stripe/checkout', async (c) => {
  if (!c.env.STRIPE_SECRET_KEY) {
    return c.json({ error: 'Stripe not configured' }, 503);
  }

  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
  const body = await c.req.json();

  const amountCents = Number(body?.amountCents);
  if (!Number.isFinite(amountCents) || amountCents < 50) {
    return c.json({ error: 'amountCents must be >= 50' }, 400);
  }

  const label = String(body?.label || 'ChittyFinance Payment');
  const purpose = String(body?.purpose || 'payment');
  const baseUrl = c.env.PUBLIC_APP_BASE_URL || 'https://finance.chitty.cc';

  // Resolve customer ID
  const integrations = await storage.getIntegrations(tenantId);
  const stripeInt = integrations.find((i) => i.serviceType === 'stripe');
  let customerId = (stripeInt?.credentials as any)?.customerId as string | undefined;

  if (!customerId) {
    const cust = await stripe.customers.create({ metadata: { tenantId } });
    customerId = cust.id;
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer: customerId,
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: label },
        unit_amount: amountCents,
      },
      quantity: 1,
    }],
    success_url: `${baseUrl}/connections?stripe=success`,
    cancel_url: `${baseUrl}/connections?stripe=cancel`,
    metadata: { tenantId, purpose },
  });

  return c.json({ url: session.url, id: session.id });
});
