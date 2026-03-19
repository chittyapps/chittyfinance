import { useLocation } from 'wouter';
import { AlertCircle, ArrowUpRight, ChevronRight, Home, MapPin } from 'lucide-react';
import { usePropertyUnits, usePropertyLeases, usePropertyFinancials } from '@/hooks/use-property';
import type { Property } from '@/hooks/use-property';
import { formatCurrency } from '@/lib/utils';

interface Props {
  property: Property;
  onSelect?: (id: string) => void;
}

const TYPE_COLOR: Record<string, string> = {
  residential: 'var(--cf-cyan)',
  commercial: 'var(--cf-violet)',
  mixed: 'var(--cf-amber)',
  land: 'var(--cf-emerald)',
};

export default function PropertyCard({ property, onSelect }: Props) {
  const [, navigate] = useLocation();
  const { data: units = [] } = usePropertyUnits(property.id);
  const { data: leases = [] } = usePropertyLeases(property.id);
  const { data: financials } = usePropertyFinancials(property.id);

  const activeLeases = leases.filter((l) => l.status === 'active');
  const occupancyRate = units.length > 0
    ? Math.round((activeLeases.length / units.length) * 100)
    : 0;

  const soonestExpiry = activeLeases
    .map((l) => ({ name: l.tenantName, days: Math.ceil((new Date(l.endDate).getTime() - Date.now()) / 86400000) }))
    .filter((l) => l.days < 90)
    .sort((a, b) => a.days - b.days)[0];

  const color = TYPE_COLOR[property.propertyType] ?? 'var(--cf-lime)';
  const occColor = occupancyRate >= 90
    ? 'var(--cf-emerald)'
    : occupancyRate >= 60
      ? 'var(--cf-amber)'
      : 'var(--cf-rose)';

  const handleClick = () => {
    if (onSelect) onSelect(property.id);
    else navigate(`/properties/${property.id}`);
  };

  return (
    <div
      className="cf-card cursor-pointer group"
      onClick={handleClick}
    >
      {/* Color accent top line */}
      <div
        className="h-px w-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: `linear-gradient(90deg, transparent, hsl(${color} / 0.5), transparent)` }}
      />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Home className="w-3.5 h-3.5 flex-shrink-0" style={{ color: `hsl(${color})` }} />
              <h3 className="text-sm font-display font-semibold text-[hsl(var(--cf-text))] truncate">{property.name}</h3>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--cf-text-muted))]">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{property.address}, {property.city} {property.state}</span>
            </div>
          </div>
          <span
            className="px-1.5 py-0.5 rounded-sm text-[10px] font-semibold uppercase tracking-wider flex-shrink-0"
            style={{
              background: `hsl(${color} / 0.1)`,
              color: `hsl(${color})`,
              border: `1px solid hsl(${color} / 0.2)`,
            }}
          >
            {property.propertyType}
          </span>
        </div>

        {/* Valuation */}
        <div className="mt-3">
          <p className="text-xl font-financial font-bold text-[hsl(var(--cf-text))]">
            {formatCurrency(parseFloat(property.currentValue || '0'))}
          </p>
          <p className="text-[10px] text-[hsl(var(--cf-text-muted))] font-mono mt-0.5">
            Purchase: {formatCurrency(parseFloat(property.purchasePrice || '0'))}
          </p>
        </div>

        {/* Financial metrics */}
        {financials && (
          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-[hsl(var(--cf-border-subtle))]">
            <div>
              <p className="text-sm font-financial font-medium text-[hsl(var(--cf-emerald))]">
                {formatCurrency(financials.noi)}
              </p>
              <p className="text-[10px] text-[hsl(var(--cf-text-muted))]">NOI</p>
            </div>
            <div>
              <p className="text-sm font-financial font-medium text-[hsl(var(--cf-text))]">
                {financials.capRate.toFixed(1)}%
              </p>
              <p className="text-[10px] text-[hsl(var(--cf-text-muted))]">Cap Rate</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: `hsl(${occColor})`,
                    boxShadow: `0 0 4px hsl(${occColor} / 0.5)`,
                  }}
                />
                <p className="text-sm font-financial font-medium text-[hsl(var(--cf-text))]">
                  {occupancyRate}%
                </p>
              </div>
              <p className="text-[10px] text-[hsl(var(--cf-text-muted))]">Occupancy</p>
            </div>
          </div>
        )}

        {/* Unit/lease summary */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[hsl(var(--cf-border-subtle))]">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-[hsl(var(--cf-text-muted))] font-mono">
              {units.length} unit{units.length !== 1 ? 's' : ''}
            </span>
            <span className="text-[10px] text-[hsl(var(--cf-text-muted))] font-mono">
              {activeLeases.length} active lease{activeLeases.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/properties/${property.id}`); }}
            className="flex items-center gap-0.5 text-[11px] text-[hsl(var(--cf-lime))] hover:text-[hsl(var(--cf-lime-bright))] transition-colors"
          >
            Detail <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        {/* Lease expiration warning */}
        {soonestExpiry && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-[hsl(var(--cf-amber)/0.06)] border border-[hsl(var(--cf-amber)/0.12)]">
            <AlertCircle className="w-3.5 h-3.5 text-[hsl(var(--cf-amber))] flex-shrink-0" />
            <span className="text-[11px] text-[hsl(var(--cf-amber))]">
              {soonestExpiry.name}'s lease expires in {soonestExpiry.days} days
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
