import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Clock } from 'lucide-react';
import type { Property } from '@/hooks/use-property';
import { usePropertyRentRoll, usePropertyLeases } from '@/hooks/use-property';
import { formatCurrency, formatDate } from '@/lib/utils';

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
          <TableCell>{entry.tenantName || '\u2014'}</TableCell>
          <TableCell className="text-right">{formatCurrency(entry.expectedRent)}</TableCell>
          <TableCell className="text-right">{formatCurrency(entry.actualPaid)}</TableCell>
          <TableCell>
            <Badge variant="outline" className={STATUS_STYLES[entry.status] || ''}>
              {entry.status}
            </Badge>
          </TableCell>
          <TableCell className="text-muted-foreground">
            {entry.leaseEnd ? formatDate(entry.leaseEnd) : '\u2014'}
          </TableCell>
        </TableRow>
      ))}
    </>
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

export default function OpsView({ properties }: { properties: Property[] }) {
  const active = properties.filter(p => p.isActive);

  return (
    <div className="space-y-6">
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Upcoming Lease Expirations (90 days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {active.map(p => (
            <PropertyLeaseExpirations key={p.id} property={p} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
