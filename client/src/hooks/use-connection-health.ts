import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface IntegrationStatus {
  configured: boolean;
  label?: string;
}

interface Integration {
  id: number;
  serviceType: string;
  name: string;
  connected: boolean;
  credentials?: Record<string, any>;
}

export interface ServiceHealth {
  key: string;
  name: string;
  configured: boolean;
  connected: boolean;
  lastChecked: number;
  error?: string;
  tokenExpiresAt?: number;
  tokenRefreshing?: boolean;
}

const SERVICE_MAP = [
  { key: 'mercury', name: 'Mercury Bank', serviceType: 'mercury_bank' },
  { key: 'wave', name: 'Wave Accounting', serviceType: 'wavapps' },
  { key: 'stripe', name: 'Stripe', serviceType: 'stripe' },
  { key: 'openai', name: 'OpenAI', serviceType: 'openai' },
] as const;

export function useConnectionHealth() {
  const queryClient = useQueryClient();
  const [autoRefreshAttempted, setAutoRefreshAttempted] = useState(false);

  const { data: integrationStatus, dataUpdatedAt: statusCheckedAt } = useQuery<
    Record<string, IntegrationStatus>
  >({
    queryKey: ['/api/integrations/status'],
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: integrations = [], dataUpdatedAt: integrationsCheckedAt } = useQuery<Integration[]>({
    queryKey: ['/api/integrations'],
    refetchInterval: 120_000,
  });

  const refreshWave = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/integrations/wave/refresh', { method: 'POST' });
      if (!response.ok) throw new Error('Token refresh failed');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/status'] });
      setAutoRefreshAttempted(false);
    },
    onError: (err) => {
      console.error('Wave token refresh failed:', err);
      // Latch to prevent tight loop, but reset after 60s to allow retry
      setAutoRefreshAttempted(true);
      setTimeout(() => setAutoRefreshAttempted(false), 60_000);
    },
  });

  // Build health map from real data
  const healthMap = useMemo(() => {
    const map: Record<string, ServiceHealth> = {};
    for (const svc of SERVICE_MAP) {
      const status = integrationStatus?.[svc.key];
      const integration = integrations.find((i) => i.serviceType === svc.serviceType);

      const health: ServiceHealth = {
        key: svc.key,
        name: svc.name,
        configured: status?.configured ?? false,
        connected: integration?.connected ?? false,
        lastChecked: Math.max(statusCheckedAt || 0, integrationsCheckedAt || 0),
      };

      // Wave token expiry tracking
      if (svc.key === 'wave' && integration?.connected && integration?.credentials) {
        const expiresAt = integration.credentials.token_expires_at;
        if (expiresAt) {
          health.tokenExpiresAt = Number(expiresAt);
        }
      }

      health.tokenRefreshing = svc.key === 'wave' && refreshWave.isPending;
      map[svc.key] = health;
    }
    return map;
  }, [integrationStatus, integrations, statusCheckedAt, integrationsCheckedAt, refreshWave.isPending]);

  // Auto-heal: refresh Wave token if about to expire (within 5 min)
  useEffect(() => {
    const wave = healthMap.wave;
    if (!wave?.connected || !wave.tokenExpiresAt || autoRefreshAttempted || refreshWave.isPending) return;

    const expiresIn = wave.tokenExpiresAt - Date.now();
    if (expiresIn > 0 && expiresIn < 5 * 60 * 1000) {
      refreshWave.mutate();
      setAutoRefreshAttempted(true);
    }
  }, [healthMap, autoRefreshAttempted, refreshWave]);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/integrations/status'] });
    queryClient.invalidateQueries({ queryKey: ['/api/integrations'] });
  }, [queryClient]);

  const manualRefreshWave = useCallback(() => {
    setAutoRefreshAttempted(false);
    refreshWave.mutate();
  }, [refreshWave]);

  const allHealthy = Object.values(healthMap).every((h) => !h.configured || h.connected);
  const downCount = Object.values(healthMap).filter((h) => h.configured && !h.connected).length;
  const configuredCount = Object.values(healthMap).filter((h) => h.configured).length;
  const connectedCount = Object.values(healthMap).filter((h) => h.connected).length;

  return {
    healthMap,
    services: SERVICE_MAP,
    allHealthy,
    downCount,
    configuredCount,
    connectedCount,
    refresh,
    manualRefreshWave,
    waveRefreshPending: refreshWave.isPending,
    lastChecked: Math.max(statusCheckedAt || 0, integrationsCheckedAt || 0),
  };
}
