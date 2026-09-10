import { describe, it, expect } from 'vitest';
import { detectRecurringCharges, analyzeOptimizations } from '../routes/charges';

/**
 * These replace an older suite that mocked `storage.getIntegrations` and
 * asserted a stub contract ("returns empty array — stub implementation",
 * "not yet implemented"). Both had been false for some time: the route was
 * implemented for real and reads `storage.getTransactions`, so every one of
 * those tests was failing with a 500 while the endpoint worked fine.
 *
 * The detection and recommendation logic is pure, so it is exercised directly
 * against realistic transaction shapes rather than through a mocked datastore.
 */

type Tx = Parameters<typeof detectRecurringCharges>[0][number];

function tx(over: Partial<Tx> & { payee: string; amount: string; date: string }): Tx {
  return {
    id: `tx-${over.payee}-${over.date}`,
    type: 'expense',
    category: 'Software',
    description: over.payee,
    ...over,
  } as Tx;
}

describe('detectRecurringCharges', () => {
  it('returns nothing for an empty ledger', () => {
    expect(detectRecurringCharges([])).toEqual([]);
  });

  it('ignores a payee seen only once', () => {
    expect(detectRecurringCharges([tx({ payee: 'Notion', amount: '-10.00', date: '2026-01-05' })])).toEqual([]);
  });

  it('ignores income, since a recurring charge is an outflow', () => {
    const rows = [
      tx({ payee: 'Rent Deposit', amount: '2400.00', date: '2026-01-01', type: 'income' }),
      tx({ payee: 'Rent Deposit', amount: '2400.00', date: '2026-02-01', type: 'income' }),
    ];
    expect(detectRecurringCharges(rows)).toEqual([]);
  });

  it('detects a monthly charge and projects the next date', () => {
    const rows = [
      tx({ payee: 'Adobe', amount: '-59.99', date: '2026-01-12' }),
      tx({ payee: 'Adobe', amount: '-59.99', date: '2026-02-12' }),
      tx({ payee: 'Adobe', amount: '-59.99', date: '2026-03-12' }),
    ];
    const [charge] = detectRecurringCharges(rows);
    expect(charge.merchantName).toBe('Adobe');
    expect(charge.occurrences).toBe(3);
    expect(charge.frequency).toBe('monthly');
    expect(charge.amount).toBeCloseTo(59.99, 2);
    // next charge is projected a month past the most recent occurrence
    expect(charge.nextChargeDate?.slice(0, 7)).toBe('2026-04');
  });

  it('groups by payee case-insensitively', () => {
    const rows = [
      tx({ payee: 'ADOBE', amount: '-59.99', date: '2026-01-12' }),
      tx({ payee: 'adobe', amount: '-59.99', date: '2026-02-12' }),
    ];
    expect(detectRecurringCharges(rows)).toHaveLength(1);
  });

  it('sorts the biggest charge first', () => {
    const rows = [
      tx({ payee: 'Small', amount: '-5.00', date: '2026-01-01' }),
      tx({ payee: 'Small', amount: '-5.00', date: '2026-02-01' }),
      tx({ payee: 'Large', amount: '-500.00', date: '2026-01-01' }),
      tx({ payee: 'Large', amount: '-500.00', date: '2026-02-01' }),
    ];
    const charges = detectRecurringCharges(rows);
    expect(charges.map((ch) => ch.merchantName)).toEqual(['Large', 'Small']);
  });
});

describe('analyzeOptimizations', () => {
  it('recommends nothing when there are no charges', () => {
    expect(analyzeOptimizations([])).toEqual([]);
  });

  it('only ever recommends actions the manage endpoint accepts', () => {
    // POST /api/charges/manage rejects anything outside this set with a 400,
    // so a recommendation the caller cannot act on is a dead end.
    const accepted = new Set(['cancel', 'downgrade', 'consolidate', 'negotiate']);
    const rows = [
      tx({ payee: 'Adobe', amount: '-59.99', date: '2026-01-12' }),
      tx({ payee: 'Adobe', amount: '-59.99', date: '2026-02-12' }),
      tx({ payee: 'Figma', amount: '-45.00', date: '2026-01-20' }),
      tx({ payee: 'Figma', amount: '-45.00', date: '2026-02-20' }),
      tx({ payee: 'Storage Unit', amount: '-210.00', date: '2026-01-03', category: 'Facilities' }),
      tx({ payee: 'Storage Unit', amount: '-210.00', date: '2026-02-03', category: 'Facilities' }),
    ];
    const recs = analyzeOptimizations(detectRecurringCharges(rows));
    for (const r of recs) {
      expect(accepted, `suggestedAction ${r.suggestedAction}`).toContain(r.suggestedAction);
      expect(r.potentialSavings).toBeGreaterThanOrEqual(0);
      expect(r.chargeId).toBeTruthy();
    }
  });

  it('never invents savings larger than the charge itself', () => {
    const rows = [
      tx({ payee: 'Adobe', amount: '-59.99', date: '2026-01-12' }),
      tx({ payee: 'Adobe', amount: '-59.99', date: '2026-02-12' }),
    ];
    const charges = detectRecurringCharges(rows);
    for (const r of analyzeOptimizations(charges)) {
      const source = charges.find((ch) => ch.id === r.chargeId)!;
      expect(r.potentialSavings).toBeLessThanOrEqual(source.amount * 12);
    }
  });
});
