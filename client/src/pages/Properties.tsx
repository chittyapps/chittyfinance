import { useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Building2, DollarSign, TrendingUp, BarChart3, Users, Plus,
  ArrowUpDown, LayoutGrid, List,
} from 'lucide-react';
import { useTenantId } from '@/contexts/TenantContext';
import { useProperties, usePortfolioSummary } from '@/hooks/use-property';
import PropertyCard from '@/components/property/PropertyCard';
import OpsView from '@/components/property/OpsView';
import AddPropertyDialog from '@/components/property/AddPropertyDialog';
import PropertyDetailPanel from '@/components/property/PropertyDetailPanel';
import { formatCurrency } from '@/lib/utils';

type SortKey = 'name' | 'value';
type ViewTab = 'portfolio' | 'operations';

function MetricTile({
  label,
  value,
  sub,
  icon: Icon,
  color,
  delay,
}: {
  label: string;
  value: string;
  sub: string;
  icon: typeof DollarSign;
  color: string;
  delay: number;
}) {
  return (
    <div className="cf-card px-4 py-4 animate-slide-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center"
          style={{
            background: `hsl(${color} / 0.08)`,
            border: `1px solid hsl(${color} / 0.15)`,
          }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color: `hsl(${color})` }} />
        </div>
        <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-xl font-financial font-bold text-[hsl(var(--cf-text))]">{value}</p>
      <p className="text-[10px] text-[hsl(var(--cf-text-muted))] mt-0.5">{sub}</p>
    </div>
  );
}

export default function Properties() {
  const tenantId = useTenantId();
  const { data: properties = [], isLoading } = useProperties();
  const { data: portfolio } = usePortfolioSummary();
  const [sortBy, setSortBy] = useState<SortKey>('value');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [view, setView] = useState<ViewTab>('portfolio');

  const active = useMemo(() => properties.filter((p) => p.isActive), [properties]);

  const sorted = useMemo(() => {
    const arr = [...active];
    switch (sortBy) {
      case 'value':
        return arr.sort((a, b) => parseFloat(b.currentValue || '0') - parseFloat(a.currentValue || '0'));
      case 'name':
        return arr.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return arr;
    }
  }, [active, sortBy]);

  if (!tenantId) {
    return (
      <div className="p-6 lg:p-8">
        <div className="cf-card p-12 text-center">
          <Building2 className="w-8 h-8 text-[hsl(var(--cf-text-muted))] mx-auto mb-3" />
          <p className="text-sm text-[hsl(var(--cf-text-muted))]">Select a tenant to view the property portfolio.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <Skeleton className="h-8 w-48 bg-[hsl(var(--cf-raised))]" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 bg-[hsl(var(--cf-raised))]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1440px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 animate-slide-up">
        <div>
          <h1 className="text-2xl font-display font-semibold text-[hsl(var(--cf-text))] tracking-tight">
            Property Portfolio
          </h1>
          <p className="text-sm text-[hsl(var(--cf-text-muted))] mt-1">
            {active.length} active propert{active.length === 1 ? 'y' : 'ies'} under management
          </p>
        </div>
        <button
          onClick={() => setAddDialogOpen(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-medium bg-[hsl(var(--cf-lime))] text-black hover:bg-[hsl(var(--cf-lime-bright))] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Property
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <MetricTile
          label="Portfolio Value"
          value={portfolio ? formatCurrency(portfolio.totalValue) : '\u2014'}
          sub={`${portfolio?.totalProperties ?? 0} properties`}
          icon={DollarSign}
          color="var(--cf-lime)"
          delay={40}
        />
        <MetricTile
          label="Portfolio NOI"
          value={portfolio ? formatCurrency(portfolio.totalNOI) : '\u2014'}
          sub="Last 12 months"
          icon={BarChart3}
          color="var(--cf-emerald)"
          delay={80}
        />
        <MetricTile
          label="Avg Cap Rate"
          value={portfolio ? `${portfolio.avgCapRate.toFixed(1)}%` : '\u2014'}
          sub="Weighted by value"
          icon={TrendingUp}
          color="var(--cf-cyan)"
          delay={120}
        />
        <MetricTile
          label="Occupancy"
          value={portfolio ? `${portfolio.occupancyRate.toFixed(0)}%` : '\u2014'}
          sub={`${portfolio?.occupiedUnits ?? 0}/${portfolio?.totalUnits ?? 0} units`}
          icon={Users}
          color="var(--cf-amber)"
          delay={160}
        />
      </div>

      {/* View toggle + sort */}
      <div className="flex items-center justify-between animate-slide-up" style={{ animationDelay: '80ms' }}>
        <div className="flex items-center bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border-subtle))] rounded-md p-0.5">
          {(['portfolio', 'operations'] as ViewTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setView(tab)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                view === tab
                  ? 'bg-[hsl(var(--cf-lime)/0.1)] text-[hsl(var(--cf-lime))]'
                  : 'text-[hsl(var(--cf-text-muted))] hover:text-[hsl(var(--cf-text))]'
              }`}
            >
              {tab === 'portfolio' ? (
                <span className="flex items-center gap-1.5"><LayoutGrid className="w-3 h-3" /> Portfolio</span>
              ) : (
                <span className="flex items-center gap-1.5"><List className="w-3 h-3" /> Operations</span>
              )}
            </button>
          ))}
        </div>

        {view === 'portfolio' && (
          <button
            onClick={() => setSortBy((s) => (s === 'value' ? 'name' : 'value'))}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-[hsl(var(--cf-text-muted))] hover:text-[hsl(var(--cf-text))] hover:bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border-subtle))] transition-colors"
          >
            <ArrowUpDown className="w-3 h-3" />
            {sortBy === 'value' ? 'Value' : 'Name'}
          </button>
        )}
      </div>

      {/* Portfolio view */}
      {view === 'portfolio' && (
        <>
          {sorted.length === 0 ? (
            <div className="cf-card p-12 text-center animate-slide-up" style={{ animationDelay: '120ms' }}>
              <Building2 className="w-10 h-10 text-[hsl(var(--cf-text-muted))] mx-auto mb-4" />
              <h3 className="text-sm font-display font-semibold text-[hsl(var(--cf-text))] mb-1">No Properties</h3>
              <p className="text-xs text-[hsl(var(--cf-text-muted))] mb-4">Add your first property to start building the portfolio.</p>
              <button
                onClick={() => setAddDialogOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-[hsl(var(--cf-lime)/0.1)] text-[hsl(var(--cf-lime))] border border-[hsl(var(--cf-lime)/0.2)] hover:bg-[hsl(var(--cf-lime)/0.15)] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Your First Property
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sorted.map((p, i) => (
                <div key={p.id} className="animate-slide-up" style={{ animationDelay: `${120 + i * 30}ms` }}>
                  <PropertyCard property={p} onSelect={setSelectedPropertyId} />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Operations view */}
      {view === 'operations' && (
        <div className="animate-slide-up" style={{ animationDelay: '120ms' }}>
          <OpsView properties={properties} />
        </div>
      )}

      <AddPropertyDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />
      <PropertyDetailPanel propertyId={selectedPropertyId} onClose={() => setSelectedPropertyId(null)} />
    </div>
  );
}
