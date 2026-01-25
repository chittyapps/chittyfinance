/**
 * Tenant Switcher - Dropdown to switch between tenants
 *
 * Only renders in system mode when multiple tenants exist
 */

import { useTenant } from '@/contexts/TenantContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Building2 } from 'lucide-react';

export default function TenantSwitcher() {
  const { currentTenant, tenants, isLoading, setCurrentTenant, isSystemMode } = useTenant();

  // Don't render in standalone mode or if no tenants
  if (!isSystemMode || tenants.length === 0) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
        <Building2 className="h-4 w-4" />
        <span>Loading...</span>
      </div>
    );
  }

  const getTenantLabel = (tenant: typeof tenants[0]) => {
    const icons = {
      holding: '🏢',
      series: '📊',
      property: '🏠',
      management: '⚙️',
      personal: '👤',
    };
    const icon = icons[tenant.type as keyof typeof icons] || '📁';
    return `${icon} ${tenant.name}`;
  };

  return (
    <Select
      value={currentTenant?.id || ''}
      onValueChange={(value) => {
        const selected = tenants.find(t => t.id === value);
        if (selected) {
          setCurrentTenant(selected);
          // Invalidate queries to refetch with new tenant
          window.location.reload();
        }
      }}
    >
      <SelectTrigger className="w-[280px]">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          <SelectValue>
            {currentTenant ? getTenantLabel(currentTenant) : 'Select tenant'}
          </SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent>
        {tenants.map((tenant) => (
          <SelectItem key={tenant.id} value={tenant.id}>
            <div className="flex flex-col">
              <div className="font-medium">{getTenantLabel(tenant)}</div>
              <div className="text-xs text-muted-foreground">
                Role: {tenant.role}
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
