import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import {
  checkTransferClearingBalance,
  classifyMercuryInternalTransfer,
  transferGroupKey,
  transferGroupId,
} from '../books/transfers';
import {
  buildConsolidatedReport,
  buildPreflightChecks,
  type ReportingTransactionRow,
} from '../lib/consolidated-reporting';
import { rejectTransferClassification, StorageValidationError } from '../storage/system';
import { errorHandler } from '../middleware/error';

/**
 * A classify write could turn a FAILING clearing check into a green pass.
 *
 * `classifyTransaction` was type-blind, so `POST /api/classification/classify`
 * could set `coa_code = 5010` on a `type='transfer'` row. `effectiveClearingCode`
 * reads `coa_code ?? suggested_coa_code`, so the reclassified leg stopped
 * matching `isTransferClearingCode` and left the leg set entirely — and
 * `buildPreflightChecks` mapped `legCount === 0` to `pass` with "No transfer
 * clearing activity". A two-leg 1900 sweep with one leg reclassified by a
 * preparer working the 9010 queue therefore reported green over an empty set,
 * which is precisely the half-recorded movement the check exists to catch.
 *
 * Three layers had to change, and each assertion below fails if its layer is
 * reverted on its own:
 *   (a) the classify path refuses the write,
 *   (b) leg identity follows `type='transfer'`, never the current code,
 *   (c) an empty leg set is not itself a pass.
 */

const leg = (over: Partial<any>) => ({
  id: 'x',
  type: 'transfer',
  amount: '0.00',
  coaCode: null,
  suggestedCoaCode: '1900',
  date: '2024-06-01',
  description: 'Mercury internal transfer',
  metadata: { transfer_group: 'xfer_pair' },
  ...over,
});

describe('(a) the classify path refuses to take a transfer off its clearing account', () => {
  it('rejects an income/expense code on a transfer row, with a message naming the repair', () => {
    const reason = rejectTransferClassification('transfer', '5010');
    expect(reason).not.toBeNull();
    expect(reason).toContain('1900');
    expect(reason).toContain('correct its type first');
  });

  it('still allows the two legitimate clearing codes', () => {
    expect(rejectTransferClassification('transfer', '1900')).toBeNull();
    expect(rejectTransferClassification('transfer', '1910')).toBeNull();
  });

  it('leaves non-transfer rows entirely alone', () => {
    expect(rejectTransferClassification('income', '4000')).toBeNull();
    expect(rejectTransferClassification('expense', '5010')).toBeNull();
  });
});

describe('(b) leg identity follows the TYPE, not the account code', () => {
  it('a reclassified leg is still found — and drags its group into the missing-leg queue', () => {
    // The exact scenario: a two-leg 1900 sweep, one leg reclassified to 5010.
    const result = checkTransferClearingBalance([
      leg({ id: 'a', amount: '-1200.00' }),
      leg({ id: 'b', amount: '1200.00', coaCode: '5010' }),
    ]);

    // It did not vanish.
    expect(result.transferRowCount).toBe(2);
    expect(result.miscodedRows.map((r) => r.id)).toEqual(['b']);

    // And because a miscoded row is kept out of the group arithmetic, the
    // movement it belonged to ALSO surfaces as an unmatched group naming the
    // surviving sibling — so a preparer can find the pair, not just the fault.
    expect(result.unmatchedGroups).toHaveLength(1);
    expect(result.unmatchedGroups[0].net).toBe(-1200);
    expect(result.unmatchedRows.map((r) => r.id)).toEqual(['a']);
    expect(result.balanced).toBe(false);
  });

  it('an intact pair still balances, and the negative control is not broken', () => {
    const result = checkTransferClearingBalance([
      leg({ id: 'a', amount: '-1200.00' }),
      leg({ id: 'b', amount: '1200.00' }),
    ]);
    expect(result.balanced).toBe(true);
    expect(result.miscodedRows).toHaveLength(0);
    expect(result.legCount).toBe(2);
  });

  it('1920 rail holding is neither a leg nor a fault (§6 excludes it by name)', () => {
    const result = checkTransferClearingBalance([
      leg({ id: 'r', amount: '500.00', suggestedCoaCode: '1920', metadata: {} }),
    ]);
    expect(result.miscodedRows).toHaveLength(0);
    expect(result.legCount).toBe(0);
    expect(result.transferRowCount).toBe(1);
  });
});

describe('(c) an empty leg set is not a pass when transfer rows exist', () => {
  const report = (rows: any[]) =>
    buildConsolidatedReport({
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      tenantIds: ['e-1'],
      transactions: rows as ReportingTransactionRow[],
      accounts: [],
      options: { includeDescendants: false, includeIntercompany: false, strictReadiness: false },
      internalIntercompanyEliminated: 0,
    });

  const clearingCheck = (rows: any[]) =>
    buildPreflightChecks(report(rows), false).checks.find(
      (c) => c.id === 'transfer-clearing-balance',
    )!;

  const base = {
    tenantId: 'e-1',
    tenantName: 'ARIBIA LLC',
    tenantType: 'holding',
    tenantMetadata: {},
    category: 'rent',
    description: '',
    date: '2024-06-01',
    reconciled: true,
    propertyState: 'IL',
  };

  it('a sweep with one leg reclassified FAILS — it must never read as "no transfer activity"', () => {
    const check = clearingCheck([
      { ...base, ...leg({ id: 'a', amount: '-1200.00' }) },
      { ...base, ...leg({ id: 'b', amount: '1200.00', coaCode: '5010' }) },
    ]);
    expect(check.status).toBe('fail');
    expect(check.message).not.toContain('No transfer clearing activity');
    expect(check.message).toContain('not on a clearing account');
    expect(check.metric).toBeGreaterThan(0);
  });

  it('BOTH legs reclassified still fails — legCount 0 with transfer rows present', () => {
    const check = clearingCheck([
      { ...base, ...leg({ id: 'a', amount: '-1200.00', coaCode: '5010' }) },
      { ...base, ...leg({ id: 'b', amount: '1200.00', coaCode: '4000' }) },
    ]);
    expect(check.status).toBe('fail');
  });

  it('a genuinely empty period still passes — the fix does not invent alarms', () => {
    const check = clearingCheck([
      { ...base, id: 'i1', type: 'income', amount: '3000.00', coaCode: '4000', metadata: {} },
    ]);
    expect(check.status).toBe('pass');
    expect(check.message).toContain('No transfer clearing activity');
  });
});

describe('the clearing check runs on the unfiltered tenant/period set', () => {
  const base = {
    tenantId: 'e-1',
    tenantName: 'ARIBIA LLC',
    tenantType: 'holding',
    tenantMetadata: {},
    category: 'rent',
    description: '',
    date: '2024-06-01',
    reconciled: true,
  };

  // An IL-only view drops the pooled-account leg (no state) and keeps the
  // property-side leg. Running the check on the post-filter rows manufactures a
  // "missing leg" that does not exist in the books.
  const propertyLeg = { ...base, ...leg({ id: 'a', amount: '-1200.00' }), propertyState: 'IL' };
  const pooledLeg = { ...base, ...leg({ id: 'b', amount: '1200.00' }), propertyState: 'FL' };

  it('a view-scoped row set does not manufacture a false missing leg', () => {
    const scoped = buildConsolidatedReport({
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      tenantIds: ['e-1'],
      transactions: [propertyLeg] as ReportingTransactionRow[],
      accounts: [],
      options: { includeDescendants: false, includeIntercompany: false, strictReadiness: false },
      internalIntercompanyEliminated: 0,
      clearingTransactions: [propertyLeg, pooledLeg] as ReportingTransactionRow[],
    });
    expect(scoped.transferClearing.balanced).toBe(true);
    expect(scoped.transferClearing.unmatchedGroups).toHaveLength(0);
    // The report body is still the filtered view — only the check is widened.
    expect(scoped.quality.totalTransactions).toBe(1);
    expect(
      buildPreflightChecks(scoped, false).checks.find((c) => c.id === 'transfer-clearing-balance')!
        .status,
    ).toBe('pass');
  });

  it('and a genuinely missing leg is still caught over the wider set', () => {
    const scoped = buildConsolidatedReport({
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      tenantIds: ['e-1'],
      transactions: [propertyLeg] as ReportingTransactionRow[],
      accounts: [],
      options: { includeDescendants: false, includeIntercompany: false, strictReadiness: false },
      internalIntercompanyEliminated: 0,
      clearingTransactions: [propertyLeg] as ReportingTransactionRow[],
    });
    expect(scoped.transferClearing.balanced).toBe(false);
  });
});

describe('bad transaction input is a 400, not a 500', () => {
  it('a StorageValidationError maps to 400 through the shared handler', async () => {
    const app = new Hono();
    app.onError(errorHandler);
    app.post('/api/transactions', () => {
      throw new StorageValidationError('invalid_transaction_type', 'Invalid transaction type "Transfer"');
    });

    const res = await app.request('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({ type: 'Transfer' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_transaction_type' });
  });

  it('an unrecognised error is still a 500 — the mapping is narrow', async () => {
    const app = new Hono();
    app.onError(errorHandler);
    app.post('/boom', () => {
      throw new Error('kaboom');
    });
    expect((await app.request('/boom', { method: 'POST' })).status).toBe(500);
  });
});

describe('the grouping inputs are recoverable from the stored row', () => {
  it('metadata carries the exact amount magnitude and postedAt the id was hashed from', () => {
    const postedAt = '2024-06-01T12:00:00.123456Z';
    const classification = classifyMercuryInternalTransfer({
      tenantId: 't-1',
      amount: -1200,
      postedAt,
      kind: 'internalTransfer',
    });

    const inputs = (classification.metadata as any).transfer_group_inputs;
    expect(inputs).toMatchObject({ amount_magnitude: '1200.00', posted_at: postedAt });
    // The hash is one-way and `transactions.date` is ms-truncated, so this is the
    // only way an unmatched group can be recomputed and audited after the fact.
    expect(inputs.key).toBe(transferGroupKey({ amount: -1200, postedAt }));
    expect(transferGroupId({ amount: 1200, postedAt })).toBe(classification.transferGroup);
  });

  it('a leg with no postedAt records no group and no inputs to fake one from', () => {
    const classification = classifyMercuryInternalTransfer({
      tenantId: 't-1',
      amount: -1200,
      postedAt: null,
      kind: 'internalTransfer',
    });
    expect(classification.transferGroup).toBeNull();
    expect((classification.metadata as any).transfer_group_inputs).toBeUndefined();
    expect(classification.type).toBe('transfer');
  });
});

describe('why a group key is refused rather than derived from a weaker timestamp', () => {
  it('day-granular dates collide: two broken pairs cancel to a false "balanced"', () => {
    // The CSV path may see a Date column but no Timestamp column. Keying on the
    // day would put four legs of TWO different movements into one group…
    const day = '2024-06-01T00:00:00.000Z';
    expect(transferGroupId({ amount: 1200, postedAt: day })).toBe(
      transferGroupId({ amount: -1200, postedAt: day }),
    );

    // …where the two surviving legs of two DIFFERENT broken pairs net to zero
    // with an even count, so the group passes while both movements are missing a
    // leg. Hence the importer books such a leg with no group at all.
    const collided = checkTransferClearingBalance([
      leg({ id: 'p1-out', amount: '-1200.00', metadata: { transfer_group: 'xfer_day' } }),
      leg({ id: 'p2-in', amount: '1200.00', metadata: { transfer_group: 'xfer_day' } }),
    ]);
    expect(collided.balanced).toBe(true); // the false pass the guard avoids

    const ungrouped = checkTransferClearingBalance([
      leg({ id: 'p1-out', amount: '-1200.00', metadata: {} }),
      leg({ id: 'p2-in', amount: '1200.00', metadata: {} }),
    ]);
    expect(ungrouped.balanced).toBe(false);
    expect(ungrouped.ungroupedRows).toHaveLength(2);
  });

  it('a per-event timestamp would give the two legs of one movement different groups', () => {
    // `event.occurredAt` differs per event, and the two legs arrive as two
    // events — so deriving the key from it splits a real pair permanently (the
    // externalId dedupe means neither row is ever revisited).
    expect(transferGroupId({ amount: 1200, postedAt: '2024-06-01T12:00:00.100000Z' })).not.toBe(
      transferGroupId({ amount: 1200, postedAt: '2024-06-01T12:00:00.200000Z' }),
    );
  });
});
