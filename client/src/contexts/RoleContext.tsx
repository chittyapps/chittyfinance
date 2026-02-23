import { createContext, useContext, useState, ReactNode } from 'react';

export type UserRole = 'cfo' | 'accountant' | 'bookkeeper' | 'user';

export interface RoleConfig {
  id: UserRole;
  label: string;
  description: string;
}

export const ROLES: RoleConfig[] = [
  { id: 'cfo', label: 'CFO', description: 'Executive overview across all entities' },
  { id: 'accountant', label: 'Accountant', description: 'GL, reconciliation, and reporting' },
  { id: 'bookkeeper', label: 'Bookkeeper', description: 'Transaction entry and categorization' },
  { id: 'user', label: 'User', description: 'Personal expenses and approvals' },
];

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
    if (saved && ROLES.some(r => r.id === saved)) return saved as UserRole;
    return 'cfo';
  });

  const setCurrentRole = (role: UserRole) => {
    setCurrentRoleState(role);
    localStorage.setItem(STORAGE_KEY, role);
  };

  const roleConfig = ROLES.find(r => r.id === currentRole) || ROLES[0];

  return (
    <RoleContext.Provider value={{ currentRole, setCurrentRole, roleConfig, roles: ROLES }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) throw new Error('useRole must be used within RoleProvider');
  return context;
}
