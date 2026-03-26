import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock } from 'lucide-react';
import { useExpiringLeases } from '@/hooks/use-property';
import { formatCurrency } from '@/lib/utils';

function urgencyBadge(days: number) {
  if (days <= 30) return <Badge variant="destructive">{days}d</Badge>;
  if (days <= 60) return <Badge variant="default">{days}d</Badge>;
  return <Badge variant="secondary">{days}d</Badge>;
}

export default function ExpiringLeases() {
  const { data: leases, isLoading } = useExpiringLeases(90);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Expiring Leases
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24" />
        </CardContent>
      </Card>
    );
  }

  if (!leases || leases.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Expiring Leases
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No leases expiring in the next 90 days.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" /> Expiring Leases ({leases.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant</TableHead>
              <TableHead>Property</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">Rent</TableHead>
              <TableHead>End Date</TableHead>
              <TableHead className="text-right">Remaining</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leases.map((l) => (
              <TableRow key={l.leaseId}>
                <TableCell className="font-medium">{l.tenantName}</TableCell>
                <TableCell>{l.propertyName}</TableCell>
                <TableCell>{l.unitNumber || '\u2014'}</TableCell>
                <TableCell className="text-right">{formatCurrency(parseFloat(l.monthlyRent))}</TableCell>
                <TableCell>{new Date(l.endDate).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">{urgencyBadge(l.daysRemaining)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
