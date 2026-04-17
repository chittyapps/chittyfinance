import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useTenantId } from '@/contexts/TenantContext';

// Matches database/system.schema.ts chartOfAccounts
export interface ChartOfAccount {
  id: string;
  tenantId: string | null; // null = global default
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  subtype: string | null;
  description: string | null;
  scheduleELine: string | null;
  taxDeductible: boolean;
  parentCode: string | null;
  isActive: boolean;
}

// Matches database/system.schema.ts transactions (classification columns)
export interface UnclassifiedTransaction {
  id: string;
  tenantId: string;
  accountId: string;
  amount: string;
  type: string;
  category: string | null;
  description: string;
  date: string;
  payee: string | null;
  coaCode: string | null;
  suggestedCoaCode: string | null;
  classificationConfidence: string | null;
  classifiedBy: string | null;
  classifiedAt: string | null;
  reconciled: boolean;
  reconciledBy: string | null;
  reconciledAt: string | null;
}

export interface ClassificationStats {
  total: number | string;
  classified: number | string;
  reconciled: number | string;
  suggested: number | string;
  unclassified: number;
  classifiedPct: number;
}

export interface ClassificationAuditEntry {
  id: string;
  transactionId: string;
  tenantId: string;
  previousCoaCode: string | null;
  newCoaCode: string;
  action: string; // 'suggest' | 're-suggest' | 'classify' | 'reclassify' | 'reconcile'
  trustLevel: string;
  actorId: string;
  actorType: 'user' | 'agent' | 'system';
  confidence: string | null;
  reason: string | null;
  createdAt: string;
}

// ── Queries ──

export function useChartOfAccounts() {
  const tenantId = useTenantId();
  return useQuery<ChartOfAccount[]>({
    queryKey: ['/api/coa', tenantId],
    enabled: !!tenantId,
  });
}

export function useClassificationStats() {
  const tenantId = useTenantId();
  return useQuery<ClassificationStats>({
    queryKey: ['/api/classification/stats', tenantId],
    enabled: !!tenantId,
  });
}

export function useUnclassifiedTransactions(limit = 50) {
  const tenantId = useTenantId();
  return useQuery<UnclassifiedTransaction[]>({
    queryKey: ['/api/classification/unclassified', tenantId, limit],
    enabled: !!tenantId,
  });
}

export function useReconciledTransactions(limit = 50) {
  const tenantId = useTenantId();
  return useQuery<UnclassifiedTransaction[]>({
    queryKey: ['/api/classification/reconciled', tenantId, limit],
    enabled: !!tenantId,
  });
}

export function useClassificationAudit(transactionId: string | null) {
  return useQuery<ClassificationAuditEntry[]>({
    queryKey: ['/api/classification/audit', transactionId],
    enabled: !!transactionId,
  });
}

// ── Mutations ──

function invalidateClassificationCache(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['/api/classification/stats'] });
  qc.invalidateQueries({ queryKey: ['/api/classification/unclassified'] });
}

/** L2 — set authoritative coa_code on a transaction */
export function useClassifyTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { transactionId: string; coaCode: string; reason?: string; confidence?: string }) =>
      apiRequest('POST', '/api/classification/classify', data).then((r) => r.json()),
    onSuccess: () => invalidateClassificationCache(qc),
  });
}

/** L1 — write a suggestion (manual override of AI/keyword) */
export function useSuggestTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { transactionId: string; coaCode: string; reason?: string; confidence?: string }) =>
      apiRequest('POST', '/api/classification/suggest', data).then((r) => r.json()),
    onSuccess: () => invalidateClassificationCache(qc),
  });
}

/** L3 — lock a classified transaction */
export function useReconcileTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { transactionId: string }) =>
      apiRequest('POST', '/api/classification/reconcile', data).then((r) => r.json()),
    onSuccess: () => invalidateClassificationCache(qc),
  });
}

/** L1 — run keyword-match batch over unclassified queue */
export function useBatchSuggest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (limit: number = 100) =>
      apiRequest('POST', `/api/classification/batch-suggest?limit=${limit}`).then((r) => r.json()),
    onSuccess: () => invalidateClassificationCache(qc),
  });
}

/** L4 — create a tenant-specific COA account */
export function useCreateCoaAccount() {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (data: {
      code: string;
      name: string;
      type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
      subtype?: string | null;
      description?: string | null;
      scheduleELine?: string | null;
      taxDeductible?: boolean;
      parentCode?: string | null;
    }) => apiRequest('POST', '/api/coa', data).then((r) => r.json()) as Promise<ChartOfAccount>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/coa', tenantId] });
    },
  });
}

/** L4 — update a tenant-specific COA account */
export function useUpdateCoaAccount() {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<ChartOfAccount>) =>
      apiRequest('PATCH', `/api/coa/${id}`, data).then((r) => r.json()) as Promise<ChartOfAccount>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/coa', tenantId] });
    },
  });
}

/** L1 — run GPT-4o-mini AI batch over unclassified queue */
export function useAiSuggest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (limit: number = 25) =>
      apiRequest('POST', `/api/classification/ai-suggest?limit=${limit}`).then((r) => r.json()) as Promise<{
        processed: number;
        suggested: number;
        aiCount: number;
        keywordCount: number;
        aiAvailable: boolean;
      }>,
    onSuccess: () => invalidateClassificationCache(qc),
  });
}

/** Tenant classification settings (bulk-accept opt-out, etc.) */
export function useTenantSettings() {
  const tenantId = useTenantId();
  return useQuery<{ bulkAcceptDisabled: boolean }>({
    queryKey: ['/api/tenants', tenantId, 'settings'],
    queryFn: () => fetch(`/api/tenants/${tenantId}/settings`, { credentials: 'include' }).then((r) => r.json()),
    enabled: !!tenantId,
  });
}

export function useUpdateTenantSettings() {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (data: { bulkAcceptDisabled?: boolean }) =>
      apiRequest('PATCH', `/api/tenants/${tenantId}/settings`, data).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/tenants', tenantId, 'settings'] });
    },
  });
}

/** L3 — unlock a reconciled transaction */
export function useUnreconcileTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { transactionId: string }) =>
      apiRequest('POST', '/api/classification/unreconcile', data).then((r) => r.json()),
    onSuccess: () => {
      invalidateClassificationCache(qc);
      qc.invalidateQueries({ queryKey: ['/api/classification/reconciled'] });
    },
  });
}
