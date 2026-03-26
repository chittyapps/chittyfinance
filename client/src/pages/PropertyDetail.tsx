import { useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, DollarSign, TrendingUp, Users, BarChart3, Plus, Pencil } from 'lucide-react';
import {
  useProperty, usePropertyUnits, usePropertyLeases,
  usePropertyFinancials,
} from '@/hooks/use-property';
import { formatCurrency } from '@/lib/utils';
import RentRollTable from '@/components/property/RentRollTable';
import PnLReport from '@/components/property/PnLReport';
import ValuationTab from '@/components/property/ValuationTab';
import AddUnitDialog from '@/components/property/AddUnitDialog';
import AddLeaseDialog from '@/components/property/AddLeaseDialog';
import EditPropertyDialog from '@/components/property/EditPropertyDialog';
import EditUnitDialog from '@/components/property/EditUnitDialog';
import EditLeaseDialog from '@/components/property/EditLeaseDialog';
import type { Unit, Lease } from '@/hooks/use-property';
import WorkspaceTab from '@/components/property/WorkspaceTab';
import CommsPanel from '@/components/property/CommsPanel';
import WorkflowBoard from '@/components/property/WorkflowBoard';

export default function PropertyDetail() {
  const [, params] = useRoute('/properties/:id');
  const id = params?.id;
  const [, navigate] = useLocation();

  const [addUnitOpen, setAddUnitOpen] = useState(false);
  const [addLeaseOpen, setAddLeaseOpen] = useState(false);
  const [editPropertyOpen, setEditPropertyOpen] = useState(false);
  const [editUnitOpen, setEditUnitOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [editLeaseOpen, setEditLeaseOpen] = useState(false);
  const [selectedLease, setSelectedLease] = useState<Lease | null>(null);

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
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setEditPropertyOpen(true)}>
            <Pencil className="h-4 w-4 mr-1" /> Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAddUnitOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Unit
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAddLeaseOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Lease
          </Button>
        </div>
      </div>

      {/* Dialogs */}
      {id && <AddUnitDialog propertyId={id} open={addUnitOpen} onOpenChange={setAddUnitOpen} />}
      {id && <AddLeaseDialog propertyId={id} open={addLeaseOpen} onOpenChange={setAddLeaseOpen} />}
      {property && <EditPropertyDialog property={property} open={editPropertyOpen} onOpenChange={setEditPropertyOpen} />}
      {selectedUnit && id && <EditUnitDialog propertyId={id} unit={selectedUnit} open={editUnitOpen} onOpenChange={setEditUnitOpen} />}
      {selectedLease && id && <EditLeaseDialog propertyId={id} lease={selectedLease} open={editLeaseOpen} onOpenChange={setEditLeaseOpen} />}

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="rent-roll">Rent Roll</TabsTrigger>
          <TabsTrigger value="pnl">P&L</TabsTrigger>
          <TabsTrigger value="valuation">Valuation</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="comms">Communications</TabsTrigger>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
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
                    <TableHead className="w-[70px]"></TableHead>
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
                        <TableCell>
                          {lease ? (
                            <button
                              className="text-left hover:underline"
                              onClick={() => { setSelectedLease(lease); setEditLeaseOpen(true); }}
                            >
                              {lease.tenantName}
                            </button>
                          ) : '\u2014'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={lease ? 'default' : 'secondary'}>
                            {lease ? 'Leased' : 'Vacant'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => { setSelectedUnit(u); setEditUnitOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
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
          <ValuationTab propertyId={id!} />
        </TabsContent>

        {/* Workspace Tab (Google Calendar/Sheets/Drive) */}
        <TabsContent value="workspace" className="mt-4">
          <WorkspaceTab propertyId={id!} />
        </TabsContent>

        {/* Communications Tab */}
        <TabsContent value="comms" className="mt-4">
          <CommsPanel propertyId={id!} leases={leases} />
        </TabsContent>

        {/* Workflows Tab */}
        <TabsContent value="workflows" className="mt-4">
          <WorkflowBoard propertyId={id!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
