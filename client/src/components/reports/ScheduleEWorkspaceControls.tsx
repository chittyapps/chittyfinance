import { formatCurrency } from '@/lib/utils';
import { Building2, Filter, Users } from 'lucide-react';

export interface WorkspaceState {
  taxYear: number;
  selectedPropertyIds: Set<string>;
  selectedTenantIds: Set<string>;
}

interface PropertyOption {
  propertyId: string;
  propertyName: string;
  address: string;
  tenantName: string;
}

interface EntityOption {
  tenantId: string;
  tenantName: string;
  tenantType: string;
}

interface ScheduleEWorkspaceControlsProps {
  state: WorkspaceState;
  onChange: (state: WorkspaceState) => void;
  availableProperties: PropertyOption[];
  availableEntities: EntityOption[];
  netIncome: number | null;
  isLoading: boolean;
}

function toggleInSet(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export default function ScheduleEWorkspaceControls({
  state,
  onChange,
  availableProperties,
  availableEntities,
  netIncome,
  isLoading,
}: ScheduleEWorkspaceControlsProps) {
  const hasPropertyFilter = state.selectedPropertyIds.size > 0;
  const hasEntityFilter = state.selectedTenantIds.size > 0;
  const hasAnyFilter = hasPropertyFilter || hasEntityFilter;

  function setYear(year: number) {
    onChange({ ...state, taxYear: year });
  }

  function toggleProperty(id: string) {
    onChange({ ...state, selectedPropertyIds: toggleInSet(state.selectedPropertyIds, id) });
  }

  function toggleEntity(id: string) {
    onChange({ ...state, selectedTenantIds: toggleInSet(state.selectedTenantIds, id) });
  }

  function clearFilters() {
    onChange({ ...state, selectedPropertyIds: new Set(), selectedTenantIds: new Set() });
  }

  function selectAllProperties() {
    onChange({ ...state, selectedPropertyIds: new Set(availableProperties.map((p) => p.propertyId)) });
  }

  function selectAllEntities() {
    onChange({ ...state, selectedTenantIds: new Set(availableEntities.map((e) => e.tenantId)) });
  }

  return (
    <div className="cf-card p-4 space-y-4">
      {/* Header row: year + net income + clear */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Filter className="w-3.5 h-3.5 text-[hsl(var(--cf-text-muted))]" />
          <h3 className="text-sm font-display font-semibold text-[hsl(var(--cf-text))]">Tax Workspace</h3>
          <select
            value={state.taxYear}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-2 py-1 text-xs bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border))] rounded text-[hsl(var(--cf-text))] font-mono"
          >
            {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          {hasAnyFilter && (
            <button
              onClick={clearFilters}
              className="text-[10px] text-[hsl(var(--cf-lime))] hover:underline"
            >
              Clear filters
            </button>
          )}
          <div className={`text-sm font-mono font-bold ${
            isLoading ? 'text-[hsl(var(--cf-text-muted))]' :
            (netIncome ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {isLoading ? '...' : netIncome !== null ? `Net: ${formatCurrency(netIncome)}` : ''}
          </div>
        </div>
      </div>

      {/* Filter panels */}
      <div className="grid grid-cols-2 gap-4">
        {/* Properties */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3 h-3 text-[hsl(var(--cf-text-muted))]" />
              <span className="text-xs font-medium text-[hsl(var(--cf-text))]">
                Properties
                {hasPropertyFilter && (
                  <span className="ml-1 text-[hsl(var(--cf-lime))]">
                    ({state.selectedPropertyIds.size}/{availableProperties.length})
                  </span>
                )}
              </span>
            </div>
            <div className="flex gap-2">
              <button onClick={selectAllProperties} className="text-[10px] text-[hsl(var(--cf-text-muted))] hover:text-[hsl(var(--cf-text))]">All</button>
              <button onClick={() => onChange({ ...state, selectedPropertyIds: new Set() })} className="text-[10px] text-[hsl(var(--cf-text-muted))] hover:text-[hsl(var(--cf-text))]">None</button>
            </div>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {availableProperties.map((p) => {
              const included = !hasPropertyFilter || state.selectedPropertyIds.has(p.propertyId);
              return (
                <label
                  key={p.propertyId}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                    included ? 'bg-[hsl(var(--cf-raised))]' : 'opacity-50'
                  } hover:bg-[hsl(var(--cf-raised))]`}
                >
                  <input
                    type="checkbox"
                    checked={included}
                    onChange={() => toggleProperty(p.propertyId)}
                    className="rounded border-[hsl(var(--cf-border))] w-3 h-3"
                  />
                  <div className="min-w-0">
                    <div className="text-xs text-[hsl(var(--cf-text))] truncate">{p.propertyName}</div>
                    <div className="text-[10px] text-[hsl(var(--cf-text-muted))] truncate">{p.address}</div>
                  </div>
                </label>
              );
            })}
            {availableProperties.length === 0 && (
              <div className="text-[10px] text-[hsl(var(--cf-text-muted))] px-2 py-3">No properties found</div>
            )}
          </div>
        </div>

        {/* Entities */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Users className="w-3 h-3 text-[hsl(var(--cf-text-muted))]" />
              <span className="text-xs font-medium text-[hsl(var(--cf-text))]">
                Entities
                {hasEntityFilter && (
                  <span className="ml-1 text-[hsl(var(--cf-lime))]">
                    ({state.selectedTenantIds.size}/{availableEntities.length})
                  </span>
                )}
              </span>
            </div>
            <div className="flex gap-2">
              <button onClick={selectAllEntities} className="text-[10px] text-[hsl(var(--cf-text-muted))] hover:text-[hsl(var(--cf-text))]">All</button>
              <button onClick={() => onChange({ ...state, selectedTenantIds: new Set() })} className="text-[10px] text-[hsl(var(--cf-text-muted))] hover:text-[hsl(var(--cf-text))]">None</button>
            </div>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {availableEntities.map((e) => {
              const included = !hasEntityFilter || state.selectedTenantIds.has(e.tenantId);
              return (
                <label
                  key={e.tenantId}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                    included ? 'bg-[hsl(var(--cf-raised))]' : 'opacity-50'
                  } hover:bg-[hsl(var(--cf-raised))]`}
                >
                  <input
                    type="checkbox"
                    checked={included}
                    onChange={() => toggleEntity(e.tenantId)}
                    className="rounded border-[hsl(var(--cf-border))] w-3 h-3"
                  />
                  <div className="min-w-0">
                    <div className="text-xs text-[hsl(var(--cf-text))] truncate">{e.tenantName}</div>
                    <div className="text-[10px] text-[hsl(var(--cf-text-muted))]">{e.tenantType}</div>
                  </div>
                </label>
              );
            })}
            {availableEntities.length === 0 && (
              <div className="text-[10px] text-[hsl(var(--cf-text-muted))] px-2 py-3">No entities found</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
