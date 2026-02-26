# Property Portfolio Hub Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the basic property list with a two-tab Portfolio Hub (investor overview + manager operations) and add a property detail page absorbing the generalized ValuationConsole.

**Architecture:** Rewrite `Properties.tsx` as a tabbed hub using shadcn Tabs. Add `PropertyDetail.tsx` as a new page with sub-tabs. Extract reusable components into `client/src/components/property/`. All data from existing backend endpoints via TanStack Query hooks.

**Tech Stack:** React 18, TypeScript, Wouter, TanStack Query, shadcn/ui (Tabs, Table, Card, Dialog, Badge, Slider, Select), Recharts (via chart.tsx), Framer Motion, Tailwind CSS with cf-* theme variables.

---

### Task 1: Data Hooks Foundation

**Files:**
- Create: `client/src/hooks/use-property.ts`

**Step 1: Create the query and mutation hooks file**

```typescript
// client/src/hooks/use-property.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useTenantId } from '@/contexts/TenantContext';

// ─── Types ───
export interface Property {
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

export interface Unit {
  id: string;
  propertyId: string;
  unitNumber: string;
  bedrooms: number;
  bathrooms: string;
  squareFeet: number;
  monthlyRent: string;
  isActive: boolean;
}

export interface Lease {
  id: string;
  unitId: string;
  tenantName: string;
  tenantEmail?: string;
  tenantPhone?: string;
  startDate: string;
  endDate: string;
  monthlyRent: string;
  securityDeposit?: string;
  status: string;
}

export interface PropertyFinancials {
  propertyId: string;
  noi: number;
  capRate: number;
  cashOnCash: number;
  occupancyRate: number;
  totalUnits: number;
  occupiedUnits: number;
  totalIncome: number;
  totalExpenses: number;
}

export interface RentRollEntry {
  unitId: string;
  unitNumber: string;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  expectedRent: number;
  actualPaid: number;
  status: 'paid' | 'partial' | 'overdue' | 'vacant';
  tenantName: string | null;
  leaseEnd: string | null;
}

export interface PnLReport {
  income: Record<string, number>;
  expenses: Record<string, number>;
  totalIncome: number;
  totalExpenses: number;
  net: number;
}

export interface ValuationData {
  property: { id: string; name: string; address: string };
  aggregated: {
    weightedEstimate: number;
    low: number;
    high: number;
    sources: number;
    estimates: Array<{
      source: string;
      estimate: number;
      low: number;
      high: number;
      confidence: number;
      fetchedAt: string;
    }>;
    errors?: string[];
  };
}

// ─── Query Hooks ───
export function useProperties() {
  const tenantId = useTenantId();
  return useQuery<Property[]>({
    queryKey: ['/api/properties', tenantId],
    enabled: !!tenantId,
  });
}

export function useProperty(id: string | undefined) {
  return useQuery<Property>({
    queryKey: [`/api/properties/${id}`],
    enabled: !!id,
  });
}

export function usePropertyUnits(propertyId: string | undefined) {
  return useQuery<Unit[]>({
    queryKey: [`/api/properties/${propertyId}/units`],
    enabled: !!propertyId,
  });
}

export function usePropertyLeases(propertyId: string | undefined) {
  return useQuery<Lease[]>({
    queryKey: [`/api/properties/${propertyId}/leases`],
    enabled: !!propertyId,
  });
}

export function usePropertyFinancials(propertyId: string | undefined) {
  return useQuery<PropertyFinancials>({
    queryKey: [`/api/properties/${propertyId}/financials`],
    enabled: !!propertyId,
  });
}

export function usePropertyRentRoll(propertyId: string | undefined) {
  return useQuery<RentRollEntry[]>({
    queryKey: [`/api/properties/${propertyId}/rent-roll`],
    enabled: !!propertyId,
  });
}

export function usePropertyPnL(propertyId: string | undefined, start: string, end: string) {
  return useQuery<PnLReport>({
    queryKey: [`/api/properties/${propertyId}/pnl?start=${start}&end=${end}`],
    enabled: !!propertyId && !!start && !!end,
  });
}

export function usePropertyValuation(propertyId: string | undefined) {
  return useQuery<ValuationData>({
    queryKey: [`/api/properties/${propertyId}/valuation`],
    enabled: !!propertyId,
  });
}

export function usePropertyValuationHistory(propertyId: string | undefined) {
  return useQuery<any[]>({
    queryKey: [`/api/properties/${propertyId}/valuation/history`],
    enabled: !!propertyId,
  });
}

// ─── Mutation Hooks ───
export function useCreateProperty() {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (data: Partial<Property>) =>
      apiRequest('POST', '/api/properties', data).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['/api/properties', tenantId] }),
  });
}

export function useUpdateProperty(id: string) {
  const qc = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (data: Partial<Property>) =>
      apiRequest('PATCH', `/api/properties/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/properties/${id}`] });
      qc.invalidateQueries({ queryKey: ['/api/properties', tenantId] });
    },
  });
}

export function useCreateUnit(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Unit>) =>
      apiRequest('POST', `/api/properties/${propertyId}/units`, data).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/properties/${propertyId}/units`] }),
  });
}

export function useCreateLease(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Lease>) =>
      apiRequest('POST', `/api/properties/${propertyId}/leases`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/properties/${propertyId}/leases`] });
      qc.invalidateQueries({ queryKey: [`/api/properties/${propertyId}/rent-roll`] });
      qc.invalidateQueries({ queryKey: [`/api/properties/${propertyId}/financials`] });
    },
  });
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project client/tsconfig.json 2>&1 | grep use-property || echo "No errors"`
Expected: No errors (or only pre-existing issues unrelated to this file)

**Step 3: Commit**

```bash
git add client/src/hooks/use-property.ts
git commit -m "feat: add property query and mutation hooks"
```

---

### Task 2: PortfolioSummary KPI Strip

**Files:**
- Create: `client/src/components/property/PortfolioSummary.tsx`

**Step 1: Create the KPI strip component**

This component takes an array of properties and their financials, and renders 4 metric cards.

```typescript
// client/src/components/property/PortfolioSummary.tsx
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

  // Weighted cap rate: sum(capRate * value) / sum(value)
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
```

**Step 2: Commit**

```bash
git add client/src/components/property/PortfolioSummary.tsx
git commit -m "feat: add PortfolioSummary KPI strip component"
```

---

### Task 3: Enhanced PropertyCard

**Files:**
- Create: `client/src/components/property/PropertyCard.tsx`

**Step 1: Create the enhanced card component**

Extracted from current `Properties.tsx` PropertyCard, enhanced with financial metrics and navigation.

```typescript
// client/src/components/property/PropertyCard.tsx
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
  onFinancialsLoaded?: (propertyId: string, financials: any) => void;
}

export default function PropertyCard({ property, onFinancialsLoaded }: Props) {
  const [, navigate] = useLocation();
  const { data: units = [] } = usePropertyUnits(property.id);
  const { data: leases = [] } = usePropertyLeases(property.id);
  const { data: financials } = usePropertyFinancials(property.id);

  const activeLeases = leases.filter(l => l.status === 'active');
  const occupancyRate = units.length > 0
    ? Math.round((activeLeases.length / units.length) * 100)
    : 0;

  // Find earliest expiring lease for warning
  const soonestExpiry = activeLeases
    .map(l => ({ name: l.tenantName, days: Math.ceil((new Date(l.endDate).getTime() - Date.now()) / 86400000) }))
    .filter(l => l.days < 90)
    .sort((a, b) => a.days - b.days)[0];

  // Occupancy indicator color
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
        {/* Value */}
        <div className="text-2xl font-bold">{formatCurrency(parseFloat(property.currentValue || '0'))}</div>
        <p className="text-xs text-muted-foreground">
          Purchase: {formatCurrency(parseFloat(property.purchasePrice || '0'))}
        </p>

        {/* Financial metrics row */}
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

        {/* Units count */}
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{units.length} unit{units.length !== 1 ? 's' : ''}</span>
          <span>{activeLeases.length} active lease{activeLeases.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Lease expiry warning */}
        {soonestExpiry && (
          <div className="flex items-center gap-2 p-2 bg-orange-50 dark:bg-orange-950 rounded-md">
            <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400 shrink-0" />
            <span className="text-xs text-orange-600 dark:text-orange-400">
              {soonestExpiry.name}'s lease expires in {soonestExpiry.days} days
            </span>
          </div>
        )}

        {/* Action */}
        <Button variant="outline" size="sm" className="w-full" onClick={(e) => { e.stopPropagation(); navigate(`/properties/${property.id}`); }}>
          View Details
        </Button>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Commit**

```bash
git add client/src/components/property/PropertyCard.tsx
git commit -m "feat: add enhanced PropertyCard with financial metrics"
```

---

### Task 4: Operations View (Rent Roll + Lease Expirations)

**Files:**
- Create: `client/src/components/property/OpsView.tsx`

**Step 1: Create the operations tab component**

Aggregates rent roll and lease data across all properties.

```typescript
// client/src/components/property/OpsView.tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Clock } from 'lucide-react';
import type { Property, RentRollEntry, Lease } from '@/hooks/use-property';
import { usePropertyRentRoll, usePropertyLeases } from '@/hooks/use-property';
import { formatCurrency, formatDate } from '@/lib/utils';

interface Props {
  properties: Property[];
}

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  partial: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  vacant: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

function PropertyRentRollRows({ property }: { property: Property }) {
  const { data: rentRoll = [] } = usePropertyRentRoll(property.id);

  return (
    <>
      {rentRoll.map((entry) => (
        <TableRow key={`${property.id}-${entry.unitId}`}>
          <TableCell className="font-medium">{property.name}</TableCell>
          <TableCell>{entry.unitNumber}</TableCell>
          <TableCell>{entry.tenantName || '—'}</TableCell>
          <TableCell className="text-right">{formatCurrency(entry.expectedRent)}</TableCell>
          <TableCell className="text-right">{formatCurrency(entry.actualPaid)}</TableCell>
          <TableCell>
            <Badge variant="outline" className={STATUS_STYLES[entry.status] || ''}>
              {entry.status}
            </Badge>
          </TableCell>
          <TableCell className="text-muted-foreground">
            {entry.leaseEnd ? formatDate(entry.leaseEnd) : '—'}
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function LeaseExpirations({ properties }: { properties: Property[] }) {
  const allLeases: Array<{ property: Property; lease: Lease; daysLeft: number }> = [];

  // This component uses individual hooks per property inside a sub-component pattern
  // to avoid rules-of-hooks issues. We collect leases via rendering.
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" />
          Upcoming Lease Expirations (90 days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {properties.map(p => (
          <PropertyLeaseExpirations key={p.id} property={p} />
        ))}
      </CardContent>
    </Card>
  );
}

function PropertyLeaseExpirations({ property }: { property: Property }) {
  const { data: leases = [] } = usePropertyLeases(property.id);
  const now = Date.now();

  const expiring = leases
    .filter(l => l.status === 'active')
    .map(l => ({ ...l, daysLeft: Math.ceil((new Date(l.endDate).getTime() - now) / 86400000) }))
    .filter(l => l.daysLeft <= 90 && l.daysLeft > 0)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  if (expiring.length === 0) return null;

  return (
    <>
      {expiring.map(l => {
        const urgency = l.daysLeft <= 30 ? 'text-red-600' : l.daysLeft <= 60 ? 'text-amber-600' : 'text-yellow-600';
        return (
          <div key={l.id} className="flex items-center justify-between py-2 border-b last:border-0">
            <div>
              <span className="font-medium">{l.tenantName}</span>
              <span className="text-muted-foreground text-sm ml-2">@ {property.name}</span>
            </div>
            <div className={`flex items-center gap-1 text-sm font-medium ${urgency}`}>
              <AlertCircle className="h-3.5 w-3.5" />
              {l.daysLeft} days
            </div>
          </div>
        );
      })}
    </>
  );
}

export default function OpsView({ properties }: Props) {
  const active = properties.filter(p => p.isActive);

  return (
    <div className="space-y-6">
      {/* Cross-property rent roll */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rent Collection Status</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Lease Ends</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.map(p => (
                <PropertyRentRollRows key={p.id} property={p} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Lease expirations */}
      <LeaseExpirations properties={active} />
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add client/src/components/property/OpsView.tsx
git commit -m "feat: add OpsView with cross-property rent roll and lease expirations"
```

---

### Task 5: Rewrite Properties.tsx as Portfolio Hub

**Files:**
- Modify: `client/src/pages/Properties.tsx` (full rewrite)

**Step 1: Rewrite Properties.tsx with two tabs**

Replace the entire file. Uses PortfolioSummary, PropertyCard, and OpsView from previous tasks.

```typescript
// client/src/pages/Properties.tsx — full rewrite
import { useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Home } from 'lucide-react';
import { useTenantId } from '@/contexts/TenantContext';
import { useProperties, usePropertyFinancials } from '@/hooks/use-property';
import type { Property, PropertyFinancials } from '@/hooks/use-property';
import PortfolioSummary from '@/components/property/PortfolioSummary';
import PropertyCard from '@/components/property/PropertyCard';
import OpsView from '@/components/property/OpsView';

type SortKey = 'name' | 'value' | 'capRate' | 'occupancy';

export default function Properties() {
  const tenantId = useTenantId();
  const { data: properties = [], isLoading } = useProperties();
  const [sortBy, setSortBy] = useState<SortKey>('value');
  const [financialsMap, setFinancialsMap] = useState<Map<string, PropertyFinancials>>(new Map());

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
        <Button>
          <Home className="mr-2 h-4 w-4" />
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
              <Button>Add Your First Property</Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {sorted.map(p => <PropertyCard key={p.id} property={p} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="operations" className="mt-4">
          <OpsView properties={properties} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

**Step 2: Verify the page renders**

Run: `npm run dev` (in standalone or system mode)
Navigate to: `http://localhost:5000/properties`
Expected: Tabs visible (Portfolio / Operations), KPI strip, property cards

**Step 3: Commit**

```bash
git add client/src/pages/Properties.tsx
git commit -m "feat: rewrite Properties as Portfolio Hub with tabs"
```

---

### Task 6: Property Detail Page — Overview Tab

**Files:**
- Create: `client/src/pages/PropertyDetail.tsx`

**Step 1: Create the detail page with Overview tab**

```typescript
// client/src/pages/PropertyDetail.tsx
import { useRoute } from 'wouter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, DollarSign, TrendingUp, Users, BarChart3 } from 'lucide-react';
import { useLocation } from 'wouter';
import {
  useProperty, usePropertyUnits, usePropertyLeases,
  usePropertyFinancials,
} from '@/hooks/use-property';
import { formatCurrency } from '@/lib/utils';
import RentRollTable from '@/components/property/RentRollTable';
import PnLReport from '@/components/property/PnLReport';
import ValuationTab from '@/components/property/ValuationTab';

export default function PropertyDetail() {
  const [, params] = useRoute('/properties/:id');
  const id = params?.id;
  const [, navigate] = useLocation();

  const { data: property, isLoading } = useProperty(id);
  const { data: units = [] } = usePropertyUnits(id);
  const { data: leases = [] } = usePropertyLeases(id);
  const { data: financials } = usePropertyFinancials(id);

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Property not found</p>
        <Button variant="ghost" className="mt-2" onClick={() => navigate('/properties')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Portfolio
        </Button>
      </div>
    );
  }

  const activeLeases = leases.filter(l => l.status === 'active');

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/properties')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{property.name}</h1>
            <Badge variant="outline" className="capitalize">{property.propertyType}</Badge>
            {property.isActive && <Badge>Active</Badge>}
          </div>
          <p className="text-muted-foreground">{property.address}, {property.city} {property.state} {property.zip}</p>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="rent-roll">Rent Roll</TabsTrigger>
          <TabsTrigger value="pnl">P&L</TabsTrigger>
          <TabsTrigger value="valuation">Valuation</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          {/* Financial KPIs */}
          {financials && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">NOI</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(financials.noi)}</div>
                  <p className="text-xs text-muted-foreground">Last 12 months</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Cap Rate</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{financials.capRate.toFixed(1)}%</div>
                  <p className="text-xs text-muted-foreground">NOI / Current Value</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Cash-on-Cash</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{financials.cashOnCash.toFixed(1)}%</div>
                  <p className="text-xs text-muted-foreground">NOI / Purchase Price</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Occupancy</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{financials.occupancyRate.toFixed(0)}%</div>
                  <p className="text-xs text-muted-foreground">{financials.occupiedUnits}/{financials.totalUnits} units</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Units Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Units ({units.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unit</TableHead>
                    <TableHead>Bed/Bath</TableHead>
                    <TableHead className="text-right">Sq Ft</TableHead>
                    <TableHead className="text-right">Rent</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {units.map(u => {
                    const lease = activeLeases.find(l => l.unitId === u.id);
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.unitNumber}</TableCell>
                        <TableCell>{u.bedrooms}br / {u.bathrooms}ba</TableCell>
                        <TableCell className="text-right">{u.squareFeet?.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{formatCurrency(parseFloat(u.monthlyRent || '0'))}</TableCell>
                        <TableCell>{lease?.tenantName || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={lease ? 'default' : 'secondary'}>
                            {lease ? 'Leased' : 'Vacant'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rent Roll Tab */}
        <TabsContent value="rent-roll" className="mt-4">
          <RentRollTable propertyId={id!} />
        </TabsContent>

        {/* P&L Tab */}
        <TabsContent value="pnl" className="mt-4">
          <PnLReport propertyId={id!} />
        </TabsContent>

        {/* Valuation Tab */}
        <TabsContent value="valuation" className="mt-4">
          <ValuationTab propertyId={id!} propertyName={property.name} propertyAddress={`${property.address}, ${property.city} ${property.state}`} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add client/src/pages/PropertyDetail.tsx
git commit -m "feat: add PropertyDetail page with overview, units table, and tab layout"
```

---

### Task 7: RentRollTable Component

**Files:**
- Create: `client/src/components/property/RentRollTable.tsx`

**Step 1: Create the rent roll table component**

```typescript
// client/src/components/property/RentRollTable.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { usePropertyRentRoll } from '@/hooks/use-property';
import { formatCurrency, formatDate } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  partial: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  vacant: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

export default function RentRollTable({ propertyId }: { propertyId: string }) {
  const { data: rentRoll = [], isLoading } = usePropertyRentRoll(propertyId);

  if (isLoading) return <Skeleton className="h-48" />;

  const totalExpected = rentRoll.reduce((s, r) => s + r.expectedRent, 0);
  const totalPaid = rentRoll.reduce((s, r) => s + r.actualPaid, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Rent Roll</CardTitle>
          <div className="text-sm text-muted-foreground">
            Collected: {formatCurrency(totalPaid)} / {formatCurrency(totalExpected)}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unit</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead className="text-right">Expected</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Lease Ends</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rentRoll.map(entry => (
              <TableRow key={entry.unitId}>
                <TableCell className="font-medium">{entry.unitNumber}</TableCell>
                <TableCell>{entry.tenantName || '—'}</TableCell>
                <TableCell className="text-right">{formatCurrency(entry.expectedRent)}</TableCell>
                <TableCell className="text-right">{formatCurrency(entry.actualPaid)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={STATUS_STYLES[entry.status] || ''}>
                    {entry.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {entry.leaseEnd ? formatDate(entry.leaseEnd) : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Commit**

```bash
git add client/src/components/property/RentRollTable.tsx
git commit -m "feat: add RentRollTable component"
```

---

### Task 8: PnLReport Component

**Files:**
- Create: `client/src/components/property/PnLReport.tsx`

**Step 1: Create the P&L report component with date range picker**

```typescript
// client/src/components/property/PnLReport.tsx
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { usePropertyPnL } from '@/hooks/use-property';
import { formatCurrency } from '@/lib/utils';

function defaultDateRange(): [string, string] {
  const now = new Date();
  const start = `${now.getFullYear()}-01-01`;
  const end = `${now.getFullYear()}-12-31`;
  return [start, end];
}

export default function PnLReport({ propertyId }: { propertyId: string }) {
  const [defaults] = useState(defaultDateRange);
  const [start, setStart] = useState(defaults[0]);
  const [end, setEnd] = useState(defaults[1]);

  const { data: pnl, isLoading } = usePropertyPnL(propertyId, start, end);

  return (
    <div className="space-y-4">
      {/* Date range controls */}
      <div className="flex gap-4 items-end">
        <div>
          <Label htmlFor="pnl-start">Start</Label>
          <Input id="pnl-start" type="date" value={start} onChange={e => setStart(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="pnl-end">End</Label>
          <Input id="pnl-end" type="date" value={end} onChange={e => setEnd(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-48" />
      ) : pnl ? (
        <div className="grid gap-4 md:grid-cols-3">
          {/* Income */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-600">Income</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatCurrency(pnl.totalIncome)}</div>
              <div className="space-y-1 mt-3">
                {Object.entries(pnl.income).map(([cat, amt]) => (
                  <div key={cat} className="flex justify-between text-sm">
                    <span className="capitalize text-muted-foreground">{cat.replace(/_/g, ' ')}</span>
                    <span>{formatCurrency(amt)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Expenses */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-600">Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{formatCurrency(pnl.totalExpenses)}</div>
              <div className="space-y-1 mt-3">
                {Object.entries(pnl.expenses).map(([cat, amt]) => (
                  <div key={cat} className="flex justify-between text-sm">
                    <span className="capitalize text-muted-foreground">{cat.replace(/_/g, ' ')}</span>
                    <span>{formatCurrency(amt)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Net */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Net Income</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${pnl.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(pnl.net)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {start} to {end}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <p className="text-muted-foreground">No data for selected period</p>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add client/src/components/property/PnLReport.tsx
git commit -m "feat: add PnLReport component with date range picker"
```

---

### Task 9: ValuationTab Component (Generalized from ValuationConsole)

**Files:**
- Create: `client/src/components/property/ValuationTab.tsx`

**Step 1: Create the generalized valuation tab**

Adapts the ValuationConsole logic to use real API data and shadcn/ui components instead of inline styles.

```typescript
// client/src/components/property/ValuationTab.tsx
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { usePropertyValuation, usePropertyValuationHistory } from '@/hooks/use-property';
import { formatCurrency } from '@/lib/utils';

type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';

interface Props {
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
}

export default function ValuationTab({ propertyId, propertyName, propertyAddress }: Props) {
  const { data: valuation, isLoading } = usePropertyValuation(propertyId);
  const { data: history = [] } = usePropertyValuationHistory(propertyId);

  // Local overrides stored by property ID
  const storageKey = `valuation-console:${propertyId}`;

  const [value, setValue] = useState(0);
  const [low, setLow] = useState(0);
  const [high, setHigh] = useState(0);
  const [rent, setRent] = useState(0);
  const [hoa, setHoa] = useState(0);
  const [tax, setTax] = useState(0);
  const [vacancyPct, setVacancyPct] = useState(10);
  const [rateShock, setRateShock] = useState(0);
  const [inventory, setInventory] = useState(0);
  const [quarter, setQuarter] = useState<Quarter>('Q1');

  // Seed from API data when it loads
  useEffect(() => {
    if (!valuation) return;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const p = JSON.parse(saved);
        setValue(p.value ?? valuation.aggregated.weightedEstimate);
        setLow(p.low ?? valuation.aggregated.low);
        setHigh(p.high ?? valuation.aggregated.high);
        setRent(p.rent ?? 0);
        setHoa(p.hoa ?? 0);
        setTax(p.tax ?? 0);
        setVacancyPct(p.vacancyPct ?? 10);
        setRateShock(p.rateShock ?? 0);
        setInventory(p.inventory ?? 0);
        setQuarter(p.quarter ?? 'Q1');
        return;
      } catch {}
    }
    setValue(Math.round(valuation.aggregated.weightedEstimate));
    setLow(Math.round(valuation.aggregated.low));
    setHigh(Math.round(valuation.aggregated.high));
  }, [valuation, storageKey]);

  // Persist overrides
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ value, low, high, rent, hoa, tax, vacancyPct, rateShock, inventory, quarter }));
  }, [value, low, high, rent, hoa, tax, vacancyPct, rateShock, inventory, quarter, storageKey]);

  const noi = useMemo(() => {
    const gross = rent * 12;
    const eff = gross * (1 - vacancyPct / 100);
    return eff - hoa * 12 - tax;
  }, [rent, hoa, tax, vacancyPct]);

  const cap = useMemo(() => (value > 0 ? (noi / value) * 100 : 0), [noi, value]);

  const scenario = useMemo(() => {
    const rateImpactPct = -3.6 * rateShock;
    const invImpactPct = -0.23 * inventory;
    const seasImpactPct = quarter === 'Q4' ? -0.9 : 0;
    const totalPct = rateImpactPct + invImpactPct + seasImpactPct;
    return { scenVal: value * (1 + totalPct / 100), totalPct };
  }, [value, rateShock, inventory, quarter]);

  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {/* Valuation snapshot */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Valuation Estimate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold">{formatCurrency(value)}</div>
            <p className="text-xs text-muted-foreground">Range: {formatCurrency(low)} - {formatCurrency(high)}</p>
            <div className="space-y-2">
              <div><Label className="text-xs">Value ($)</Label><Input type="number" value={value} step={1000} onChange={e => setValue(Number(e.target.value) || 0)} /></div>
              <div><Label className="text-xs">Low ($)</Label><Input type="number" value={low} step={1000} onChange={e => setLow(Number(e.target.value) || 0)} /></div>
              <div><Label className="text-xs">High ($)</Label><Input type="number" value={high} step={1000} onChange={e => setHigh(Number(e.target.value) || 0)} /></div>
            </div>
          </CardContent>
        </Card>

        {/* Rental & Yield */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Rental & Yield</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div><Label className="text-xs">Monthly Rent ($)</Label><Input type="number" value={rent} step={25} onChange={e => setRent(Number(e.target.value) || 0)} /></div>
            <div><Label className="text-xs">HOA/month ($)</Label><Input type="number" value={hoa} step={10} onChange={e => setHoa(Number(e.target.value) || 0)} /></div>
            <div><Label className="text-xs">Annual Tax ($)</Label><Input type="number" value={tax} step={50} onChange={e => setTax(Number(e.target.value) || 0)} /></div>
            <div><Label className="text-xs">Vacancy %</Label><Input type="number" value={vacancyPct} step={1} onChange={e => setVacancyPct(Number(e.target.value) || 0)} /></div>
            <div className="pt-2 border-t">
              <div className="text-xl font-bold">{cap.toFixed(1)}% cap</div>
              <p className="text-xs text-muted-foreground">NOI: {formatCurrency(Math.round(noi))}/yr</p>
            </div>
          </CardContent>
        </Card>

        {/* Sensitivity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sensitivity Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Rate Shock: {(rateShock * 100).toFixed(0)} bps</Label>
              <Slider min={-100} max={100} step={10} value={[rateShock * 100]} onValueChange={([v]) => setRateShock(v / 100)} />
            </div>
            <div>
              <Label className="text-xs">Inventory: {inventory > 0 ? '+' : ''}{inventory}%</Label>
              <Slider min={-20} max={20} step={1} value={[inventory]} onValueChange={([v]) => setInventory(v)} />
            </div>
            <div>
              <Label className="text-xs">Season</Label>
              <Select value={quarter} onValueChange={v => setQuarter(v as Quarter)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Q1">Q1 (Jan-Mar)</SelectItem>
                  <SelectItem value="Q2">Q2 (Apr-Jun)</SelectItem>
                  <SelectItem value="Q3">Q3 (Jul-Sep)</SelectItem>
                  <SelectItem value="Q4">Q4 (Oct-Dec)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="pt-2 border-t">
              <div className="text-xl font-bold">{formatCurrency(Math.round(scenario.scenVal))}</div>
              <p className="text-xs text-muted-foreground">
                {scenario.totalPct >= 0 ? '+' : ''}{scenario.totalPct.toFixed(1)}% vs base
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data Sources */}
      {valuation?.aggregated.estimates && valuation.aggregated.estimates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Valuation Sources ({valuation.aggregated.sources})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Estimate</TableHead>
                  <TableHead className="text-right">Low</TableHead>
                  <TableHead className="text-right">High</TableHead>
                  <TableHead className="text-right">Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {valuation.aggregated.estimates.map(est => (
                  <TableRow key={est.source}>
                    <TableCell className="capitalize font-medium">{est.source}</TableCell>
                    <TableCell className="text-right">{formatCurrency(est.estimate)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(est.low)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(est.high)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">{(est.confidence * 100).toFixed(0)}%</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add client/src/components/property/ValuationTab.tsx
git commit -m "feat: add ValuationTab generalized from ValuationConsole"
```

---

### Task 10: Wire Up Routes and Clean Up

**Files:**
- Modify: `client/src/App.tsx:1-42` — update imports and routes
- Delete: `client/src/pages/ValuationConsole.tsx`

**Step 1: Update App.tsx routes**

Replace the Router function's imports and Switch block:

1. Add import for PropertyDetail:
   ```typescript
   import PropertyDetail from "@/pages/PropertyDetail";
   ```
2. Remove import for ValuationConsole:
   ```typescript
   // DELETE: import ValuationConsole from "@/pages/ValuationConsole";
   ```
3. In the Switch block, replace:
   ```typescript
   <Route path="/valuation/550-w-surf-504" component={ValuationConsole} />
   ```
   with:
   ```typescript
   <Route path="/properties/:id" component={PropertyDetail} />
   ```
   Place it AFTER the `/properties` route and BEFORE `/connections`.

**Step 2: Delete ValuationConsole.tsx**

```bash
rm client/src/pages/ValuationConsole.tsx
```

**Step 3: Verify the app builds**

Run: `npx vite build --outDir dist/public`
Expected: Build succeeds with no errors

**Step 4: Manual smoke test**

Run: `npm run dev`
Test these routes:
- `http://localhost:5000/properties` — Should show Portfolio Hub with tabs
- Click a property card — Should navigate to `/properties/:id`
- `/properties/:id` — Should show detail page with 4 tabs
- Valuation tab — Should load API data into the sensitivity console

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire up PropertyDetail route, remove hardcoded ValuationConsole"
```

---

### Task 11: Final Integration Commit

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: 86/86 tests pass (frontend is untested but backend unaffected)

**Step 2: Build and deploy**

```bash
npx vite build --outDir dist/public
npx wrangler deploy --config deploy/system-wrangler.toml
```

**Step 3: Verify production**

```bash
curl -s https://finance.chitty.cc/health | python3 -m json.tool
```
Expected: `{"status":"ok","service":"chittyfinance"}`

**Step 4: Final commit and push**

```bash
git push
```
