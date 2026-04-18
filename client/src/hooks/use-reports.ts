import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useTenantId } from '@/contexts/TenantContext';

export interface ReportParams {
  startDate: string;
  endDate: string;
  includeDescendants?: boolean;
  includeIntercompany?: boolean;
  strictReadiness?: boolean;
  entityTypes?: string;
  states?: string;
}

export interface ConsolidatedReport {
  report: {
    scope: { tenantIds: string[]; startDate: string; endDate: string };
    totals: {
      income: number;
      expenses: number;
      deductibleExpenses: number;
      nonDeductibleExpenses: number;
      net: number;
      transactionCount: number;
    };
    byEntity: Array<{
      tenantId: string;
      tenantName: string;
      tenantType: string;
      income: number;
      expenses: number;
      net: number;
      transactionCount: number;
    }>;
    byState: Array<{
      state: string;
      income: number;
      expenses: number;
      taxableIncome: number;
      estimatedTax: number;
      transactionCount: number;
    }>;
    quality: {
      uncategorizedCount: number;
      unreconciledCount: number;
      unassignedStateCount: number;
      futureDatedCount: number;
      totalTransactions: number;
    };
    balances: {
      totalAssets: number;
      totalLiabilities: number;
      netWorth: number;
    };
  };
  preflight: {
    readyToFileTaxes: boolean;
    checks: Array<{
      id: string;
      status: 'pass' | 'warn' | 'fail';
      message: string;
    }>;
  };
  verificationChecklist: Array<{
    id: string;
    status: 'pass' | 'warn' | 'fail';
    message: string;
  }>;
  remediationPrompts: string[];
}

export interface TaxAutomationResult extends ConsolidatedReport {
  runId: string;
  generatedAt: string;
  aiReview: { provider: string; content: string } | null;
  nextStep: string;
}

function buildQueryString(params: ReportParams): string {
  const qs = new URLSearchParams();
  qs.set('startDate', params.startDate);
  qs.set('endDate', params.endDate);
  if (params.includeDescendants !== undefined) qs.set('includeDescendants', String(params.includeDescendants));
  if (params.includeIntercompany !== undefined) qs.set('includeIntercompany', String(params.includeIntercompany));
  if (params.strictReadiness !== undefined) qs.set('strictReadiness', String(params.strictReadiness));
  if (params.entityTypes) qs.set('entityTypes', params.entityTypes);
  if (params.states) qs.set('states', params.states);
  return qs.toString();
}

export function useConsolidatedReport(params: ReportParams | null) {
  const tenantId = useTenantId();
  const qs = params ? buildQueryString(params) : '';
  return useQuery<ConsolidatedReport>({
    queryKey: [`/api/reports/consolidated?${qs}`, tenantId],
    enabled: !!tenantId && !!params,
    staleTime: 2 * 60 * 1000,
  });
}

export function useRunTaxAutomation() {
  return useMutation<TaxAutomationResult, Error, ReportParams>({
    mutationFn: (params) =>
      apiRequest('POST', '/api/workflows/close-tax-automation', params).then(r => r.json()),
  });
}

// ── Tax Report Types ──

export interface TaxReportParams {
  taxYear: number;
  includeDescendants?: boolean;
  propertyIds?: string[];
  tenantIds?: string[];
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

export interface ScheduleELineSummaryItem {
  lineNumber: string;
  lineLabel: string;
  amount: number;
  transactionCount: number;
  coaBreakdown: Array<{
    coaCode: string;
    coaName: string;
    amount: number;
    transactionCount: number;
  }>;
}

export interface ClassificationQuality {
  totalTransactions: number;
  l2ClassifiedCount: number;
  l1SuggestedOnlyCount: number;
  unclassifiedCount: number;
  l1SuggestedOnlyAmount: number;
  confirmedPct: number;
  readyToFile: boolean;
}

export interface ScheduleEReport {
  taxYear: number;
  properties: ScheduleEPropertyColumn[];
  entityLevelItems: ScheduleELineItem[];
  entityLevelTotal: number;
  uncategorizedAmount: number;
  uncategorizedCount: number;
  unmappedCategories: string[];
  lineSummary: ScheduleELineSummaryItem[];
  classificationQuality: ClassificationQuality;
}

export interface K1MemberAllocation {
  memberName: string;
  pct: number;
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

function buildTaxQueryString(params: TaxReportParams): string {
  const qs = new URLSearchParams();
  qs.set('taxYear', String(params.taxYear));
  if (params.includeDescendants !== undefined) qs.set('includeDescendants', String(params.includeDescendants));
  if (params.propertyIds?.length) qs.set('propertyIds', params.propertyIds.join(','));
  if (params.tenantIds?.length) qs.set('tenantIds', params.tenantIds.join(','));
  return qs.toString();
}

export function useScheduleEReport(params: TaxReportParams | null) {
  const tenantId = useTenantId();
  const qs = params ? buildTaxQueryString(params) : '';
  return useQuery<ScheduleEReport>({
    queryKey: [`/api/reports/tax/schedule-e?${qs}`, tenantId],
    enabled: !!tenantId && !!params,
    staleTime: 2 * 60 * 1000,
  });
}

export function useForm1065Report(params: TaxReportParams | null) {
  const tenantId = useTenantId();
  const qs = params ? buildTaxQueryString(params) : '';
  return useQuery<Form1065Report[]>({
    queryKey: [`/api/reports/tax/form-1065?${qs}`, tenantId],
    enabled: !!tenantId && !!params,
    staleTime: 2 * 60 * 1000,
  });
}

export function useExportTaxPackage() {
  return useMutation<void, Error, TaxReportParams & { format?: 'csv' | 'json' }>({
    mutationFn: async (params) => {
      const qs = new URLSearchParams();
      qs.set('taxYear', String(params.taxYear));
      qs.set('format', params.format || 'csv');
      if (params.includeDescendants !== undefined) qs.set('includeDescendants', String(params.includeDescendants));
      const res = await apiRequest('GET', `/api/reports/tax/export?${qs}`);
      const blob = await res.blob();
      const ext = params.format === 'json' ? 'json' : 'csv';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tax-package-${params.taxYear}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });
}
