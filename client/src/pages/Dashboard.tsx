import { useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight,
  Building2, CheckCircle2, ChevronRight, Loader2, RefreshCw,
  Send, ShieldAlert, Sparkles, Users, XCircle,
} from 'lucide-react';
import { useTenant, useTenantId } from '@/contexts/TenantContext';
import { formatCurrency } from '@/lib/utils';
import { usePortfolioSummary } from '@/hooks/use-property';
import { useActionQueue, type ActionItem, type ActionSeverity } from '@/hooks/use-action-queue';
import { useConnectionHealth } from '@/hooks/use-connection-health';
import { useConsolidatedReport } from '@/hooks/use-reports';
import type { Transaction } from '@/hooks/use-transactions';

interface FinancialSummary {
  cashOnHand: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
  outstandingInvoices: number;
}

// ─── Severity styling ───
const SEVERITY_STYLE: Record<ActionSeverity, { bg: string; text: string; icon: typeof XCircle }> = {
  critical: { bg: 'hsl(var(--cf-rose) / 0.1)', text: 'hsl(var(--cf-rose))', icon: XCircle },
  warning: { bg: 'hsl(var(--cf-amber) / 0.1)', text: 'hsl(var(--cf-amber))', icon: AlertTriangle },
  info: { bg: 'hsl(var(--cf-cyan) / 0.1)', text: 'hsl(var(--cf-cyan))', icon: Activity },
};

// ─── Metric Card ───
function MetricCard({
  label, value, sub, delta, delay,
}: {
  label: string;
  value: string;
  sub: string;
  delta?: { value: string; positive: boolean };
  delay: number;
}) {
  return (
    <div className="cf-card p-4 animate-slide-up" style={{ animationDelay: `${delay}ms` }}>
      <span className="cf-metric-label">{label}</span>
      <div className="cf-metric-value mt-1.5">{value}</div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-[11px] text-[hsl(var(--cf-text-muted))]">{sub}</span>
        {delta && (
          <span className={`cf-metric-delta ${delta.positive ? 'text-[hsl(var(--cf-emerald))]' : 'text-[hsl(var(--cf-rose))]'}`}>
            {delta.positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {delta.value}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Action Item Row ───
function ActionRow({ item }: { item: ActionItem }) {
  const style = SEVERITY_STYLE[item.severity];
  const Icon = style.icon;

  return (
    <Link href={item.actionHref}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[hsl(var(--cf-border-subtle))] hover:bg-[hsl(var(--cf-raised))] cursor-pointer transition-colors group">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ background: style.bg }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color: style.text }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[hsl(var(--cf-text))] truncate">{item.title}</p>
          <p className="text-[11px] text-[hsl(var(--cf-text-muted))] truncate">{item.detail}</p>
        </div>
        {item.count !== undefined && (
          <span
            className="px-2 py-0.5 rounded-sm text-[10px] font-financial font-bold"
            style={{ background: style.bg, color: style.text }}
          >
            {item.count}
          </span>
        )}
        <span className="text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5" style={{ color: style.text }}>
          {item.actionLabel} <ArrowRight className="w-3 h-3" />
        </span>
      </div>
    </Link>
  );
}

// ─── Connection Pulse ───
function ConnectionPulse() {
  const { healthMap, services, connectedCount, configuredCount, refresh, lastChecked } = useConnectionHealth();
  const timeSince = lastChecked ? Math.round((Date.now() - lastChecked) / 1000) : null;

  return (
    <div className="cf-card animate-slide-up" style={{ animationDelay: '160ms' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--cf-border-subtle))]">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-[hsl(var(--cf-lime))]" />
          <span className="text-sm font-display font-semibold text-[hsl(var(--cf-text))]">Connections</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[hsl(var(--cf-text-muted))] font-mono">
            {connectedCount}/{configuredCount} live
            {timeSince !== null && ` · ${timeSince < 60 ? 'just now' : `${Math.floor(timeSince / 60)}m ago`}`}
          </span>
          <button
            onClick={refresh}
            className="p-1 rounded text-[hsl(var(--cf-text-muted))] hover:text-[hsl(var(--cf-text))] transition-colors"
            title="Refresh status"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
        {services.map((svc) => {
          const h = healthMap[svc.key];
          if (!h) return null;
          const color = h.connected
            ? 'var(--cf-emerald)'
            : h.configured
              ? 'var(--cf-rose)'
              : 'var(--cf-text-muted)';
          const statusLabel = h.connected ? 'live' : h.configured ? 'down' : 'off';
          return (
            <div key={svc.key} className="flex items-center gap-2 px-3 py-2 rounded-md bg-[hsl(var(--cf-raised))]">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{
                  background: `hsl(${color})`,
                  boxShadow: h.connected ? `0 0 6px hsl(${color} / 0.5)` : 'none',
                }}
              />
              <span className="text-xs text-[hsl(var(--cf-text-secondary))] truncate">{h.name}</span>
              <span
                className="ml-auto text-[10px] font-mono flex-shrink-0"
                style={{ color: `hsl(${color})` }}
              >
                {statusLabel}
              </span>
            </div>
          );
        })}
      </div>
      <div className="px-4 pb-3">
        <Link href="/connections">
          <span className="text-[11px] text-[hsl(var(--cf-lime))] hover:text-[hsl(var(--cf-lime-bright))] cursor-pointer flex items-center gap-0.5">
            Manage connections <ChevronRight className="w-3 h-3" />
          </span>
        </Link>
      </div>
    </div>
  );
}

// ─── Data Health Bar ───
function DataHealth() {
  const tenantId = useTenantId();
  const now = new Date();
  const { data: reportData } = useConsolidatedReport(
    tenantId
      ? {
          startDate: `${now.getFullYear()}-01-01`,
          endDate: `${now.getFullYear()}-12-31`,
          includeDescendants: true,
          includeIntercompany: false,
        }
      : null,
  );

  const quality = reportData?.report?.quality;
  const preflight = reportData?.preflight;
  const checks = reportData?.verificationChecklist ?? [];
  const passCount = checks.filter((c) => c.status === 'pass').length;
  const failCount = checks.filter((c) => c.status === 'fail').length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;

  if (!quality && !preflight) {
    return (
      <div className="cf-card p-4 animate-slide-up" style={{ animationDelay: '200ms' }}>
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert className="w-3.5 h-3.5 text-[hsl(var(--cf-text-muted))]" />
          <span className="cf-section-title">Data Health</span>
        </div>
        <p className="text-xs text-[hsl(var(--cf-text-muted))]">Select a tenant to see data quality metrics.</p>
      </div>
    );
  }

  return (
    <div className="cf-card p-4 animate-slide-up" style={{ animationDelay: '200ms' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-3.5 h-3.5 text-[hsl(var(--cf-text-muted))]" />
          <span className="cf-section-title">Data Health</span>
        </div>
        {preflight && (
          <span className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-sm ${
            preflight.readyToFileTaxes
              ? 'bg-[hsl(var(--cf-emerald)/0.1)] text-[hsl(var(--cf-emerald))]'
              : 'bg-[hsl(var(--cf-amber)/0.1)] text-[hsl(var(--cf-amber))]'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${preflight.readyToFileTaxes ? 'bg-[hsl(var(--cf-emerald))]' : 'bg-[hsl(var(--cf-amber))]'}`} />
            {preflight.readyToFileTaxes ? 'Ready' : 'Needs Work'}
          </span>
        )}
      </div>

      {/* Quality gauge */}
      {quality && quality.totalTransactions > 0 && (
        <div className="space-y-2 mb-3">
          {[
            { label: 'Reconciled', good: quality.totalTransactions - (reportData?.report?.quality?.unreconciledCount ?? 0), total: quality.totalTransactions, color: 'var(--cf-emerald)' },
            { label: 'Categorized', good: quality.totalTransactions - quality.uncategorizedCount, total: quality.totalTransactions, color: 'var(--cf-cyan)' },
          ].map((row) => {
            const pct = row.total > 0 ? (row.good / row.total) * 100 : 0;
            return (
              <div key={row.label}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">{row.label}</span>
                  <span className="text-[10px] font-mono text-[hsl(var(--cf-text-secondary))]">
                    {row.good}/{row.total} ({pct.toFixed(0)}%)
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[hsl(var(--cf-raised))] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, background: `hsl(${row.color})` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Verification checks summary */}
      {checks.length > 0 && (
        <div className="flex items-center gap-3 pt-2 border-t border-[hsl(var(--cf-border-subtle))]">
          {passCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-[hsl(var(--cf-emerald))]">
              <CheckCircle2 className="w-3 h-3" /> {passCount} pass
            </span>
          )}
          {warnCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-[hsl(var(--cf-amber))]">
              <AlertTriangle className="w-3 h-3" /> {warnCount} warn
            </span>
          )}
          {failCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-[hsl(var(--cf-rose))]">
              <XCircle className="w-3 h-3" /> {failCount} fail
            </span>
          )}
          <Link href="/reports" className="ml-auto">
            <span className="text-[11px] text-[hsl(var(--cf-lime))] hover:text-[hsl(var(--cf-lime-bright))] cursor-pointer flex items-center gap-0.5">
              Report <ChevronRight className="w-3 h-3" />
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Transaction Row ───
function TxnRow({ title, amount, date }: { title: string; amount: number; date?: string }) {
  const positive = amount >= 0;
  return (
    <div className="cf-table-row group">
      <div className="w-7 h-7 rounded-md bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border-subtle))] flex items-center justify-center mr-3 flex-shrink-0">
        {positive
          ? <ArrowUpRight className="w-3.5 h-3.5 text-[hsl(var(--cf-emerald))]" />
          : <ArrowDownRight className="w-3.5 h-3.5 text-[hsl(var(--cf-rose))]" />}
      </div>
      <p className="flex-1 text-sm font-medium text-[hsl(var(--cf-text))] truncate">{title}</p>
      {date && <span className="text-[10px] text-[hsl(var(--cf-text-muted))] font-mono mr-4 hidden sm:block">{date}</span>}
      <span className={`font-financial text-sm font-medium ${positive ? 'amount-positive' : 'amount-negative'}`}>
        {positive ? '+' : ''}{formatCurrency(amount)}
      </span>
    </div>
  );
}

// ─── AI Quick Chat ───
function AIQuickChat() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([
    { role: 'assistant', content: 'Ask about your financial position, transaction issues, or property metrics.' },
  ]);
  const [pending, setPending] = useState(false);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!input.trim() || pending) return;
    const q = input;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setPending(true);
    try {
      const r = await fetch('/api/ai/property-advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q }),
      });
      const data: { content: string } = r.ok ? await r.json() : { content: 'Unable to reach AI advisor.' };
      setMessages((prev) => [...prev, { role: 'assistant', content: data.content }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Connection error.' }]);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="cf-card flex flex-col animate-slide-up" style={{ animationDelay: '240ms' }}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[hsl(var(--cf-border-subtle))]">
        <Sparkles className="w-4 h-4 text-[hsl(var(--cf-lime))]" />
        <span className="text-sm font-display font-semibold text-[hsl(var(--cf-text))]">AI Advisor</span>
      </div>
      <div className="flex-1 overflow-y-auto cf-scrollbar p-4 space-y-3 max-h-[260px] min-h-[140px]">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-md px-3 py-2 text-[13px] leading-relaxed ${
              msg.role === 'user'
                ? 'bg-[hsl(var(--cf-lime)/0.1)] text-[hsl(var(--cf-text))] border border-[hsl(var(--cf-lime)/0.15)]'
                : 'bg-[hsl(var(--cf-raised))] text-[hsl(var(--cf-text-secondary))]'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex justify-start">
            <div className="bg-[hsl(var(--cf-raised))] rounded-md px-3 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[hsl(var(--cf-lime))]" />
            </div>
          </div>
        )}
      </div>
      <form onSubmit={send} className="flex items-center gap-2 px-4 py-3 border-t border-[hsl(var(--cf-border-subtle))]">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about finances, properties, or data quality..."
          disabled={pending}
          className="flex-1 bg-[hsl(var(--cf-raised))] text-sm text-[hsl(var(--cf-text))] placeholder:text-[hsl(var(--cf-text-muted))] rounded-md px-3 py-2 border border-[hsl(var(--cf-border-subtle))] focus:border-[hsl(var(--cf-lime)/0.4)] focus:outline-none transition-colors"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="w-8 h-8 rounded-md bg-[hsl(var(--cf-lime))] text-black flex items-center justify-center hover:bg-[hsl(var(--cf-lime-bright))] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}

// ─── Dashboard ───
export default function Dashboard() {
  const tenantId = useTenantId();
  const { currentTenant } = useTenant();
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolioSummary();
  const { items: actionItems, criticalCount, total: actionTotal } = useActionQueue();

  const { data: financialSummary } = useQuery<FinancialSummary>({
    queryKey: ['/api/financial-summary'],
    enabled: !tenantId,
  });
  const { data: transactions = [] } = useQuery<Transaction[]>({
    queryKey: ['/api/transactions?limit=8'],
  });

  const recent = transactions.slice(0, 8);

  // Metric computations from real data
  const primaryValue = tenantId
    ? formatCurrency(portfolio?.totalValue ?? 0)
    : formatCurrency(financialSummary?.cashOnHand ?? 0);
  const primarySub = tenantId ? `${portfolio?.totalProperties ?? 0} properties` : 'cash on hand';
  const secondaryValue = tenantId
    ? formatCurrency(portfolio?.totalNOI ?? 0)
    : formatCurrency(financialSummary?.monthlyRevenue ?? 0);
  const secondarySub = tenantId ? 'trailing 12m NOI' : 'monthly revenue';
  const tertiaryValue = tenantId
    ? `${(portfolio?.avgCapRate ?? 0).toFixed(1)}%`
    : formatCurrency(financialSummary?.monthlyExpenses ?? 0);
  const tertiarySub = tenantId ? 'weighted cap rate' : 'monthly expenses';
  const quaternaryValue = tenantId
    ? `${(portfolio?.occupancyRate ?? 0).toFixed(0)}%`
    : formatCurrency(financialSummary?.outstandingInvoices ?? 0);
  const quaternarySub = tenantId
    ? `${portfolio?.occupiedUnits ?? 0}/${portfolio?.totalUnits ?? 0} units`
    : 'outstanding invoices';

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1440px] mx-auto">
      {/* Attention banner — only shown when there are critical items */}
      {criticalCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-md bg-[hsl(var(--cf-rose)/0.08)] border border-[hsl(var(--cf-rose)/0.15)] animate-slide-up">
          <XCircle className="w-4 h-4 text-[hsl(var(--cf-rose))] flex-shrink-0" />
          <span className="text-sm text-[hsl(var(--cf-rose))] font-medium">
            {criticalCount} critical item{criticalCount !== 1 ? 's' : ''} need attention
          </span>
          <span className="text-[11px] text-[hsl(var(--cf-text-muted))] ml-auto">
            {currentTenant?.name ?? 'Standalone'}
          </span>
        </div>
      )}

      {/* Financial metrics */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={tenantId ? 'Portfolio Value' : 'Liquidity'}
          value={portfolioLoading ? '\u2014' : primaryValue}
          sub={primarySub}
          delay={0}
        />
        <MetricCard
          label={tenantId ? 'Net Operating Income' : 'Revenue'}
          value={portfolioLoading ? '\u2014' : secondaryValue}
          sub={secondarySub}
          delay={40}
        />
        <MetricCard
          label={tenantId ? 'Cap Rate' : 'Expense Run Rate'}
          value={portfolioLoading ? '\u2014' : tertiaryValue}
          sub={tertiarySub}
          delay={80}
        />
        <MetricCard
          label={tenantId ? 'Occupancy' : 'Outstanding'}
          value={portfolioLoading ? '\u2014' : quaternaryValue}
          sub={quaternarySub}
          delay={120}
          delta={
            tenantId && portfolio
              ? {
                  value: `${portfolio.occupiedUnits} occupied`,
                  positive: portfolio.occupancyRate >= 80,
                }
              : undefined
          }
        />
      </div>

      {/* Main content: Action Queue + Sidebar */}
      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        {/* Action queue — the core utility */}
        <div className="cf-card animate-slide-up" style={{ animationDelay: '80ms' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--cf-border-subtle))]">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[hsl(var(--cf-amber))]" />
              <span className="text-sm font-display font-semibold text-[hsl(var(--cf-text))]">Action Queue</span>
            </div>
            <span className="text-[10px] text-[hsl(var(--cf-text-muted))] font-mono">
              {actionTotal} item{actionTotal !== 1 ? 's' : ''}
            </span>
          </div>
          {actionItems.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <CheckCircle2 className="w-6 h-6 text-[hsl(var(--cf-emerald))] mx-auto mb-2" />
              <p className="text-sm text-[hsl(var(--cf-text-secondary))]">All clear. No items need attention.</p>
              <p className="text-[11px] text-[hsl(var(--cf-text-muted))] mt-1">Data syncs will surface new items automatically.</p>
            </div>
          ) : (
            <div>
              {actionItems.map((item) => (
                <ActionRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>

        {/* Right column: health + connections */}
        <div className="space-y-5">
          <DataHealth />
          <ConnectionPulse />
        </div>
      </div>

      {/* Bottom row: Recent activity + AI */}
      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="cf-card animate-slide-up" style={{ animationDelay: '160ms' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--cf-border-subtle))]">
            <span className="text-sm font-display font-semibold text-[hsl(var(--cf-text))]">Recent Activity</span>
            <Link href="/transactions">
              <span className="text-[11px] text-[hsl(var(--cf-lime))] hover:text-[hsl(var(--cf-lime-bright))] cursor-pointer flex items-center gap-0.5">
                View all <ChevronRight className="w-3 h-3" />
              </span>
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[hsl(var(--cf-text-muted))]">
              No transactions yet
            </div>
          ) : (
            <div>
              {recent.map((tx, i) => (
                <TxnRow
                  key={tx.id ?? i}
                  title={tx.description || tx.payee || 'Transaction'}
                  amount={Number(tx.amount)}
                  date={tx.date ? new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : undefined}
                />
              ))}
            </div>
          )}
        </div>

        <AIQuickChat />
      </div>
    </div>
  );
}
