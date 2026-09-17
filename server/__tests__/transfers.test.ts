import { describe, it, expect } from 'vitest';
import {
  TRANSACTION_TYPES,
  TRANSFER_CLEARING_INTERCOMPANY,
  TRANSFER_CLEARING_INTRA_ENTITY,
  checkTransferClearingBalance,
  classifyMercuryInternalTransfer,
  effectiveClearingCode,
  isMercuryInternalTransfer,
  isTransactionType,
  isTransferClearingCode,
  isTransferType,
  selectTransferClearingCode,
  transferGroupId,
  transferGroupKey,
} from '../books/transfers';
import { getAccountByCode, isProfitAndLossAccount } from '../../database/chart-of-accounts';
import { buildConsolidatedReport, buildPreflightChecks, type ReportingTransactionRow } from '../lib/consolidated-reporting';
import { buildScheduleEReport, buildForm1065Report } from '../lib/tax-reporting';

// Both legs of one real Mercury internal transfer: separate ids, identical
// postedAt to the microsecond, opposite amounts, counterpartyNickname naming the
// other account.
const LEG_OUT = {
  id: 'mercury-leg-out',
  amount: -4250.0,
  postedAt: '2026-03-14T18:22:09.481732Z',
  kind: 'internalTransfer',
  bankDescription: 'Transfer to 👁️ Operating - City 5608',
  counterpartyNickname: '👁️ Operating - City 5608',
};

const LEG_IN = {
  id: 'mercury-leg-in',
  amount: 4250.0,
  postedAt: '2026-03-14T18:22:09.481732Z',
  kind: 'internalTransfer',
  bankDescription: 'Transfer from 🤑 Rental Income - City 3372',
  counterpartyNickname: '🤑 Rental Income - City 3372',
};

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

describe('transaction type domain', () => {
  it('includes transfer alongside income and expense', () => {
    expect(TRANSACTION_TYPES).toEqual(['income', 'expense', 'transfer']);
    expect(isTransactionType('transfer')).toBe(true);
    expect(isTransactionType('income')).toBe(true);
    expect(isTransactionType('expense')).toBe(true);
  });

  it('rejects anything outside the domain', () => {
    expect(isTransactionType('Transfer')).toBe(false);
    expect(isTransactionType('xfer')).toBe(false);
    expect(isTransactionType(undefined)).toBe(false);
    expect(isTransactionType(null)).toBe(false);
  });

  it('isTransferType only matches transfer', () => {
    expect(isTransferType('transfer')).toBe(true);
    expect(isTransferType('income')).toBe(false);
    expect(isTransferType('expense')).toBe(false);
  });
});

describe('leg pairing', () => {
  it('derives the same transfer_group from each leg independently', () => {
    const out = transferGroupId({ amount: LEG_OUT.amount, postedAt: LEG_OUT.postedAt });
    const inn = transferGroupId({ amount: LEG_IN.amount, postedAt: LEG_IN.postedAt });
    expect(out).toBe(inn);
    expect(out).toMatch(/^xfer_[0-9a-f]{16}$/);
  });

  it('keys on magnitude, so sign does not split the pair', () => {
    expect(transferGroupKey({ amount: -4250, postedAt: LEG_OUT.postedAt })).toBe(
      transferGroupKey({ amount: 4250, postedAt: LEG_IN.postedAt }),
    );
  });

  it('preserves microsecond precision — same second, different microsecond is a different group', () => {
    const a = transferGroupId({ amount: 100, postedAt: '2026-03-14T18:22:09.481732Z' });
    const b = transferGroupId({ amount: 100, postedAt: '2026-03-14T18:22:09.481733Z' });
    expect(a).not.toBe(b);
  });

  it('separates movements of different amounts at the same instant', () => {
    const a = transferGroupId({ amount: 100, postedAt: LEG_OUT.postedAt });
    const b = transferGroupId({ amount: 100.01, postedAt: LEG_OUT.postedAt });
    expect(a).not.toBe(b);
  });

  it('does not pair on transaction id — the legs have different ids', () => {
    expect(LEG_OUT.id).not.toBe(LEG_IN.id);
    expect(
      classifyMercuryInternalTransfer({ tenantId: TENANT_A, ...LEG_OUT }).transferGroup,
    ).toBe(classifyMercuryInternalTransfer({ tenantId: TENANT_A, ...LEG_IN }).transferGroup);
  });
});

describe('1900 vs 1910 selection', () => {
  it('detects Mercury internal transfers only on the exact kind', () => {
    expect(isMercuryInternalTransfer('internalTransfer')).toBe(true);
    expect(isMercuryInternalTransfer('externalTransfer')).toBe(false);
    expect(isMercuryInternalTransfer('incomingPayment')).toBe(false);
    expect(isMercuryInternalTransfer(null)).toBe(false);
  });

  it('books 1900 when both accounts belong to the same tenant', () => {
    expect(
      selectTransferClearingCode({ tenantId: TENANT_A, counterpartyTenantId: TENANT_A }),
    ).toBe(TRANSFER_CLEARING_INTRA_ENTITY);
  });

  it('books 1910 only on a positive tenant mismatch', () => {
    expect(
      selectTransferClearingCode({ tenantId: TENANT_A, counterpartyTenantId: TENANT_B }),
    ).toBe(TRANSFER_CLEARING_INTERCOMPANY);
  });

  it('falls back to 1900 when the counterparty tenant is unknown', () => {
    expect(selectTransferClearingCode({ tenantId: TENANT_A, counterpartyTenantId: null })).toBe(
      TRANSFER_CLEARING_INTRA_ENTITY,
    );
    expect(selectTransferClearingCode({ tenantId: TENANT_A })).toBe(
      TRANSFER_CLEARING_INTRA_ENTITY,
    );
  });

  it('never returns an income or expense code for an internal transfer', () => {
    const classified = classifyMercuryInternalTransfer({ tenantId: TENANT_A, ...LEG_IN });
    expect(classified.type).toBe('transfer');
    expect(isTransferClearingCode(classified.suggestedCoaCode)).toBe(true);
    expect(isProfitAndLossAccount(classified.suggestedCoaCode)).toBe(false);
  });

  it('keeps the raw Mercury kind, bank description and counterparty in metadata', () => {
    const classified = classifyMercuryInternalTransfer({ tenantId: TENANT_A, ...LEG_OUT });
    expect(classified.metadata.mercury_kind).toBe('internalTransfer');
    expect(classified.metadata.bank_description).toBe(LEG_OUT.bankDescription);
    expect(classified.metadata.counterparty_nickname).toBe(LEG_OUT.counterpartyNickname);
    expect(classified.metadata.transfer_group).toBe(classified.transferGroup);
    expect(classified.metadata.transfer_direction).toBe('out');
  });
});

describe('chart of accounts — clearing codes', () => {
  it('1900 and 1910 exist so getAccountByCode validates an emitted code', () => {
    expect(getAccountByCode('1900')?.type).toBe('asset');
    expect(getAccountByCode('1910')?.type).toBe('asset');
  });

  it('isProfitAndLossAccount excludes balance-sheet and unknown codes', () => {
    expect(isProfitAndLossAccount('4000')).toBe(true); // rental income
    expect(isProfitAndLossAccount('5040')).toBe(true); // insurance expense
    expect(isProfitAndLossAccount('1900')).toBe(false);
    expect(isProfitAndLossAccount('1910')).toBe(false);
    expect(isProfitAndLossAccount('3200')).toBe(false); // never a real account
    expect(isProfitAndLossAccount(null)).toBe(false);
  });
});

// ── Clearing balance check ──

function leg(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'row',
    type: 'transfer',
    amount: '-4250.00',
    coaCode: null,
    suggestedCoaCode: '1900',
    date: '2026-03-14',
    metadata: { transfer_group: 'xfer_abc' },
    ...over,
  } as any;
}

describe('clearing balance check', () => {
  it('nets a matched pair to zero', () => {
    const result = checkTransferClearingBalance([
      leg({ id: 'a', amount: '-4250.00' }),
      leg({ id: 'b', amount: '4250.00' }),
    ]);
    expect(result.legCount).toBe(2);
    expect(result.groupCount).toBe(1);
    expect(result.net).toBe(0);
    expect(result.balanced).toBe(true);
    expect(result.unmatchedGroups).toEqual([]);
    expect(result.unmatchedRows).toEqual([]);
  });

  it('catches a deliberately unmatched leg and returns the row', () => {
    const result = checkTransferClearingBalance([
      leg({ id: 'a', amount: '-4250.00' }),
      leg({ id: 'b', amount: '4250.00' }),
      leg({ id: 'orphan', amount: '-900.00', metadata: { transfer_group: 'xfer_lonely' } }),
    ]);
    expect(result.balanced).toBe(false);
    expect(result.net).toBe(-900);
    expect(result.unmatchedGroups).toHaveLength(1);
    expect(result.unmatchedGroups[0]).toMatchObject({
      transferGroup: 'xfer_lonely',
      legCount: 1,
      net: -900,
      rowIds: ['orphan'],
    });
    expect(result.unmatchedRows.map((r) => r.id)).toEqual(['orphan']);
  });

  it('reads suggested_coa_code when coa_code is null (the L1 ingest path)', () => {
    expect(effectiveClearingCode(leg({ coaCode: null, suggestedCoaCode: '1900' }))).toBe('1900');
    expect(effectiveClearingCode(leg({ coaCode: '1910', suggestedCoaCode: '1900' }))).toBe('1910');
    const result = checkTransferClearingBalance([
      leg({ id: 'a', amount: '-10.00', coaCode: null, suggestedCoaCode: '1900' }),
      leg({ id: 'b', amount: '10.00', coaCode: '1900', suggestedCoaCode: null }),
    ]);
    expect(result.legCount).toBe(2);
    expect(result.balanced).toBe(true);
  });

  it('does not pass vacuously on an empty period', () => {
    const result = checkTransferClearingBalance([]);
    expect(result.legCount).toBe(0);
    expect(result.net).toBe(0);
    expect(result.balanced).toBe(false);
  });

  it('flags clearing legs that carry no transfer_group', () => {
    const result = checkTransferClearingBalance([
      leg({ id: 'a', amount: '-10.00', metadata: null }),
      leg({ id: 'b', amount: '10.00', metadata: null }),
    ]);
    expect(result.net).toBe(0);
    expect(result.ungroupedRows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(result.balanced).toBe(false);
  });

  it('ignores income and expense rows entirely', () => {
    const result = checkTransferClearingBalance([
      leg({ id: 'income', type: 'income', amount: '5000.00', suggestedCoaCode: '4000' }),
      leg({ id: 'expense', type: 'expense', amount: '-200.00', suggestedCoaCode: '5040' }),
    ]);
    expect(result.legCount).toBe(0);
  });

  it('ignores a transfer booked to a non-clearing code', () => {
    const result = checkTransferClearingBalance([
      leg({ id: 'a', suggestedCoaCode: '9010' }),
    ]);
    expect(result.legCount).toBe(0);
  });
});

// ── Report exclusion ──

function tx(over: Partial<ReportingTransactionRow>): ReportingTransactionRow {
  return {
    id: 'tx',
    tenantId: TENANT_A,
    tenantName: 'ARIBIA LLC',
    tenantType: 'operating',
    tenantMetadata: null,
    amount: '100.00',
    type: 'income',
    category: 'Rent',
    description: 'Rent',
    coaCode: '4000',
    suggestedCoaCode: null,
    date: '2026-03-14',
    reconciled: true,
    metadata: null,
    propertyState: 'IL',
    ...over,
  };
}

const REPORT_ROWS: ReportingTransactionRow[] = [
  tx({ id: 'rent', amount: '5000.00', type: 'income', category: 'Rent', coaCode: '4000' }),
  tx({ id: 'ins', amount: '-800.00', type: 'expense', category: 'Insurance', coaCode: '5040' }),
  tx({
    id: 'sweep-out',
    amount: '-4250.00',
    type: 'transfer',
    category: null,
    description: 'Transfer to Operating',
    coaCode: null,
    suggestedCoaCode: '1900',
    metadata: { transfer_group: 'xfer_sweep' },
  }),
  tx({
    id: 'sweep-in',
    amount: '4250.00',
    type: 'transfer',
    category: null,
    description: 'Transfer from Rental Income',
    coaCode: null,
    suggestedCoaCode: '1900',
    metadata: { transfer_group: 'xfer_sweep' },
  }),
];

describe('report exclusion', () => {
  it('keeps transfers out of consolidated income and expense totals', () => {
    const report = buildConsolidatedReport({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      tenantIds: [TENANT_A],
      transactions: REPORT_ROWS,
      accounts: [],
      options: { includeDescendants: true, includeIntercompany: false, strictReadiness: false },
      internalIntercompanyEliminated: 0,
    });

    expect(report.totals.income).toBe(5000);
    expect(report.totals.expenses).toBe(800);
    expect(report.totals.netIncome).toBe(4200);
    expect(report.quality.totalTransactions).toBe(4);
    expect(report.quality.transfersExcluded).toBe(2);
  });

  it('reports the clearing balance and passes preflight when the pair nets to zero', () => {
    const report = buildConsolidatedReport({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      tenantIds: [TENANT_A],
      transactions: REPORT_ROWS,
      accounts: [],
      options: { includeDescendants: true, includeIntercompany: false, strictReadiness: false },
      internalIntercompanyEliminated: 0,
    });

    expect(report.transferClearing.balanced).toBe(true);
    expect(report.transferClearing.net).toBe(0);

    const check = buildPreflightChecks(report, false).checks.find(
      (c) => c.id === 'transfer-clearing-balance',
    );
    expect(check?.status).toBe('pass');
  });

  it('fails preflight when a leg is missing', () => {
    const report = buildConsolidatedReport({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      tenantIds: [TENANT_A],
      transactions: REPORT_ROWS.filter((row) => row.id !== 'sweep-in'),
      accounts: [],
      options: { includeDescendants: true, includeIntercompany: false, strictReadiness: false },
      internalIntercompanyEliminated: 0,
    });

    expect(report.transferClearing.balanced).toBe(false);
    expect(report.transferClearing.net).toBe(-4250);
    expect(report.transferClearing.unmatchedRows.map((r) => r.id)).toEqual(['sweep-out']);

    const checks = buildPreflightChecks(report, false);
    const check = checks.checks.find((c) => c.id === 'transfer-clearing-balance');
    expect(check?.status).toBe('fail');
    expect(checks.readyToFileTaxes).toBe(false);
  });

  it('keeps transfers off every Schedule E line', () => {
    const report = buildScheduleEReport({
      taxYear: 2026,
      transactions: REPORT_ROWS,
      properties: [],
      tenants: [{ id: TENANT_A, name: 'ARIBIA LLC', type: 'operating', metadata: null }],
    });

    // 5000 income (Line 3) and 800 expense magnitude (Line 9). The 4250
    // transfer legs contribute to no line on either side.
    expect(report.entityLevelItems.every((line) => Math.abs(line.amount) !== 4250)).toBe(true);
    expect(report.lineSummary.every((line) => Math.abs(line.amount) !== 4250)).toBe(true);
    expect(report.lineSummary.reduce((sum, line) => sum + line.amount, 0)).toBe(5800);
    expect(report.lineSummary.reduce((n, line) => n + line.transactionCount, 0)).toBe(2);
    expect(report.classificationQuality.totalTransactions).toBe(2);
  });

  it('keeps transfers out of Form 1065 income and deductions', () => {
    const reports = buildForm1065Report({
      taxYear: 2026,
      transactions: REPORT_ROWS,
      entityTenants: [{ id: TENANT_A, name: 'ARIBIA LLC', type: 'holding', metadata: null }],
    });

    expect(reports).toHaveLength(1);
    expect(reports[0].ordinaryIncome).toBe(5000);
    expect(reports[0].totalDeductions).toBe(800);
    expect(reports[0].netIncome).toBe(4200);
    expect(
      [...reports[0].incomeByCategory, ...reports[0].deductionsByCategory].every(
        (row) => Math.abs(row.amount) !== 4250,
      ),
    ).toBe(true);
  });
});
