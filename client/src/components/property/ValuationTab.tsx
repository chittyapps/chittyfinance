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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Rental &amp; Yield</CardTitle>
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
