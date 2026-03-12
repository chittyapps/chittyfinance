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
