import Stripe from 'stripe';

const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2024-06-20' as any;

export function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY');
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}

export async function ensureCustomerForTenant(params: {
  tenantId: string;
  tenantName?: string;
  email?: string;
}): Promise<string> {
  const stripe = getStripeClient();
  const search = await stripe.customers.search({
    query: `metadata['tenantId']:'${params.tenantId}'`,
  });
  if (search.data[0]) return search.data[0].id;
  const cust = await stripe.customers.create({
    name: params.tenantName,
    email: params.email,
    metadata: { tenantId: params.tenantId, tenantName: params.tenantName || '' },
  });
  return cust.id;
}

export async function createCheckoutSession(options: {
  tenantId: string;
  customerId: string;
  amountCents: number;
  label?: string;
  purpose?: string;
  source?: string;
  successUrl?: string;
  cancelUrl?: string;
  idempotencyKey?: string;
}) {
  const stripe = getStripeClient();
  const {
    customerId,
    amountCents,
    label = 'ChittyFinance Payment',
    purpose = 'test',
    source = 'connections',
    tenantId,
    successUrl = `${process.env.PUBLIC_APP_BASE_URL || 'http://localhost:5000'}/connections?stripe=success`,
    cancelUrl = `${process.env.PUBLIC_APP_BASE_URL || 'http://localhost:5000'}/connections?stripe=cancel`,
    idempotencyKey,
  } = options;

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: label },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { tenantId, purpose, source },
    },
    idempotencyKey ? { idempotencyKey } : undefined
  );
  return session;
}

export function verifyWebhook(rawBody: Buffer, signature: string | string[] | undefined) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('Missing STRIPE_WEBHOOK_SECRET');
  const stripe = getStripeClient();
  const sig = Array.isArray(signature) ? signature[0] : signature || '';
  return stripe.webhooks.constructEvent(rawBody, sig, secret);
}

