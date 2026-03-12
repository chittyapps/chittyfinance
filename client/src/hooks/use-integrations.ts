import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useTenantId } from '@/contexts/TenantContext';

export interface Integration {
  id: string;
  serviceType: string;
  name: string;
  description?: string;
  connected: boolean;
  lastSynced?: string;
  metadata?: Record<string, unknown>;
}

export interface RecurringCharge {
  id: string;
  merchantName: string;
  amount: number;
  date: string;
  category: string;
  recurring: boolean;
  nextChargeDate?: string;
  subscriptionId?: string;
}

export interface OptimizationRecommendation {
  chargeId: string;
  merchantName: string;
  currentAmount: number;
  suggestedAction: 'cancel' | 'downgrade' | 'consolidate' | 'negotiate';
  potentialSavings: number;
  reasoning: string;
  alternativeOptions?: string[];
}

export function useIntegrations() {
  const tenantId = useTenantId();
  return useQuery<Integration[]>({
    queryKey: ['/api/integrations', tenantId],
    enabled: !!tenantId,
  });
}

export function useRecurringCharges() {
  const tenantId = useTenantId();
  return useQuery<RecurringCharge[]>({
    queryKey: ['/api/charges/recurring', tenantId],
    enabled: !!tenantId,
  });
}

export function useChargeOptimizations() {
  const tenantId = useTenantId();
  return useQuery<OptimizationRecommendation[]>({
    queryKey: ['/api/charges/optimizations', tenantId],
    enabled: !!tenantId,
  });
}

export function useWaveSync() {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: () =>
      apiRequest('POST', '/api/import/wave-sync', {}).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/transactions', tenantId] });
      qc.invalidateQueries({ queryKey: ['/api/integrations', tenantId] });
    },
  });
}

export function useTurboTenantImport() {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: async ({ file, accountId }: { file: File; accountId: string }) => {
      const csv = await file.text();
      const res = await fetch(`/api/import/turbotenant?tenantId=${tenantId}`, {
        method: 'POST',
        headers: { 'X-Account-ID': accountId, 'Content-Type': 'text/csv' },
        body: csv,
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/transactions', tenantId] });
    },
  });
}
