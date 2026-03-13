import { createContext, useContext, useState, ReactNode } from 'react';
import {
  ROLE_CONFIGS,
  type RoleConfig,
  type UserRole,
} from '@/lib/operating-model';

export type { UserRole, RoleConfig } from '@/lib/operating-model';

interface RoleContextValue {
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  roleConfig: RoleConfig;
  roles: RoleConfig[];
}

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

const STORAGE_KEY = 'cf-current-role';

export function RoleProvider({ children }: { children: ReactNode }) {
  const [currentRole, setCurrentRoleState] = useState<UserRole>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && ROLE_CONFIGS.some(r => r.id === saved)) return saved as UserRole;
    return 'cfo';
  });

  const setCurrentRole = (role: UserRole) => {
    setCurrentRoleState(role);
    localStorage.setItem(STORAGE_KEY, role);
  };

  const roleConfig = ROLE_CONFIGS.find(r => r.id === currentRole) || ROLE_CONFIGS[0];

  return (
    <RoleContext.Provider value={{ currentRole, setCurrentRole, roleConfig, roles: ROLE_CONFIGS }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) throw new Error('useRole must be used within RoleProvider');
  return context;
}
