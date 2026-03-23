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
  switchTenant: (tenant: Tenant | null) => void;
  isSystemMode: boolean;
  consolidatedMode: boolean;
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

  // Keep query client in sync with current tenant
  useEffect(() => {
    if (currentTenant) {
      setActiveTenantId(currentTenant.id);
    }
  }, [currentTenant]);

  const switchTenant = useCallback((tenant: Tenant | null) => {
    setCurrentTenant(tenant);
    setActiveTenantId(tenant?.id ?? null);
    if (tenant) {
      localStorage.setItem('currentTenantId', tenant.id);
    } else {
      localStorage.removeItem('currentTenantId');
    }
    // Invalidate tenant-scoped queries (skip the tenants list itself — it doesn't change)
    qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== '/api/tenants' });
  }, [qc]);

  const consolidatedMode = isSystemMode && currentTenant === null;

  return (
    <TenantContext.Provider
      value={{
        currentTenant,
        tenants,
        isLoading,
        switchTenant,
        isSystemMode,
        consolidatedMode,
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
