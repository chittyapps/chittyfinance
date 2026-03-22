import { AlertCircle, Clock, DollarSign } from 'lucide-react';
import type { Property } from '@/hooks/use-property';
import { usePropertyRentRoll, usePropertyLeases } from '@/hooks/use-property';
import { formatCurrency, formatDate } from '@/lib/utils';

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  paid: { bg: 'hsl(var(--cf-emerald) / 0.1)', text: 'hsl(var(--cf-emerald))' },
  partial: { bg: 'hsl(var(--cf-amber) / 0.1)', text: 'hsl(var(--cf-amber))' },
  overdue: { bg: 'hsl(var(--cf-rose) / 0.1)', text: 'hsl(var(--cf-rose))' },
  vacant: { bg: 'hsl(var(--cf-overlay))', text: 'hsl(var(--cf-text-muted))' },
};

function PropertyRentRollRows({ property }: { property: Property }) {
  const { data: rentRoll = [] } = usePropertyRentRoll(property.id);

  return (
    <>
      {rentRoll.map((entry) => {
        const style = STATUS_STYLES[entry.status] ?? STATUS_STYLES.vacant;
        return (
          <tr key={`${property.id}-${entry.unitId}`} className="border-b border-[hsl(var(--cf-border-subtle))] hover:bg-[hsl(var(--cf-raised))] transition-colors">
            <td className="px-3 py-2 text-xs font-medium text-[hsl(var(--cf-text))]">{property.name}</td>
            <td className="px-3 py-2 text-xs text-[hsl(var(--cf-text-secondary))] font-mono">{entry.unitNumber}</td>
            <td className="px-3 py-2 text-xs text-[hsl(var(--cf-text-secondary))]">{entry.tenantName || '\u2014'}</td>
            <td className="px-3 py-2 text-xs text-right font-mono text-[hsl(var(--cf-text))]">{formatCurrency(entry.expectedRent)}</td>
            <td className="px-3 py-2 text-xs text-right font-mono text-[hsl(var(--cf-text))]">{formatCurrency(entry.actualPaid)}</td>
            <td className="px-3 py-2">
              <span
                className="inline-flex px-1.5 py-0.5 rounded-sm text-[10px] font-semibold uppercase tracking-wider"
                style={{ background: style.bg, color: style.text, border: `1px solid ${style.text}20` }}
              >
                {entry.status}
              </span>
            </td>
            <td className="px-3 py-2 text-xs text-[hsl(var(--cf-text-muted))] font-mono">
              {entry.leaseEnd ? formatDate(entry.leaseEnd) : '\u2014'}
            </td>
          </tr>
        );
      })}
    </>
  );
}

function PropertyLeaseExpirations({ property }: { property: Property }) {
  const { data: leases = [] } = usePropertyLeases(property.id);
  const now = Date.now();

  const expiring = leases
    .filter((l) => l.status === 'active')
    .map((l) => ({ ...l, daysLeft: Math.ceil((new Date(l.endDate).getTime() - now) / 86400000) }))
    .filter((l) => l.daysLeft <= 90 && l.daysLeft > 0)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  if (expiring.length === 0) return null;

  return (
    <>
      {expiring.map((l) => {
        const urgency =
          l.daysLeft <= 30
            ? 'var(--cf-rose)'
            : l.daysLeft <= 60
              ? 'var(--cf-amber)'
              : 'var(--cf-lime-dim)';
        return (
          <div
            key={l.id}
            className="flex items-center justify-between py-2.5 border-b border-[hsl(var(--cf-border-subtle))] last:border-b-0"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[hsl(var(--cf-text))]">{l.tenantName}</span>
              <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">@ {property.name}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3" style={{ color: `hsl(${urgency})` }} />
              <span className="text-xs font-mono font-medium" style={{ color: `hsl(${urgency})` }}>
                {l.daysLeft}d
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}

export default function OpsView({ properties }: { properties: Property[] }) {
  const active = properties.filter((p) => p.isActive);

  return (
    <div className="space-y-6">
      {/* Rent Collection */}
      <div className="cf-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[hsl(var(--cf-border-subtle))]">
          <DollarSign className="w-4 h-4 text-[hsl(var(--cf-lime))]" />
          <span className="text-sm font-display font-semibold text-[hsl(var(--cf-text))]">Rent Collection Status</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[hsl(var(--cf-border-subtle))] text-[hsl(var(--cf-text-muted))]">
                <th className="text-left px-3 py-2 font-medium">Property</th>
                <th className="text-left px-3 py-2 font-medium">Unit</th>
                <th className="text-left px-3 py-2 font-medium">Tenant</th>
                <th className="text-right px-3 py-2 font-medium">Expected</th>
                <th className="text-right px-3 py-2 font-medium">Paid</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Lease Ends</th>
              </tr>
            </thead>
            <tbody>
              {active.map((p) => (
                <PropertyRentRollRows key={p.id} property={p} />
              ))}
              {active.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-[hsl(var(--cf-text-muted))]">
                    No active properties
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lease Expirations */}
      <div className="cf-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[hsl(var(--cf-border-subtle))]">
          <Clock className="w-4 h-4 text-[hsl(var(--cf-amber))]" />
          <span className="text-sm font-display font-semibold text-[hsl(var(--cf-text))]">Upcoming Lease Expirations</span>
          <span className="text-[10px] text-[hsl(var(--cf-text-muted))] ml-auto font-mono">90-day window</span>
        </div>
        <div className="p-4">
          {active.map((p) => (
            <PropertyLeaseExpirations key={p.id} property={p} />
          ))}
          {active.length === 0 && (
            <p className="text-xs text-[hsl(var(--cf-text-muted))] text-center py-6">No active properties</p>
          )}
        </div>
      </div>
    </div>
  );
}
