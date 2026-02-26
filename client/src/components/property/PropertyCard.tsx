import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import { usePropertyUnits, usePropertyLeases, usePropertyFinancials } from '@/hooks/use-property';
import type { Property } from '@/hooks/use-property';
import { formatCurrency } from '@/lib/utils';

interface Props {
  property: Property;
}

export default function PropertyCard({ property }: Props) {
  const [, navigate] = useLocation();
  const { data: units = [] } = usePropertyUnits(property.id);
  const { data: leases = [] } = usePropertyLeases(property.id);
  const { data: financials } = usePropertyFinancials(property.id);

  const activeLeases = leases.filter(l => l.status === 'active');
  const occupancyRate = units.length > 0
    ? Math.round((activeLeases.length / units.length) * 100)
    : 0;

  const soonestExpiry = activeLeases
    .map(l => ({ name: l.tenantName, days: Math.ceil((new Date(l.endDate).getTime() - Date.now()) / 86400000) }))
    .filter(l => l.days < 90)
    .sort((a, b) => a.days - b.days)[0];

  const occColor = occupancyRate >= 90 ? 'bg-green-500' : occupancyRate >= 60 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate(`/properties/${property.id}`)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{property.name}</CardTitle>
            <CardDescription>{property.address}, {property.city} {property.state}</CardDescription>
          </div>
          <Badge variant="outline" className="capitalize">{property.propertyType}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-2xl font-bold">{formatCurrency(parseFloat(property.currentValue || '0'))}</div>
        <p className="text-xs text-muted-foreground">
          Purchase: {formatCurrency(parseFloat(property.purchasePrice || '0'))}
        </p>

        {financials && (
          <div className="grid grid-cols-3 gap-2 pt-2 border-t">
            <div className="text-center">
              <div className="text-sm font-semibold">{formatCurrency(financials.noi)}</div>
              <div className="text-xs text-muted-foreground">NOI</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold">{financials.capRate.toFixed(1)}%</div>
              <div className="text-xs text-muted-foreground">Cap Rate</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <span className={`w-2 h-2 rounded-full ${occColor}`} />
                <span className="text-sm font-semibold">{occupancyRate}%</span>
              </div>
              <div className="text-xs text-muted-foreground">Occupancy</div>
            </div>
          </div>
        )}

        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{units.length} unit{units.length !== 1 ? 's' : ''}</span>
          <span>{activeLeases.length} active lease{activeLeases.length !== 1 ? 's' : ''}</span>
        </div>

        {soonestExpiry && (
          <div className="flex items-center gap-2 p-2 bg-orange-50 dark:bg-orange-950 rounded-md">
            <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400 shrink-0" />
            <span className="text-xs text-orange-600 dark:text-orange-400">
              {soonestExpiry.name}'s lease expires in {soonestExpiry.days} days
            </span>
          </div>
        )}

        <Button variant="outline" size="sm" className="w-full" onClick={(e) => { e.stopPropagation(); navigate(`/properties/${property.id}`); }}>
          View Details
        </Button>
      </CardContent>
    </Card>
  );
}
