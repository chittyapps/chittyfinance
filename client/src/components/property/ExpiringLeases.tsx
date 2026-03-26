import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock } from 'lucide-react';
import { useExpiringLeases } from '@/hooks/use-property';
import { formatCurrency } from '@/lib/utils';

function urgencyVariant(days: number): 'destructive' | 'default' | 'secondary' {
  if (days <= 30) return 'destructive';
  if (days <= 60) return 'default';
  return 'secondary';
}

function Header({ count }: { count?: number }) {
  return (
    <CardHeader>
      <CardTitle className="text-base flex items-center gap-2">
        <Clock className="h-4 w-4" /> Expiring Leases{count != null ? ` (${count})` : ''}
      </CardTitle>
    </CardHeader>
  );
}

export default function ExpiringLeases() {
  const { data: leases, isLoading } = useExpiringLeases(90);

  if (isLoading) {
    return (
      <Card>
        <Header />
        <CardContent>
          <Skeleton className="h-24" />
        </CardContent>
      </Card>
    );
  }

  if (!leases || leases.length === 0) {
    return (
      <Card>
        <Header />
        <CardContent>
          <p className="text-sm text-muted-foreground">No leases expiring in the next 90 days.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <Header count={leases.length} />
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
                <TableCell className="text-right">
                  <Badge variant={urgencyVariant(l.daysRemaining)}>{l.daysRemaining}d</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
