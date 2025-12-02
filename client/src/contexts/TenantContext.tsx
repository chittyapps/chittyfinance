/**
 * Tenant Context - Multi-tenant state management
 *
 * Provides current tenant selection and switching capabilities
 * Only active in system mode (MODE=system)
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

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
  setCurrentTenant: (tenant: Tenant | null) => void;
  isSystemMode: boolean;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [isSystemMode, setIsSystemMode] = useState(false);

  // Check mode from API status
  useEffect(() => {
    fetch('/api/v1/status')
      .then(res => res.json())
      .then(data => {
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

      setCurrentTenant(selected || tenants[0]);
    }
  }, [tenants, currentTenant, isSystemMode]);

  // Save current tenant to localStorage
  useEffect(() => {
    if (currentTenant) {
      localStorage.setItem('currentTenantId', currentTenant.id);
    }
  }, [currentTenant]);

  return (
    <TenantContext.Provider
      value={{
        currentTenant,
        tenants,
        isLoading,
        setCurrentTenant,
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
 * Hook to get current tenant ID for API requests
 * Returns null in standalone mode
 */
export function useTenantId(): string | null {
  const { currentTenant, isSystemMode } = useTenant();
  return isSystemMode ? currentTenant?.id || null : null;
}