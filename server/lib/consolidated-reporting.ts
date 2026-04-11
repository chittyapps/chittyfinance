type NumberLike = string | number | null | undefined;

const NON_DEDUCTIBLE_EXPENSE_CATEGORIES = new Set([
  'personal',
  'owner_draw',
  'owner_distribution',
  'distribution',
  'income_tax',
  'federal_tax',
  'state_tax',
  'estimated_tax',
  'penalty',
  'fine',
]);

const LIABILITY_ACCOUNT_TYPES = new Set(['credit', 'mortgage', 'loan', 'tax_liability']);

export interface ReportingTransactionRow {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantType: string;
  tenantMetadata: unknown;
  amount: string;
  type: string;
  category: string | null;
  description?: string;
  coaCode?: string | null; // pre-classified COA code (preferred over fuzzy match)
  suggestedCoaCode?: string | null; // L1 suggestion — used only to count classification quality, never as authoritative
  date: Date | string;
  reconciled: boolean;
  metadata: unknown;
  propertyState: string | null;
}

export interface ReportingAccountRow {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantType: string;
  type: string;
  balance: string;
  currency: string;
}

export interface TaxRateConfig {
  federalTaxRate?: number;
  defaultStateTaxRate?: number;
  stateTaxRates?: Record<string, number>;
}

export interface ConsolidatedReportOptions extends TaxRateConfig {
  includeDescendants: boolean;
  includeIntercompany: boolean;
  strictReadiness: boolean;
  stateFilter?: string[];
  entityTypes?: string[];
}

export interface ReportQuality {
  totalTransactions: number;
  uncategorizedTransactions: number;
  unreconciledTransactions: number;
  unassignedStateTransactions: number;
  futureDatedTransactions: number;
  internalIntercompanyEliminated: number;
}

export interface PreflightCheck {
  id: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  metric: number;
  threshold?: string;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function amount(value: NumberLike): number {
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

function normalizeState(raw: unknown): string {
  if (!raw || typeof raw !== 'string') return 'UNASSIGNED';
  const clean = raw.trim().toUpperCase();
  return clean || 'UNASSIGNED';
}

export function detectTransactionState(tx: ReportingTransactionRow): string {
  if (tx.propertyState) return normalizeState(tx.propertyState);

  const txMetadata = asObject(tx.metadata);
  if (typeof txMetadata.state === 'string') {
    return normalizeState(txMetadata.state);
  }

  const tenantMetadata = asObject(tx.tenantMetadata);
  if (typeof tenantMetadata.state === 'string') {
    return normalizeState(tenantMetadata.state);
  }

  return 'UNASSIGNED';
}

function isUncategorized(category: string | null): boolean {
  if (!category) return true;
  const normalized = category.trim().toLowerCase();
  return normalized === '' || normalized === 'uncategorized' || normalized === 'other_expense' || normalized === 'other_income';
}

function isDeductibleExpense(category: string | null, metadata: unknown): boolean {
  const meta = asObject(metadata);
  if (typeof meta.deductible === 'boolean') return meta.deductible;
  if (typeof meta.nonDeductible === 'boolean') return !meta.nonDeductible;

  const normalizedCategory = (category || '').trim().toLowerCase();
  if (!normalizedCategory) return true;
  return !NON_DEDUCTIBLE_EXPENSE_CATEGORIES.has(normalizedCategory);
}

function parseDate(input: Date | string): Date | null {
  const parsed = input instanceof Date ? input : new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function stateRateFor(state: string, config: TaxRateConfig): number | null {
  const mapRate = config.stateTaxRates?.[state];
  if (typeof mapRate === 'number' && Number.isFinite(mapRate)) return mapRate;
  if (typeof config.defaultStateTaxRate === 'number' && Number.isFinite(config.defaultStateTaxRate)) {
    return config.defaultStateTaxRate;
  }
  return null;
}

export function parseStateTaxRates(raw: string | undefined): Record<string, number> | undefined {
  if (!raw) return undefined;
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('stateTaxRates must be a JSON object like {"IL":0.0495}');
  }
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`stateTaxRates.${key} must be a finite number`);
    }
    out[normalizeState(key)] = value;
  }
  return out;
}

export function buildConsolidatedReport(params: {
  startDate: string;
  endDate: string;
  tenantIds: string[];
  transactions: ReportingTransactionRow[];
  accounts: ReportingAccountRow[];
  options: ConsolidatedReportOptions;
  internalIntercompanyEliminated: number;
}) {
  const quality: ReportQuality = {
    totalTransactions: 0,
    uncategorizedTransactions: 0,
    unreconciledTransactions: 0,
    unassignedStateTransactions: 0,
    futureDatedTransactions: 0,
    internalIntercompanyEliminated: params.internalIntercompanyEliminated,
  };

  const entityMap = new Map<string, any>();
  const stateMap = new Map<string, any>();

  let totalIncome = 0;
  let totalExpenses = 0;
  let totalDeductibleExpenses = 0;
  let totalNonDeductibleExpenses = 0;

  const now = Date.now();

  for (const tx of params.transactions) {
    quality.totalTransactions += 1;

    const txDate = parseDate(tx.date);
    if (!txDate || txDate.getTime() > now) quality.futureDatedTransactions += 1;
    if (!tx.reconciled) quality.unreconciledTransactions += 1;
    if (isUncategorized(tx.category)) quality.uncategorizedTransactions += 1;

    const state = detectTransactionState(tx);
    if (state === 'UNASSIGNED') quality.unassignedStateTransactions += 1;

    const rawAmount = amount(tx.amount);
    const absAmount = Math.abs(rawAmount);

    if (!entityMap.has(tx.tenantId)) {
      entityMap.set(tx.tenantId, {
        tenantId: tx.tenantId,
        tenantName: tx.tenantName,
        tenantType: tx.tenantType,
        income: 0,
        expenses: 0,
        deductibleExpenses: 0,
        nonDeductibleExpenses: 0,
        netIncome: 0,
        taxableIncome: 0,
        estimatedFederalTax: null as number | null,
        estimatedStateTax: null as number | null,
        estimatedTotalTax: null as number | null,
        transactionCount: 0,
        unreconciledTransactions: 0,
        byState: new Map<string, any>(),
        assets: 0,
        liabilities: 0,
        equity: 0,
      });
    }

    if (!stateMap.has(state)) {
      stateMap.set(state, {
        state,
        income: 0,
        expenses: 0,
        deductibleExpenses: 0,
        nonDeductibleExpenses: 0,
        taxableIncome: 0,
        netIncome: 0,
        estimatedStateTax: null as number | null,
      });
    }

    const entity = entityMap.get(tx.tenantId);
    const stateTotals = stateMap.get(state);

    if (!entity.byState.has(state)) {
      entity.byState.set(state, {
        state,
        income: 0,
        expenses: 0,
        deductibleExpenses: 0,
        nonDeductibleExpenses: 0,
        taxableIncome: 0,
        netIncome: 0,
        estimatedStateTax: null as number | null,
      });
    }

    const entityState = entity.byState.get(state);
    entity.transactionCount += 1;
    if (!tx.reconciled) entity.unreconciledTransactions += 1;

    if (tx.type === 'income') {
      entity.income += rawAmount;
      stateTotals.income += rawAmount;
      entityState.income += rawAmount;
      totalIncome += rawAmount;
    } else if (tx.type === 'expense') {
      const deductible = isDeductibleExpense(tx.category, tx.metadata);

      entity.expenses += absAmount;
      stateTotals.expenses += absAmount;
      entityState.expenses += absAmount;
      totalExpenses += absAmount;

      if (deductible) {
        entity.deductibleExpenses += absAmount;
        stateTotals.deductibleExpenses += absAmount;
        entityState.deductibleExpenses += absAmount;
        totalDeductibleExpenses += absAmount;
      } else {
        entity.nonDeductibleExpenses += absAmount;
        stateTotals.nonDeductibleExpenses += absAmount;
        entityState.nonDeductibleExpenses += absAmount;
        totalNonDeductibleExpenses += absAmount;
      }
    }
  }

  for (const account of params.accounts) {
    if (!entityMap.has(account.tenantId)) {
      entityMap.set(account.tenantId, {
        tenantId: account.tenantId,
        tenantName: account.tenantName,
        tenantType: account.tenantType,
        income: 0,
        expenses: 0,
        deductibleExpenses: 0,
        nonDeductibleExpenses: 0,
        netIncome: 0,
        taxableIncome: 0,
        estimatedFederalTax: null as number | null,
        estimatedStateTax: null as number | null,
        estimatedTotalTax: null as number | null,
        transactionCount: 0,
        unreconciledTransactions: 0,
        byState: new Map<string, any>(),
        assets: 0,
        liabilities: 0,
        equity: 0,
      });
    }

    const row = entityMap.get(account.tenantId);

    const bal = amount(account.balance);
    if (LIABILITY_ACCOUNT_TYPES.has(account.type)) {
      row.liabilities += Math.abs(bal);
    } else {
      row.assets += bal;
    }
    row.equity = row.assets - row.liabilities;
  }

  const federalRate = params.options.federalTaxRate;
  let estimatedStateTaxTotal = 0;
  let estimatedFederalTaxTotal = 0;

  const byEntity = Array.from(entityMap.values()).map((entity) => {
    entity.netIncome = entity.income - entity.expenses;
    entity.taxableIncome = Math.max(0, entity.income - entity.deductibleExpenses);

    if (typeof federalRate === 'number' && Number.isFinite(federalRate)) {
      entity.estimatedFederalTax = round2(entity.taxableIncome * federalRate);
      estimatedFederalTaxTotal += entity.estimatedFederalTax;
    }

    let entityStateTax = 0;
    const entityStates = Array.from(entity.byState.values()).map((stateRow: any) => {
      stateRow.netIncome = stateRow.income - stateRow.expenses;
      stateRow.taxableIncome = Math.max(0, stateRow.income - stateRow.deductibleExpenses);

      const stateRate = stateRateFor(stateRow.state, params.options);
      if (stateRate !== null) {
        stateRow.estimatedStateTax = round2(stateRow.taxableIncome * stateRate);
        entityStateTax += stateRow.estimatedStateTax;
      }

      return {
        ...stateRow,
        income: round2(stateRow.income),
        expenses: round2(stateRow.expenses),
        deductibleExpenses: round2(stateRow.deductibleExpenses),
        nonDeductibleExpenses: round2(stateRow.nonDeductibleExpenses),
        taxableIncome: round2(stateRow.taxableIncome),
        netIncome: round2(stateRow.netIncome),
      };
    }).sort((a: any, b: any) => b.income - a.income);

    if (entityStates.some((s: any) => s.estimatedStateTax !== null)) {
      entity.estimatedStateTax = round2(entityStateTax);
      estimatedStateTaxTotal += entity.estimatedStateTax;
    }

    if (entity.estimatedFederalTax !== null || entity.estimatedStateTax !== null) {
      entity.estimatedTotalTax = round2((entity.estimatedFederalTax || 0) + (entity.estimatedStateTax || 0));
    }

    return {
      ...entity,
      income: round2(entity.income),
      expenses: round2(entity.expenses),
      deductibleExpenses: round2(entity.deductibleExpenses),
      nonDeductibleExpenses: round2(entity.nonDeductibleExpenses),
      netIncome: round2(entity.netIncome),
      taxableIncome: round2(entity.taxableIncome),
      assets: round2(entity.assets),
      liabilities: round2(entity.liabilities),
      equity: round2(entity.equity),
      byState: entityStates,
    };
  }).sort((a, b) => b.taxableIncome - a.taxableIncome);

  const byState = Array.from(stateMap.values()).map((stateRow) => {
    stateRow.netIncome = stateRow.income - stateRow.expenses;
    stateRow.taxableIncome = Math.max(0, stateRow.income - stateRow.deductibleExpenses);

    const stateRate = stateRateFor(stateRow.state, params.options);
    if (stateRate !== null) {
      stateRow.estimatedStateTax = round2(stateRow.taxableIncome * stateRate);
    }

    return {
      ...stateRow,
      income: round2(stateRow.income),
      expenses: round2(stateRow.expenses),
      deductibleExpenses: round2(stateRow.deductibleExpenses),
      nonDeductibleExpenses: round2(stateRow.nonDeductibleExpenses),
      taxableIncome: round2(stateRow.taxableIncome),
      netIncome: round2(stateRow.netIncome),
    };
  }).sort((a, b) => b.taxableIncome - a.taxableIncome);

  const assets = byEntity.reduce((sum, row) => sum + row.assets, 0);
  const liabilities = byEntity.reduce((sum, row) => sum + row.liabilities, 0);

  const taxableIncome = Math.max(0, totalIncome - totalDeductibleExpenses);
  const totalNet = totalIncome - totalExpenses;
  const estimatedTotalTax =
    (typeof federalRate === 'number' ? estimatedFederalTaxTotal : 0) +
    (estimatedStateTaxTotal > 0 ? estimatedStateTaxTotal : 0);

  return {
    period: { startDate: params.startDate, endDate: params.endDate },
    scope: {
      tenantIds: params.tenantIds,
      includeDescendants: params.options.includeDescendants,
      includeIntercompany: params.options.includeIntercompany,
      stateFilter: params.options.stateFilter || null,
      entityTypes: params.options.entityTypes || null,
    },
    totals: {
      income: round2(totalIncome),
      expenses: round2(totalExpenses),
      deductibleExpenses: round2(totalDeductibleExpenses),
      nonDeductibleExpenses: round2(totalNonDeductibleExpenses),
      netIncome: round2(totalNet),
      taxableIncome: round2(taxableIncome),
      estimatedFederalTax: typeof federalRate === 'number' ? round2(estimatedFederalTaxTotal) : null,
      estimatedStateTax: estimatedStateTaxTotal > 0 ? round2(estimatedStateTaxTotal) : null,
      estimatedTotalTax: estimatedTotalTax > 0 ? round2(estimatedTotalTax) : null,
      assets: round2(assets),
      liabilities: round2(liabilities),
      equity: round2(assets - liabilities),
    },
    byEntity,
    byState,
    quality,
  };
}

export function buildPreflightChecks(
  report: ReturnType<typeof buildConsolidatedReport>,
  strictReadiness: boolean,
) {
  const checks: PreflightCheck[] = [];
  const quality = report.quality;
  const total = Math.max(1, quality.totalTransactions);

  checks.push({
    id: 'future-dated-transactions',
    status: quality.futureDatedTransactions > 0 ? 'fail' : 'pass',
    message: quality.futureDatedTransactions > 0
      ? 'Future-dated transactions detected; close/tax report is not filing-ready.'
      : 'No future-dated transactions detected.',
    metric: quality.futureDatedTransactions,
    threshold: '0',
  });

  checks.push({
    id: 'state-attribution',
    status: quality.unassignedStateTransactions > 0 ? 'warn' : 'pass',
    message: quality.unassignedStateTransactions > 0
      ? 'Some transactions have no state attribution; multi-state tax allocations may be incomplete.'
      : 'All transactions are state-attributed.',
    metric: quality.unassignedStateTransactions,
    threshold: '0',
  });

  checks.push({
    id: 'categorization-quality',
    status: quality.uncategorizedTransactions / total > 0.05 ? 'warn' : 'pass',
    message: quality.uncategorizedTransactions / total > 0.05
      ? 'More than 5% of transactions are uncategorized.'
      : 'Transaction categorization is within threshold.',
    metric: quality.uncategorizedTransactions,
    threshold: '<= 5%',
  });

  checks.push({
    id: 'reconciliation-coverage',
    status: quality.unreconciledTransactions / total > 0.1 ? 'warn' : 'pass',
    message: quality.unreconciledTransactions / total > 0.1
      ? 'More than 10% of transactions are unreconciled.'
      : 'Reconciliation coverage is within threshold.',
    metric: quality.unreconciledTransactions,
    threshold: '<= 10%',
  });

  checks.push({
    id: 'intercompany-elimination',
    status: quality.internalIntercompanyEliminated > 0 ? 'pass' : 'warn',
    message: quality.internalIntercompanyEliminated > 0
      ? 'Internal intercompany entries were eliminated from consolidated totals.'
      : 'No internal intercompany eliminations were applied in this run.',
    metric: quality.internalIntercompanyEliminated,
    threshold: '>= 1 when intercompany activity exists',
  });

  const hasFail = checks.some((check) => check.status === 'fail');
  const hasWarn = checks.some((check) => check.status === 'warn');
  const readyToFileTaxes = !hasFail && (!strictReadiness || !hasWarn);

  return {
    checks,
    readyToFileTaxes,
    strictReadiness,
  };
}

export function buildRemediationPrompts(checks: PreflightCheck[]) {
  const prompts: string[] = [];

  for (const check of checks) {
    if (check.status === 'pass') continue;

    if (check.id === 'future-dated-transactions') {
      prompts.push('Review and correct future-dated transactions before generating tax filing schedules.');
    }
    if (check.id === 'state-attribution') {
      prompts.push('Assign state codes to UNASSIGNED transactions using property/state metadata before state tax allocation.');
    }
    if (check.id === 'categorization-quality') {
      prompts.push('Classify uncategorized transactions into chart-of-accounts categories and set deductible/non-deductible flags.');
    }
    if (check.id === 'reconciliation-coverage') {
      prompts.push('Reconcile unreconciled transactions against source statements to validate report accuracy.');
    }
    if (check.id === 'intercompany-elimination') {
      prompts.push('Verify intercompany mappings so internal transfers are eliminated in consolidated reporting.');
    }
  }

  return prompts;
}
