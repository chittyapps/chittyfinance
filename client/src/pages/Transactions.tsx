import { useState, useMemo } from 'react';
import { useTenantId } from '@/contexts/TenantContext';
import { useTransactions, useCreateTransaction, useUpdateTransaction, type Transaction } from '@/hooks/use-transactions';
import { useAccounts } from '@/hooks/use-accounts';
import { useProperties } from '@/hooks/use-property';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Plus, Search, Download, ArrowUpDown, Check, X,
  TrendingUp, TrendingDown, ArrowLeftRight, ChevronLeft, ChevronRight
} from 'lucide-react';

const CATEGORIES = [
  'rent', 'maintenance', 'utilities', 'management_fee', 'insurance',
  'taxes', 'mortgage', 'hoa', 'supplies', 'professional_fees',
  'advertising', 'travel', 'office', 'payroll', 'other',
];

const PAGE_SIZE = 50;

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type SortKey = 'date' | 'amount' | 'payee' | 'category';
type SortDir = 'asc' | 'desc';

export default function Transactions() {
  const tenantId = useTenantId();
  const { data: transactions = [], isLoading } = useTransactions();
  const { data: accounts = [] } = useAccounts();
  const { data: properties = [] } = useProperties();
  const createTx = useCreateTransaction();
  const updateTx = useUpdateTransaction();
  const { toast } = useToast();

  // Filters
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterAccount, setFilterAccount] = useState<string>('all');
  const [filterProperty, setFilterProperty] = useState<string>('all');
  const [filterReconciled, setFilterReconciled] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Pagination
  const [page, setPage] = useState(0);

  // Dialog
  const [showAdd, setShowAdd] = useState(false);
  const [newTx, setNewTx] = useState({
    accountId: '', amount: '', type: 'expense', category: '', description: '', date: '', payee: '', propertyId: '',
  });

  if (!tenantId) {
    return <div className="p-6 text-[hsl(var(--cf-text-muted))]">Select a tenant to view transactions.</div>;
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  // Filter + sort
  const filtered = useMemo(() => {
    let result = [...transactions];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        (t.payee?.toLowerCase().includes(q)) || t.description.toLowerCase().includes(q)
      );
    }
    if (filterCategory !== 'all') result = result.filter(t => t.category === filterCategory);
    if (filterAccount !== 'all') result = result.filter(t => t.accountId === filterAccount);
    if (filterProperty !== 'all') result = result.filter(t => t.propertyId === filterProperty);
    if (filterReconciled === 'yes') result = result.filter(t => t.reconciled);
    if (filterReconciled === 'no') result = result.filter(t => !t.reconciled);
    if (dateFrom) result = result.filter(t => new Date(t.date) >= new Date(dateFrom));
    if (dateTo) result = result.filter(t => new Date(t.date) <= new Date(dateTo + 'T23:59:59'));

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'date': cmp = new Date(a.date).getTime() - new Date(b.date).getTime(); break;
        case 'amount': cmp = a.amount - b.amount; break;
        case 'payee': cmp = (a.payee || '').localeCompare(b.payee || ''); break;
        case 'category': cmp = (a.category || '').localeCompare(b.category || ''); break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return result;
  }, [transactions, search, filterCategory, filterAccount, filterProperty, filterReconciled, dateFrom, dateTo, sortKey, sortDir]);

  // Stats
  const totalIncome = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpenses = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(t.amount), 0);
  const net = totalIncome - totalExpenses;

  // Paginate
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const accountMap = useMemo(() => new Map(accounts.map(a => [a.id, a.name])), [accounts]);
  const propertyMap = useMemo(() => new Map(properties.map(p => [p.id, p.name])), [properties]);

  const handleReconcileToggle = (tx: Transaction) => {
    updateTx.mutate({ id: tx.id, reconciled: !tx.reconciled }, {
      onError: () => toast({ title: 'Failed to update', variant: 'destructive' }),
    });
  };

  const handleCreate = () => {
    if (!newTx.accountId || !newTx.amount || !newTx.description || !newTx.date) {
      toast({ title: 'Fill required fields', variant: 'destructive' }); return;
    }
    createTx.mutate({
      accountId: newTx.accountId,
      amount: parseFloat(newTx.amount),
      type: newTx.type,
      category: newTx.category || undefined,
      description: newTx.description,
      date: newTx.date,
      payee: newTx.payee || undefined,
      propertyId: newTx.propertyId || undefined,
    }, {
      onSuccess: () => {
        toast({ title: 'Transaction created' });
        setShowAdd(false);
        setNewTx({ accountId: '', amount: '', type: 'expense', category: '', description: '', date: '', payee: '', propertyId: '' });
      },
      onError: () => toast({ title: 'Failed to create', variant: 'destructive' }),
    });
  };

  const exportCsv = () => {
    const header = 'Date,Payee,Description,Category,Amount,Type,Account,Property,Reconciled';
    const rows = filtered.map(t => [
      formatDate(t.date), t.payee || '', t.description, t.category || '',
      t.amount, t.type, accountMap.get(t.accountId) || '', propertyMap.get(t.propertyId || '') || '',
      t.reconciled ? 'Yes' : 'No',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'transactions.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ col }: { col: SortKey }) => (
    <ArrowUpDown className={`w-3 h-3 inline ml-1 ${sortKey === col ? 'text-[hsl(var(--cf-lime))]' : 'opacity-40'}`} />
  );

  return (
    <div className="p-6 space-y-4 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold text-[hsl(var(--cf-text))]">Transactions</h1>
          <p className="text-xs text-[hsl(var(--cf-text-muted))]">{filtered.length} transactions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5">
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5 bg-lime-500 hover:bg-lime-600 text-black">
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="cf-card px-4 py-3 flex items-center gap-3">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <div>
            <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">Income</p>
            <p className="text-sm font-mono font-semibold text-emerald-400">{formatCurrency(totalIncome)}</p>
          </div>
        </div>
        <div className="cf-card px-4 py-3 flex items-center gap-3">
          <TrendingDown className="w-4 h-4 text-rose-400" />
          <div>
            <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">Expenses</p>
            <p className="text-sm font-mono font-semibold text-rose-400">{formatCurrency(totalExpenses)}</p>
          </div>
        </div>
        <div className="cf-card px-4 py-3 flex items-center gap-3">
          <ArrowLeftRight className="w-4 h-4 text-[hsl(var(--cf-lime))]" />
          <div>
            <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">Net</p>
            <p className={`text-sm font-mono font-semibold ${net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(net)}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[hsl(var(--cf-text-muted))]" />
          <Input placeholder="Search payee or description..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-8 h-8 text-xs bg-[hsl(var(--cf-surface))] border-[hsl(var(--cf-border-subtle))]" />
        </div>
        <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }} className="w-[130px] h-8 text-xs bg-[hsl(var(--cf-surface))] border-[hsl(var(--cf-border-subtle))]" />
        <span className="text-xs text-[hsl(var(--cf-text-muted))]">to</span>
        <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }} className="w-[130px] h-8 text-xs bg-[hsl(var(--cf-surface))] border-[hsl(var(--cf-border-subtle))]" />
        <Select value={filterCategory} onValueChange={v => { setFilterCategory(v); setPage(0); }}>
          <SelectTrigger className="w-[130px] h-8 text-xs bg-[hsl(var(--cf-surface))] border-[hsl(var(--cf-border-subtle))]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAccount} onValueChange={v => { setFilterAccount(v); setPage(0); }}>
          <SelectTrigger className="w-[140px] h-8 text-xs bg-[hsl(var(--cf-surface))] border-[hsl(var(--cf-border-subtle))]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterProperty} onValueChange={v => { setFilterProperty(v); setPage(0); }}>
          <SelectTrigger className="w-[140px] h-8 text-xs bg-[hsl(var(--cf-surface))] border-[hsl(var(--cf-border-subtle))]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Properties</SelectItem>
            {properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterReconciled} onValueChange={v => { setFilterReconciled(v); setPage(0); }}>
          <SelectTrigger className="w-[120px] h-8 text-xs bg-[hsl(var(--cf-surface))] border-[hsl(var(--cf-border-subtle))]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Reconciled?</SelectItem>
            <SelectItem value="yes">Reconciled</SelectItem>
            <SelectItem value="no">Unreconciled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="cf-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-[hsl(var(--cf-text-muted))] text-sm">Loading transactions...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[hsl(var(--cf-border-subtle))] text-[hsl(var(--cf-text-muted))]">
                  <th className="text-left px-3 py-2 font-medium cursor-pointer select-none" onClick={() => toggleSort('date')}>Date<SortIcon col="date" /></th>
                  <th className="text-left px-3 py-2 font-medium cursor-pointer select-none" onClick={() => toggleSort('payee')}>Payee<SortIcon col="payee" /></th>
                  <th className="text-left px-3 py-2 font-medium">Description</th>
                  <th className="text-left px-3 py-2 font-medium cursor-pointer select-none" onClick={() => toggleSort('category')}>Category<SortIcon col="category" /></th>
                  <th className="text-right px-3 py-2 font-medium cursor-pointer select-none" onClick={() => toggleSort('amount')}>Amount<SortIcon col="amount" /></th>
                  <th className="text-left px-3 py-2 font-medium">Account</th>
                  <th className="text-left px-3 py-2 font-medium">Property</th>
                  <th className="text-center px-3 py-2 font-medium">Rec.</th>
                </tr>
              </thead>
              <tbody>
                {paged.map(tx => (
                  <tr key={tx.id} className="border-b border-[hsl(var(--cf-border-subtle))] hover:bg-[hsl(var(--cf-raised))] transition-colors">
                    <td className="px-3 py-2 text-[hsl(var(--cf-text-secondary))] whitespace-nowrap">{formatDate(tx.date)}</td>
                    <td className="px-3 py-2 text-[hsl(var(--cf-text))] font-medium max-w-[140px] truncate">{tx.payee || '-'}</td>
                    <td className="px-3 py-2 text-[hsl(var(--cf-text-secondary))] max-w-[200px] truncate">{tx.description}</td>
                    <td className="px-3 py-2">
                      {tx.category ? (
                        <Badge variant="outline" className="text-[10px] font-normal">{tx.category.replace(/_/g, ' ')}</Badge>
                      ) : (
                        <span className="text-[hsl(var(--cf-text-muted))]">-</span>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono font-medium whitespace-nowrap ${tx.type === 'income' ? 'text-emerald-400' : tx.type === 'expense' ? 'text-rose-400' : 'text-cyan-400'}`}>
                      {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}{formatCurrency(Math.abs(tx.amount))}
                    </td>
                    <td className="px-3 py-2 text-[hsl(var(--cf-text-secondary))] max-w-[120px] truncate">{accountMap.get(tx.accountId) || '-'}</td>
                    <td className="px-3 py-2 text-[hsl(var(--cf-text-secondary))] max-w-[120px] truncate">{propertyMap.get(tx.propertyId || '') || '-'}</td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => handleReconcileToggle(tx)} className="p-0.5 rounded hover:bg-[hsl(var(--cf-overlay))] transition-colors">
                        {tx.reconciled ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <X className="w-3.5 h-3.5 text-[hsl(var(--cf-text-muted))]" />}
                      </button>
                    </td>
                  </tr>
                ))}
                {paged.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-[hsl(var(--cf-text-muted))]">No transactions found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-[hsl(var(--cf-border-subtle))]">
            <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">
              {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-6 w-6 p-0">
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-6 w-6 p-0">
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Add Transaction Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Account *</Label>
                <Select value={newTx.accountId} onValueChange={v => setNewTx(p => ({ ...p, accountId: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Type *</Label>
                <Select value={newTx.type} onValueChange={v => setNewTx(p => ({ ...p, type: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Amount *</Label>
                <Input type="number" step="0.01" placeholder="0.00" value={newTx.amount}
                  onChange={e => setNewTx(p => ({ ...p, amount: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs">Date *</Label>
                <Input type="date" value={newTx.date} onChange={e => setNewTx(p => ({ ...p, date: e.target.value }))} className="h-8 text-xs" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Description *</Label>
              <Input placeholder="What was this for?" value={newTx.description}
                onChange={e => setNewTx(p => ({ ...p, description: e.target.value }))} className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Payee</Label>
                <Input placeholder="Who was paid?" value={newTx.payee}
                  onChange={e => setNewTx(p => ({ ...p, payee: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={newTx.category} onValueChange={v => setNewTx(p => ({ ...p, category: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Property</Label>
              <Select value={newTx.propertyId} onValueChange={v => setNewTx(p => ({ ...p, propertyId: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  {properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={createTx.isPending}
              className="bg-lime-500 hover:bg-lime-600 text-black">
              {createTx.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
