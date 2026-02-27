import { useLocation } from 'wouter';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Building2, DollarSign, TrendingUp, BarChart3, Users, Maximize2, X,
} from 'lucide-react';
import {
  useProperty, usePropertyUnits, usePropertyLeases, usePropertyFinancials,
} from '@/hooks/use-property';
import { formatCurrency } from '@/lib/utils';
import RentRollTable from '@/components/property/RentRollTable';
import PnLReport from '@/components/property/PnLReport';
import ValuationTab from '@/components/property/ValuationTab';
import AIAdvisorTab from '@/components/property/AIAdvisorTab';

interface PropertyDetailPanelProps {
  propertyId: string | null;
  onClose: () => void;
}

export default function PropertyDetailPanel({ propertyId, onClose }: PropertyDetailPanelProps) {
  const [, navigate] = useLocation();

  const open = propertyId !== null;
  const { data: property, isLoading } = useProperty(propertyId ?? undefined);
  const { data: units = [] } = usePropertyUnits(propertyId ?? undefined);
  const { data: leases = [] } = usePropertyLeases(propertyId ?? undefined);
  const { data: financials } = usePropertyFinancials(propertyId ?? undefined);

  const activeLeases = leases.filter(l => l.status === 'active');

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full lg:w-[60%] lg:max-w-[60%] sm:max-w-full overflow-y-auto p-0"
      >
        {isLoading && (
          <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
            <div className="grid gap-4 grid-cols-2 mt-6">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          </div>
        )}

        {!isLoading && !property && (
          <div className="p-6">
            <SheetHeader>
              <SheetTitle>Property Not Found</SheetTitle>
              <SheetDescription>
                The selected property could not be loaded.
              </SheetDescription>
            </SheetHeader>
            <p className="text-muted-foreground mt-4">
              This property may have been removed or you may not have access.
            </p>
          </div>
        )}

        {!isLoading && property && (
          <>
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background border-b px-6 py-4">
              <SheetHeader className="space-y-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <SheetTitle className="text-xl truncate">
                        {property.name}
                      </SheetTitle>
                      <Badge variant="outline" className="capitalize shrink-0">
                        {property.propertyType}
                      </Badge>
                      {property.isActive && (
                        <Badge className="shrink-0">Active</Badge>
                      )}
                    </div>
                    <SheetDescription className="mt-1 truncate">
                      {property.address}, {property.city} {property.state} {property.zip}
                    </SheetDescription>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        onClose();
                        navigate(`/properties/${propertyId}`);
                      }}
                    >
                      <Maximize2 className="h-4 w-4 mr-1" />
                      Expand
                    </Button>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                      <X className="h-4 w-4" />
                      <span className="sr-only">Close</span>
                    </Button>
                  </div>
                </div>
              </SheetHeader>
            </div>

            {/* Tabbed Content */}
            <div className="px-6 py-4">
              <Tabs defaultValue="summary">
                <TabsList className="w-full justify-start overflow-x-auto">
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="units">Units & Leases</TabsTrigger>
                  <TabsTrigger value="financials">Financials</TabsTrigger>
                  <TabsTrigger value="valuation">Valuation</TabsTrigger>
                  <TabsTrigger value="ai">AI Advisor</TabsTrigger>
                </TabsList>

                {/* Summary Tab */}
                <TabsContent value="summary" className="space-y-6 mt-4">
                  {/* KPI Metric Cards */}
                  <div className="grid gap-4 grid-cols-2">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Value</CardTitle>
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {formatCurrency(parseFloat(property.currentValue || '0'))}
                        </div>
                        <p className="text-xs text-muted-foreground">Current estimate</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">NOI</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {financials ? formatCurrency(financials.noi) : '--'}
                        </div>
                        <p className="text-xs text-muted-foreground">Last 12 months</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Cap Rate</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {financials ? `${financials.capRate.toFixed(1)}%` : '--'}
                        </div>
                        <p className="text-xs text-muted-foreground">NOI / Current Value</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Cash-on-Cash</CardTitle>
                        <BarChart3 className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {financials ? `${financials.cashOnCash.toFixed(1)}%` : '--'}
                        </div>
                        <p className="text-xs text-muted-foreground">NOI / Purchase Price</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Purchase Info */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Purchase Information</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-3 grid-cols-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Purchase Price</span>
                          <p className="font-medium">
                            {formatCurrency(parseFloat(property.purchasePrice || '0'))}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Current Value</span>
                          <p className="font-medium">
                            {formatCurrency(parseFloat(property.currentValue || '0'))}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Property Type</span>
                          <p className="font-medium capitalize">{property.propertyType}</p>
                        </div>
                        {financials && (
                          <div>
                            <span className="text-muted-foreground">Occupancy</span>
                            <p className="font-medium">
                              {financials.occupancyRate.toFixed(0)}% ({financials.occupiedUnits}/{financials.totalUnits} units)
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Units & Leases Tab */}
                <TabsContent value="units" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                          <Users className="h-4 w-4 inline mr-2" />
                          Units ({units.length})
                        </CardTitle>
                        <span className="text-sm text-muted-foreground">
                          {activeLeases.length} active lease{activeLeases.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {units.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No units configured for this property.</p>
                      ) : (
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
                                  <TableCell className="text-right">
                                    {u.squareFeet?.toLocaleString()}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(parseFloat(u.monthlyRent || '0'))}
                                  </TableCell>
                                  <TableCell>{lease?.tenantName || '\u2014'}</TableCell>
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
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Financials Tab */}
                <TabsContent value="financials" className="space-y-6 mt-4">
                  <PnLReport propertyId={propertyId!} />
                  <RentRollTable propertyId={propertyId!} />
                </TabsContent>

                {/* Valuation Tab */}
                <TabsContent value="valuation" className="mt-4">
                  <ValuationTab propertyId={propertyId!} />
                </TabsContent>

                {/* AI Advisor Tab */}
                <TabsContent value="ai" className="mt-4">
                  <AIAdvisorTab propertyId={propertyId!} />
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
