import { useState, useMemo } from 'react';
import { useTenantId } from '@/contexts/TenantContext';
import { useAccounts, useAccountTransactions, useCreateAccount, useSyncAccount, type Account } from '@/hooks/use-accounts';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Plus, RefreshCw, ArrowLeft, TrendingUp, TrendingDown, Minus,
  Building, CreditCard, PiggyBank, Landmark, DollarSign
} from 'lucide-react';

const ACCOUNT_TYPES = ['checking', 'savings', 'credit', 'investment', 'mortgage', 'loan', 'tax_liability'] as const;

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Building; color: string; isLiability: boolean }> = {
  checking: { label: 'Checking', icon: Building, color: 'text-cyan-400', isLiability: false },
  savings: { label: 'Savings', icon: PiggyBank, color: 'text-emerald-400', isLiability: false },
  credit: { label: 'Credit', icon: CreditCard, color: 'text-rose-400', isLiability: true },
  investment: { label: 'Investment', icon: TrendingUp, color: 'text-violet-400', isLiability: false },
  mortgage: { label: 'Mortgage', icon: Landmark, color: 'text-amber-400', isLiability: true },
  loan: { label: 'Loan', icon: DollarSign, color: 'text-orange-400', isLiability: true },
  tax_liability: { label: 'Tax Liability', icon: Landmark, color: 'text-red-400', isLiability: true },
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Accounts() {
  const tenantId = useTenantId();
  const { data: accounts = [], isLoading } = useAccounts();
  const createAccount = useCreateAccount();
  const syncAccount = useSyncAccount();
  const { toast } = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newAcct, setNewAcct] = useState({ name: '', type: 'checking', institution: '', balance: '' });

  const { data: accountTxns = [], isLoading: txnsLoading } = useAccountTransactions(selectedId);

  if (!tenantId) {
    return <div className="p-6 text-[hsl(var(--cf-text-muted))]">Select a tenant to view accounts.</div>;
  }

  // Group accounts by type
  const grouped = useMemo(() => {
    const map = new Map<string, Account[]>();
    for (const a of accounts) {
      const list = map.get(a.type) || [];
      list.push(a);
      map.set(a.type, list);
    }
    return map;
  }, [accounts]);

  // Balance summary
  const totalAssets = accounts.filter(a => !TYPE_CONFIG[a.type]?.isLiability).reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = accounts.filter(a => TYPE_CONFIG[a.type]?.isLiability).reduce((s, a) => s + Math.abs(a.balance), 0);
  const netWorth = totalAssets - totalLiabilities;

  const selectedAccount = accounts.find(a => a.id === selectedId);

  const handleCreate = () => {
    if (!newAcct.name || !newAcct.type) {
      toast({ title: 'Name and type are required', variant: 'destructive' }); return;
    }
    createAccount.mutate({
      name: newAcct.name,
      type: newAcct.type,
      institution: newAcct.institution || undefined,
      balance: newAcct.balance ? parseFloat(newAcct.balance) : undefined,
    }, {
      onSuccess: () => {
        toast({ title: 'Account created' });
        setShowAdd(false);
        setNewAcct({ name: '', type: 'checking', institution: '', balance: '' });
      },
      onError: () => toast({ title: 'Failed to create account', variant: 'destructive' }),
    });
  };

  const handleSync = (id: string) => {
    syncAccount.mutate({ id }, {
      onSuccess: () => toast({ title: 'Account synced' }),
      onError: () => toast({ title: 'Sync failed', variant: 'destructive' }),
    });
  };

  // Detail view
  if (selectedId && selectedAccount) {
    const cfg = TYPE_CONFIG[selectedAccount.type] || TYPE_CONFIG.checking;
    return (
      <div className="p-6 space-y-4 animate-slide-up">
        <button onClick={() => setSelectedId(null)} className="flex items-center gap-1.5 text-xs text-[hsl(var(--cf-text-muted))] hover:text-[hsl(var(--cf-text))] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Accounts
        </button>

        <div className="cf-card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg bg-[hsl(var(--cf-raised))] flex items-center justify-center ${cfg.color}`}>
                <cfg.icon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-display font-semibold text-[hsl(var(--cf-text))]">{selectedAccount.name}</h2>
                <p className="text-xs text-[hsl(var(--cf-text-muted))]">{selectedAccount.institution || cfg.label} &middot; {selectedAccount.currency}</p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-xl font-mono font-bold ${cfg.isLiability ? 'text-rose-400' : 'text-emerald-400'}`}>
                {formatCurrency(selectedAccount.balance)}
              </p>
              <Badge variant="outline" className="text-[10px]">{cfg.label}</Badge>
            </div>
          </div>

          {/* Liability details */}
          {selectedAccount.liabilityDetails && (
            <div className="mt-4 pt-4 border-t border-[hsl(var(--cf-border-subtle))] grid grid-cols-3 gap-4">
              {Object.entries(selectedAccount.liabilityDetails).map(([k, v]) => (
                <div key={k}>
                  <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">{k.replace(/([A-Z])/g, ' $1')}</p>
                  <p className="text-sm text-[hsl(var(--cf-text))]">{String(v)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Account transactions */}
        <div className="cf-card overflow-hidden">
          <div className="px-4 py-3 border-b border-[hsl(var(--cf-border-subtle))] flex items-center justify-between">
            <h3 className="text-sm font-medium text-[hsl(var(--cf-text))]">Transactions</h3>
            <Button variant="ghost" size="sm" onClick={() => handleSync(selectedId)} className="gap-1.5 h-7 text-xs">
              <RefreshCw className={`w-3 h-3 ${syncAccount.isPending ? 'animate-spin' : ''}`} /> Sync
            </Button>
          </div>
          {txnsLoading ? (
            <div className="p-6 text-center text-sm text-[hsl(var(--cf-text-muted))]">Loading...</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[hsl(var(--cf-border-subtle))] text-[hsl(var(--cf-text-muted))]">
                  <th className="text-left px-3 py-2 font-medium">Date</th>
                  <th className="text-left px-3 py-2 font-medium">Description</th>
                  <th className="text-left px-3 py-2 font-medium">Category</th>
                  <th className="text-left px-3 py-2 font-medium">Counterparty</th>
                  <th className="text-right px-3 py-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {accountTxns.map(tx => (
                  <tr key={tx.id} className="border-b border-[hsl(var(--cf-border-subtle))] hover:bg-[hsl(var(--cf-raised))] transition-colors">
                    <td className="px-3 py-2 text-[hsl(var(--cf-text-secondary))] whitespace-nowrap">{formatDate(tx.date)}</td>
                    <td className="px-3 py-2 text-[hsl(var(--cf-text))] max-w-[250px] truncate">{tx.description}</td>
                    <td className="px-3 py-2">
                      {tx.category ? <Badge variant="outline" className="text-[10px]">{tx.category}</Badge> : '-'}
                    </td>
                    <td className="px-3 py-2 text-[hsl(var(--cf-text-secondary))]">{tx.counterparty || '-'}</td>
                    <td className={`px-3 py-2 text-right font-mono font-medium ${tx.direction === 'inflow' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {tx.direction === 'inflow' ? '+' : '-'}{formatCurrency(Math.abs(tx.amount))}
                    </td>
                  </tr>
                ))}
                {accountTxns.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-[hsl(var(--cf-text-muted))]">No transactions</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // Main list view
  return (
    <div className="p-6 space-y-4 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold text-[hsl(var(--cf-text))]">Accounts</h1>
          <p className="text-xs text-[hsl(var(--cf-text-muted))]">{accounts.length} accounts</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5 bg-lime-500 hover:bg-lime-600 text-black">
          <Plus className="w-3.5 h-3.5" /> Add Account
        </Button>
      </div>

      {/* Balance summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="cf-card px-4 py-3 flex items-center gap-3">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <div>
            <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">Total Assets</p>
            <p className="text-sm font-mono font-semibold text-emerald-400">{formatCurrency(totalAssets)}</p>
          </div>
        </div>
        <div className="cf-card px-4 py-3 flex items-center gap-3">
          <TrendingDown className="w-4 h-4 text-rose-400" />
          <div>
            <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">Total Liabilities</p>
            <p className="text-sm font-mono font-semibold text-rose-400">{formatCurrency(totalLiabilities)}</p>
          </div>
        </div>
        <div className="cf-card px-4 py-3 flex items-center gap-3">
          <Minus className="w-4 h-4 text-[hsl(var(--cf-lime))]" />
          <div>
            <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">Net Worth</p>
            <p className={`text-sm font-mono font-semibold ${netWorth >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(netWorth)}</p>
          </div>
        </div>
      </div>

      {/* Grouped accounts */}
      {isLoading ? (
        <div className="cf-card p-8 text-center text-sm text-[hsl(var(--cf-text-muted))]">Loading accounts...</div>
      ) : (
        <div className="space-y-4">
          {ACCOUNT_TYPES.map(type => {
            const group = grouped.get(type);
            if (!group || group.length === 0) return null;
            const cfg = TYPE_CONFIG[type];
            return (
              <div key={type}>
                <h3 className="text-xs font-medium text-[hsl(var(--cf-text-muted))] uppercase tracking-wider mb-2 px-1">{cfg.label}s</h3>
                <div className="grid gap-2">
                  {group.map(acct => {
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={acct.id}
                        onClick={() => setSelectedId(acct.id)}
                        className="cf-card px-4 py-3 flex items-center gap-3 text-left hover:border-[hsl(var(--cf-border-active))] transition-colors w-full"
                      >
                        <div className={`w-8 h-8 rounded-lg bg-[hsl(var(--cf-raised))] flex items-center justify-center ${cfg.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[hsl(var(--cf-text))] truncate">{acct.name}</p>
                          <p className="text-[10px] text-[hsl(var(--cf-text-muted))]">{acct.institution || '-'} &middot; {acct.currency}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-mono font-semibold ${cfg.isLiability ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {formatCurrency(acct.balance)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {accounts.length === 0 && (
            <div className="cf-card p-8 text-center text-sm text-[hsl(var(--cf-text-muted))]">No accounts yet. Add one to get started.</div>
          )}
        </div>
      )}

      {/* Add Account Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader><DialogTitle>Add Account</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label className="text-xs">Name *</Label>
              <Input placeholder="e.g. Mercury Checking" value={newAcct.name}
                onChange={e => setNewAcct(p => ({ ...p, name: e.target.value }))} className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Type *</Label>
                <Select value={newAcct.type} onValueChange={v => setNewAcct(p => ({ ...p, type: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_CONFIG[t].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Institution</Label>
                <Input placeholder="e.g. Mercury Bank" value={newAcct.institution}
                  onChange={e => setNewAcct(p => ({ ...p, institution: e.target.value }))} className="h-8 text-xs" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Opening Balance</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={newAcct.balance}
                onChange={e => setNewAcct(p => ({ ...p, balance: e.target.value }))} className="h-8 text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={createAccount.isPending}
              className="bg-lime-500 hover:bg-lime-600 text-black">
              {createAccount.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
