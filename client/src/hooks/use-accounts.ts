import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useTenantId } from '@/contexts/TenantContext';

export interface Account {
  id: string;
  name: string;
  type: string;
  institution: string;
  balance: number;
  currency: string;
  externalId?: string;
  liabilityDetails?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AccountTransaction {
  id: string;
  account_id: string;
  amount: number;
  direction: 'inflow' | 'outflow';
  description: string;
  date: string;
  category?: string;
  counterparty?: string;
}

export interface CreateAccountInput {
  name: string;
  type: string;
  institution?: string;
  balance?: number;
  currency?: string;
  accountNumber?: string;
  liabilityDetails?: Record<string, unknown>;
}

export function useAccounts() {
  const tenantId = useTenantId();
  return useQuery<Account[]>({
    queryKey: ['/api/accounts', tenantId],
    enabled: !!tenantId,
  });
}

export function useAccountTransactions(accountId: string | null) {
  const tenantId = useTenantId();
  return useQuery<AccountTransaction[]>({
    queryKey: [`/api/accounts/${accountId}/transactions`, tenantId],
    enabled: !!accountId && !!tenantId,
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (data: CreateAccountInput) =>
      apiRequest('POST', '/api/accounts', data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/accounts', tenantId] });
      qc.invalidateQueries({ queryKey: ['/api/summary', tenantId] });
    },
  });
}

export function useSyncAccount() {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiRequest('POST', `/api/accounts/${id}/sync`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/accounts', tenantId] });
    },
  });
}
