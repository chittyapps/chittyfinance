/**
 * Properties Dashboard - Property Portfolio Management
 *
 * Shows all properties for the current tenant with key metrics:
 * - Property list with occupancy status
 * - Revenue and expense summaries
 * - Lease expiration tracking
 * - Rent roll overview
 */

import { useQuery } from '@tanstack/react-query';
import { useTenantId } from '@/contexts/TenantContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Home, DollarSign, Users, Calendar, TrendingUp, AlertCircle } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

interface Property {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  propertyType: string;
  purchasePrice: string;
  currentValue: string;
  isActive: boolean;
}

interface Unit {
  id: string;
  unitNumber: string;
  bedrooms: number;
  bathrooms: string;
  squareFeet: number;
  monthlyRent: string;
  isActive: boolean;
}

interface Lease {
  id: string;
  tenantName: string;
  startDate: string;
  endDate: string;
  monthlyRent: string;
  status: string;
}

export default function Properties() {
  const tenantId = useTenantId();

  const { data: properties = [], isLoading } = useQuery<Property[]>({
    queryKey: ['/api/properties', tenantId],
    enabled: !!tenantId,
  });

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="text-muted-foreground">Loading properties...</div>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="p-8">
        <div className="text-muted-foreground">
          Select a tenant to view properties
        </div>
      </div>
    );
  }

  const activeProperties = properties.filter(p => p.isActive);
  const totalValue = activeProperties.reduce((sum, p) => sum + parseFloat(p.currentValue || '0'), 0);
  const totalPurchasePrice = activeProperties.reduce((sum, p) => sum + parseFloat(p.purchasePrice || '0'), 0);
  const totalEquity = totalValue - totalPurchasePrice;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Property Portfolio</h1>
          <p className="text-muted-foreground">
            Manage your real estate investments
          </p>
        </div>
        <Button>
          <Home className="mr-2 h-4 w-4" />
          Add Property
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Properties</CardTitle>
            <Home className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeProperties.length}</div>
            <p className="text-xs text-muted-foreground">
              {properties.length - activeProperties.length} inactive
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
            <p className="text-xs text-muted-foreground">
              Current market value
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Equity</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalEquity)}</div>
            <p className="text-xs text-muted-foreground">
              Value - purchase price
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Occupancy Rate</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--%</div>
            <p className="text-xs text-muted-foreground">
              Lease data loading...
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Property List */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Properties</h2>

        {activeProperties.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Home className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Properties</h3>
              <p className="text-muted-foreground text-center mb-4">
                Get started by adding your first property to track.
              </p>
              <Button>Add Your First Property</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeProperties.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PropertyCard({ property }: { property: Property }) {
  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: [`/api/properties/${property.id}/units`],
  });

  const { data: leases = [] } = useQuery<Lease[]>({
    queryKey: [`/api/properties/${property.id}/leases`],
  });

  const totalUnits = units.length;
  const occupiedUnits = leases.filter(l => l.status === 'active').length;
  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
  const monthlyRent = units.reduce((sum, u) => sum + parseFloat(u.monthlyRent || '0'), 0);

  const upcomingLeaseExpiration = leases
    .filter(l => l.status === 'active')
    .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())[0];

  const daysUntilExpiration = upcomingLeaseExpiration
    ? Math.ceil((new Date(upcomingLeaseExpiration.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{property.name}</CardTitle>
            <CardDescription className="text-sm">
              {property.address}, {property.city}
            </CardDescription>
          </div>
          <Badge variant={property.isActive ? 'default' : 'secondary'}>
            {property.isActive ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Property Type</span>
            <span className="font-medium capitalize">{property.propertyType}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Current Value</span>
            <span className="font-medium">{formatCurrency(parseFloat(property.currentValue || '0'))}</span>
          </div>
          {totalUnits > 0 && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Units</span>
                <span className="font-medium">{totalUnits}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Occupancy</span>
                <span className="font-medium">{occupancyRate}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Monthly Rent</span>
                <span className="font-medium">{formatCurrency(monthlyRent)}</span>
              </div>
            </>
          )}
        </div>

        {daysUntilExpiration !== null && daysUntilExpiration < 90 && (
          <div className="flex items-center gap-2 p-2 bg-orange-50 dark:bg-orange-950 rounded-md">
            <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            <span className="text-xs text-orange-600 dark:text-orange-400">
              Lease expires in {daysUntilExpiration} days
            </span>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" className="flex-1">
            View Details
          </Button>
          <Button variant="outline" size="sm" className="flex-1">
            Manage Leases
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
