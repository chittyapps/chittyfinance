// Pure logic for the ChittyScrape vendor-charge ingest (POST /api/vendor-charge/ingest).
// No I/O here — the route validates with these helpers and the storage layer
// (SystemStorage.upsertVendorCharge) encodes the same overwrite rule in SQL.
//
// Trust path (AGENTS.md): this ingest is an L1 writer. It proposes a COA code
// via `suggested_coa_code` + `classification_confidence` and never touches the
// authoritative `coa_code` / `classified_by` / `classified_at` columns.

import { z } from 'zod';

/** Suspense — "needs a human". Kept below the bulk-accept gate. */
export const SUSPENSE_CODE = '9010';
export const SUSPENSE_CONFIDENCE = '0.100';

/** Audit actor for every row this ingest writes to classification_audit. */
export const VENDOR_CHARGE_ACTOR_ID = 'chittyscrape:vendor-charge';

export interface VendorChargeSuggestion {
  code: string;
  /** decimal(4,3) string, as stored in transactions.classification_confidence */
  confidence: string;
}

// Vendor category -> suggested COA code. Every code here must exist in
// REI_CHART_OF_ACCOUNTS (database/chart-of-accounts.ts); the unit test walks
// this table and fails on any code that does not. Anything we cannot map to a
// single real expense account goes to suspense (9010).
//
// Confidence tiers (bulk-accept gate is 0.80, see
// client/src/pages/Classification.tsx MIN_BULK_CONFIDENCE):
//   0.850  the category names exactly one account (a specific utility)
//   0.700  a reasonable default a human should confirm
//          (registered-agent: a private vendor's statutory-agent service reads
//           as 5050 Legal & Professional Fees, but 6040 Licenses & Permits is
//           arguable)
//   0.100  suspense
export const VENDOR_CATEGORY_COA: Record<string, VendorChargeSuggestion> = {
  'registered-agent': { code: '5050', confidence: '0.700' },
  'utility-electric': { code: '5100', confidence: '0.850' },
  'utility-gas': { code: '5110', confidence: '0.850' },
  'utility-water': { code: '5120', confidence: '0.850' },
  'utility-trash': { code: '5130', confidence: '0.850' },
  'utility-internet': { code: '5140', confidence: '0.850' },
  // An unspecified "utility" could be any of 5100-5140; guessing internet
  // (the old mapping) would silently misfile electric/gas bills.
  utility: { code: SUSPENSE_CODE, confidence: SUSPENSE_CONFIDENCE },
  // A scraped mortgage payment bundles principal (2500 Mortgage Payable, a
  // liability — not an expense), interest (5300 Mortgage Interest) and escrow
  // (taxes/insurance). The statement total cannot be booked to any one of
  // those, so it goes to suspense for a human to split.
  mortgage: { code: SUSPENSE_CODE, confidence: SUSPENSE_CONFIDENCE },
};

// ChittyScrape portalId -> default vendor category when the caller omits one.
export const PORTAL_DEFAULT_CATEGORY: Record<string, string> = {
  'nw-registered-agent': 'registered-agent',
  'fl-registered-agent': 'registered-agent',
  comed: 'utility-electric',
  'peoples-gas': 'utility-gas',
  'mr-cooper': 'mortgage',
};

// Segments of the external id `scrape:{portal}:{period}:{vendor}` — portal and
// period are constrained so a ':' cannot make two different charges collide.
const portalId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'portal must be a lowercase ChittyScrape portal id');
const period = z.string().regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, "period must be 'YYYY' or 'YYYY-MM'");
const isoDate = z.string().refine((s) => !Number.isNaN(new Date(s).getTime()), 'not a valid date');

export const vendorChargeIngestSchema = z.object({
  // ChittyScrape result envelope (src/scrapers/base.ts ScrapeResult).
  envelope: z.object({
    success: z.boolean(),
    portal: portalId,
    scrapedAt: isoDate,
    error: z.string().nullish(),
    data: z.unknown().optional(),
    method: z.literal('scrape').optional(),
  }),
  charge: z.object({
    vendor: z.string().trim().min(1).max(200),
    // Required, finite, and at least one cent after rounding: a $0 row is a
    // silent data-integrity lie, so there is no default.
    amountUsd: z
      .number()
      .finite()
      .positive()
      .refine((n) => Math.round(n * 100) >= 1, 'amountUsd must be at least 0.01'),
    period,
    category: z.string().min(1).optional(),
    paymentStatus: z.string().max(50).optional(),
    date: isoDate.optional(),
    description: z.string().max(500).optional(),
  }),
  // The account to book against, by accounts.external_id. Required — there is
  // no default account. Resolved against the caller's tenant only.
  accountExternalId: z.string().trim().min(1),
});

export type VendorChargeIngest = z.infer<typeof vendorChargeIngestSchema>;

export type VendorChargeResolution =
  | {
      ok: true;
      input: VendorChargeIngest;
      category: string;
      suggestion: VendorChargeSuggestion;
      date: Date;
      externalId: string;
      /** signed decimal(12,2) string — negative, like Mercury expense rows */
      amount: string;
    }
  | { ok: false; status: 400 | 422; error: string; message?: string; details?: unknown };

/** Idempotency key for a scraped charge. */
export function vendorChargeExternalId(portal: string, chargePeriod: string, vendor: string): string {
  return `scrape:${portal}:${chargePeriod}:${vendor}`;
}

/**
 * Sign convention: Mercury ingest (server/books/webhooks.ts) stores the bank's
 * signed amount with `type = amount >= 0 ? 'income' : 'expense'`, so every
 * Mercury expense row is negative. Vendor charges follow the same convention
 * so reports that sum `amount` treat both sources alike.
 */
export function vendorChargeAmount(amountUsd: number): string {
  return (-Math.abs(amountUsd)).toFixed(2);
}

export function resolveVendorChargeSuggestion(category: string): VendorChargeSuggestion | undefined {
  return Object.prototype.hasOwnProperty.call(VENDOR_CATEGORY_COA, category)
    ? VENDOR_CATEGORY_COA[category]
    : undefined;
}

/** Validate an ingest body and resolve everything the storage call needs. */
export function resolveVendorChargeIngest(body: unknown): VendorChargeResolution {
  const parsed = vendorChargeIngestSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, error: 'invalid_payload', details: parsed.error.flatten() };
  }
  const input = parsed.data;
  const { envelope, charge } = input;

  // A failed scrape carries no trustworthy charge.
  if (!envelope.success) {
    return {
      ok: false,
      status: 422,
      error: 'scrape_failed',
      message: envelope.error ?? 'ChittyScrape reported success=false',
    };
  }

  const category = charge.category ?? PORTAL_DEFAULT_CATEGORY[envelope.portal];
  if (!category) {
    return {
      ok: false,
      status: 400,
      error: 'unknown_category',
      message: `No vendor category for portal '${envelope.portal}'. Pass charge.category explicitly.`,
    };
  }
  const suggestion = resolveVendorChargeSuggestion(category);
  if (!suggestion) {
    return {
      ok: false,
      status: 400,
      error: 'unmapped_category',
      message: `No COA mapping for category '${category}'. Known: ${Object.keys(VENDOR_CATEGORY_COA).join(', ')}.`,
    };
  }

  return {
    ok: true,
    input,
    category,
    suggestion,
    date: new Date(charge.date ?? envelope.scrapedAt),
    externalId: vendorChargeExternalId(envelope.portal, charge.period, charge.vendor),
    amount: vendorChargeAmount(charge.amountUsd),
  };
}

/**
 * May a re-scrape overwrite the existing row? Only while no human (or L2+
 * agent) has classified it and it has not been reconciled. A new row (no
 * existing) is always writable. SystemStorage.upsertVendorCharge encodes the
 * same predicate in the ON CONFLICT ... DO UPDATE ... WHERE clause.
 */
export function mayOverwriteVendorCharge(
  existing: { coaCode: string | null; reconciled: boolean } | null | undefined,
): boolean {
  if (!existing) return true;
  return existing.coaCode === null && existing.reconciled === false;
}

/**
 * Which classification_audit action (if any) a write produces. Mirrors the
 * suggestion branch of SystemStorage.classifyTransaction: 'suggest' for a new
 * row, 're-suggest' when the proposal changed, nothing when it is unchanged
 * (a nightly re-scrape must not spam the audit trail) or when the row was
 * protected from overwrite.
 */
export function vendorChargeAuditAction(
  existing: { coaCode: string | null; reconciled: boolean; suggestedCoaCode: string | null } | null | undefined,
  nextSuggestedCoaCode: string,
): 'suggest' | 're-suggest' | null {
  if (!existing) return 'suggest';
  if (!mayOverwriteVendorCharge(existing)) return null;
  return existing.suggestedCoaCode === nextSuggestedCoaCode ? null : 're-suggest';
}
