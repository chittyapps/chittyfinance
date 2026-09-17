import { describe, it, expect } from 'vitest';
import {
  buildConsolidatedReport,
  type ReportingTransactionRow,
} from '../lib/consolidated-reporting';

/**
 * The consolidated P&L is gated on the ACCOUNT. Clearing (1900-1920), control and
 * suspense (9000-9040) and capitalized improvements (7000-7040) are not income or
 * expense, and letting them through inflates the headline totals and the deductible
 * split that the tax estimate is built on.
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

const run = (transactions: ReportingTransactionRow[]) =>
  buildConsolidatedReport({
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    tenantIds: ['e-1'],
    transactions,
    accounts: [],
    options: { includeDescendants: false, includeIntercompany: false, strictReadiness: false },
    internalIntercompanyEliminated: 0,
  });

describe('buildConsolidatedReport — non-P&L accounts', () => {
  it('excludes clearing, suspense and capital improvement codes from the totals', () => {
    const report = run([
      { ...baseTx, id: 'i1', amount: '4000.00', type: 'income', coaCode: '4000' } as any,
      { ...baseTx, id: 'e1', amount: '-600.00', type: 'expense', coaCode: '5070' } as any,
      { ...baseTx, id: 'x1', amount: '-4250.00', type: 'expense', coaCode: '1900' } as any,
      { ...baseTx, id: 'x2', amount: '-9000.00', type: 'expense', coaCode: '9010' } as any,
      { ...baseTx, id: 'x3', amount: '-7000.00', type: 'expense', coaCode: '7020' } as any,
    ]);

    expect(report.totals.income).toBe(4000);
    expect(report.totals.expenses).toBe(600);
    expect(report.totals.deductibleExpenses).toBe(600);
    expect(report.quality.nonPLExcludedTransactions).toBe(3);
    // Every row is still counted, so the exclusion is visible rather than silent.
    expect(report.quality.totalTransactions).toBe(5);
  });

  it('leaves rows carrying no coa_code alone', () => {
    // 48% of the production table has no authoritative code. Gating those out would
    // erase half of every historical report without anything being reclassified.
    const report = run([
      { ...baseTx, id: 'u1', amount: '-250.00', type: 'expense' } as any,
      { ...baseTx, id: 'u2', amount: '1000.00', type: 'income' } as any,
    ]);

    expect(report.quality.nonPLExcludedTransactions).toBe(0);
    expect(report.totals.expenses).toBe(250);
    expect(report.totals.income).toBe(1000);
  });

  it('excludes a code that is not in the chart at all', () => {
    // 3200 never existed yet reached 1,199 live rows. A code the chart does not
    // define cannot be asserted to belong on an income or expense line, so it is
    // held out and counted rather than quietly deducted.
    const report = run([
      { ...baseTx, id: 'g1', amount: '-100.00', type: 'expense', coaCode: '3200' } as any,
    ]);
    expect(report.quality.nonPLExcludedTransactions).toBe(1);
    expect(report.totals.expenses).toBe(0);
  });
});
