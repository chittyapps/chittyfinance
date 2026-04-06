/**
 * Inter-company allocation engine.
 *
 * Computes automated allocations between tenants based on configurable rules:
 * - management_fee: % of revenue from source → target (e.g., MGMT charges 10% of property rent)
 * - cost_sharing: split shared expenses across tenants by %
 * - rent_passthrough: pass rent from property entity up to parent
 * - custom_pct: arbitrary % allocation of filtered transactions
 */

type NumberLike = string | number | null | undefined;

function toNum(v: NumberLike): number {
  if (v == null) return 0;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface AllocationRuleInput {
  id: string;
  name: string;
  ruleType: string; // 'management_fee' | 'cost_sharing' | 'rent_passthrough' | 'custom_pct'
  sourceTenantId: string;
  targetTenantId: string;
  percentage: NumberLike;
  fixedAmount: NumberLike;
  frequency: string;
  sourceCategory: string | null;
  allocationMethod: string; // 'percentage' | 'fixed' | 'remainder'
  metadata: unknown;
}

export interface AllocationTransaction {
  id: string;
  tenantId: string;
  amount: NumberLike;
  type: string; // 'income' | 'expense'
  category: string | null;
  date: Date | string;
}

export interface AllocationResult {
  ruleId: string;
  ruleName: string;
  ruleType: string;
  sourceTenantId: string;
  targetTenantId: string;
  sourceAmount: number;
  allocatedAmount: number;
  matchedTransactionCount: number;
  description: string;
  periodStart: string;
  periodEnd: string;
}

export interface AllocationPreview {
  results: AllocationResult[];
  totalAllocated: number;
  ruleCount: number;
  periodStart: string;
  periodEnd: string;
}

function filterTransactions(
  transactions: AllocationTransaction[],
  sourceTenantId: string,
  sourceCategory: string | null,
  ruleType: string,
): AllocationTransaction[] {
  let filtered = transactions.filter((tx) => tx.tenantId === sourceTenantId);

  if (sourceCategory) {
    const cat = sourceCategory.toLowerCase();
    filtered = filtered.filter(
      (tx) => tx.category && tx.category.toLowerCase() === cat,
    );
  }

  // Rule-type specific filtering
  switch (ruleType) {
    case 'management_fee':
    case 'rent_passthrough':
      // Only income transactions
      filtered = filtered.filter((tx) => tx.type === 'income');
      break;
    case 'cost_sharing':
      // Only expense transactions
      filtered = filtered.filter((tx) => tx.type === 'expense');
      break;
    // 'custom_pct' — no type filtering, use all matched transactions
  }

  return filtered;
}

function computeAllocation(
  rule: AllocationRuleInput,
  matchedTransactions: AllocationTransaction[],
  periodStart: string,
  periodEnd: string,
): AllocationResult {
  const sourceAmount = matchedTransactions.reduce(
    (sum, tx) => sum + Math.abs(toNum(tx.amount)),
    0,
  );

  let allocatedAmount: number;

  switch (rule.allocationMethod) {
    case 'fixed':
      allocatedAmount = toNum(rule.fixedAmount);
      break;
    case 'remainder':
      // Allocate everything not already covered by other rules (caller handles)
      allocatedAmount = sourceAmount;
      break;
    case 'percentage':
    default:
      allocatedAmount = round2(sourceAmount * toNum(rule.percentage) / 100);
      break;
  }

  const typeLabels: Record<string, string> = {
    management_fee: 'Management fee',
    cost_sharing: 'Cost sharing',
    rent_passthrough: 'Rent pass-through',
    custom_pct: 'Custom allocation',
  };

  const label = typeLabels[rule.ruleType] || 'Allocation';
  const pctStr = rule.allocationMethod === 'percentage'
    ? ` (${toNum(rule.percentage)}%)`
    : rule.allocationMethod === 'fixed'
      ? ` (fixed $${toNum(rule.fixedAmount).toFixed(2)})`
      : '';

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    ruleType: rule.ruleType,
    sourceTenantId: rule.sourceTenantId,
    targetTenantId: rule.targetTenantId,
    sourceAmount: round2(sourceAmount),
    allocatedAmount: round2(allocatedAmount),
    matchedTransactionCount: matchedTransactions.length,
    description: `${label}${pctStr} on $${round2(sourceAmount).toFixed(2)} from ${matchedTransactions.length} transactions`,
    periodStart,
    periodEnd,
  };
}

/**
 * Run all allocation rules against a set of transactions for a given period.
 */
export function runAllocations(params: {
  rules: AllocationRuleInput[];
  transactions: AllocationTransaction[];
  periodStart: string;
  periodEnd: string;
}): AllocationPreview {
  const { rules, transactions, periodStart, periodEnd } = params;
  const results: AllocationResult[] = [];

  // Filter transactions to the period
  const periodTxns = transactions.filter((tx) => {
    const d = typeof tx.date === 'string' ? tx.date : tx.date.toISOString();
    return d >= periodStart && d <= periodEnd;
  });

  for (const rule of rules) {
    const matched = filterTransactions(
      periodTxns,
      rule.sourceTenantId,
      rule.sourceCategory,
      rule.ruleType,
    );

    if (matched.length === 0 && rule.allocationMethod !== 'fixed') continue;

    const result = computeAllocation(rule, matched, periodStart, periodEnd);

    // Skip zero allocations (except fixed which may be intentional)
    if (result.allocatedAmount === 0 && rule.allocationMethod !== 'fixed') continue;

    results.push(result);
  }

  return {
    results,
    totalAllocated: round2(results.reduce((sum, r) => sum + r.allocatedAmount, 0)),
    ruleCount: results.length,
    periodStart,
    periodEnd,
  };
}

/**
 * Compute period boundaries from a frequency and reference date.
 */
export function computePeriodBounds(
  frequency: string,
  referenceDate: Date,
): { periodStart: string; periodEnd: string } {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();

  switch (frequency) {
    case 'quarterly': {
      const qStart = new Date(year, Math.floor(month / 3) * 3, 1);
      const qEnd = new Date(year, Math.floor(month / 3) * 3 + 3, 0);
      return {
        periodStart: qStart.toISOString().slice(0, 10),
        periodEnd: qEnd.toISOString().slice(0, 10),
      };
    }
    case 'annually': {
      return {
        periodStart: `${year}-01-01`,
        periodEnd: `${year}-12-31`,
      };
    }
    case 'monthly':
    default: {
      const mStart = new Date(year, month, 1);
      const mEnd = new Date(year, month + 1, 0);
      return {
        periodStart: mStart.toISOString().slice(0, 10),
        periodEnd: mEnd.toISOString().slice(0, 10),
      };
    }
  }
}

/**
 * Validate an allocation rule for logical consistency.
 */
export function validateAllocationRule(rule: Partial<AllocationRuleInput>): string[] {
  const errors: string[] = [];

  if (!rule.ruleType) {
    errors.push('ruleType is required');
  } else if (!['management_fee', 'cost_sharing', 'rent_passthrough', 'custom_pct'].includes(rule.ruleType)) {
    errors.push(`Invalid ruleType: ${rule.ruleType}`);
  }

  if (!rule.sourceTenantId) errors.push('sourceTenantId is required');
  if (!rule.targetTenantId) errors.push('targetTenantId is required');
  if (rule.sourceTenantId && rule.sourceTenantId === rule.targetTenantId) {
    errors.push('Source and target tenant cannot be the same');
  }

  if (!rule.allocationMethod) {
    errors.push('allocationMethod is required');
  } else if (!['percentage', 'fixed', 'remainder'].includes(rule.allocationMethod)) {
    errors.push(`Invalid allocationMethod: ${rule.allocationMethod}`);
  }

  if (rule.allocationMethod === 'percentage') {
    const pct = toNum(rule.percentage);
    if (pct <= 0 || pct > 100) {
      errors.push('percentage must be between 0 and 100 (exclusive of 0)');
    }
  }

  if (rule.allocationMethod === 'fixed') {
    const amt = toNum(rule.fixedAmount);
    if (amt <= 0) {
      errors.push('fixedAmount must be greater than 0');
    }
  }

  const validFreqs = ['monthly', 'quarterly', 'annually', 'per_transaction'];
  if (rule.frequency && !validFreqs.includes(rule.frequency)) {
    errors.push(`Invalid frequency: ${rule.frequency}`);
  }

  return errors;
}
