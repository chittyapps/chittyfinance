import { useState, useRef } from 'react';
import { useTenantId } from '@/contexts/TenantContext';
import {
  useIntegrations, useRecurringCharges, useChargeOptimizations,
  useWaveSync, useTurboTenantImport,
} from '@/hooks/use-integrations';
import { useAccounts } from '@/hooks/use-accounts';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  RefreshCw, Upload, Cable, Clock, CheckCircle2, XCircle,
  TrendingDown, Lightbulb, ArrowDownToLine
} from 'lucide-react';

function formatDate(dateStr: string | undefined) {
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

const ACTION_COLORS = {
  cancel: 'text-rose-400 bg-rose-400/10',
  downgrade: 'text-amber-400 bg-amber-400/10',
  consolidate: 'text-cyan-400 bg-cyan-400/10',
  negotiate: 'text-violet-400 bg-violet-400/10',
};

export default function Integrations() {
  const tenantId = useTenantId();
  const { data: integrations = [], isLoading: intLoading } = useIntegrations();
  const { data: charges = [] } = useRecurringCharges();
  const { data: optimizations = [] } = useChargeOptimizations();
  const { data: accounts = [] } = useAccounts();
  const waveSync = useWaveSync();
  const ttImport = useTurboTenantImport();
  const { toast } = useToast();

  const [showImport, setShowImport] = useState(false);
  const [importAccountId, setImportAccountId] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  if (!tenantId) {
    return <div className="p-6 text-[hsl(var(--cf-text-muted))]">Select a tenant to view integrations.</div>;
  }

  const handleWaveSync = () => {
    waveSync.mutate(undefined, {
      onSuccess: (data: any) => toast({ title: `Wave sync: ${data.imported ?? 0} transactions imported` }),
      onError: () => toast({ title: 'Wave sync failed', variant: 'destructive' }),
    });
  };

  const handleImport = () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !importAccountId) {
      toast({ title: 'Select a file and account', variant: 'destructive' }); return;
    }
    ttImport.mutate({ file, accountId: importAccountId }, {
      onSuccess: (data: any) => {
        toast({ title: `Imported ${data.imported ?? 0} transactions (${data.skipped ?? 0} skipped)` });
        setShowImport(false);
      },
      onError: () => toast({ title: 'Import failed', variant: 'destructive' }),
    });
  };

  const totalSavings = optimizations.reduce((s, o) => s + o.potentialSavings, 0);

  return (
    <div className="p-6 space-y-6 animate-slide-up">
      {/* Header */}
      <div>
        <h1 className="text-xl font-display font-semibold text-[hsl(var(--cf-text))]">Integrations</h1>
        <p className="text-xs text-[hsl(var(--cf-text-muted))]">Sync status, data imports, and charge optimization</p>
      </div>

      {/* Sync Status Cards */}
      <div>
        <h2 className="text-xs font-medium text-[hsl(var(--cf-text-muted))] uppercase tracking-wider mb-2 px-1">Connected Services</h2>
        {intLoading ? (
          <div className="cf-card p-6 text-center text-sm text-[hsl(var(--cf-text-muted))]">Loading...</div>
        ) : integrations.length === 0 ? (
          <div className="cf-card p-6 text-center text-sm text-[hsl(var(--cf-text-muted))]">No integrations configured. Visit Connections to set up.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {integrations.map(int => (
              <div key={int.id} className="cf-card px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Cable className="w-4 h-4 text-[hsl(var(--cf-text-muted))]" />
                    <span className="text-sm font-medium text-[hsl(var(--cf-text))]">{int.name}</span>
                  </div>
                  {int.connected ? (
                    <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]"><CheckCircle2 className="w-2.5 h-2.5 mr-1" />Connected</Badge>
                  ) : (
                    <Badge className="bg-zinc-500/20 text-zinc-400 text-[10px]"><XCircle className="w-2.5 h-2.5 mr-1" />Disconnected</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-[hsl(var(--cf-text-muted))]">
                  <Clock className="w-2.5 h-2.5" />
                  Last synced: {formatDate(int.lastSynced)}
                </div>
                {int.description && (
                  <p className="text-[10px] text-[hsl(var(--cf-text-muted))] mt-1">{int.description}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sync Actions */}
      <div>
        <h2 className="text-xs font-medium text-[hsl(var(--cf-text-muted))] uppercase tracking-wider mb-2 px-1">Data Import</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="cf-card px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[hsl(var(--cf-text))]">Wave Accounting Sync</p>
              <p className="text-[10px] text-[hsl(var(--cf-text-muted))]">Pull invoices & expenses from Wave</p>
            </div>
            <Button size="sm" variant="outline" onClick={handleWaveSync} disabled={waveSync.isPending} className="gap-1.5">
              <RefreshCw className={`w-3 h-3 ${waveSync.isPending ? 'animate-spin' : ''}`} />
              {waveSync.isPending ? 'Syncing...' : 'Sync Now'}
            </Button>
          </div>
          <div className="cf-card px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[hsl(var(--cf-text))]">TurboTenant Import</p>
              <p className="text-[10px] text-[hsl(var(--cf-text-muted))]">Upload CSV ledger from TurboTenant</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowImport(true)} className="gap-1.5">
              <Upload className="w-3 h-3" /> Import CSV
            </Button>
          </div>
        </div>
      </div>

      {/* Recurring Charges */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-xs font-medium text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">Recurring Charges</h2>
          {charges.length > 0 && <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">{charges.length} charges detected</span>}
        </div>
        {charges.length === 0 ? (
          <div className="cf-card p-6 text-center text-sm text-[hsl(var(--cf-text-muted))]">
            No recurring charges detected. Connect integrations that support charge detection.
          </div>
        ) : (
          <div className="cf-card overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[hsl(var(--cf-border-subtle))] text-[hsl(var(--cf-text-muted))]">
                  <th className="text-left px-3 py-2 font-medium">Merchant</th>
                  <th className="text-left px-3 py-2 font-medium">Category</th>
                  <th className="text-right px-3 py-2 font-medium">Amount</th>
                  <th className="text-left px-3 py-2 font-medium">Next Charge</th>
                </tr>
              </thead>
              <tbody>
                {charges.map(ch => (
                  <tr key={ch.id} className="border-b border-[hsl(var(--cf-border-subtle))] hover:bg-[hsl(var(--cf-raised))]">
                    <td className="px-3 py-2 text-[hsl(var(--cf-text))] font-medium">{ch.merchantName}</td>
                    <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{ch.category}</Badge></td>
                    <td className="px-3 py-2 text-right font-mono text-rose-400">{formatCurrency(ch.amount)}</td>
                    <td className="px-3 py-2 text-[hsl(var(--cf-text-secondary))]">{ch.nextChargeDate ? formatDate(ch.nextChargeDate) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Optimization Recommendations */}
      {optimizations.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
              <h2 className="text-xs font-medium text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">Optimization Recommendations</h2>
            </div>
            <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">
              <TrendingDown className="w-2.5 h-2.5 mr-1" /> Save {formatCurrency(totalSavings)}/mo
            </Badge>
          </div>
          <div className="space-y-2">
            {optimizations.map((opt, i) => (
              <div key={i} className="cf-card px-4 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[hsl(var(--cf-text))]">{opt.merchantName}</span>
                    <Badge className={`text-[10px] ${ACTION_COLORS[opt.suggestedAction]}`}>{opt.suggestedAction}</Badge>
                  </div>
                  <span className="text-xs font-mono text-emerald-400">Save {formatCurrency(opt.potentialSavings)}/mo</span>
                </div>
                <p className="text-xs text-[hsl(var(--cf-text-secondary))]">{opt.reasoning}</p>
                {opt.alternativeOptions && opt.alternativeOptions.length > 0 && (
                  <div className="flex gap-1 mt-1.5">
                    <ArrowDownToLine className="w-2.5 h-2.5 text-[hsl(var(--cf-text-muted))] mt-0.5" />
                    <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">Alternatives: {opt.alternativeOptions.join(', ')}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TurboTenant Import Dialog */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader><DialogTitle>Import TurboTenant CSV</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label className="text-xs">Target Account *</Label>
              <Select value={importAccountId} onValueChange={setImportAccountId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select account..." /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">CSV File *</Label>
              <Input type="file" accept=".csv" ref={fileRef} className="h-8 text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowImport(false)}>Cancel</Button>
            <Button size="sm" onClick={handleImport} disabled={ttImport.isPending}
              className="bg-lime-500 hover:bg-lime-600 text-black">
              {ttImport.isPending ? 'Importing...' : 'Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
