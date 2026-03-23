import { useState } from 'react';
import { useTenantId } from '@/contexts/TenantContext';
import { useConsolidatedReport, useRunTaxAutomation, type ReportParams } from '@/hooks/use-reports';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  BarChart3, Download, Play, CheckCircle2, AlertTriangle, XCircle,
  TrendingUp, TrendingDown, Building2, MapPin, Shield
} from 'lucide-react';

function pct(value: number, total: number) {
  if (total === 0) return '0%';
  return `${((value / total) * 100).toFixed(1)}%`;
}

const currentYear = new Date().getFullYear();
const defaultStart = `${currentYear}-01-01`;
const defaultEnd = `${currentYear}-12-31`;

const STATUS_ICON = {
  pass: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
  warn: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
  fail: <XCircle className="w-3.5 h-3.5 text-rose-400" />,
};

export default function Reports() {
  const tenantId = useTenantId();
  const { toast } = useToast();

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [includeDescendants, setIncludeDescendants] = useState(true);
  const [includeIntercompany, setIncludeIntercompany] = useState(false);

  const params: ReportParams | null = tenantId ? { startDate, endDate, includeDescendants, includeIntercompany } : null;
  const { data, isLoading, error } = useConsolidatedReport(params);
  const taxAutomation = useRunTaxAutomation();

  if (!tenantId) {
    return <div className="p-6 text-[hsl(var(--cf-text-muted))]">Select a tenant to view reports.</div>;
  }

  const report = data?.report;
  const preflight = data?.preflight;
  const checks = data?.verificationChecklist || [];
  const remediationPrompts = data?.remediationPrompts || [];

  const handleRunTax = () => {
    taxAutomation.mutate({ startDate, endDate, includeDescendants, includeIntercompany }, {
      onSuccess: (result) => {
        toast({ title: result.nextStep === 'prepare_tax_package' ? 'Tax automation complete - Ready to file!' : 'Issues found - resolve before filing' });
      },
      onError: () => toast({ title: 'Tax automation failed', variant: 'destructive' }),
    });
  };

  const exportCsv = () => {
    if (!report) return;
    const rows = [
      'Consolidated P&L Report',
      `Period: ${report.scope.startDate} to ${report.scope.endDate}`,
      '',
      'TOTALS',
      `Income,${report.totals.income}`,
      `Expenses,${report.totals.expenses}`,
      `Deductible Expenses,${report.totals.deductibleExpenses}`,
      `Net Income,${report.totals.net}`,
      '',
      'BY ENTITY',
      'Entity,Type,Income,Expenses,Net',
      ...report.byEntity.map(e => `"${e.tenantName}",${e.tenantType},${e.income},${e.expenses},${e.net}`),
      '',
      'BY STATE',
      'State,Income,Expenses,Taxable Income,Estimated Tax',
      ...report.byState.map(s => `${s.state},${s.income},${s.expenses},${s.taxableIncome},${s.estimatedTax}`),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `report-${startDate}-${endDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-4 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold text-[hsl(var(--cf-text))]">Reports</h1>
          <p className="text-xs text-[hsl(var(--cf-text-muted))]">Consolidated financial reporting & tax readiness</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!report} className="gap-1.5">
            <Download className="w-3.5 h-3.5" /> Export
          </Button>
          <Button size="sm" onClick={handleRunTax} disabled={taxAutomation.isPending} className="gap-1.5 bg-lime-500 hover:bg-lime-600 text-black">
            <Play className="w-3.5 h-3.5" /> {taxAutomation.isPending ? 'Running...' : 'Run Tax Automation'}
          </Button>
        </div>
      </div>

      {/* Controls */}
      <div className="cf-card p-4 flex flex-wrap gap-4 items-end">
        <div>
          <Label className="text-xs text-[hsl(var(--cf-text-muted))]">Start Date</Label>
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-[150px] h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs text-[hsl(var(--cf-text-muted))]">End Date</Label>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-[150px] h-8 text-xs" />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={includeDescendants} onCheckedChange={setIncludeDescendants} />
          <Label className="text-xs">Include subsidiaries</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={includeIntercompany} onCheckedChange={setIncludeIntercompany} />
          <Label className="text-xs">Include intercompany</Label>
        </div>
      </div>

      {isLoading && <div className="cf-card p-8 text-center text-sm text-[hsl(var(--cf-text-muted))]">Generating report...</div>}
      {error && <div className="cf-card p-4 text-sm text-rose-400">Failed to load report. Check date range.</div>}

      {report && (
        <>
          {/* P&L Summary */}
          <div className="grid grid-cols-4 gap-3">
            <div className="cf-card px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">Income</p>
              </div>
              <p className="text-lg font-mono font-bold text-emerald-400">{formatCurrency(report.totals.income)}</p>
            </div>
            <div className="cf-card px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">Expenses</p>
              </div>
              <p className="text-lg font-mono font-bold text-rose-400">{formatCurrency(report.totals.expenses)}</p>
              <p className="text-[10px] text-[hsl(var(--cf-text-muted))]">Deductible: {formatCurrency(report.totals.deductibleExpenses)}</p>
            </div>
            <div className="cf-card px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-3.5 h-3.5 text-[hsl(var(--cf-lime))]" />
                <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">Net Income</p>
              </div>
              <p className={`text-lg font-mono font-bold ${report.totals.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatCurrency(report.totals.net)}
              </p>
            </div>
            <div className="cf-card px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-3.5 h-3.5 text-violet-400" />
                <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">Net Worth</p>
              </div>
              <p className="text-lg font-mono font-bold text-violet-400">{formatCurrency(report.balances.netWorth)}</p>
              <p className="text-[10px] text-[hsl(var(--cf-text-muted))]">{report.totals.transactionCount} transactions</p>
            </div>
          </div>

          {/* Quality Metrics */}
          <div className="cf-card p-4">
            <h3 className="text-sm font-medium text-[hsl(var(--cf-text))] mb-3">Data Quality</h3>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Uncategorized', value: report.quality.uncategorizedCount, color: report.quality.uncategorizedCount === 0 ? 'text-emerald-400' : 'text-amber-400' },
                { label: 'Unreconciled', value: report.quality.unreconciledCount, color: report.quality.unreconciledCount === 0 ? 'text-emerald-400' : 'text-amber-400' },
                { label: 'No State', value: report.quality.unassignedStateCount, color: report.quality.unassignedStateCount === 0 ? 'text-emerald-400' : 'text-amber-400' },
                { label: 'Future-Dated', value: report.quality.futureDatedCount, color: report.quality.futureDatedCount === 0 ? 'text-emerald-400' : 'text-rose-400' },
              ].map(m => (
                <div key={m.label} className="flex items-center gap-2">
                  <span className={`text-lg font-mono font-bold ${m.color}`}>{m.value}</span>
                  <span className="text-xs text-[hsl(var(--cf-text-muted))]">{m.label}</span>
                  <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">({pct(m.value, report.quality.totalTransactions)})</span>
                </div>
              ))}
            </div>
          </div>

          {/* By Entity */}
          {report.byEntity.length > 0 && (
            <div className="cf-card overflow-hidden">
              <div className="px-4 py-3 border-b border-[hsl(var(--cf-border-subtle))] flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-[hsl(var(--cf-text-muted))]" />
                <h3 className="text-sm font-medium text-[hsl(var(--cf-text))]">By Entity</h3>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[hsl(var(--cf-border-subtle))] text-[hsl(var(--cf-text-muted))]">
                    <th className="text-left px-3 py-2 font-medium">Entity</th>
                    <th className="text-left px-3 py-2 font-medium">Type</th>
                    <th className="text-right px-3 py-2 font-medium">Income</th>
                    <th className="text-right px-3 py-2 font-medium">Expenses</th>
                    <th className="text-right px-3 py-2 font-medium">Net</th>
                    <th className="text-right px-3 py-2 font-medium">Txns</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byEntity.map(e => (
                    <tr key={e.tenantId} className="border-b border-[hsl(var(--cf-border-subtle))] hover:bg-[hsl(var(--cf-raised))]">
                      <td className="px-3 py-2 text-[hsl(var(--cf-text))] font-medium">{e.tenantName}</td>
                      <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{e.tenantType}</Badge></td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-400">{formatCurrency(e.income)}</td>
                      <td className="px-3 py-2 text-right font-mono text-rose-400">{formatCurrency(e.expenses)}</td>
                      <td className={`px-3 py-2 text-right font-mono font-medium ${e.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(e.net)}</td>
                      <td className="px-3 py-2 text-right text-[hsl(var(--cf-text-muted))]">{e.transactionCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* By State */}
          {report.byState.length > 0 && (
            <div className="cf-card overflow-hidden">
              <div className="px-4 py-3 border-b border-[hsl(var(--cf-border-subtle))] flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-[hsl(var(--cf-text-muted))]" />
                <h3 className="text-sm font-medium text-[hsl(var(--cf-text))]">By State</h3>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[hsl(var(--cf-border-subtle))] text-[hsl(var(--cf-text-muted))]">
                    <th className="text-left px-3 py-2 font-medium">State</th>
                    <th className="text-right px-3 py-2 font-medium">Income</th>
                    <th className="text-right px-3 py-2 font-medium">Expenses</th>
                    <th className="text-right px-3 py-2 font-medium">Taxable Income</th>
                    <th className="text-right px-3 py-2 font-medium">Est. Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byState.map(s => (
                    <tr key={s.state} className="border-b border-[hsl(var(--cf-border-subtle))] hover:bg-[hsl(var(--cf-raised))]">
                      <td className="px-3 py-2 text-[hsl(var(--cf-text))] font-medium">{s.state}</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-400">{formatCurrency(s.income)}</td>
                      <td className="px-3 py-2 text-right font-mono text-rose-400">{formatCurrency(s.expenses)}</td>
                      <td className="px-3 py-2 text-right font-mono text-[hsl(var(--cf-text))]">{formatCurrency(s.taxableIncome)}</td>
                      <td className="px-3 py-2 text-right font-mono text-amber-400">{formatCurrency(s.estimatedTax)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tax Readiness Checklist */}
          {preflight && (
            <div className="cf-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-[hsl(var(--cf-text))]">Tax Readiness</h3>
                <Badge className={preflight.readyToFileTaxes ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}>
                  {preflight.readyToFileTaxes ? 'Ready to File' : 'Not Ready'}
                </Badge>
              </div>
              <div className="space-y-1.5">
                {checks.map(c => (
                  <div key={c.id} className="flex items-center gap-2 py-1">
                    {STATUS_ICON[c.status]}
                    <span className="text-xs text-[hsl(var(--cf-text-secondary))]">{c.message}</span>
                  </div>
                ))}
              </div>
              {remediationPrompts.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[hsl(var(--cf-border-subtle))]">
                  <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider mb-1.5">Remediation Steps</p>
                  {remediationPrompts.map((prompt, i) => (
                    <p key={i} className="text-xs text-[hsl(var(--cf-text-secondary))] py-0.5">{i + 1}. {prompt}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tax Automation Result */}
          {taxAutomation.data && (
            <div className="cf-card p-4 border-l-2 border-l-lime-400">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-[hsl(var(--cf-text))]">Tax Automation Result</h3>
                <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">{taxAutomation.data.generatedAt}</span>
              </div>
              {taxAutomation.data.aiReview && (
                <div className="text-xs text-[hsl(var(--cf-text-secondary))] whitespace-pre-wrap bg-[hsl(var(--cf-raised))] rounded p-3">
                  {taxAutomation.data.aiReview.content}
                </div>
              )}
              <p className="text-xs text-[hsl(var(--cf-text-muted))] mt-2">Next: {taxAutomation.data.nextStep.replace(/_/g, ' ')}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
