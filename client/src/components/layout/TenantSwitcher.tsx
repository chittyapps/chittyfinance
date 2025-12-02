import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Building2, Check } from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  type: string;
  role: string;
}

export function TenantSwitcher() {
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);

  const { data: tenants, isLoading } = useQuery<Tenant[]>({
    queryKey: ['/api/tenants'],
  });

  useEffect(() => {
    if (tenants && tenants.length > 0 && !currentTenant) {
      setCurrentTenant(tenants[0]);
    }
  }, [tenants, currentTenant]);

  const handleTenantSwitch = (tenant: Tenant) => {
    setCurrentTenant(tenant);
    // Store in localStorage for persistence
    localStorage.setItem('currentTenantId', tenant.id);
    // Trigger refetch of tenant-scoped data
    window.location.reload();
  };

  if (isLoading || !tenants || tenants.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-start">
          <Building2 className="mr-2 h-4 w-4" />
          <div className="flex flex-col items-start">
            <span className="text-sm font-medium">
              {currentTenant?.name || 'Select Tenant'}
            </span>
            {currentTenant && (
              <span className="text-xs text-muted-foreground">
                {currentTenant.type} • {currentTenant.role}
              </span>
            )}
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuLabel>Switch Tenant</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tenants.map((tenant) => (
          <DropdownMenuItem
            key={tenant.id}
            onClick={() => handleTenantSwitch(tenant)}
            className="flex items-center justify-between"
          >
            <div className="flex flex-col">
              <span className="font-medium">{tenant.name}</span>
              <span className="text-xs text-muted-foreground">
                {tenant.type} • {tenant.role}
              </span>
            </div>
            {currentTenant?.id === tenant.id && (
              <Check className="h-4 w-4" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
