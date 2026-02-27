import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useTenantId } from '@/contexts/TenantContext';

// ─── Types ───
export interface Property {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  propertyType: string;
  purchasePrice: string;
  currentValue: string;
  isActive: boolean;
}

export interface Unit {
  id: string;
  propertyId: string;
  unitNumber: string;
  bedrooms: number;
  bathrooms: string;
  squareFeet: number;
  monthlyRent: string;
  isActive: boolean;
}

export interface Lease {
  id: string;
  unitId: string;
  tenantName: string;
  tenantEmail?: string;
  tenantPhone?: string;
  startDate: string;
  endDate: string;
  monthlyRent: string;
  securityDeposit?: string;
  status: string;
}

export interface PropertyFinancials {
  propertyId: string;
  noi: number;
  capRate: number;
  cashOnCash: number;
  occupancyRate: number;
  totalUnits: number;
  occupiedUnits: number;
  totalIncome: number;
  totalExpenses: number;
}

export interface RentRollEntry {
  unitId: string;
  unitNumber: string;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  expectedRent: number;
  actualPaid: number;
  status: 'paid' | 'partial' | 'overdue' | 'vacant';
  tenantName: string | null;
  leaseEnd: string | null;
}

export interface PnLReport {
  income: Record<string, number>;
  expenses: Record<string, number>;
  totalIncome: number;
  totalExpenses: number;
  net: number;
}

export interface PortfolioSummary {
  totalProperties: number;
  totalValue: number;
  totalNOI: number;
  avgCapRate: number;
  totalUnits: number;
  occupiedUnits: number;
  occupancyRate: number;
  properties: Array<{
    id: string;
    name: string;
    address: string;
    city: string;
    state: string;
    propertyType: string;
    currentValue: number;
    noi: number;
    capRate: number;
    occupancyRate: number;
    totalUnits: number;
    occupiedUnits: number;
  }>;
}

export interface AIAdviceResponse {
  role: 'assistant';
  content: string;
  model: string | null;
  provider: string;
}

export interface ValuationData {
  property: { id: string; name: string; address: string };
  aggregated: {
    weightedEstimate: number;
    low: number;
    high: number;
    sources: number;
    estimates: Array<{
      source: string;
      estimate: number;
      low: number;
      high: number;
      confidence: number;
      fetchedAt: string;
    }>;
    errors?: string[];
  };
}

// ─── Query Hooks ───
export function usePortfolioSummary() {
  const tenantId = useTenantId();
  return useQuery<PortfolioSummary>({
    queryKey: ['/api/portfolio/summary', tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useProperties() {
  const tenantId = useTenantId();
  return useQuery<Property[]>({
    queryKey: ['/api/properties', tenantId],
    enabled: !!tenantId,
  });
}

export function useProperty(id: string | undefined) {
  return useQuery<Property>({
    queryKey: [`/api/properties/${id}`],
    enabled: !!id,
  });
}

export function usePropertyUnits(propertyId: string | undefined) {
  return useQuery<Unit[]>({
    queryKey: [`/api/properties/${propertyId}/units`],
    enabled: !!propertyId,
  });
}

export function usePropertyLeases(propertyId: string | undefined) {
  return useQuery<Lease[]>({
    queryKey: [`/api/properties/${propertyId}/leases`],
    enabled: !!propertyId,
  });
}

export function usePropertyFinancials(propertyId: string | undefined) {
  return useQuery<PropertyFinancials>({
    queryKey: [`/api/properties/${propertyId}/financials`],
    enabled: !!propertyId,
  });
}

export function usePropertyRentRoll(propertyId: string | undefined) {
  return useQuery<RentRollEntry[]>({
    queryKey: [`/api/properties/${propertyId}/rent-roll`],
    enabled: !!propertyId,
  });
}

export function usePropertyPnL(propertyId: string | undefined, start: string, end: string) {
  return useQuery<PnLReport>({
    queryKey: [`/api/properties/${propertyId}/pnl?start=${start}&end=${end}`],
    enabled: !!propertyId && !!start && !!end,
  });
}

export function usePropertyValuation(propertyId: string | undefined) {
  return useQuery<ValuationData>({
    queryKey: [`/api/properties/${propertyId}/valuation`],
    enabled: !!propertyId,
  });
}

export function usePropertyValuationHistory(propertyId: string | undefined) {
  return useQuery<any[]>({
    queryKey: [`/api/properties/${propertyId}/valuation/history`],
    enabled: !!propertyId,
  });
}

// ─── Mutation Hooks ───
export function useCreateProperty() {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (data: Partial<Property>) =>
      apiRequest('POST', '/api/properties', data).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['/api/properties', tenantId] }),
  });
}

export function useUpdateProperty(id: string) {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (data: Partial<Property>) =>
      apiRequest('PATCH', `/api/properties/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/properties/${id}`] });
      qc.invalidateQueries({ queryKey: ['/api/properties', tenantId] });
    },
  });
}

export function useCreateUnit(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Unit>) =>
      apiRequest('POST', `/api/properties/${propertyId}/units`, data).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/properties/${propertyId}/units`] }),
  });
}

export function useCreateLease(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Lease>) =>
      apiRequest('POST', `/api/properties/${propertyId}/leases`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/properties/${propertyId}/leases`] });
      qc.invalidateQueries({ queryKey: [`/api/properties/${propertyId}/rent-roll`] });
      qc.invalidateQueries({ queryKey: [`/api/properties/${propertyId}/financials`] });
    },
  });
}

export function useSendPropertyAdvice(propertyId: string) {
  return useMutation<AIAdviceResponse, Error, string>({
    mutationFn: (message: string) =>
      apiRequest('POST', '/api/ai/property-advice', { propertyId, message }).then(r => r.json()),
  });
}
