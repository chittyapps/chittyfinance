import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useTenantId } from '@/contexts/TenantContext';

export interface Transaction {
  id: string;
  accountId: string;
  amount: number;
  type: string;
  category?: string;
  description: string;
  date: string;
  payee?: string;
  propertyId?: string;
  unitId?: string;
  reconciled: boolean;
}

export interface CreateTransactionInput {
  accountId: string;
  amount: number;
  type: string;
  category?: string;
  description: string;
  date: string;
  payee?: string;
  propertyId?: string;
  unitId?: string;
}

export function useTransactions(limit?: number) {
  const tenantId = useTenantId();
  const url = limit ? `/api/transactions?limit=${limit}` : '/api/transactions';
  return useQuery<Transaction[]>({
    queryKey: [url, tenantId],
    enabled: !!tenantId,
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (data: CreateTransactionInput) =>
      apiRequest('POST', '/api/transactions', data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/transactions', tenantId] });
      qc.invalidateQueries({ queryKey: ['/api/summary', tenantId] });
    },
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiRequest('PATCH', `/api/transactions/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/transactions', tenantId] });
    },
  });
}
