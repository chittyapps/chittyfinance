import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { taxRoutes } from '../routes/tax';
import {
  buildScheduleEReport,
  buildForm1065Report,
  buildMemberAllocations,
  buildAllocationPeriods,
  resolveScheduleELine,
  serializeScheduleECsv,
  serializeTaxPackageCsv,
  buildTaxPackage,
  type MemberOwnership,
} from '../lib/tax-reporting';
import type { ReportingTransactionRow } from '../lib/consolidated-reporting';

// ── Pure Function Tests ──

describe('resolveScheduleELine', () => {
  it('maps Rent to Line 3', () => {
    const result = resolveScheduleELine('Rent');
    expect(result.lineNumber).toBe('Line 3');
    expect(result.coaCode).toBe('4000');
  });

  it('maps Insurance to Line 9', () => {
    const result = resolveScheduleELine('Insurance');
    expect(result.lineNumber).toBe('Line 9');
    expect(result.coaCode).toBe('5040');
  });

  it('maps Repairs to Line 14', () => {
    const result = resolveScheduleELine('Repairs');
    expect(result.lineNumber).toBe('Line 14');
    expect(result.coaCode).toBe('5070');
  });

  it('maps unknown category to Line 19 (Other)', () => {
    const result = resolveScheduleELine('random_unknown_thing');
    expect(result.lineNumber).toBe('Line 19');
    expect(result.coaCode).toBe('9010');
  });

  it('uses description fallback when category is null', () => {
    const result = resolveScheduleELine(null, 'Peoples Gas payment');
    expect(result.lineNumber).toBe('Line 17');
  });
});

describe('buildScheduleEReport', () => {
  const baseTx = {
    tenantId: 't-prop1',
    tenantName: 'APT ARLENE',
    tenantType: 'property',
    tenantMetadata: {},
    reconciled: true,
    metadata: {},
    propertyState: 'IL',
  };

  const transactions: ReportingTransactionRow[] = [
    { ...baseTx, id: 'tx1', amount: '2000.00', type: 'income', category: 'Rent', date: '2024-03-15', propertyId: 'p1' } as any,
    { ...baseTx, id: 'tx2', amount: '-500.00', type: 'expense', category: 'Insurance', date: '2024-04-01', propertyId: 'p1' } as any,
    { ...baseTx, id: 'tx3', amount: '-300.00', type: 'expense', category: 'Repairs', date: '2024-05-10', propertyId: 'p1' } as any,
    { ...baseTx, id: 'tx4', amount: '-100.00', type: 'expense', category: 'HOA Dues', date: '2024-06-01', propertyId: 'p1' } as any,
  ];

  const properties = [{ id: 'p1', tenantId: 't-prop1', name: 'Villa Vista', address: '4343 N Clarendon #1610, Chicago, IL', state: 'IL' }];
  const tenants = [{ id: 't-prop1', name: 'APT ARLENE', type: 'property', metadata: {} }];

  it('groups transactions by Schedule E line per property', () => {
    const report = buildScheduleEReport({ taxYear: 2024, transactions, properties, tenants });

    expect(report.taxYear).toBe(2024);
    expect(report.properties).toHaveLength(1);

    const prop = report.properties[0];
    expect(prop.propertyName).toBe('Villa Vista');
    expect(prop.totalIncome).toBe(2000);
    expect(prop.totalExpenses).toBe(900);
    expect(prop.netIncome).toBe(1100);

    // Check line items
    const line3 = prop.lines.find(l => l.lineNumber === 'Line 3');
    expect(line3?.amount).toBe(2000);

    const line9 = prop.lines.find(l => l.lineNumber === 'Line 9');
    expect(line9?.amount).toBe(500);

    const line14 = prop.lines.find(l => l.lineNumber === 'Line 14');
    expect(line14?.amount).toBe(300);

    const line19 = prop.lines.find(l => l.lineNumber === 'Line 19');
    expect(line19?.amount).toBe(100); // HOA maps to Line 19
  });

  it('flags filing type based on tenant type', () => {
    const report = buildScheduleEReport({ taxYear: 2024, transactions, properties, tenants });
    expect(report.properties[0].filingType).toBe('schedule-e-partnership');

    // Personal property
    const personalTenants = [{ id: 't-prop1', name: 'Personal', type: 'personal', metadata: {} }];
    const personalReport = buildScheduleEReport({ taxYear: 2024, transactions, properties, tenants: personalTenants });
    expect(personalReport.properties[0].filingType).toBe('schedule-e-personal');
  });

  it('collects entity-level items when propertyId is missing', () => {
    const entityTxs: any[] = [
      { ...baseTx, id: 'tx-e1', amount: '-200.00', type: 'expense', category: 'Legal', date: '2024-07-01' },
    ];
    const report = buildScheduleEReport({ taxYear: 2024, transactions: entityTxs, properties: [], tenants });
    expect(report.entityLevelItems.length).toBeGreaterThan(0);
  });
});

describe('buildScheduleEReport — line summary', () => {
  const baseTx = {
    tenantName: 'T',
    tenantType: 'property',
    tenantMetadata: {},
    reconciled: true,
    metadata: {},
    propertyState: 'IL',
  };

  const tenants = [
    { id: 't-a', name: 'Tenant A', type: 'property', metadata: {} },
    { id: 't-b', name: 'Tenant B', type: 'property', metadata: {} },
  ];
  const properties = [
    { id: 'p-a', tenantId: 't-a', name: 'Property A', address: 'A', state: 'IL' },
    { id: 'p-b', tenantId: 't-b', name: 'Property B', address: 'B', state: 'IL' },
  ];

  it('aggregates Line 14 (Repairs + Cleaning) across multiple properties with per-COA breakdown', () => {
    // Note: per database/chart-of-accounts.ts, both 5070 (Repairs) and
    // 5020 (Cleaning & Maintenance) map to Schedule E Line 14, so they
    // should aggregate under the same summary row with a 2-entry breakdown.
    const transactions: ReportingTransactionRow[] = [
      { ...baseTx, id: 'r1', tenantId: 't-a', amount: '-150.00', type: 'expense', category: 'Repairs', date: '2024-03-01', propertyId: 'p-a' } as any,
      { ...baseTx, id: 'r2', tenantId: 't-b', amount: '-250.00', type: 'expense', category: 'Repairs', date: '2024-04-01', propertyId: 'p-b' } as any,
      { ...baseTx, id: 'r3', tenantId: 't-a', amount: '-100.00', type: 'expense', category: 'Cleaning', date: '2024-05-01', propertyId: 'p-a' } as any,
    ];

    const report = buildScheduleEReport({ taxYear: 2024, transactions, properties, tenants });

    const line14 = report.lineSummary.find((l) => l.lineNumber === 'Line 14');
    expect(line14).toBeDefined();
    expect(line14!.amount).toBe(500); // 150 + 250 + 100
    expect(line14!.transactionCount).toBe(3);
    expect(line14!.coaBreakdown).toHaveLength(2);

    // Breakdown sorted by amount descending — Repairs (400) > Cleaning (100)
    expect(line14!.coaBreakdown[0].coaCode).toBe('5070');
    expect(line14!.coaBreakdown[0].coaName).toBe('Repairs');
    expect(line14!.coaBreakdown[0].amount).toBe(400);
    expect(line14!.coaBreakdown[0].transactionCount).toBe(2);

    expect(line14!.coaBreakdown[1].coaCode).toBe('5020');
    expect(line14!.coaBreakdown[1].amount).toBe(100);
    expect(line14!.coaBreakdown[1].transactionCount).toBe(1);
  });

  it('groups multiple COA codes under the same Schedule E line (Line 17 utilities)', () => {
    const transactions: ReportingTransactionRow[] = [
      { ...baseTx, id: 'u1', tenantId: 't-a', amount: '-80.00', type: 'expense', category: 'Electric', date: '2024-03-01', propertyId: 'p-a' } as any,
      { ...baseTx, id: 'u2', tenantId: 't-a', amount: '-60.00', type: 'expense', category: 'Gas', date: '2024-04-01', propertyId: 'p-a' } as any,
      { ...baseTx, id: 'u3', tenantId: 't-b', amount: '-40.00', type: 'expense', category: 'Water', date: '2024-05-01', propertyId: 'p-b' } as any,
    ];

    const report = buildScheduleEReport({ taxYear: 2024, transactions, properties, tenants });

    const line17 = report.lineSummary.find((l) => l.lineNumber === 'Line 17');
    expect(line17).toBeDefined();
    expect(line17!.amount).toBe(180);
    expect(line17!.coaBreakdown).toHaveLength(3); // 5100 (Electric), 5110 (Gas), 5120 (Water/Sewer)
    // Breakdown sorted by amount descending — Electric (80) > Gas (60) > Water (40)
    expect(line17!.coaBreakdown[0].coaCode).toBe('5100');
    expect(line17!.coaBreakdown[0].amount).toBe(80);
    expect(line17!.coaBreakdown[1].coaCode).toBe('5110');
    expect(line17!.coaBreakdown[2].coaCode).toBe('5120');
  });

  it('preserves Schedule E line order in lineSummary', () => {
    const transactions: ReportingTransactionRow[] = [
      { ...baseTx, id: 't1', tenantId: 't-a', amount: '-100.00', type: 'expense', category: 'Insurance', date: '2024-03-01', propertyId: 'p-a' } as any,
      { ...baseTx, id: 't2', tenantId: 't-a', amount: '1000.00', type: 'income', category: 'Rent', date: '2024-03-01', propertyId: 'p-a' } as any,
      { ...baseTx, id: 't3', tenantId: 't-a', amount: '-50.00', type: 'expense', category: 'Advertising', date: '2024-03-01', propertyId: 'p-a' } as any,
    ];
    const report = buildScheduleEReport({ taxYear: 2024, transactions, properties, tenants });

    const lineNumbers = report.lineSummary.map((l) => l.lineNumber);
    const line3Idx = lineNumbers.indexOf('Line 3');
    const line5Idx = lineNumbers.indexOf('Line 5');
    const line9Idx = lineNumbers.indexOf('Line 9');

    expect(line3Idx).toBeLessThan(line5Idx); // Rent before Advertising
    expect(line5Idx).toBeLessThan(line9Idx); // Advertising before Insurance
  });
});

describe('buildScheduleEReport — classification quality', () => {
  const baseTx = {
    tenantId: 't-a',
    tenantName: 'T',
    tenantType: 'property',
    tenantMetadata: {},
    reconciled: false,
    metadata: {},
    propertyState: 'IL',
  };
  const tenants = [{ id: 't-a', name: 'Tenant A', type: 'property', metadata: {} }];
  const properties = [{ id: 'p-a', tenantId: 't-a', name: 'Prop A', address: 'A', state: 'IL' }];

  it('counts L2-classified rows separately from L1 suggestions and unclassified', () => {
    const transactions: ReportingTransactionRow[] = [
      // L2 — has coaCode set
      { ...baseTx, id: 'a', amount: '-100.00', type: 'expense', category: null, description: 'a', coaCode: '5070', date: '2024-03-01', propertyId: 'p-a' } as any,
      { ...baseTx, id: 'b', amount: '-200.00', type: 'expense', category: null, description: 'b', coaCode: '5040', date: '2024-03-02', propertyId: 'p-a' } as any,
      // L1 — only suggested_coa_code
      { ...baseTx, id: 'c', amount: '-300.00', type: 'expense', category: null, description: 'c', suggestedCoaCode: '5070', date: '2024-03-03', propertyId: 'p-a' } as any,
      // Unclassified — neither set
      { ...baseTx, id: 'd', amount: '-50.00', type: 'expense', category: null, description: 'd', date: '2024-03-04', propertyId: 'p-a' } as any,
    ];

    const report = buildScheduleEReport({ taxYear: 2024, transactions, properties, tenants });
    const q = report.classificationQuality;

    expect(q.totalTransactions).toBe(4);
    expect(q.l2ClassifiedCount).toBe(2);
    expect(q.l1SuggestedOnlyCount).toBe(1);
    expect(q.unclassifiedCount).toBe(1);
    expect(q.l1SuggestedOnlyAmount).toBe(300);
    expect(q.confirmedPct).toBe(50); // 2/4
    expect(q.readyToFile).toBe(false); // below 95% threshold
  });

  it('marks readyToFile=true when 100% L2-classified', () => {
    const transactions: ReportingTransactionRow[] = [
      { ...baseTx, id: 'a', amount: '-100.00', type: 'expense', category: null, description: 'a', coaCode: '5070', date: '2024-03-01', propertyId: 'p-a' } as any,
      { ...baseTx, id: 'b', amount: '-200.00', type: 'expense', category: null, description: 'b', coaCode: '5040', date: '2024-03-02', propertyId: 'p-a' } as any,
    ];
    const report = buildScheduleEReport({ taxYear: 2024, transactions, properties, tenants });
    const q = report.classificationQuality;

    expect(q.totalTransactions).toBe(2);
    expect(q.l2ClassifiedCount).toBe(2);
    expect(q.confirmedPct).toBe(100);
    expect(q.readyToFile).toBe(true);
  });

  it('marks readyToFile=true when there are zero contributing transactions (empty report)', () => {
    const report = buildScheduleEReport({ taxYear: 2024, transactions: [], properties, tenants });
    expect(report.classificationQuality.totalTransactions).toBe(0);
    expect(report.classificationQuality.readyToFile).toBe(true);
  });

  it('marks readyToFile=false just below the 95% threshold', () => {
    // 19 L2 + 1 L1 = 95% — should be READY (>= 95)
    const txs19: ReportingTransactionRow[] = Array.from({ length: 19 }, (_, i) => ({
      ...baseTx,
      id: `ok-${i}`,
      amount: '-10.00',
      type: 'expense',
      category: null,
      description: 'x',
      coaCode: '5070',
      date: '2024-03-01',
      propertyId: 'p-a',
    })) as any;
    const txs1: ReportingTransactionRow[] = [
      { ...baseTx, id: 'risk', amount: '-10.00', type: 'expense', category: null, description: 'x', suggestedCoaCode: '5070', date: '2024-03-01', propertyId: 'p-a' } as any,
    ];

    const report = buildScheduleEReport({
      taxYear: 2024,
      transactions: [...txs19, ...txs1],
      properties,
      tenants,
    });
    expect(report.classificationQuality.confirmedPct).toBe(95);
    expect(report.classificationQuality.readyToFile).toBe(true);

    // 18 L2 + 2 L1 = 90% → not ready
    const txs18 = txs19.slice(0, 18);
    const txs2 = [
      ...txs1,
      { ...baseTx, id: 'risk2', amount: '-10.00', type: 'expense', category: null, description: 'y', suggestedCoaCode: '5040', date: '2024-03-01', propertyId: 'p-a' } as any,
    ];
    const report2 = buildScheduleEReport({
      taxYear: 2024,
      transactions: [...txs18, ...txs2],
      properties,
      tenants,
    });
    expect(report2.classificationQuality.confirmedPct).toBe(90);
    expect(report2.classificationQuality.readyToFile).toBe(false);
  });
});

describe('buildAllocationPeriods', () => {
  it('returns single period when no date ranges', () => {
    const members: MemberOwnership[] = [
      { name: 'Nick', pct: 85 },
      { name: 'Sharon', pct: 15 },
    ];
    const periods = buildAllocationPeriods(2024, members);
    expect(periods).toHaveLength(1);
    expect(periods[0].startDate).toBe('2024-01-01');
    expect(periods[0].endDate).toBe('2024-12-31');
    expect(periods[0].members).toHaveLength(2);
  });

  it('splits periods when member exits mid-year (Luisa Oct 14 2024)', () => {
    const members: MemberOwnership[] = [
      { name: 'Nick', pct: 80 },
      { name: 'Sharon', pct: 10 },
      { name: 'Luisa', pct: 10, endDate: '2024-10-14' },
    ];
    const periods = buildAllocationPeriods(2024, members);
    expect(periods.length).toBe(2);

    // Period 1: Jan 1 - Oct 14 (all three members)
    expect(periods[0].startDate).toBe('2024-01-01');
    expect(periods[0].endDate).toBe('2024-10-14');
    expect(periods[0].members).toHaveLength(3);

    // Period 2: Oct 15 - Dec 31 (without Luisa)
    expect(periods[1].startDate).toBe('2024-10-15');
    expect(periods[1].endDate).toBe('2024-12-31');
    expect(periods[1].members).toHaveLength(2);
    expect(periods[1].members.find(m => m.name === 'Luisa')).toBeUndefined();
  });

  it('handles member joining mid-year', () => {
    const members: MemberOwnership[] = [
      { name: 'Nick', pct: 90 },
      { name: 'Sharon', pct: 10, startDate: '2024-03-15' },
    ];
    const periods = buildAllocationPeriods(2024, members);
    expect(periods.length).toBe(2);

    // Period 1: Jan 1 - Mar 14 (Nick only)
    expect(periods[0].members).toHaveLength(1);
    expect(periods[0].members[0].name).toBe('Nick');

    // Period 2: Mar 15 - Dec 31 (both)
    expect(periods[1].members).toHaveLength(2);
  });
});

describe('buildMemberAllocations', () => {
  it('allocates 100% to entity when no members defined', () => {
    const result = buildMemberAllocations(2024, 10000, []);
    expect(result).toHaveLength(1);
    expect(result[0].totalAllocated).toBe(10000);
    expect(result[0].pct).toBe(100);
  });

  it('applies static percentages correctly (85/15 split)', () => {
    const members: MemberOwnership[] = [
      { name: 'JAV', pct: 85 },
      { name: 'Sharon', pct: 15 },
    ];
    const result = buildMemberAllocations(2024, 10000, members);
    expect(result).toHaveLength(2);
    expect(result[0].totalAllocated).toBe(8500);
    expect(result[1].totalAllocated).toBe(1500);
  });

  it('applies time-weighted allocation for Luisa exit', () => {
    const members: MemberOwnership[] = [
      { name: 'Nick', pct: 80 },
      { name: 'Sharon', pct: 10 },
      { name: 'Luisa', pct: 10, endDate: '2024-10-14' },
    ];

    const result = buildMemberAllocations(2024, 36600, members);

    // Luisa should get less than 10% of annual income (only ~78% of year)
    const luisa = result.find(m => m.memberName === 'Luisa')!;
    expect(luisa.totalAllocated).toBeLessThan(3660); // < 10% of 36600
    expect(luisa.totalAllocated).toBeGreaterThan(0);
    expect(luisa.periods.length).toBe(1); // Only in first period

    // Nick should get more than 80% (picks up extra in second period)
    const nick = result.find(m => m.memberName === 'Nick')!;
    expect(nick.totalAllocated).toBeGreaterThan(29280); // > 80% of 36600
    expect(nick.periods.length).toBe(2);

    // Total allocated should equal net income
    const total = result.reduce((sum, m) => sum + m.totalAllocated, 0);
    expect(Math.abs(total - 36600)).toBeLessThan(0.02); // rounding tolerance
  });

  it('handles negative income (loss)', () => {
    const members: MemberOwnership[] = [
      { name: 'Nick', pct: 85 },
      { name: 'Sharon', pct: 15 },
    ];
    const result = buildMemberAllocations(2024, -5000, members);
    expect(result[0].totalAllocated).toBe(-4250);
    expect(result[1].totalAllocated).toBe(-750);
  });

  it('merges same-person entries into one K-1 (ARIBIA 2024 timeline)', () => {
    // Real scenario: Nick appears twice with different pcts for different date ranges
    const members: MemberOwnership[] = [
      { name: 'Nicholas Bianchi', pct: 90, endDate: '2024-03-14' },
      { name: 'Nicholas Bianchi', pct: 85, startDate: '2024-03-15', endDate: '2024-10-28' },
      { name: 'Luisa Arias', pct: 10, endDate: '2024-10-14' },
      { name: 'Sharon E Jones', pct: 5, startDate: '2024-03-15', endDate: '2024-10-28' },
      { name: 'IT CAN BE LLC', pct: 100, startDate: '2024-10-29' },
    ];

    const result = buildMemberAllocations(2024, 36600, members);

    // One K-1 per unique name (IRS requires one K-1 per SSN/EIN)
    const names = result.map(m => m.memberName);
    expect(new Set(names).size).toBe(names.length);
    expect(result.filter(m => m.memberName === 'Nicholas Bianchi')).toHaveLength(1);

    // Total must equal net income
    const total = result.reduce((sum, m) => sum + m.totalAllocated, 0);
    expect(Math.abs(total - 36600)).toBeLessThan(0.02);

    // Nick's merged K-1 should have multiple periods
    const nick = result.find(m => m.memberName === 'Nicholas Bianchi')!;
    expect(nick.periods.length).toBe(3);
  });
});

describe('buildForm1065Report', () => {
  it('generates report for partnership entities only', () => {
    const transactions: any[] = [
      { id: 'tx1', tenantId: 't-mgmt', tenantName: 'ARIBIA - MGMT', tenantType: 'management', tenantMetadata: {}, amount: '5000', type: 'income', category: 'Rent', date: '2024-06-01', reconciled: true, metadata: {}, propertyState: 'IL' },
      { id: 'tx2', tenantId: 't-mgmt', tenantName: 'ARIBIA - MGMT', tenantType: 'management', tenantMetadata: {}, amount: '-1500', type: 'expense', category: 'Repairs', date: '2024-06-15', reconciled: true, metadata: {}, propertyState: 'IL' },
      { id: 'tx3', tenantId: 't-personal', tenantName: 'Personal', tenantType: 'personal', tenantMetadata: {}, amount: '3000', type: 'income', category: 'Rent', date: '2024-06-01', reconciled: true, metadata: {}, propertyState: 'IL' },
    ];

    const tenants = [
      { id: 't-mgmt', name: 'ARIBIA - MGMT', type: 'management', metadata: { members: [{ name: 'ITCB', pct: 100 }] } },
      { id: 't-personal', name: 'Personal', type: 'personal', metadata: {} },
    ];

    const reports = buildForm1065Report({ taxYear: 2024, entityTenants: tenants, transactions });

    // Only management entity gets a 1065, not personal
    expect(reports).toHaveLength(1);
    expect(reports[0].entityName).toBe('ARIBIA - MGMT');
    expect(reports[0].ordinaryIncome).toBe(5000);
    expect(reports[0].totalDeductions).toBe(1500);
    expect(reports[0].netIncome).toBe(3500);
    expect(reports[0].memberAllocations[0].memberName).toBe('ITCB');
    expect(reports[0].memberAllocations[0].totalAllocated).toBe(3500);
  });

  it('does not double-count with Schedule E', () => {
    // Partnership entity transactions (no propertyId) should appear in Form 1065
    // but NOT in Schedule E entity-level section
    const transactions: any[] = [
      { id: 'tx1', tenantId: 't-prop', tenantName: 'City Studio', tenantType: 'property', tenantMetadata: {}, amount: '2500', type: 'income', category: 'Rent', date: '2024-06-15', reconciled: true, metadata: {}, propertyState: 'IL', propertyId: 'p1' },
      { id: 'tx2', tenantId: 't-mgmt', tenantName: 'MGMT', tenantType: 'management', tenantMetadata: {}, amount: '250', type: 'income', category: 'Management Fees', date: '2024-06-15', reconciled: true, metadata: {}, propertyState: 'IL' },
      { id: 'tx3', tenantId: 't-series', tenantName: 'ARIBIA', tenantType: 'series', tenantMetadata: {}, amount: '-500', type: 'expense', category: 'Legal', date: '2024-06-20', reconciled: true, metadata: {}, propertyState: 'IL' },
      { id: 'tx4', tenantId: 't-personal', tenantName: 'JAV', tenantType: 'personal', tenantMetadata: {}, amount: '-150', type: 'expense', category: 'Legal', date: '2024-07-01', reconciled: true, metadata: {}, propertyState: 'FL' },
    ];

    const tenants = [
      { id: 't-prop', name: 'City Studio', type: 'property', metadata: {} },
      { id: 't-mgmt', name: 'MGMT', type: 'management', metadata: { members: [{ name: 'ARIBIA', pct: 100 }] } },
      { id: 't-series', name: 'ARIBIA', type: 'series', metadata: { members: [{ name: 'ITCB', pct: 100 }] } },
      { id: 't-personal', name: 'JAV', type: 'personal', metadata: {} },
    ];

    const properties = [{ id: 'p1', tenantId: 't-prop', name: 'City Studio', address: '550 W Surf', state: 'IL' }];

    const schedE = buildScheduleEReport({ taxYear: 2024, transactions, properties, tenants });
    const form1065 = buildForm1065Report({ taxYear: 2024, entityTenants: tenants, transactions });

    const schedENet = schedE.properties.reduce((s, p) => s + p.netIncome, 0) + schedE.entityLevelTotal;
    const form1065Net = form1065.reduce((s, r) => s + r.netIncome, 0);
    const combined = schedENet + form1065Net;
    const expected = 2500 + 250 - 500 - 150; // All unique transactions

    expect(Math.abs(combined - expected)).toBeLessThan(0.01);

    // Schedule E entity-level should only have JAV's expense, not MGMT/ARIBIA
    expect(schedE.entityLevelItems.length).toBe(1);
  });

  it('warns when no members are defined', () => {
    const transactions: any[] = [
      { id: 'tx1', tenantId: 't-hold', tenantName: 'ITCB', tenantType: 'holding', tenantMetadata: {}, amount: '1000', type: 'income', category: 'Rent', date: '2024-01-15', reconciled: true, metadata: {}, propertyState: 'IL' },
    ];
    const tenants = [{ id: 't-hold', name: 'ITCB', type: 'holding', metadata: {} }];

    const reports = buildForm1065Report({ taxYear: 2024, entityTenants: tenants, transactions });
    expect(reports[0].warnings).toContain('No members defined in tenant metadata. Showing 100% to entity.');
  });
});

describe('serializeScheduleECsv', () => {
  it('produces valid CSV with BOM', () => {
    const report = buildScheduleEReport({
      taxYear: 2024,
      transactions: [
        { id: 'tx1', tenantId: 't1', tenantName: 'Test', tenantType: 'property', tenantMetadata: {}, amount: '1000', type: 'income', category: 'Rent', date: '2024-01-15', reconciled: true, metadata: {}, propertyState: 'IL', propertyId: 'p1' } as any,
      ],
      properties: [{ id: 'p1', tenantId: 't1', name: 'Test Property', address: '123 Main St', state: 'IL' }],
      tenants: [{ id: 't1', name: 'Test', type: 'property', metadata: {} }],
    });

    const csv = serializeScheduleECsv(report);
    expect(csv.startsWith('\uFEFF')).toBe(true); // BOM
    expect(csv).toContain('Schedule E Summary');
    expect(csv).toContain('Test Property');
    expect(csv).toContain('Line 3'); // Rent = Line 3
  });
});

// ── Route Integration Tests ──

const env = {
  CHITTY_AUTH_SERVICE_TOKEN: 'svc-token',
  DATABASE_URL: 'fake',
  FINANCE_KV: {} as any,
  FINANCE_R2: {} as any,
  ASSETS: {} as any,
};

function withStorage(app: Hono<HonoEnv>, storage: any) {
  app.use('*', async (c, next) => {
    c.set('tenantId', 't-root');
    c.set('storage', storage);
    await next();
  });
  return app;
}

describe('taxRoutes', () => {
  const mockStorage = {
    getTenantDescendantIds: vi.fn().mockResolvedValue(['t-root', 't-prop1']),
    getTenantsByIds: vi.fn().mockResolvedValue([
      { id: 't-root', name: 'ARIBIA LLC', type: 'series', metadata: { members: [{ name: 'ITCB', pct: 100 }] } },
      { id: 't-prop1', name: 'APT ARLENE', type: 'property', metadata: {} },
    ]),
    getTransactionsForTenantScope: vi.fn().mockResolvedValue([
      { id: 'tx1', tenantId: 't-prop1', tenantName: 'APT ARLENE', tenantType: 'property', tenantMetadata: {}, amount: '2000', type: 'income', category: 'Rent', date: '2024-06-15', reconciled: true, metadata: {}, propertyState: 'IL', propertyId: 'p1' },
    ]),
    getPropertiesForTenants: vi.fn().mockResolvedValue([
      { id: 'p1', tenantId: 't-prop1', name: 'Villa Vista', address: '4343 N Clarendon', city: 'Chicago', state: 'IL' },
    ]),
  };

  it('GET /api/reports/tax/schedule-e returns property-level report', async () => {
    const app = new Hono<HonoEnv>();
    withStorage(app, mockStorage);
    app.route('/', taxRoutes);

    const res = await app.request('/api/reports/tax/schedule-e?taxYear=2024', {}, env);
    expect(res.status).toBe(200);

    const body = await res.json() as any;
    expect(body.taxYear).toBe(2024);
    expect(body.properties).toHaveLength(1);
    expect(body.properties[0].propertyName).toBe('Villa Vista');
    expect(body.properties[0].lines.length).toBeGreaterThan(0);
  });

  it('GET /api/reports/tax/form-1065 returns partnership reports', async () => {
    const app = new Hono<HonoEnv>();
    withStorage(app, mockStorage);
    app.route('/', taxRoutes);

    const res = await app.request('/api/reports/tax/form-1065?taxYear=2024', {}, env);
    expect(res.status).toBe(200);

    const body = await res.json() as any;
    expect(Array.isArray(body)).toBe(true);
  });

  it('GET /api/reports/tax/export returns CSV', async () => {
    const app = new Hono<HonoEnv>();
    withStorage(app, mockStorage);
    app.route('/', taxRoutes);

    const res = await app.request('/api/reports/tax/export?taxYear=2024&format=csv', {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('tax-package-2024.csv');
  });

  it('rejects invalid tax year', async () => {
    const app = new Hono<HonoEnv>();
    withStorage(app, mockStorage);
    app.route('/', taxRoutes);

    const res = await app.request('/api/reports/tax/schedule-e?taxYear=abc', {}, env);
    expect(res.status).toBe(400);
  });
});
