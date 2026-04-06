import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useTenantId } from '@/contexts/TenantContext';

export interface AllocationRule {
  id: string;
  name: string;
  description: string | null;
  ruleType: string;
  sourceTenantId: string;
  targetTenantId: string;
  percentage: string | null;
  fixedAmount: string | null;
  frequency: string;
  sourceCategory: string | null;
  allocationMethod: string;
  isActive: boolean;
  lastRunAt: string | null;
  createdAt: string;
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

export interface AllocationRun {
  id: string;
  ruleId: string;
  periodStart: string;
  periodEnd: string;
  sourceAmount: string;
  allocatedAmount: string;
  transactionCount: number;
  status: string;
  createdAt: string;
}

export function useAllocationRules() {
  const tenantId = useTenantId();
  return useQuery<{ rules: AllocationRule[] }>({
    queryKey: ['/api/allocations/rules', tenantId],
    enabled: !!tenantId,
  });
}

export function useCreateAllocationRule() {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (data: Partial<AllocationRule>) =>
      apiRequest('POST', '/api/allocations/rules', data).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/allocations/rules', tenantId] });
    },
  });
}

export function useDeleteAllocationRule() {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest('DELETE', `/api/allocations/rules/${id}`).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/allocations/rules', tenantId] });
    },
  });
}

export function usePreviewAllocations() {
  return useMutation({
    mutationFn: (data: { periodStart: string; periodEnd: string }) =>
      apiRequest('POST', '/api/allocations/preview', data).then((r) => r.json()) as Promise<AllocationPreview>,
  });
}

export function useExecuteAllocations() {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (data: { periodStart: string; periodEnd: string }) =>
      apiRequest('POST', '/api/allocations/execute', data).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/allocations/rules', tenantId] });
      qc.invalidateQueries({ queryKey: ['/api/allocations/runs', tenantId] });
    },
  });
}

export function useAllocationRuns() {
  const tenantId = useTenantId();
  return useQuery<{ runs: AllocationRun[] }>({
    queryKey: ['/api/allocations/runs', tenantId],
    enabled: !!tenantId,
  });
}
