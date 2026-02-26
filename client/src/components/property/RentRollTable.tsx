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
