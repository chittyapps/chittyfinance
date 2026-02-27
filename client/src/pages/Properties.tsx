import { useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Home, Plus } from 'lucide-react';
import { useTenantId } from '@/contexts/TenantContext';
import { useProperties } from '@/hooks/use-property';
import type { PropertyFinancials } from '@/hooks/use-property';
import PortfolioSummary from '@/components/property/PortfolioSummary';
import PropertyCard from '@/components/property/PropertyCard';
import OpsView from '@/components/property/OpsView';
import AddPropertyDialog from '@/components/property/AddPropertyDialog';
import PropertyDetailPanel from '@/components/property/PropertyDetailPanel';

type SortKey = 'name' | 'value' | 'capRate' | 'occupancy';

export default function Properties() {
  const tenantId = useTenantId();
  const { data: properties = [], isLoading } = useProperties();
  const [sortBy, setSortBy] = useState<SortKey>('value');
  const [financialsMap] = useState<Map<string, PropertyFinancials>>(new Map());
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  const active = useMemo(() => properties.filter(p => p.isActive), [properties]);

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
      <div className="p-8">
        <p className="text-muted-foreground">Select a tenant to view properties</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Property Portfolio</h1>
          <p className="text-muted-foreground">
            {active.length} active propert{active.length === 1 ? 'y' : 'ies'}
          </p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Property
        </Button>
      </div>

      <Tabs defaultValue="portfolio">
        <TabsList>
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
        </TabsList>

        <TabsContent value="portfolio" className="space-y-6 mt-4">
          {/* KPI Strip */}
          <PortfolioSummary properties={properties} financials={financialsMap} />

          {/* Sort control */}
          <div className="flex justify-end">
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="value">Value (high to low)</SelectItem>
                <SelectItem value="name">Name (A-Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Property cards grid */}
          {sorted.length === 0 ? (
            <div className="text-center py-12">
              <Home className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Properties</h3>
              <p className="text-muted-foreground mb-4">Add your first property to get started.</p>
              <Button onClick={() => setAddDialogOpen(true)}>Add Your First Property</Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {sorted.map(p => (
                <PropertyCard key={p.id} property={p} onSelect={setSelectedPropertyId} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="operations" className="mt-4">
          <OpsView properties={properties} />
        </TabsContent>
      </Tabs>

      {/* Add Property Dialog */}
      <AddPropertyDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />

      {/* Property Detail Side Panel */}
      <PropertyDetailPanel
        propertyId={selectedPropertyId}
        onClose={() => setSelectedPropertyId(null)}
      />
    </div>
  );
}
