import { Hono } from 'hono';
import { z } from 'zod';
import type { HonoEnv } from '../env';
import { ledgerLog } from '../lib/ledger-client';
import { INFRA_ACCOUNT_EXTERNAL_ID } from '../lib/comptroller-sync';

// ChittyScrape (scrape.chitty.cc) extracts vendor charges from portals that
// have no API — registered-agent fees, utility bills, mortgage statements.
// This route is the canonical "ChittyScrape feeds the cost flow" wiring: it
// accepts a ChittyScrape result envelope plus the resolved charge amount and
// records it as an idempotent expense transaction in the books.
//
// The live portal scrape itself is credential-gated (portal login via
// ChittyConnect); this ingest does NOT scrape. It is driven by whatever
// dispatches the scrape (ChittyCommand cron) and posts the result here.

// Vendor category → real chart_of_accounts code. Codes verified against the
// seeded ChittyFinance COA (Neon solitary-rice-14149088). Do NOT invent codes.
//   registered-agent : 5050 Legal & Professional Fees
//     (Northwest Registered Agent et al. are private vendors selling a
//      statutory-agent service — a professional-services fee, not a government
//      license, so 5050 rather than 6040 Licenses & Permits.)
//   utility-electric : 5100 / utility-gas : 5110 / utility-water : 5120 /
//     utility-trash : 5130 / utility-internet : 5140
//   mortgage         : 5300 Mortgage Interest (the expense-recognised portion
//     of a mortgage charge; principal is a 2500 liability, not an expense).
export const VENDOR_CATEGORY_COA: Record<string, string> = {
  'registered-agent': '5050',
  'utility-electric': '5100',
  'utility-gas': '5110',
  'utility-water': '5120',
  'utility-trash': '5130',
  'utility-internet': '5140',
  utility: '5140', // generic utility fallback (internet/cable) when unspecified
  mortgage: '5300',
};

// Map a ChittyScrape portalId to a default vendor category when the caller
// does not specify one explicitly.
const PORTAL_DEFAULT_CATEGORY: Record<string, string> = {
  'nw-registered-agent': 'registered-agent',
  'fl-registered-agent': 'registered-agent',
  comed: 'utility-electric',
  'peoples-gas': 'utility-gas',
  'mr-cooper': 'mortgage',
};

// ChittyScrape result envelope shape (src/scrapers/base.ts ScrapeResult):
//   { success, data?, error?, method:'scrape', portal, scrapedAt }
// We accept that envelope and a small ingest contract carrying the resolved
// charge (amount, vendor, category, period) since the raw scraped `data` shape
// differs per portal and the monetary amount is portal-specific.
const ingestSchema = z.object({
  // The ChittyScrape envelope (required so we honour success/error + portal).
  envelope: z.object({
    success: z.boolean(),
    portal: z.string().min(1),
    scrapedAt: z.string().min(1),
    error: z.string().nullish(),
    data: z.unknown().optional(),
    method: z.literal('scrape').optional(),
  }),
  // The resolved charge derived from the scrape.
  charge: z.object({
    vendor: z.string().min(1),
    // amount is REQUIRED and must be > 0 — no defaulting to 0.
    amountUsd: z.number().positive(),
    period: z.string().min(1), // e.g. '2026' (annual) or '2026-06' (monthly)
    category: z.string().optional(), // overrides the portal default
    paymentStatus: z.string().optional(), // scraped 'ok' | 'failed'
    date: z.string().optional(), // ISO; defaults to envelope.scrapedAt
    description: z.string().optional(),
  }),
  // Account to book against, by external_id. Defaults to the infra account.
  accountExternalId: z.string().optional(),
});

export const vendorChargeRoutes = new Hono<HonoEnv>();

vendorChargeRoutes.post('/api/vendor-charge/ingest', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_payload', details: parsed.error.flatten() }, 400);
  }
  const { envelope, charge } = parsed.data;

  // A failed scrape carries no trustworthy charge — refuse to book it.
  if (!envelope.success) {
    return c.json(
      { error: 'scrape_failed', message: envelope.error ?? 'ChittyScrape reported success=false' },
      422,
    );
  }

  const category = charge.category ?? PORTAL_DEFAULT_CATEGORY[envelope.portal];
  if (!category) {
    return c.json(
      {
        error: 'unknown_category',
        message: `No vendor category for portal '${envelope.portal}'. Pass charge.category explicitly.`,
      },
      400,
    );
  }
  const coaCode = VENDOR_CATEGORY_COA[category];
  if (!coaCode) {
    return c.json(
      {
        error: 'unmapped_category',
        message: `No COA mapping for category '${category}'. Known: ${Object.keys(VENDOR_CATEGORY_COA).join(', ')}.`,
      },
      400,
    );
  }

  const accountExternalId = parsed.data.accountExternalId ?? INFRA_ACCOUNT_EXTERNAL_ID;
  const account = await storage.getAccountByExternalId(accountExternalId, tenantId);
  if (!account) {
    return c.json(
      {
        error: 'account_missing',
        message: `No account with external_id='${accountExternalId}' for this tenant.`,
      },
      400,
    );
  }

  const date = charge.date ? new Date(charge.date) : new Date(envelope.scrapedAt);
  if (Number.isNaN(date.getTime())) {
    return c.json({ error: 'invalid_date', message: 'charge.date / envelope.scrapedAt is not a valid date' }, 400);
  }

  const row = await storage.upsertVendorCharge({
    tenantId,
    accountId: account.id,
    date,
    period: charge.period,
    portalId: envelope.portal,
    vendor: charge.vendor,
    amountUsd: charge.amountUsd,
    coaCode,
    description: charge.description,
    paymentStatus: charge.paymentStatus,
    metadata: { category, scrapedAt: envelope.scrapedAt },
  });

  ledgerLog(
    c,
    {
      entityType: 'audit',
      action: 'vendor-charge.ingest',
      metadata: {
        tenantId,
        portal: envelope.portal,
        vendor: charge.vendor,
        period: charge.period,
        category,
        coaCode,
        amount: row.amount,
        externalId: row.externalId,
        transactionId: row.id,
      },
    },
    c.env,
  );

  return c.json({
    recorded: true,
    transaction: {
      id: row.id,
      externalId: row.externalId,
      amount: row.amount,
      coaCode: row.coaCode,
      type: row.type,
      payee: row.payee,
    },
  });
});
