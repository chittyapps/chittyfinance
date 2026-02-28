import { useTenant } from '@/contexts/TenantContext';
import { Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

function tenantTypeColor(type: string): string {
  const map: Record<string, string> = {
    holding: 'bg-lime-400',
    personal: 'bg-violet-400',
    series: 'bg-cyan-400',
    management: 'bg-amber-400',
    property: 'bg-emerald-400',
  };
  return map[type] || 'bg-zinc-400';
}

export function TenantSwitcher() {
  const { currentTenant, tenants, isLoading, switchTenant, isSystemMode } = useTenant();
  const [open, setOpen] = useState(false);

  if (!isSystemMode || isLoading || tenants.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-[hsl(var(--cf-raised))] transition-colors"
      >
        <span className={cn('w-2 h-2 rounded-full flex-shrink-0', tenantTypeColor(currentTenant?.type || ''))} />
        <span className="text-sm font-display font-medium text-[hsl(var(--cf-text))] truncate max-w-[200px]">
          {currentTenant?.name || 'Select Entity'}
        </span>
        <ChevronDown className={cn(
          'w-3 h-3 text-[hsl(var(--cf-text-muted))] transition-transform',
          open && 'rotate-180'
        )} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 w-72 bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border))] rounded-md shadow-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-[hsl(var(--cf-border-subtle))]">
              <span className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--cf-text-muted))]">
                Switch Entity
              </span>
            </div>
            <div className="max-h-[300px] overflow-y-auto cf-scrollbar">
              {tenants.map((tenant) => (
                <button
                  key={tenant.id}
                  onClick={() => { switchTenant(tenant); setOpen(false); }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
                    currentTenant?.id === tenant.id
                      ? 'bg-[hsl(var(--cf-lime)/0.08)]'
                      : 'hover:bg-[hsl(var(--cf-overlay))]'
                  )}
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', tenantTypeColor(tenant.type))} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-[hsl(var(--cf-text))] truncate block">
                      {tenant.name}
                    </span>
                    <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">
                      {tenant.type} {tenant.role ? `\u00b7 ${tenant.role}` : ''}
                    </span>
                  </div>
                  {currentTenant?.id === tenant.id && (
                    <Check className="w-3.5 h-3.5 text-[hsl(var(--cf-lime))] flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
