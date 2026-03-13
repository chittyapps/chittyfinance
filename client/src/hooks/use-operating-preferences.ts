import { useEffect, useState } from 'react';
import {
  DEFAULT_OPERATING_PREFERENCES,
  type OperatingPreferences,
} from '@/lib/operating-model';

const STORAGE_KEY = 'cf-operating-preferences-v1';

function loadPreferences(): OperatingPreferences {
  if (typeof window === 'undefined') return DEFAULT_OPERATING_PREFERENCES;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_OPERATING_PREFERENCES;

    const parsed = JSON.parse(raw) as Partial<OperatingPreferences>;
    return {
      ...DEFAULT_OPERATING_PREFERENCES,
      ...parsed,
      enabledAgentIds: parsed.enabledAgentIds?.length
        ? parsed.enabledAgentIds
        : DEFAULT_OPERATING_PREFERENCES.enabledAgentIds,
    };
  } catch {
    return DEFAULT_OPERATING_PREFERENCES;
  }
}

export function useOperatingPreferences() {
  const [preferences, setPreferences] = useState<OperatingPreferences>(loadPreferences);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  const updatePreferences = (patch: Partial<OperatingPreferences>) => {
    setPreferences((current) => ({ ...current, ...patch }));
  };

  const toggleAgent = (agentId: string) => {
    setPreferences((current) => {
      const enabledAgentIds = current.enabledAgentIds.includes(agentId)
        ? current.enabledAgentIds.filter((id) => id !== agentId)
        : [...current.enabledAgentIds, agentId];
      return { ...current, enabledAgentIds };
    });
  };

  const resetPreferences = () => {
    setPreferences(DEFAULT_OPERATING_PREFERENCES);
  };

  return {
    preferences,
    updatePreferences,
    toggleAgent,
    resetPreferences,
  };
}
