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
