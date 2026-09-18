import { describe, it, expect } from 'vitest';
import {
  buildConsolidatedReport,
  type ReportingTransactionRow,
} from '../lib/consolidated-reporting';
import { buildScheduleEReport, buildForm1065Report } from '../lib/tax-reporting';

/**
 * Two independent exclusions guard every report total, and BOTH must hold at once.
 *
 *   Gate 1 — TYPE.    `type = 'transfer'` is a hop between two accounts the group
 *                     controls (docs/CHART-OF-ACCOUNTS.md §5/§6 step 4). Added by
 *                     PR #160.
 *   Gate 2 — ACCOUNT. A clearing, control/suspense or capitalized-improvement code
 *                     reaches no P&L or return line (§6). Added by PR #157.
 *
 * They are orthogonal: a transfer can carry a P&L account code, and an income-typed
 * row can carry a control code. Each fixture below is built so that losing EITHER
 * gate changes a number — the rebase of #160 onto #157 merged both into the same
 * loops, and a conflict resolution that quietly kept only one would otherwise let
 * suspense or transfers back onto a tax line.
 *
 * The third row in each fixture is a negative control: an ordinary income row on a
 * real P&L account. It must still land. Without it these tests would also pass if
 * the loop were broken outright and every row dropped.
 */

const baseTx = {
  tenantId: 'e-1',
  tenantName: 'ARIBIA LLC',
  tenantType: 'holding',
  tenantMetadata: {},
  category: 'rent',
  description: '',
  date: '2024-06-01',
  reconciled: true,
  metadata: {},
  propertyState: 'IL',
};

/** Transfer on a P&L code — only the TYPE gate catches this one. */
const transferOnPLAccount = { ...baseTx, id: 'g1', amount: '5000.00', type: 'transfer', coaCode: '4000' } as any;
/** Income on a control code — only the ACCOUNT gate catches this one. */
const incomeOnControlAccount = { ...baseTx, id: 'g2', amount: '900.00', type: 'income', coaCode: '9010' } as any;
/** Negative control — must survive both gates. */
const ordinaryIncome = { ...baseTx, id: 'g3', amount: '3000.00', type: 'income', coaCode: '4000' } as any;

describe('report gates — transfer type AND non-P&L account, simultaneously', () => {
  it('buildConsolidatedReport applies both, and still counts ordinary income', () => {
    const report = buildConsolidatedReport({
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      tenantIds: ['e-1'],
      transactions: [transferOnPLAccount, incomeOnControlAccount, ordinaryIncome] as ReportingTransactionRow[],
      accounts: [],
      options: { includeDescendants: false, includeIntercompany: false, strictReadiness: false },
      internalIntercompanyEliminated: 0,
    });

    // Losing the TYPE gate makes this 8000; losing the ACCOUNT gate makes it 3900;
    // losing both makes it 8900. Only both-present gives 3000.
    expect(report.totals.income).toBe(3000);
    expect(report.quality.transfersExcluded).toBe(1);
    expect(report.quality.nonPLExcludedTransactions).toBe(1);
    // Both exclusions are reported, never silent.
    expect(report.quality.totalTransactions).toBe(3);
  });

  it('buildScheduleEReport applies both, and still files the ordinary income on Line 3', () => {
    const report = buildScheduleEReport({
      taxYear: 2024,
      transactions: [transferOnPLAccount, incomeOnControlAccount, ordinaryIncome] as ReportingTransactionRow[],
      properties: [{ id: 'p1', tenantId: 'e-1', name: 'Villa Vista', address: '4343 N Clarendon #1610, Chicago, IL', state: 'IL' }],
      tenants: [{ id: 'e-1', name: 'ARIBIA LLC', type: 'property', metadata: {} }],
    });

    const line3 = report.lineSummary.find((l) => l.lineNumber === 'Line 3');
    expect(line3?.amount).toBe(3000);
    expect(line3?.transactionCount).toBe(1);

    // The transfer never reaches the form at all — the TYPE gate drops it before
    // the account is consulted, so it is not counted as a non-P&L exclusion either.
    expect(report.lineSummary.some((l) => l.amount === 8000)).toBe(false);

    // The control-coded row is excluded by the ACCOUNT gate and reported as such,
    // rather than falling through to nonRentalItems or the 'Line 19' Other fallback.
    expect(report.excludedNonPLCount).toBe(1);
    expect(report.excludedNonPLAmount).toBe(900);
    expect(report.nonRentalItems).toHaveLength(0);
    expect(report.lineSummary.some((l) => l.lineNumber === 'Line 19')).toBe(false);
  });

  it('buildForm1065Report applies both to the partnership return', () => {
    // NOTE on what this actually proves. At Form 1065 the TYPE gate has exactly ONE
    // observable consequence, and it is the `entityId` assertion below — not the
    // amounts. A transfer matches neither the `income` nor the `expense` branch of
    // the accumulation loop, so removing `!isTransferType` leaves ordinaryIncome,
    // netIncome and incomeByCategory unchanged. What it does change is the
    // `entityTxs.length === 0` skip: a partnership whose only activity is a
    // transfer survives it and emits an empty, zeroed 1065 for an entity that had
    // no reportable activity. That is a real defect — a return filed for a
    // partnership that owes none — but it is the only mutation this site detects,
    // and the amount assertions below are carried by the ACCOUNT gate alone.
    const transferOnlyEntity = {
      ...baseTx, id: 'g4', tenantId: 'e-2', amount: '2500.00', type: 'transfer', coaCode: '1900',
    } as any;

    const reports = buildForm1065Report({
      taxYear: 2024,
      transactions: [
        transferOnPLAccount, incomeOnControlAccount, ordinaryIncome, transferOnlyEntity,
      ] as ReportingTransactionRow[],
      entityTenants: [
        { id: 'e-1', name: 'ARIBIA LLC', type: 'holding', metadata: {} },
        { id: 'e-2', name: 'ARIBIA Clearing', type: 'holding', metadata: {} },
      ] as any,
    });

    // The sole TYPE-gate mutation detector at this site.
    expect(reports.map((r) => r.entityId)).toEqual(['e-1']);

    const [report] = reports;
    // netIncome feeds every member's K-1 allocation, so a lost gate here is not a
    // reporting cosmetic — it is a wrong distributive share.
    // Losing the ACCOUNT gate makes ordinaryIncome 3900.
    expect(report.ordinaryIncome).toBe(3000);
    expect(report.netIncome).toBe(3000);
    expect(report.incomeByCategory.map((i) => i.coaCode)).toEqual(['4000']);
  });
});
