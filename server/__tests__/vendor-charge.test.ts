import { describe, it, expect } from 'vitest';
import {
  VENDOR_CATEGORY_COA,
  PORTAL_DEFAULT_CATEGORY,
  SUSPENSE_CODE,
  resolveVendorChargeIngest,
  resolveVendorChargeSuggestion,
  mayOverwriteVendorCharge,
  vendorChargeAuditAction,
  vendorChargeAmount,
  vendorChargeExternalId,
} from '../lib/vendor-charge';
import { getAccountByCode } from '../../database/chart-of-accounts';

/**
 * Real functions against the real chart of accounts — no mocks. The SQL side
 * of the overwrite rule is validated against a Neon branch (see PR body).
 */

// Shaped like a real ChittyScrape nw-registered-agent result.
function body(overrides: { envelope?: object; charge?: object; accountExternalId?: string | undefined } = {}) {
  const b: Record<string, unknown> = {
    envelope: {
      success: true,
      portal: 'nw-registered-agent',
      scrapedAt: '2026-06-11T01:00:00.000Z',
      method: 'scrape',
      ...overrides.envelope,
    },
    charge: {
      vendor: 'Northwest Registered Agent',
      amountUsd: 125,
      period: '2026',
      paymentStatus: 'ok',
      ...overrides.charge,
    },
    accountExternalId: 'accountExternalId' in overrides ? overrides.accountExternalId : 'b88b1ef0-53af-11ee-a04b-6798e9e03c7b' // a real Mercury account id (ARIBIA LLC, ••4209),
  };
  if (b.accountExternalId === undefined) delete b.accountExternalId;
  return b;
}

describe('VENDOR_CATEGORY_COA — every code is a real account', () => {
  it.each(Object.entries(VENDOR_CATEGORY_COA))('%s -> %o exists in REI_CHART_OF_ACCOUNTS', (_cat, s) => {
    const acct = getAccountByCode(s.code);
    expect(acct, `COA ${s.code} missing from the chart`).toBeDefined();
    expect(acct!.type).toBe('expense');
  });

  it('every portal default category is mapped', () => {
    for (const cat of Object.values(PORTAL_DEFAULT_CATEGORY)) {
      expect(resolveVendorChargeSuggestion(cat), cat).toBeDefined();
    }
  });

  it('only suspense may sit below 0.500, and suspense stays below the 0.80 bulk-accept gate', () => {
    for (const s of Object.values(VENDOR_CATEGORY_COA)) {
      const n = Number(s.confidence);
      if (s.code === SUSPENSE_CODE) expect(n).toBeLessThan(0.8);
      else expect(n).toBeGreaterThanOrEqual(0.5);
      expect(n).toBeLessThanOrEqual(1);
    }
  });

  it('mortgage goes to suspense at 0.100 — never 5300 or the 2500 liability', () => {
    expect(VENDOR_CATEGORY_COA.mortgage).toEqual({ code: '9010', confidence: '0.100' });
    expect(resolveVendorChargeSuggestion(PORTAL_DEFAULT_CATEGORY['mr-cooper'])!.code).toBe('9010');
  });

  it('an unspecified utility goes to suspense instead of guessing internet', () => {
    expect(VENDOR_CATEGORY_COA.utility.code).toBe('9010');
  });

  it('registered-agent suggests 5050 and specific utilities their own account', () => {
    expect(VENDOR_CATEGORY_COA['registered-agent'].code).toBe('5050');
    expect(VENDOR_CATEGORY_COA['utility-electric'].code).toBe('5100');
    expect(VENDOR_CATEGORY_COA['utility-gas'].code).toBe('5110');
  });

  it('does not resolve prototype keys as categories', () => {
    expect(resolveVendorChargeSuggestion('constructor')).toBeUndefined();
    expect(resolveVendorChargeSuggestion('__proto__')).toBeUndefined();
  });
});

describe('resolveVendorChargeIngest — validation', () => {
  it('resolves a valid registered-agent charge as a negative L1 suggestion', () => {
    const r = resolveVendorChargeIngest(body());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.category).toBe('registered-agent');
    expect(r.suggestion).toEqual({ code: '5050', confidence: '0.700' });
    expect(r.amount).toBe('-125.00');
    expect(r.externalId).toBe('scrape:nw-registered-agent:2026:Northwest Registered Agent');
    expect(r.date.toISOString()).toBe('2026-06-11T01:00:00.000Z');
  });

  it('prefers charge.date over envelope.scrapedAt', () => {
    const r = resolveVendorChargeIngest(body({ charge: { date: '2026-03-15' } }));
    expect(r.ok && r.date.toISOString().slice(0, 10)).toBe('2026-03-15');
  });

  it('requires accountExternalId — there is no default account', () => {
    const r = resolveVendorChargeIngest(body({ accountExternalId: undefined }));
    expect(r).toMatchObject({ ok: false, status: 400, error: 'invalid_payload' });
  });

  it.each([
    ['zero', 0],
    ['negative', -125],
    ['sub-cent (rounds to $0.00)', 0.004],
    ['infinite', Number.POSITIVE_INFINITY],
    ['NaN', Number.NaN],
  ])('rejects a %s amount', (_label, amountUsd) => {
    const r = resolveVendorChargeIngest(body({ charge: { amountUsd } }));
    expect(r).toMatchObject({ ok: false, status: 400, error: 'invalid_payload' });
  });

  it('rejects a missing amount instead of defaulting to 0', () => {
    const b = body();
    delete (b.charge as Record<string, unknown>).amountUsd;
    expect(resolveVendorChargeIngest(b)).toMatchObject({ ok: false, status: 400 });
  });

  it('accepts exactly one cent', () => {
    const r = resolveVendorChargeIngest(body({ charge: { amountUsd: 0.01 } }));
    expect(r.ok && r.amount).toBe('-0.01');
  });

  it.each(['2026-13', '26', '2026-6', 'FY2026', '2026:01'])('rejects period %s', (period) => {
    expect(resolveVendorChargeIngest(body({ charge: { period } }))).toMatchObject({ ok: false, status: 400 });
  });

  it.each(['NW:agent', 'Mr Cooper', ''])('rejects portal id %j', (portal) => {
    expect(resolveVendorChargeIngest(body({ envelope: { portal } }))).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects an unparseable scrapedAt', () => {
    expect(resolveVendorChargeIngest(body({ envelope: { scrapedAt: 'yesterday-ish' } }))).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it('refuses a failed scrape with 422', () => {
    const r = resolveVendorChargeIngest(body({ envelope: { success: false, error: 'login required' } }));
    expect(r).toEqual({ ok: false, status: 422, error: 'scrape_failed', message: 'login required' });
  });

  it('400s an unknown portal with no explicit category', () => {
    const r = resolveVendorChargeIngest(body({ envelope: { portal: 'duke-energy' } }));
    expect(r).toMatchObject({ ok: false, status: 400, error: 'unknown_category' });
  });

  it('400s an explicit category with no mapping', () => {
    const r = resolveVendorChargeIngest(body({ charge: { category: 'hoa-dues' } }));
    expect(r).toMatchObject({ ok: false, status: 400, error: 'unmapped_category' });
  });

  it('lets an explicit category override the portal default', () => {
    const r = resolveVendorChargeIngest(
      body({ envelope: { portal: 'comed' }, charge: { vendor: 'ComEd', category: 'utility', period: '2026-05' } }),
    );
    expect(r.ok && r.suggestion.code).toBe('9010');
  });

  it('rejects non-object bodies', () => {
    for (const b of [null, 'x', 42, []]) {
      expect(resolveVendorChargeIngest(b)).toMatchObject({ ok: false, status: 400 });
    }
  });
});

describe('vendorChargeAmount / vendorChargeExternalId', () => {
  it('stores expenses negative, like Mercury expense rows', () => {
    expect(vendorChargeAmount(125)).toBe('-125.00');
    expect(vendorChargeAmount(1234.567)).toBe('-1234.57');
  });

  it('builds the idempotency key from portal, period, vendor', () => {
    expect(vendorChargeExternalId('comed', '2026-05', 'ComEd')).toBe('scrape:comed:2026-05:ComEd');
  });
});

describe('mayOverwriteVendorCharge', () => {
  it('writes a new row', () => {
    expect(mayOverwriteVendorCharge(null)).toBe(true);
    expect(mayOverwriteVendorCharge(undefined)).toBe(true);
  });
  it('overwrites an unclassified, unreconciled row', () => {
    expect(mayOverwriteVendorCharge({ coaCode: null, reconciled: false })).toBe(true);
  });
  it('never overwrites a classified row', () => {
    expect(mayOverwriteVendorCharge({ coaCode: '5050', reconciled: false })).toBe(false);
  });
  it('never overwrites a reconciled row, even without a coa_code', () => {
    expect(mayOverwriteVendorCharge({ coaCode: null, reconciled: true })).toBe(false);
    expect(mayOverwriteVendorCharge({ coaCode: '5050', reconciled: true })).toBe(false);
  });
});

describe('vendorChargeAuditAction', () => {
  it("is 'suggest' on insert", () => {
    expect(vendorChargeAuditAction(null, '5050')).toBe('suggest');
  });
  it("is 're-suggest' when the proposal changes", () => {
    expect(vendorChargeAuditAction({ coaCode: null, reconciled: false, suggestedCoaCode: '5140' }, '9010')).toBe(
      're-suggest',
    );
    expect(vendorChargeAuditAction({ coaCode: null, reconciled: false, suggestedCoaCode: null }, '9010')).toBe(
      're-suggest',
    );
  });
  it('writes nothing when a re-scrape repeats the same proposal', () => {
    expect(vendorChargeAuditAction({ coaCode: null, reconciled: false, suggestedCoaCode: '5050' }, '5050')).toBeNull();
  });
  it('writes nothing for a protected row', () => {
    expect(vendorChargeAuditAction({ coaCode: '5050', reconciled: false, suggestedCoaCode: '5140' }, '9010')).toBeNull();
    expect(vendorChargeAuditAction({ coaCode: null, reconciled: true, suggestedCoaCode: '5140' }, '9010')).toBeNull();
  });
});
