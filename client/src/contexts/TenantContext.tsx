/**
 * Tenant Context - Multi-tenant state management
 *
 * Provides current tenant selection and switching capabilities.
 * Only active in system mode (MODE=system).
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { setActiveTenantId } from '@/lib/queryClient';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  type: string;
  role: string;
  parentId?: string;
  isActive: boolean;
}

interface TenantContextValue {
  currentTenant: Tenant | null;
  tenants: Tenant[];
  isLoading: boolean;
  switchTenant: (tenant: Tenant) => void;
  isSystemMode: boolean;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [isSystemMode, setIsSystemMode] = useState(false);
  const qc = useQueryClient();

  // Check mode from API status
  useEffect(() => {
    fetch('/api/v1/status')
      .then(res => res.json())
      .then((data: any) => {
        setIsSystemMode(data.mode === 'system');
      })
      .catch(console.error);
  }, []);

  // Fetch user's tenants (only in system mode)
  const { data: tenants = [], isLoading } = useQuery<Tenant[]>({
    queryKey: ['/api/tenants'],
    enabled: isSystemMode,
    retry: false,
  });

  // Auto-select first tenant if none selected
  useEffect(() => {
    if (isSystemMode && tenants.length > 0 && !currentTenant) {
      const saved = localStorage.getItem('currentTenantId');
      const selected = saved
        ? tenants.find(t => t.id === saved)
        : tenants[0];
      const tenant = selected || tenants[0];
      setCurrentTenant(tenant);
      setActiveTenantId(tenant.id);
    }
  }, [tenants, currentTenant, isSystemMode]);

  // Persist and sync tenant ID
  useEffect(() => {
    if (currentTenant) {
      localStorage.setItem('currentTenantId', currentTenant.id);
      setActiveTenantId(currentTenant.id);
    }
  }, [currentTenant]);

  const switchTenant = useCallback((tenant: Tenant) => {
    setCurrentTenant(tenant);
    setActiveTenantId(tenant.id);
    // Invalidate all tenant-scoped queries so they refetch with new tenantId
    qc.invalidateQueries();
  }, [qc]);

  return (
    <TenantContext.Provider
      value={{
        currentTenant,
        tenants,
        isLoading,
        switchTenant,
        isSystemMode,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}

/**
 * Hook to get current tenant ID for API requests.
 * Returns null in standalone mode.
 */
export function useTenantId(): string | null {
  const { currentTenant, isSystemMode } = useTenant();
  return isSystemMode ? currentTenant?.id || null : null;
}
