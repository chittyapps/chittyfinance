import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp, BarChart3, Users } from 'lucide-react';
import type { Property, PropertyFinancials } from '@/hooks/use-property';
import { formatCurrency } from '@/lib/utils';

interface Props {
  properties: Property[];
  financials: Map<string, PropertyFinancials>;
}

export default function PortfolioSummary({ properties, financials }: Props) {
  const active = properties.filter(p => p.isActive);

  const totalValue = active.reduce((s, p) => s + parseFloat(p.currentValue || '0'), 0);

  let capWeightedSum = 0;
  let capWeightDenom = 0;
  let totalNOI = 0;
  let totalUnits = 0;
  let occupiedUnits = 0;

  for (const p of active) {
    const f = financials.get(p.id);
    const val = parseFloat(p.currentValue || '0');
    if (f) {
      capWeightedSum += f.capRate * val;
      capWeightDenom += val;
      totalNOI += f.noi;
      totalUnits += f.totalUnits;
      occupiedUnits += f.occupiedUnits;
    }
  }

  const avgCapRate = capWeightDenom > 0 ? capWeightedSum / capWeightDenom : 0;
  const avgOccupancy = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

  const metrics = [
    { label: 'Portfolio Value', value: formatCurrency(totalValue), icon: DollarSign, sub: `${active.length} properties` },
    { label: 'Avg Cap Rate', value: `${avgCapRate.toFixed(1)}%`, icon: TrendingUp, sub: 'Weighted by value' },
    { label: 'Portfolio NOI', value: formatCurrency(totalNOI), icon: BarChart3, sub: 'Last 12 months' },
    { label: 'Occupancy', value: `${avgOccupancy.toFixed(0)}%`, icon: Users, sub: `${occupiedUnits}/${totalUnits} units` },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {metrics.map((m) => (
        <Card key={m.label}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{m.label}</CardTitle>
            <m.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{m.value}</div>
            <p className="text-xs text-muted-foreground">{m.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
