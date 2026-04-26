import { describe, it, expect, vi, beforeEach } from 'vitest';

// All vi.mock calls are hoisted to the top by Vitest's transformer
vi.mock('../storage', () => ({
  storage: {
    getTransactions: vi.fn(),
    getAccounts: vi.fn(),
    listIntegrationsByService: vi.fn(),
    getProperties: vi.fn(),
    createTransaction: vi.fn(),
  },
}));

vi.mock('../lib/chittychronicle-logging', () => ({
  logToChronicle: vi.fn().mockResolvedValue(undefined),
}));

const mockReconcileAccount = vi.fn().mockResolvedValue({ matched: 0, unmatched: 0 });
vi.mock('../lib/reconciliation', () => ({
  reconcileAccount: mockReconcileAccount,
}));

vi.mock('../lib/ml-categorization', () => ({
  categorizeTransaction: vi.fn().mockResolvedValue({ category: 'other', confidence: 0.5 }),
}));

vi.mock('../lib/wave-bookkeeping', () => ({
  WaveBookkeepingClient: vi.fn().mockImplementation(() => ({
    setAccessToken: vi.fn(),
    syncToChittyFinance: vi.fn().mockResolvedValue({ invoices: 0, expenses: 0 }),
  })),
}));

vi.mock('../lib/chittyrental-integration', () => ({
  ChittyRentalClient: vi.fn().mockImplementation(() => ({
    syncProperty: vi.fn().mockResolvedValue({ rentPayments: 0, expenses: 0, errors: [] }),
  })),
}));

vi.mock('../lib/stripe-connect', () => ({
  StripeConnectClient: vi.fn().mockImplementation(() => ({
    syncAllConnectedAccounts: vi.fn().mockResolvedValue({ totalSynced: 0, accounts: 0 }),
  })),
}));

vi.mock('../lib/doorloop-integration', () => ({
  DoorLoopClient: vi.fn().mockImplementation(() => ({
    getProperties: vi.fn().mockResolvedValue([]),
    syncProperty: vi.fn().mockResolvedValue({ rentPayments: 0, expenses: 0 }),
  })),
}));

import { storage } from '../storage';
import {
  runMonthlyClose,
  runQuarterlyTaxPrep,
  runYearEndClose,
  runWeeklyReconciliation,
  runDailyBookkeeping,
  WorkflowScheduler,
} from '../lib/bookkeeping-workflows';

const mockedStorage = storage as {
  getTransactions: ReturnType<typeof vi.fn>;
  getAccounts: ReturnType<typeof vi.fn>;
  listIntegrationsByService: ReturnType<typeof vi.fn>;
  getProperties: ReturnType<typeof vi.fn>;
  createTransaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedStorage.getTransactions.mockResolvedValue([]);
  mockedStorage.getAccounts.mockResolvedValue([]);
  mockedStorage.listIntegrationsByService.mockResolvedValue([]);
  mockedStorage.getProperties.mockResolvedValue([]);
  mockedStorage.createTransaction.mockResolvedValue({});
});

// ─── runMonthlyClose ─────────────────────────────────────────────────────────

describe('runMonthlyClose', () => {
  it('returns zero profit/loss when there are no transactions', async () => {
    const result = await runMonthlyClose('tenant-1', 1, 2024);
    expect(result.profitLoss.revenue).toBe(0);
    expect(result.profitLoss.expenses).toBe(0);
    expect(result.profitLoss.netIncome).toBe(0);
  });

  it('calculates revenue from income transactions within the month', async () => {
    mockedStorage.getTransactions.mockResolvedValue([
      { id: 't1', type: 'income', amount: '1000.00', date: new Date('2024-03-15'), category: 'consulting' },
      { id: 't2', type: 'income', amount: '500.00', date: new Date('2024-03-20'), category: 'services' },
      // Outside month — should not be included
      { id: 't3', type: 'income', amount: '999.00', date: new Date('2024-04-01'), category: 'consulting' },
    ]);
    const result = await runMonthlyClose('tenant-1', 3, 2024);
    expect(result.profitLoss.revenue).toBeCloseTo(1500, 2);
  });

  it('calculates expenses from expense transactions within the month', async () => {
    mockedStorage.getTransactions.mockResolvedValue([
      { id: 't1', type: 'expense', amount: '-200.00', date: new Date('2024-03-10'), category: 'office' },
      { id: 't2', type: 'expense', amount: '-300.00', date: new Date('2024-03-25'), category: 'software' },
    ]);
    const result = await runMonthlyClose('tenant-1', 3, 2024);
    expect(result.profitLoss.expenses).toBeCloseTo(500, 2);
  });

  it('computes netIncome = revenue - expenses', async () => {
    mockedStorage.getTransactions.mockResolvedValue([
      { id: 't1', type: 'income', amount: '3000.00', date: new Date('2024-06-15'), category: 'rent' },
      { id: 't2', type: 'expense', amount: '-1000.00', date: new Date('2024-06-10'), category: 'maintenance' },
    ]);
    const result = await runMonthlyClose('tenant-1', 6, 2024);
    expect(result.profitLoss.netIncome).toBeCloseTo(2000, 2);
  });

  it('excludes transactions outside the target month', async () => {
    mockedStorage.getTransactions.mockResolvedValue([
      { id: 't1', type: 'income', amount: '5000.00', date: new Date('2024-02-28'), category: 'sales' }, // Feb
      { id: 't2', type: 'income', amount: '1000.00', date: new Date('2024-04-01'), category: 'sales' }, // Apr
    ]);
    const result = await runMonthlyClose('tenant-1', 3, 2024); // March
    expect(result.profitLoss.revenue).toBe(0);
  });

  it('calculates balance sheet equity = assets - liabilities', async () => {
    mockedStorage.getAccounts.mockResolvedValue([
      { id: 'a1', name: 'Checking', type: 'checking', balance: '10000.00' },
      { id: 'a2', name: 'Savings', type: 'savings', balance: '5000.00' },
      { id: 'a3', name: 'Credit Card', type: 'credit', balance: '2000.00' },
    ]);
    const result = await runMonthlyClose('tenant-1', 1, 2024);
    expect(result.balanceSheet.assets).toBeCloseTo(15000, 2);
    expect(result.balanceSheet.liabilities).toBeCloseTo(2000, 2);
    expect(result.balanceSheet.equity).toBeCloseTo(13000, 2);
  });

  it('returns zero balance sheet values when no accounts', async () => {
    mockedStorage.getAccounts.mockResolvedValue([]);
    const result = await runMonthlyClose('tenant-1', 5, 2024);
    expect(result.balanceSheet.assets).toBe(0);
    expect(result.balanceSheet.liabilities).toBe(0);
    expect(result.balanceSheet.equity).toBe(0);
  });

  it('tax summary deductions exclude personal expense category', async () => {
    mockedStorage.getTransactions.mockResolvedValue([
      { id: 't1', type: 'expense', amount: '-500.00', date: new Date('2024-07-10'), category: 'office' },
      { id: 't2', type: 'expense', amount: '-200.00', date: new Date('2024-07-15'), category: 'personal' }, // excluded
    ]);
    const result = await runMonthlyClose('tenant-1', 7, 2024);
    // Only non-personal expense should be in deductions
    expect(result.taxSummary.deductions).toBeCloseTo(500, 2);
  });

  it('tax summary income excludes non_taxable category', async () => {
    mockedStorage.getTransactions.mockResolvedValue([
      { id: 't1', type: 'income', amount: '1000.00', date: new Date('2024-08-10'), category: 'consulting' },
      { id: 't2', type: 'income', amount: '500.00', date: new Date('2024-08-15'), category: 'non_taxable_grant' },
    ]);
    const result = await runMonthlyClose('tenant-1', 8, 2024);
    // non_taxable_grant contains 'non_taxable', excluded from taxable income
    expect(result.taxSummary.income).toBeCloseTo(1000, 2);
  });

  it('handles investment account type as assets', async () => {
    mockedStorage.getAccounts.mockResolvedValue([
      { id: 'a1', name: 'Investment', type: 'investment', balance: '20000.00' },
    ]);
    const result = await runMonthlyClose('tenant-1', 1, 2024);
    expect(result.balanceSheet.assets).toBeCloseTo(20000, 2);
  });
});

// ─── runQuarterlyTaxPrep ──────────────────────────────────────────────────────

describe('runQuarterlyTaxPrep', () => {
  it('returns zeros when no transactions', async () => {
    const result = await runQuarterlyTaxPrep('tenant-1', 1, 2024);
    expect(result.income).toBe(0);
    expect(result.expenses).toBe(0);
    expect(result.netIncome).toBe(0);
    expect(result.estimatedTax).toBe(0);
    expect(result.deductions).toHaveLength(0);
  });

  it('Q1 covers January through March', async () => {
    mockedStorage.getTransactions.mockResolvedValue([
      { id: 't1', type: 'income', amount: '3000.00', date: new Date('2024-01-15'), category: 'sales' },
      { id: 't2', type: 'income', amount: '2000.00', date: new Date('2024-03-31'), category: 'sales' },
      { id: 't3', type: 'income', amount: '999.00', date: new Date('2024-04-01'), category: 'sales' }, // Q2
    ]);
    const result = await runQuarterlyTaxPrep('tenant-1', 1, 2024);
    expect(result.income).toBeCloseTo(5000, 2);
  });

  it('Q2 covers April through June', async () => {
    mockedStorage.getTransactions.mockResolvedValue([
      { id: 't1', type: 'income', amount: '1200.00', date: new Date('2024-04-01'), category: 'sales' },
      { id: 't2', type: 'income', amount: '800.00', date: new Date('2024-06-30'), category: 'sales' },
      { id: 't3', type: 'income', amount: '500.00', date: new Date('2024-07-01'), category: 'sales' }, // Q3
    ]);
    const result = await runQuarterlyTaxPrep('tenant-1', 2, 2024);
    expect(result.income).toBeCloseTo(2000, 2);
  });

  it('Q3 covers July through September', async () => {
    mockedStorage.getTransactions.mockResolvedValue([
      { id: 't1', type: 'income', amount: '4000.00', date: new Date('2024-09-30'), category: 'sales' },
    ]);
    const result = await runQuarterlyTaxPrep('tenant-1', 3, 2024);
    expect(result.income).toBeCloseTo(4000, 2);
  });

  it('Q4 covers October through December', async () => {
    mockedStorage.getTransactions.mockResolvedValue([
      { id: 't1', type: 'income', amount: '6000.00', date: new Date('2024-12-31'), category: 'sales' },
      { id: 't2', type: 'income', amount: '1000.00', date: new Date('2024-09-30'), category: 'sales' }, // Q3
    ]);
    const result = await runQuarterlyTaxPrep('tenant-1', 4, 2024);
    expect(result.income).toBeCloseTo(6000, 2);
  });

  it('calculates estimatedTax at 25% of net income', async () => {
    mockedStorage.getTransactions.mockResolvedValue([
      { id: 't1', type: 'income', amount: '8000.00', date: new Date('2024-01-15'), category: 'sales' },
      { id: 't2', type: 'expense', amount: '-3000.00', date: new Date('2024-02-10'), category: 'office' },
    ]);
    const result = await runQuarterlyTaxPrep('tenant-1', 1, 2024);
    expect(result.netIncome).toBeCloseTo(5000, 2);
    expect(result.estimatedTax).toBeCloseTo(1250, 2); // 5000 * 0.25
  });

  it('estimatedTax is zero when netIncome is negative', async () => {
    mockedStorage.getTransactions.mockResolvedValue([
      { id: 't1', type: 'expense', amount: '-5000.00', date: new Date('2024-01-10'), category: 'office' },
    ]);
    const result = await runQuarterlyTaxPrep('tenant-1', 1, 2024);
    expect(result.netIncome).toBeLessThan(0);
    expect(result.estimatedTax).toBe(0);
  });

  it('groups deductions by expense category', async () => {
    mockedStorage.getTransactions.mockResolvedValue([
      { id: 't1', type: 'expense', amount: '-300.00', date: new Date('2024-01-10'), category: 'office' },
      { id: 't2', type: 'expense', amount: '-200.00', date: new Date('2024-02-10'), category: 'office' },
      { id: 't3', type: 'expense', amount: '-500.00', date: new Date('2024-03-10'), category: 'software' },
    ]);
    const result = await runQuarterlyTaxPrep('tenant-1', 1, 2024);
    const officeDeduction = result.deductions.find(d => d.category === 'office');
    const softwareDeduction = result.deductions.find(d => d.category === 'software');
    expect(officeDeduction?.amount).toBeCloseTo(500, 2);
    expect(softwareDeduction?.amount).toBeCloseTo(500, 2);
  });
});

// ─── runYearEndClose ──────────────────────────────────────────────────────────

describe('runYearEndClose', () => {
  it('returns zeros when no transactions', async () => {
    const result = await runYearEndClose('tenant-1', 2024);
    expect(result.annual.revenue).toBe(0);
    expect(result.annual.expenses).toBe(0);
    expect(result.annual.netIncome).toBe(0);
    expect(result.metrics.profitMargin).toBe(0);
  });

  it('calculates annual revenue and expenses correctly', async () => {
    mockedStorage.getTransactions.mockResolvedValue([
      { id: 't1', type: 'income', amount: '12000.00', date: new Date('2024-06-15'), category: 'sales' },
      { id: 't2', type: 'expense', amount: '-4000.00', date: new Date('2024-09-20'), category: 'office' },
    ]);
    const result = await runYearEndClose('tenant-1', 2024);
    expect(result.annual.revenue).toBeCloseTo(12000, 2);
    expect(result.annual.expenses).toBeCloseTo(4000, 2);
    expect(result.annual.netIncome).toBeCloseTo(8000, 2);
  });

  it('excludes transactions from other years', async () => {
    mockedStorage.getTransactions.mockResolvedValue([
      { id: 't1', type: 'income', amount: '5000.00', date: new Date('2023-12-31'), category: 'sales' },
      { id: 't2', type: 'income', amount: '3000.00', date: new Date('2025-01-01'), category: 'sales' },
    ]);
    const result = await runYearEndClose('tenant-1', 2024);
    expect(result.annual.revenue).toBe(0);
  });

  it('calculates avgMonthlyRevenue = revenue / 12', async () => {
    mockedStorage.getTransactions.mockResolvedValue([
      { id: 't1', type: 'income', amount: '24000.00', date: new Date('2024-06-01'), category: 'sales' },
    ]);
    const result = await runYearEndClose('tenant-1', 2024);
    expect(result.metrics.avgMonthlyRevenue).toBeCloseTo(2000, 2); // 24000 / 12
  });

  it('calculates avgMonthlyExpenses = expenses / 12', async () => {
    mockedStorage.getTransactions.mockResolvedValue([
      { id: 't1', type: 'expense', amount: '-6000.00', date: new Date('2024-03-01'), category: 'office' },
    ]);
    const result = await runYearEndClose('tenant-1', 2024);
    expect(result.metrics.avgMonthlyExpenses).toBeCloseTo(500, 2); // 6000 / 12
  });

  it('calculates profitMargin = (netIncome / revenue) * 100', async () => {
    mockedStorage.getTransactions.mockResolvedValue([
      { id: 't1', type: 'income', amount: '10000.00', date: new Date('2024-05-01'), category: 'sales' },
      { id: 't2', type: 'expense', amount: '-3000.00', date: new Date('2024-05-15'), category: 'office' },
    ]);
    const result = await runYearEndClose('tenant-1', 2024);
    // netIncome = 7000, revenue = 10000, margin = 70%
    expect(result.metrics.profitMargin).toBeCloseTo(70, 1);
  });

  it('profitMargin is zero when revenue is zero', async () => {
    const result = await runYearEndClose('tenant-1', 2024);
    expect(result.metrics.profitMargin).toBe(0);
  });

  it('calculates estimatedTax as 25% of (taxableIncome - deductions)', async () => {
    mockedStorage.getTransactions.mockResolvedValue([
      { id: 't1', type: 'income', amount: '20000.00', date: new Date('2024-06-01'), category: 'sales' },
      { id: 't2', type: 'expense', amount: '-8000.00', date: new Date('2024-06-15'), category: 'office' },
    ]);
    const result = await runYearEndClose('tenant-1', 2024);
    // taxableIncome=20000, deductions=8000, taxable=12000, estimatedTax=3000
    expect(result.tax.estimatedTax).toBeCloseTo(3000, 2);
  });

  it('estimatedTax is zero when expenses exceed revenue', async () => {
    mockedStorage.getTransactions.mockResolvedValue([
      { id: 't1', type: 'income', amount: '1000.00', date: new Date('2024-01-01'), category: 'sales' },
      { id: 't2', type: 'expense', amount: '-5000.00', date: new Date('2024-01-15'), category: 'office' },
    ]);
    const result = await runYearEndClose('tenant-1', 2024);
    expect(result.tax.estimatedTax).toBe(0);
  });
});

// ─── runWeeklyReconciliation ──────────────────────────────────────────────────

describe('runWeeklyReconciliation', () => {
  it('returns zeros when no accounts', async () => {
    mockedStorage.getAccounts.mockResolvedValue(null);
    const result = await runWeeklyReconciliation('tenant-1');
    expect(result.accounts).toBe(0);
    expect(result.reconciled).toBe(0);
    expect(result.discrepancies).toBe(0);
  });

  it('returns zeros when accounts list is empty', async () => {
    mockedStorage.getAccounts.mockResolvedValue([]);
    const result = await runWeeklyReconciliation('tenant-1');
    expect(result.accounts).toBe(0);
  });

  it('counts accounts processed', async () => {
    mockReconcileAccount.mockResolvedValue({ matched: 5, unmatched: 1 });

    mockedStorage.getAccounts.mockResolvedValue([
      { id: 'a1', name: 'Checking', type: 'checking', balance: '10000.00' },
      { id: 'a2', name: 'Savings', type: 'savings', balance: '5000.00' },
    ]);
    const result = await runWeeklyReconciliation('tenant-1');
    expect(result.accounts).toBe(2);
  });

  it('accumulates reconciled and discrepancy counts across accounts', async () => {
    mockReconcileAccount.mockResolvedValue({ matched: 3, unmatched: 2 });

    mockedStorage.getAccounts.mockResolvedValue([
      { id: 'a1', name: 'Checking', type: 'checking', balance: '1000.00' },
      { id: 'a2', name: 'Credit', type: 'credit', balance: '500.00' },
    ]);
    const result = await runWeeklyReconciliation('tenant-1');
    expect(result.reconciled).toBe(6); // 3 + 3
    expect(result.discrepancies).toBe(4); // 2 + 2
  });
});

// ─── WorkflowScheduler ───────────────────────────────────────────────────────

describe('WorkflowScheduler', () => {
  it('registers a workflow and runDue skips disabled workflows', async () => {
    const scheduler = new WorkflowScheduler();
    scheduler.register({
      id: 'wf-1',
      name: 'Disabled Daily',
      type: 'daily',
      tenantId: 'tenant-1',
      enabled: false,
      config: {},
    });

    // Should not throw even when storage has no integrations
    mockedStorage.getTransactions.mockResolvedValue([]);
    mockedStorage.listIntegrationsByService.mockResolvedValue([]);
    await expect(scheduler.runDue()).resolves.toBeUndefined();
  });

  it('skips workflows whose nextRun is in the future', async () => {
    const scheduler = new WorkflowScheduler();
    const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    scheduler.register({
      id: 'wf-2',
      name: 'Future Workflow',
      type: 'daily',
      tenantId: 'tenant-1',
      enabled: true,
      nextRun: futureDate,
      config: {},
    });

    // runDue should not trigger the workflow since nextRun > now
    await expect(scheduler.runDue()).resolves.toBeUndefined();
    // getTransactions should not be called since workflow was skipped
    expect(mockedStorage.listIntegrationsByService).not.toHaveBeenCalled();
  });

  it('allows multiple workflow registrations', () => {
    const scheduler = new WorkflowScheduler();
    scheduler.register({ id: 'w1', name: 'W1', type: 'daily', tenantId: 't1', enabled: false, config: {} });
    scheduler.register({ id: 'w2', name: 'W2', type: 'weekly', tenantId: 't2', enabled: false, config: {} });
    // No error = registration successful
  });

  it('overwrites existing registration when same id is used', () => {
    const scheduler = new WorkflowScheduler();
    scheduler.register({ id: 'w1', name: 'Old Name', type: 'daily', tenantId: 't1', enabled: false, config: {} });
    scheduler.register({ id: 'w1', name: 'New Name', type: 'weekly', tenantId: 't1', enabled: false, config: {} });
    // Should not throw — second registration replaces first
  });

  it('sets nextRun on successful daily workflow execution', async () => {
    const scheduler = new WorkflowScheduler();
    const workflow = {
      id: 'wf-daily',
      name: 'Daily Bookkeeping',
      type: 'daily' as const,
      tenantId: 'tenant-1',
      enabled: true,
      nextRun: undefined,
      lastRun: undefined,
      config: {},
    };

    mockedStorage.listIntegrationsByService.mockResolvedValue([]);
    mockedStorage.getTransactions.mockResolvedValue([]);
    mockedStorage.getProperties.mockResolvedValue(null);

    scheduler.register(workflow);
    await scheduler.runDue();

    // After running, lastRun and nextRun should be set
    expect(workflow.lastRun).toBeDefined();
    expect(workflow.nextRun).toBeDefined();
    // nextRun should be ~24 hours in the future
    const diffMs = (workflow.nextRun as Date).getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(diffMs).toBeLessThan(25 * 60 * 60 * 1000);
  });
});

// ─── runDailyBookkeeping ─────────────────────────────────────────────────────

describe('runDailyBookkeeping', () => {
  it('returns synced counts and categorized count', async () => {
    mockedStorage.listIntegrationsByService.mockResolvedValue([]);
    mockedStorage.getTransactions.mockResolvedValue([]);
    mockedStorage.getProperties.mockResolvedValue(null);

    const result = await runDailyBookkeeping('tenant-1');
    expect(result.synced).toBeDefined();
    expect(result.synced.wave).toBeGreaterThanOrEqual(0);
    expect(result.synced.rental).toBeGreaterThanOrEqual(0);
    expect(result.synced.doorloop).toBeGreaterThanOrEqual(0);
    expect(result.synced.stripe).toBeGreaterThanOrEqual(0);
    expect(result.categorized).toBeGreaterThanOrEqual(0);
    expect(result.anomalies).toBeGreaterThanOrEqual(0);
  });

  it('skips Wave sync when no Wave integrations', async () => {
    mockedStorage.listIntegrationsByService.mockResolvedValue([]);
    mockedStorage.getTransactions.mockResolvedValue([]);
    mockedStorage.getProperties.mockResolvedValue(null);

    const result = await runDailyBookkeeping('tenant-1');
    expect(result.synced.wave).toBe(0);
  });
});