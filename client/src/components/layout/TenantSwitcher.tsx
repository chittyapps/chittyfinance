import { useTenant, type Tenant } from '@/contexts/TenantContext';
import { Check, ChevronDown, Layers, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

/* ─── Type Colors ─── */

const TYPE_DOT: Record<string, string> = {
  holding: 'bg-lime-400',
  personal: 'bg-violet-400',
  series: 'bg-cyan-400',
  management: 'bg-amber-400',
  property: 'bg-emerald-400',
  brand: 'bg-rose-400',
  vendor: 'bg-orange-400',
};

const ROLE_BADGE: Record<string, string> = {
  owner: 'text-lime-400 bg-lime-400/10',
  admin: 'text-cyan-400 bg-cyan-400/10',
  manager: 'text-amber-400 bg-amber-400/10',
  viewer: 'text-zinc-400 bg-zinc-400/10',
};

function typeDot(type: string) {
  return TYPE_DOT[type] || 'bg-zinc-400';
}

function shortName(name: string) {
  return name.replace(/\s*LLC\s*/gi, '').replace(/^ARIBIA\s*-\s*/i, '').trim() || name;
}

/* ─── Hierarchy Helpers ─── */

function depthOrderedTenants(tenants: Tenant[]): { tenant: Tenant; depth: number }[] {
  const childrenOf = new Map<string | undefined, Tenant[]>();
  for (const t of tenants) {
    const key = t.parentId ?? undefined;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(t);
  }
  const result: { tenant: Tenant; depth: number }[] = [];
  function visit(parentId: string | undefined, depth: number) {
    for (const t of childrenOf.get(parentId) ?? []) {
      result.push({ tenant: t, depth });
      visit(t.id, depth + 1);
    }
  }
  visit(undefined, 0);
  return result;
}

/* ─── Component ─── */

export function TenantSwitcher() {
  const { currentTenant, tenants, isLoading, switchTenant, isSystemMode, consolidatedMode } = useTenant();
  const [open, setOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const ordered = useMemo(() => depthOrderedTenants(tenants), [tenants]);

  if (!isSystemMode || isLoading || tenants.length === 0) {
    return null;
  }

  const handleSelect = (tenant: Tenant | null) => {
    setIsSwitching(true);
    switchTenant(tenant);
    setOpen(false);
    setTimeout(() => setIsSwitching(false), 600);
  };

  const triggerLabel = consolidatedMode
    ? 'Portfolio'
    : shortName(currentTenant?.name || 'Select Entity');

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-[hsl(var(--cf-raised))] transition-colors"
      >
        {consolidatedMode ? (
          <Layers className="w-3.5 h-3.5 text-[hsl(var(--cf-lime))] flex-shrink-0" />
        ) : (
          <span className={cn('w-2 h-2 rounded-full flex-shrink-0', typeDot(currentTenant?.type || ''))} />
        )}
        <span className={cn(
          'text-sm font-display font-medium truncate max-w-[200px]',
          consolidatedMode ? 'text-[hsl(var(--cf-lime))]' : 'text-[hsl(var(--cf-text))]'
        )}>
          {triggerLabel}
        </span>
        {currentTenant?.role && !consolidatedMode && (
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', ROLE_BADGE[currentTenant.role] || ROLE_BADGE.viewer)}>
            {currentTenant.role}
          </span>
        )}
        {isSwitching ? (
          <Loader2 className="w-3 h-3 text-[hsl(var(--cf-text-muted))] animate-spin" />
        ) : (
          <ChevronDown className={cn(
            'w-3 h-3 text-[hsl(var(--cf-text-muted))] transition-transform',
            open && 'rotate-180'
          )} />
        )}
      </button>

      {/* Flyout */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            className="absolute top-full left-0 mt-1 z-50 w-80 bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border))] rounded-md shadow-xl overflow-hidden"
          >
            {/* Header */}
            <div className="px-3 py-2 border-b border-[hsl(var(--cf-border-subtle))] flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--cf-text-muted))]">
                Switch Entity
              </span>
            </div>

            {/* Portfolio (consolidated) option */}
            <button
              role="option"
              aria-selected={consolidatedMode}
              onClick={() => handleSelect(null)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors border-b border-[hsl(var(--cf-border-subtle))]',
                consolidatedMode
                  ? 'bg-[hsl(var(--cf-lime)/0.08)]'
                  : 'hover:bg-[hsl(var(--cf-overlay))]'
              )}
            >
              <Layers className="w-3.5 h-3.5 text-[hsl(var(--cf-lime))] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-[hsl(var(--cf-text))] block">Portfolio</span>
                <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">All entities consolidated</span>
              </div>
              {consolidatedMode && (
                <Check className="w-3.5 h-3.5 text-[hsl(var(--cf-lime))] flex-shrink-0" />
              )}
            </button>

            {/* Entity list */}
            <div className="max-h-[320px] overflow-y-auto cf-scrollbar py-1">
              {ordered.map(({ tenant, depth }) => {
                const isActive = currentTenant?.id === tenant.id;
                return (
                  <button
                    key={tenant.id}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => handleSelect(tenant)}
                    className={cn(
                      'w-full flex items-center gap-2 py-2 pr-3 text-left transition-colors',
                      isActive
                        ? 'bg-[hsl(var(--cf-lime)/0.08)]'
                        : 'hover:bg-[hsl(var(--cf-overlay))]'
                    )}
                    style={{ paddingLeft: `${depth * 12 + 12}px` }}
                  >
                    <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', typeDot(tenant.type))} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-[hsl(var(--cf-text))] truncate block">
                        {shortName(tenant.name)}
                      </span>
                      <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">
                        {tenant.type}
                      </span>
                    </div>
                    {tenant.role && (
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0', ROLE_BADGE[tenant.role] || ROLE_BADGE.viewer)}>
                        {tenant.role}
                      </span>
                    )}
                    {isActive && (
                      <Check className="w-3.5 h-3.5 text-[hsl(var(--cf-lime))] flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
