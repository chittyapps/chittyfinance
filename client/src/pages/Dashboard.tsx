import { useState } from 'react';
import { Link } from 'wouter';
import {
  DollarSign, TrendingUp, TrendingDown, BarChart3, Users,
  ArrowUpRight, ArrowDownRight, Send, Loader2,
  Plug, ChevronRight, Sparkles, Building2
} from 'lucide-react';
import { usePortfolioSummary } from '@/hooks/use-property';
import { useTenantId, useTenant } from '@/contexts/TenantContext';
import { useQuery, useMutation } from '@tanstack/react-query';
import { formatCurrency } from '@/lib/utils';
import type { Transaction } from '@shared/schema';

/* ─── KPI Metric Card ─── */
function MetricCard({
  label, value, sub, icon: Icon, delta, delay,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  delta?: { value: string; positive: boolean };
  delay: number;
}) {
  return (
    <div
      className="cf-card p-5 animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="cf-metric-label">{label}</span>
        <div className="w-8 h-8 rounded-md bg-[hsl(var(--cf-lime)/0.08)] border border-[hsl(var(--cf-lime)/0.15)] flex items-center justify-center">
          <Icon className="w-4 h-4 text-[hsl(var(--cf-lime))]" />
        </div>
      </div>
      <div className="cf-metric-value">{value}</div>
      <div className="flex items-center gap-2 mt-1.5">
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

/* ─── Transaction Row ─── */
function TxnRow({ title, description, amount, date }: {
  title: string; description?: string; amount: number; date?: string;
}) {
  const positive = amount >= 0;
  return (
    <div className="cf-table-row group">
      <div className="w-8 h-8 rounded-md bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border-subtle))] flex items-center justify-center mr-3 flex-shrink-0">
        {positive
          ? <TrendingUp className="w-3.5 h-3.5 text-[hsl(var(--cf-emerald))]" />
          : <TrendingDown className="w-3.5 h-3.5 text-[hsl(var(--cf-rose))]" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[hsl(var(--cf-text))] truncate">{title}</p>
        {description && <p className="text-xs text-[hsl(var(--cf-text-muted))] truncate">{description}</p>}
      </div>
      {date && <span className="text-[10px] text-[hsl(var(--cf-text-muted))] font-mono mr-4 hidden sm:block">{date}</span>}
      <span className={`font-financial text-sm font-medium ${positive ? 'amount-positive' : 'amount-negative'}`}>
        {positive ? '+' : ''}{formatCurrency(amount)}
      </span>
    </div>
  );
}

/* ─── AI Chat Inline ─── */
function AIQuickChat() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([
    { role: 'assistant', content: 'Ready. Ask about cash flow, optimization, or property performance.' },
  ]);

  const ask = useMutation({
    mutationFn: async (q: string) => {
      const r = await fetch('/api/ai/property-advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q }),
      });
      if (!r.ok) return { content: 'Unable to reach AI advisor.' };
      return r.json() as Promise<{ content: string }>;
    },
    onSuccess: (data) => setMessages(prev => [...prev, { role: 'assistant', content: data.content }]),
  });

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || ask.isPending) return;
    setMessages(prev => [...prev, { role: 'user', content: input }]);
    ask.mutate(input);
    setInput('');
  };

  return (
    <div className="cf-card flex flex-col animate-slide-up" style={{ animationDelay: '200ms' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[hsl(var(--cf-border-subtle))]">
        <Sparkles className="w-4 h-4 text-[hsl(var(--cf-lime))]" />
        <span className="text-sm font-display font-semibold text-[hsl(var(--cf-text))]">AI CFO</span>
        <span className="text-[10px] text-[hsl(var(--cf-text-muted))] ml-auto font-mono">GPT-4o</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto cf-scrollbar p-4 space-y-3 max-h-[280px] min-h-[180px]">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-md px-3 py-2 text-[13px] leading-relaxed ${
              m.role === 'user'
                ? 'bg-[hsl(var(--cf-lime)/0.1)] text-[hsl(var(--cf-text))] border border-[hsl(var(--cf-lime)/0.15)]'
                : 'bg-[hsl(var(--cf-raised))] text-[hsl(var(--cf-text-secondary))]'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {ask.isPending && (
          <div className="flex justify-start">
            <div className="bg-[hsl(var(--cf-raised))] rounded-md px-3 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[hsl(var(--cf-lime))]" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={send} className="flex items-center gap-2 px-4 py-3 border-t border-[hsl(var(--cf-border-subtle))]">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about your finances..."
          disabled={ask.isPending}
          className="flex-1 bg-[hsl(var(--cf-raised))] text-sm text-[hsl(var(--cf-text))] placeholder:text-[hsl(var(--cf-text-muted))] rounded-md px-3 py-2 border border-[hsl(var(--cf-border-subtle))] focus:border-[hsl(var(--cf-lime)/0.4)] focus:outline-none transition-colors"
        />
        <button
          type="submit"
          disabled={ask.isPending || !input.trim()}
          className="w-8 h-8 rounded-md bg-[hsl(var(--cf-lime))] text-black flex items-center justify-center hover:bg-[hsl(var(--cf-lime-bright))] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}

/* ─── Integration Status Strip ─── */
function IntegrationStrip() {
  const { data } = useQuery<Record<string, { configured: boolean; label?: string }>>({
    queryKey: ['/api/integrations/status'],
    staleTime: 60_000,
  });

  const services = [
    { key: 'mercury', label: 'Mercury', color: '--cf-cyan' },
    { key: 'wave', label: 'Wave', color: '--cf-violet' },
    { key: 'stripe', label: 'Stripe', color: '--cf-amber' },
    { key: 'openai', label: 'OpenAI', color: '--cf-lime' },
  ];

  return (
    <div className="cf-card p-4 animate-slide-up" style={{ animationDelay: '250ms' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Plug className="w-3.5 h-3.5 text-[hsl(var(--cf-text-muted))]" />
          <span className="cf-section-title">Integrations</span>
        </div>
        <Link href="/connections">
          <span className="text-[11px] text-[hsl(var(--cf-lime))] hover:text-[hsl(var(--cf-lime-bright))] cursor-pointer flex items-center gap-0.5">
            Manage <ChevronRight className="w-3 h-3" />
          </span>
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {services.map(s => {
          const configured = data?.[s.key]?.configured ?? false;
          return (
            <div key={s.key} className="flex items-center gap-2 px-3 py-2 rounded-md bg-[hsl(var(--cf-raised))]">
              <span className={`w-1.5 h-1.5 rounded-full ${configured ? 'bg-[hsl(var(--cf-emerald))]' : 'bg-[hsl(var(--cf-text-muted))]'}`}
                style={configured ? { boxShadow: '0 0 6px hsl(var(--cf-emerald) / 0.5)' } : {}}
              />
              <span className="text-xs text-[hsl(var(--cf-text-secondary))]">{s.label}</span>
              <span className={`ml-auto text-[10px] font-mono ${configured ? 'text-[hsl(var(--cf-emerald))]' : 'text-[hsl(var(--cf-text-muted))]'}`}>
                {configured ? 'live' : 'off'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main Dashboard ─── */
export default function Dashboard() {
  const tenantId = useTenantId();
  const { currentTenant } = useTenant();
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolioSummary();
  const { data: transactions = [] } = useQuery<Transaction[]>({
    queryKey: ['/api/transactions', tenantId, { limit: 6 }],
    enabled: !!tenantId,
  });

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[hsl(var(--cf-text-muted))]">Select a tenant to view the dashboard.</p>
      </div>
    );
  }

  const recent = transactions.slice(0, 6);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Page Header */}
      <div className="animate-slide-up">
        <h1 className="text-2xl font-display font-bold text-[hsl(var(--cf-text))] tracking-tight">
          Financial Overview
        </h1>
        <p className="text-sm text-[hsl(var(--cf-text-muted))] mt-0.5">
          {currentTenant?.name || 'All entities'} — {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Portfolio Value"
          value={portfolioLoading ? '—' : formatCurrency(portfolio?.totalValue ?? 0)}
          sub={`${portfolio?.totalProperties ?? 0} properties`}
          icon={DollarSign}
          delay={50}
        />
        <MetricCard
          label="Total NOI"
          value={portfolioLoading ? '—' : formatCurrency(portfolio?.totalNOI ?? 0)}
          sub="Last 12 months"
          icon={BarChart3}
          delta={{ value: '5.2%', positive: true }}
          delay={100}
        />
        <MetricCard
          label="Avg Cap Rate"
          value={portfolioLoading ? '—' : `${(portfolio?.avgCapRate ?? 0).toFixed(1)}%`}
          sub="Weighted by value"
          icon={TrendingUp}
          delay={150}
        />
        <MetricCard
          label="Occupancy"
          value={portfolioLoading ? '—' : `${(portfolio?.occupancyRate ?? 0).toFixed(0)}%`}
          sub={`${portfolio?.occupiedUnits ?? 0}/${portfolio?.totalUnits ?? 0} units`}
          icon={Users}
          delay={200}
        />
      </div>

      {/* Two Column: Activity + AI */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: Recent Activity (3 cols) */}
        <div className="lg:col-span-3 space-y-6">
          {/* Recent Transactions */}
          <div className="cf-card animate-slide-up" style={{ animationDelay: '150ms' }}>
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
                No recent transactions
              </div>
            ) : (
              <div>
                {recent.map((tx, i) => (
                  <TxnRow
                    key={tx.id ?? i}
                    title={tx.title || tx.description || 'Transaction'}
                    description={tx.description ?? undefined}
                    amount={Number(tx.amount)}
                    date={tx.date ? new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : undefined}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Quick Property Summary */}
          {portfolio && portfolio.properties.length > 0 && (
            <div className="cf-card animate-slide-up" style={{ animationDelay: '200ms' }}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--cf-border-subtle))]">
                <span className="text-sm font-display font-semibold text-[hsl(var(--cf-text))]">Properties</span>
                <Link href="/">
                  <span className="text-[11px] text-[hsl(var(--cf-lime))] hover:text-[hsl(var(--cf-lime-bright))] cursor-pointer flex items-center gap-0.5">
                    Portfolio <ChevronRight className="w-3 h-3" />
                  </span>
                </Link>
              </div>
              <div className="divide-y divide-[hsl(var(--cf-border-subtle))]">
                {portfolio.properties.slice(0, 4).map(p => (
                  <Link key={p.id} href={`/properties/${p.id}`}>
                    <div className="flex items-center px-4 py-3 hover:bg-[hsl(var(--cf-raised))] transition-colors cursor-pointer group">
                      <div className="w-8 h-8 rounded-md bg-[hsl(var(--cf-lime)/0.06)] border border-[hsl(var(--cf-lime)/0.12)] flex items-center justify-center mr-3">
                        <Building2 className="w-3.5 h-3.5 text-[hsl(var(--cf-lime-dim))]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[hsl(var(--cf-text))] truncate group-hover:text-[hsl(var(--cf-lime-bright))] transition-colors">{p.name}</p>
                        <p className="text-[11px] text-[hsl(var(--cf-text-muted))]">{p.city}, {p.state}</p>
                      </div>
                      <div className="text-right ml-4">
                        <p className="font-financial text-sm text-[hsl(var(--cf-text))]">{formatCurrency(p.currentValue)}</p>
                        <p className="text-[10px] text-[hsl(var(--cf-text-muted))] font-mono">{p.capRate.toFixed(1)}% cap</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: AI + Integrations (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <AIQuickChat />
          <IntegrationStrip />
        </div>
      </div>
    </div>
  );
}
