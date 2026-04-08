/**
 * Tax reporting engine for ChittyFinance.
 * Pure functions — no DB calls, no side effects.
 *
 * Produces Schedule E (per-property) and Form 1065 (partnership)
 * reports from transaction data, with time-weighted K-1 member allocations.
 */

import {
  findAccountCode,
  getScheduleELine,
  getAccountByCode,
  type AccountDefinition,
} from '../../database/chart-of-accounts';
import type { ReportingTransactionRow } from './consolidated-reporting';

// ── IRS Schedule E line labels ──

const SCHEDULE_E_LINES: Record<string, string> = {
  'Line 3': 'Rents received',
  'Line 5': 'Advertising',
  'Line 6': 'Auto and travel',
  'Line 7': 'Cleaning and maintenance',
  'Line 8': 'Commissions',
  'Line 9': 'Insurance',
  'Line 10': 'Legal and professional fees',
  'Line 11': 'Management fees',
  'Line 12': 'Mortgage interest paid',
  'Line 13': 'Other interest',
  'Line 14': 'Repairs',
  'Line 15': 'Supplies',
  'Line 16': 'Taxes',
  'Line 17': 'Utilities',
  'Line 18': 'Depreciation expense',
  'Line 19': 'Other',
};

// Ordered for output
const SCHEDULE_E_LINE_ORDER = [
  'Line 3', 'Line 5', 'Line 6', 'Line 7', 'Line 8', 'Line 9',
  'Line 10', 'Line 11', 'Line 12', 'Line 13', 'Line 14', 'Line 15',
  'Line 16', 'Line 17', 'Line 18', 'Line 19',
];

// ── K-1 line references (Form 1065 Schedule K) ──

const K1_LINES: Record<string, string> = {
  ordinary_income: 'Line 1 - Ordinary business income (loss)',
  rental_income: 'Line 2 - Net rental real estate income (loss)',
  guaranteed_payments: 'Line 4c - Guaranteed payments - other',
  interest_income: 'Line 5 - Interest income',
  section_179: 'Line 11 - Section 179 deduction',
  other_deductions: 'Line 13d - Other deductions',
};

// ── Types ──

export interface MemberOwnership {
  name: string;
  pct: number; // 0-100
  ein?: string;
  startDate?: string; // ISO date — for time-weighted allocation
  endDate?: string; // ISO date — for time-weighted allocation
}

export interface AllocationPeriod {
  startDate: string; // ISO YYYY-MM-DD
  endDate: string; // ISO YYYY-MM-DD
  members: MemberOwnership[];
  dayCount: number;
}

export interface ScheduleELineItem {
  lineNumber: string;
  lineLabel: string;
  amount: number;
  transactionCount: number;
}

export interface ScheduleEPropertyColumn {
  propertyId: string;
  propertyName: string;
  address: string;
  state: string;
  filingType: 'schedule-e-personal' | 'schedule-e-partnership';
  tenantId: string;
  tenantName: string;
  lines: ScheduleELineItem[];
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
}

export interface ScheduleEReport {
  taxYear: number;
  properties: ScheduleEPropertyColumn[];
  entityLevelItems: ScheduleELineItem[];
  entityLevelTotal: number;
  uncategorizedAmount: number;
  uncategorizedCount: number;
  unmappedCategories: string[];
}

export interface K1MemberAllocation {
  memberName: string;
  pct: number; // effective annual percentage (time-weighted)
  ordinaryIncome: number;
  rentalIncome: number;
  guaranteedPayments: number;
  otherDeductions: number;
  totalAllocated: number;
  periods: Array<{
    startDate: string;
    endDate: string;
    pct: number;
    dayCount: number;
    allocatedIncome: number;
  }>;
}

export interface Form1065Report {
  taxYear: number;
  entityId: string;
  entityName: string;
  entityType: string;
  ordinaryIncome: number;
  totalDeductions: number;
  netIncome: number;
  incomeByCategory: Array<{ category: string; coaCode: string; amount: number }>;
  deductionsByCategory: Array<{ category: string; coaCode: string; amount: number; scheduleELine?: string }>;
  memberAllocations: K1MemberAllocation[];
  warnings: string[];
}

export interface TaxPackage {
  taxYear: number;
  generatedAt: string;
  scheduleE: ScheduleEReport;
  form1065: Form1065Report[];
  summary: {
    totalIncome: number;
    totalExpenses: number;
    totalNet: number;
    entityCount: number;
    propertyCount: number;
    transactionCount: number;
  };
}

export interface PropertyInfo {
  id: string;
  tenantId: string;
  name: string;
  address: string;
  state: string;
}

export interface TenantInfo {
  id: string;
  name: string;
  type: string;
  metadata: unknown;
}

// ── Helpers ──

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function amount(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1);
}

/**
 * Resolve a transaction's free-text category to a Schedule E line.
 * Returns the line number string ('Line 3', etc.) and the COA code.
 * If preClassifiedCoaCode is provided (from transaction.coa_code), uses it directly
 * instead of running fuzzy match — this is the trust-path governed classification.
 */
export function resolveScheduleELine(
  category: string | null,
  description?: string,
  preClassifiedCoaCode?: string | null,
): { lineNumber: string; lineLabel: string; coaCode: string } {
  const coaCode = preClassifiedCoaCode || findAccountCode(description || '', category || undefined);
  const scheduleLine = getScheduleELine(coaCode);
  const lineNumber = scheduleLine || 'Line 19';
  const lineLabel = SCHEDULE_E_LINES[lineNumber] || 'Other';
  return { lineNumber, lineLabel, coaCode };
}

// ── Schedule E Report Builder ──

export function buildScheduleEReport(params: {
  taxYear: number;
  transactions: ReportingTransactionRow[];
  properties: PropertyInfo[];
  tenants: TenantInfo[];
}): ScheduleEReport {
  const { taxYear, transactions, properties, tenants } = params;

  // Build lookup maps
  const propertyMap = new Map(properties.map((p) => [p.id, p]));
  const tenantMap = new Map(tenants.map((t) => [t.id, t]));
  const tenantTypeMap = new Map(tenants.map((t) => [t.id, t.type]));

  // Per-property line accumulators
  const propertyLines = new Map<string, Map<string, { amount: number; count: number }>>();
  // Entity-level (no propertyId) line accumulators
  const entityLines = new Map<string, { amount: number; count: number }>();

  let uncategorizedAmount = 0;
  let uncategorizedCount = 0;
  const unmappedSet = new Set<string>();

  // Partnership entity types are reported on Form 1065, not Schedule E entity-level.
  // Only property-attributed transactions and non-partnership entity-level items belong here.
  const partnershipTypes = new Set(['holding', 'series', 'management']);

  for (const tx of transactions) {
    const rawAmount = amount(tx.amount);
    const absAmount = Math.abs(rawAmount);
    const { lineNumber, coaCode } = resolveScheduleELine(tx.category, tx.description, tx.coaCode);

    // Track unmapped categories (hit suspense 9010)
    if (coaCode === '9010' && tx.category) {
      unmappedSet.add(tx.category);
      uncategorizedAmount += absAmount;
      uncategorizedCount += 1;
    }

    const propId = (tx as any).propertyId as string | null;

    if (propId && propertyMap.has(propId)) {
      // Property-attributed transaction → Schedule E property column
      if (!propertyLines.has(propId)) {
        propertyLines.set(propId, new Map());
      }
      const lines = propertyLines.get(propId)!;
      const key = tx.type === 'income' ? 'Line 3' : lineNumber;
      const existing = lines.get(key) || { amount: 0, count: 0 };
      existing.amount += tx.type === 'income' ? rawAmount : absAmount;
      existing.count += 1;
      lines.set(key, existing);
    } else {
      // No property attribution — only include in Schedule E entity-level
      // if the transaction's tenant is NOT a partnership type (those go to Form 1065)
      const txTenantType = tenantTypeMap.get(tx.tenantId) || '';
      if (partnershipTypes.has(txTenantType)) {
        continue; // Skip — will be reported on Form 1065 instead
      }
      const key = tx.type === 'income' ? 'Line 3' : lineNumber;
      const existing = entityLines.get(key) || { amount: 0, count: 0 };
      existing.amount += tx.type === 'income' ? rawAmount : absAmount;
      existing.count += 1;
      entityLines.set(key, existing);
    }
  }

  // Build property columns
  const propertyColumns: ScheduleEPropertyColumn[] = [];

  for (const prop of properties) {
    const lines = propertyLines.get(prop.id);
    if (!lines) continue; // No transactions for this property

    const tenantType = tenantTypeMap.get(prop.tenantId) || 'unknown';
    const tenant = tenantMap.get(prop.tenantId);
    const filingType: 'schedule-e-personal' | 'schedule-e-partnership' =
      tenantType === 'personal' ? 'schedule-e-personal' : 'schedule-e-partnership';

    const lineItems: ScheduleELineItem[] = [];
    let totalIncome = 0;
    let totalExpenses = 0;

    for (const lineNum of SCHEDULE_E_LINE_ORDER) {
      const data = lines.get(lineNum);
      if (!data) continue;

      lineItems.push({
        lineNumber: lineNum,
        lineLabel: SCHEDULE_E_LINES[lineNum] || 'Other',
        amount: round2(data.amount),
        transactionCount: data.count,
      });

      if (lineNum === 'Line 3') {
        totalIncome += data.amount;
      } else {
        totalExpenses += data.amount;
      }
    }

    propertyColumns.push({
      propertyId: prop.id,
      propertyName: prop.name,
      address: prop.address || '',
      state: prop.state || 'UNASSIGNED',
      filingType,
      tenantId: prop.tenantId,
      tenantName: tenant?.name || '',
      lines: lineItems,
      totalIncome: round2(totalIncome),
      totalExpenses: round2(totalExpenses),
      netIncome: round2(totalIncome - totalExpenses),
    });
  }

  // Sort by net income descending
  propertyColumns.sort((a, b) => b.netIncome - a.netIncome);

  // Build entity-level items
  const entityLevelItems: ScheduleELineItem[] = [];
  let entityLevelTotal = 0;

  for (const lineNum of SCHEDULE_E_LINE_ORDER) {
    const data = entityLines.get(lineNum);
    if (!data) continue;
    entityLevelItems.push({
      lineNumber: lineNum,
      lineLabel: SCHEDULE_E_LINES[lineNum] || 'Other',
      amount: round2(data.amount),
      transactionCount: data.count,
    });
    if (lineNum === 'Line 3') {
      entityLevelTotal += data.amount;
    } else {
      entityLevelTotal -= data.amount;
    }
  }

  return {
    taxYear,
    properties: propertyColumns,
    entityLevelItems,
    entityLevelTotal: round2(entityLevelTotal),
    uncategorizedAmount: round2(uncategorizedAmount),
    uncategorizedCount,
    unmappedCategories: Array.from(unmappedSet).sort(),
  };
}

// ── Time-Weighted Member Allocation ──

/**
 * Build allocation periods from member ownership data.
 * Members have optional startDate/endDate to support mid-year changes
 * (e.g., Luisa Arias exits Oct 14, 2024).
 */
export function buildAllocationPeriods(
  taxYear: number,
  members: MemberOwnership[],
): AllocationPeriod[] {
  const yearStart = `${taxYear}-01-01`;
  const yearEnd = `${taxYear}-12-31`;
  const totalDays = daysBetween(yearStart, yearEnd);

  // Collect all boundary dates
  const boundaries = new Set<string>([yearStart]);

  for (const m of members) {
    if (m.startDate && m.startDate > yearStart && m.startDate <= yearEnd) {
      boundaries.add(m.startDate);
    }
    if (m.endDate && m.endDate >= yearStart && m.endDate < yearEnd) {
      // Period ends the day after endDate — next period starts endDate + 1
      const nextDay = new Date(m.endDate + 'T00:00:00Z');
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const nextDayStr = nextDay.toISOString().slice(0, 10);
      if (nextDayStr <= yearEnd) {
        boundaries.add(nextDayStr);
      }
    }
  }

  const sortedDates = Array.from(boundaries).sort();
  const periods: AllocationPeriod[] = [];

  for (let i = 0; i < sortedDates.length; i++) {
    const periodStart = sortedDates[i];
    const periodEnd = i + 1 < sortedDates.length
      ? (() => {
          const d = new Date(sortedDates[i + 1] + 'T00:00:00Z');
          d.setUTCDate(d.getUTCDate() - 1);
          return d.toISOString().slice(0, 10);
        })()
      : yearEnd;

    // Which members are active during this period?
    const activeMembers = members.filter((m) => {
      const mStart = m.startDate || yearStart;
      const mEnd = m.endDate || yearEnd;
      return mStart <= periodEnd && mEnd >= periodStart;
    });

    if (activeMembers.length === 0) continue;

    periods.push({
      startDate: periodStart,
      endDate: periodEnd,
      members: activeMembers,
      dayCount: daysBetween(periodStart, periodEnd),
    });
  }

  return periods;
}

/**
 * Compute time-weighted K-1 allocations for each member.
 */
export function buildMemberAllocations(
  taxYear: number,
  netIncome: number,
  members: MemberOwnership[],
): K1MemberAllocation[] {
  // If no members defined, return 100% to entity
  if (members.length === 0) {
    return [{
      memberName: '(Entity - no members defined)',
      pct: 100,
      ordinaryIncome: round2(netIncome),
      rentalIncome: 0,
      guaranteedPayments: 0,
      otherDeductions: 0,
      totalAllocated: round2(netIncome),
      periods: [],
    }];
  }

  // Deduplicate members by name — the same person may appear multiple times
  // with different percentages for different date ranges (e.g., Nick at 90%
  // until Mar 14, then 85% from Mar 15). IRS expects one K-1 per SSN/EIN.
  const uniqueNames = Array.from(new Set(members.map((m) => m.name)));

  // Check if any member has date ranges (time-weighted mode)
  const hasDateRanges = members.some((m) => m.startDate || m.endDate);

  if (!hasDateRanges) {
    // Simple static allocation — deduplicate by summing percentages
    const merged = new Map<string, number>();
    for (const m of members) {
      merged.set(m.name, (merged.get(m.name) || 0) + m.pct);
    }
    const totalPct = Array.from(merged.values()).reduce((sum, p) => sum + p, 0);
    return Array.from(merged.entries()).map(([name, pct]) => {
      const effectivePct = totalPct > 0 ? (pct / totalPct) * 100 : 0;
      const allocated = round2(netIncome * effectivePct / 100);
      return {
        memberName: name,
        pct: round2(effectivePct),
        ordinaryIncome: allocated,
        rentalIncome: 0,
        guaranteedPayments: 0,
        otherDeductions: 0,
        totalAllocated: allocated,
        periods: [],
      };
    });
  }

  // Time-weighted allocation
  const periods = buildAllocationPeriods(taxYear, members);
  const yearStart = `${taxYear}-01-01`;
  const yearEnd = `${taxYear}-12-31`;
  const totalDays = daysBetween(yearStart, yearEnd);

  // Per-member accumulator — keyed by unique name (one K-1 per person)
  const memberTotals = new Map<string, {
    allocatedIncome: number;
    weightedPct: number;
    periods: K1MemberAllocation['periods'];
  }>();

  for (const name of uniqueNames) {
    memberTotals.set(name, { allocatedIncome: 0, weightedPct: 0, periods: [] });
  }

  for (const period of periods) {
    const periodFraction = period.dayCount / totalDays;
    const periodIncome = netIncome * periodFraction;
    const periodTotalPct = period.members.reduce((sum, m) => sum + m.pct, 0);

    for (const m of period.members) {
      const memberShare = periodTotalPct > 0 ? (m.pct / periodTotalPct) : 0;
      const allocated = periodIncome * memberShare;
      const entry = memberTotals.get(m.name)!;
      entry.allocatedIncome += allocated;
      entry.weightedPct += (m.pct / (periodTotalPct || 1)) * 100 * periodFraction;
      entry.periods.push({
        startDate: period.startDate,
        endDate: period.endDate,
        pct: round2(m.pct),
        dayCount: period.dayCount,
        allocatedIncome: round2(allocated),
      });
    }
  }

  // Emit one K-1 per unique member name
  return uniqueNames.map((name) => {
    const entry = memberTotals.get(name)!;
    return {
      memberName: name,
      pct: round2(entry.weightedPct),
      ordinaryIncome: round2(entry.allocatedIncome),
      rentalIncome: 0,
      guaranteedPayments: 0,
      otherDeductions: 0,
      totalAllocated: round2(entry.allocatedIncome),
      periods: entry.periods,
    };
  });
}

// ── Form 1065 Report Builder ──

export function buildForm1065Report(params: {
  taxYear: number;
  entityTenants: TenantInfo[];
  transactions: ReportingTransactionRow[];
}): Form1065Report[] {
  const { taxYear, entityTenants, transactions } = params;

  // Only partnership-type entities get 1065s
  const partnershipTypes = new Set(['holding', 'series', 'management']);
  const partnershipEntities = entityTenants.filter((t) => partnershipTypes.has(t.type));

  const reports: Form1065Report[] = [];

  for (const entity of partnershipEntities) {
    const entityTxs = transactions.filter((tx) => tx.tenantId === entity.id);
    if (entityTxs.length === 0) continue;

    const incomeMap = new Map<string, { amount: number; coaCode: string }>();
    const deductionMap = new Map<string, { amount: number; coaCode: string; scheduleELine?: string }>();
    const warnings: string[] = [];

    let totalIncome = 0;
    let totalDeductions = 0;

    for (const tx of entityTxs) {
      const rawAmount = amount(tx.amount);
      const absAmount = Math.abs(rawAmount);
      const { coaCode, lineNumber } = resolveScheduleELine(tx.category, tx.description, tx.coaCode);
      const acctDef = getAccountByCode(coaCode);
      const label = acctDef?.name || tx.category || 'Uncategorized';

      if (tx.type === 'income') {
        const existing = incomeMap.get(label) || { amount: 0, coaCode };
        existing.amount += rawAmount;
        incomeMap.set(label, existing);
        totalIncome += rawAmount;
      } else if (tx.type === 'expense') {
        const existing = deductionMap.get(label) || { amount: 0, coaCode, scheduleELine: lineNumber };
        existing.amount += absAmount;
        deductionMap.set(label, existing);
        totalDeductions += absAmount;
      }
    }

    const netIncome = totalIncome - totalDeductions;

    // Extract member ownership from tenant metadata
    // Check for year-specific members first (e.g. members_2024), then fall back to members
    const meta = asObject(entity.metadata);
    const yearKey = `members_${taxYear}`;
    const rawMembers = Array.isArray(meta[yearKey])
      ? meta[yearKey] as any[]
      : Array.isArray(meta.members) ? meta.members : [];
    const members: MemberOwnership[] = rawMembers.map((m: any) => ({
      name: String(m.name || 'Unknown'),
      pct: typeof m.pct === 'number' ? m.pct : 0,
      ein: typeof m.ein === 'string' ? m.ein : undefined,
      startDate: typeof m.startDate === 'string' ? m.startDate : undefined,
      endDate: typeof m.endDate === 'string' ? m.endDate : undefined,
    }));

    // Validate member percentages
    if (members.length > 0) {
      // Check if any members have date ranges
      const hasDateRanges = members.some((m) => m.startDate || m.endDate);
      if (!hasDateRanges) {
        const totalPct = members.reduce((sum, m) => sum + m.pct, 0);
        if (Math.abs(totalPct - 100) > 0.01) {
          warnings.push(`Member percentages sum to ${totalPct}%, expected 100%. Allocations will be proportional.`);
        }
      }
    } else {
      warnings.push('No members defined in tenant metadata. Showing 100% to entity.');
    }

    const memberAllocations = buildMemberAllocations(taxYear, netIncome, members);

    reports.push({
      taxYear,
      entityId: entity.id,
      entityName: entity.name,
      entityType: entity.type,
      ordinaryIncome: round2(totalIncome),
      totalDeductions: round2(totalDeductions),
      netIncome: round2(netIncome),
      incomeByCategory: Array.from(incomeMap.entries())
        .map(([category, data]) => ({ category, coaCode: data.coaCode, amount: round2(data.amount) }))
        .sort((a, b) => b.amount - a.amount),
      deductionsByCategory: Array.from(deductionMap.entries())
        .map(([category, data]) => ({
          category,
          coaCode: data.coaCode,
          amount: round2(data.amount),
          scheduleELine: data.scheduleELine,
        }))
        .sort((a, b) => b.amount - a.amount),
      memberAllocations,
      warnings,
    });
  }

  // Sort by net income descending
  reports.sort((a, b) => b.netIncome - a.netIncome);
  return reports;
}

// ── Tax Package Builder ──

export function buildTaxPackage(params: {
  taxYear: number;
  scheduleE: ScheduleEReport;
  form1065: Form1065Report[];
  transactionCount: number;
}): TaxPackage {
  const totalIncome = params.scheduleE.properties.reduce((s, p) => s + p.totalIncome, 0)
    + params.form1065.reduce((s, r) => s + r.ordinaryIncome, 0);
  const totalExpenses = params.scheduleE.properties.reduce((s, p) => s + p.totalExpenses, 0)
    + params.form1065.reduce((s, r) => s + r.totalDeductions, 0);

  return {
    taxYear: params.taxYear,
    generatedAt: new Date().toISOString(),
    scheduleE: params.scheduleE,
    form1065: params.form1065,
    summary: {
      totalIncome: round2(totalIncome),
      totalExpenses: round2(totalExpenses),
      totalNet: round2(totalIncome - totalExpenses),
      entityCount: params.form1065.length,
      propertyCount: params.scheduleE.properties.length,
      transactionCount: params.transactionCount,
    },
  };
}

// ── CSV Serializers ──

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

export function serializeScheduleECsv(report: ScheduleEReport): string {
  const rows: string[] = [];

  // Header
  rows.push(`Schedule E Summary — Tax Year ${report.taxYear}`);
  rows.push('');

  // Column headers: Line | Label | Property1 | Property2 | ... | Total
  const propNames = report.properties.map((p) => p.propertyName);
  rows.push(['Line', 'Description', ...propNames, 'Total'].map(csvEscape).join(','));

  // Build a matrix: line -> property -> amount
  for (const lineNum of SCHEDULE_E_LINE_ORDER) {
    const label = SCHEDULE_E_LINES[lineNum] || 'Other';
    const amounts = report.properties.map((prop) => {
      const item = prop.lines.find((l) => l.lineNumber === lineNum);
      return item ? item.amount : 0;
    });
    const total = amounts.reduce((s, a) => s + a, 0);

    // Only include lines that have data
    if (total === 0 && amounts.every((a) => a === 0)) continue;

    rows.push([lineNum, label, ...amounts.map((a) => a.toFixed(2)), total.toFixed(2)].map(String).map(csvEscape).join(','));
  }

  // Totals row
  rows.push('');
  rows.push(['', 'Total Income', ...report.properties.map((p) => p.totalIncome.toFixed(2)),
    report.properties.reduce((s, p) => s + p.totalIncome, 0).toFixed(2)].map(csvEscape).join(','));
  rows.push(['', 'Total Expenses', ...report.properties.map((p) => p.totalExpenses.toFixed(2)),
    report.properties.reduce((s, p) => s + p.totalExpenses, 0).toFixed(2)].map(csvEscape).join(','));
  rows.push(['', 'Net Income', ...report.properties.map((p) => p.netIncome.toFixed(2)),
    report.properties.reduce((s, p) => s + p.netIncome, 0).toFixed(2)].map(csvEscape).join(','));

  // Filing type per property
  rows.push('');
  rows.push(['', 'Filing Type', ...report.properties.map((p) => p.filingType)].map(csvEscape).join(','));
  rows.push(['', 'State', ...report.properties.map((p) => p.state)].map(csvEscape).join(','));

  // Entity-level items
  if (report.entityLevelItems.length > 0) {
    rows.push('');
    rows.push('Entity-Level Items (no property attribution)');
    rows.push(['Line', 'Description', 'Amount'].join(','));
    for (const item of report.entityLevelItems) {
      rows.push([item.lineNumber, item.lineLabel, item.amount.toFixed(2)].map(csvEscape).join(','));
    }
  }

  // Warnings
  if (report.uncategorizedCount > 0) {
    rows.push('');
    rows.push(`WARNING: ${report.uncategorizedCount} transactions ($${report.uncategorizedAmount.toFixed(2)}) unmapped to Schedule E lines`);
    if (report.unmappedCategories.length > 0) {
      rows.push(`Unmapped categories: ${report.unmappedCategories.join(', ')}`);
    }
  }

  return '\uFEFF' + rows.join('\r\n');
}

export function serializeForm1065Csv(reports: Form1065Report[]): string {
  const rows: string[] = [];

  for (const report of reports) {
    rows.push(`Form 1065 — ${report.entityName} — Tax Year ${report.taxYear}`);
    rows.push('');

    // Income section
    rows.push('INCOME');
    rows.push(['Category', 'COA Code', 'Amount'].join(','));
    for (const item of report.incomeByCategory) {
      rows.push([item.category, item.coaCode, item.amount.toFixed(2)].map(csvEscape).join(','));
    }
    rows.push(['Total Income', '', report.ordinaryIncome.toFixed(2)].join(','));

    rows.push('');

    // Deductions section
    rows.push('DEDUCTIONS');
    rows.push(['Category', 'COA Code', 'Sched E Line', 'Amount'].join(','));
    for (const item of report.deductionsByCategory) {
      rows.push([item.category, item.coaCode, item.scheduleELine || '', item.amount.toFixed(2)].map(csvEscape).join(','));
    }
    rows.push(['Total Deductions', '', '', report.totalDeductions.toFixed(2)].join(','));

    rows.push('');
    rows.push(['NET INCOME', '', '', report.netIncome.toFixed(2)].join(','));

    // K-1 allocations
    rows.push('');
    rows.push('K-1 MEMBER ALLOCATIONS');
    rows.push(['Member', 'Effective %', 'Ordinary Income', 'Periods'].join(','));
    for (const member of report.memberAllocations) {
      const periodDesc = member.periods.length > 0
        ? member.periods.map((p) => `${p.startDate} to ${p.endDate} (${p.pct}%)`).join('; ')
        : 'Full year';
      rows.push([member.memberName, member.pct.toFixed(2) + '%', member.totalAllocated.toFixed(2), periodDesc].map(csvEscape).join(','));
    }

    // Warnings
    if (report.warnings.length > 0) {
      rows.push('');
      for (const w of report.warnings) {
        rows.push(`WARNING: ${w}`);
      }
    }

    rows.push('');
    rows.push('---');
    rows.push('');
  }

  return '\uFEFF' + rows.join('\r\n');
}

export function serializeTaxPackageCsv(pkg: TaxPackage): string {
  const header = [
    `ChittyFinance Tax Package — Tax Year ${pkg.taxYear}`,
    `Generated: ${pkg.generatedAt}`,
    `Entities: ${pkg.summary.entityCount} | Properties: ${pkg.summary.propertyCount} | Transactions: ${pkg.summary.transactionCount}`,
    `Total Income: $${pkg.summary.totalIncome.toFixed(2)} | Total Expenses: $${pkg.summary.totalExpenses.toFixed(2)} | Net: $${pkg.summary.totalNet.toFixed(2)}`,
    '',
    '═══════════════════════════════════════════════════',
    'SECTION 1: SCHEDULE E (Per-Property Income & Expenses)',
    '═══════════════════════════════════════════════════',
    '',
  ].join('\r\n');

  const scheduleE = serializeScheduleECsv(pkg.scheduleE);
  const form1065Section = [
    '',
    '═══════════════════════════════════════════════════',
    'SECTION 2: FORM 1065 (Partnership Returns & K-1 Allocations)',
    '═══════════════════════════════════════════════════',
    '',
  ].join('\r\n');

  const form1065 = serializeForm1065Csv(pkg.form1065);

  // Strip BOM from sub-sections since we add it once at the top
  return '\uFEFF' + header + scheduleE.replace('\uFEFF', '') + form1065Section + form1065.replace('\uFEFF', '');
}

/**
 * Strip EIN/sensitive fields from member data for client-side display.
 */
export function sanitizeMembersForClient(allocations: K1MemberAllocation[]): K1MemberAllocation[] {
  return allocations.map((a) => ({ ...a }));
}

export function sanitizeForm1065ForClient(reports: Form1065Report[]): Form1065Report[] {
  return reports.map((r) => ({
    ...r,
    memberAllocations: sanitizeMembersForClient(r.memberAllocations),
  }));
}
