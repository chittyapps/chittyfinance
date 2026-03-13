import { useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Activity, ArrowDownRight, ArrowUpRight, Bot, Building2, CheckCircle2,
  ChevronRight, ClipboardCheck, Loader2, Plug, Send, ShieldCheck,
  Sparkles, Users, Workflow,
} from 'lucide-react';
import { useTenant, useTenantId } from '@/contexts/TenantContext';
import { useRole } from '@/contexts/RoleContext';
import { formatCurrency } from '@/lib/utils';
import { usePortfolioSummary } from '@/hooks/use-property';
import { useOperatingPreferences } from '@/hooks/use-operating-preferences';
import { useConsolidatedReport } from '@/hooks/use-reports';
import {
  buildFocusQueue,
  getEnabledAgentCards,
  getScenario,
  type SimpleTask,
  type SimpleWorkflow,
} from '@/lib/operating-model';
import type { Transaction } from '@shared/schema';

interface FinancialSummary {
  cashOnHand: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
  outstandingInvoices: number;
}

interface IntegrationStatus {
  configured: boolean;
  label?: string;
}

function MetricCard({
  label,
  value,
  sub,
  delta,
  icon: Icon,
  delay,
}: {
  label: string;
  value: string;
  sub: string;
  delta?: { value: string; positive: boolean };
  icon: typeof Activity;
  delay: number;
}) {
  return (
    <div className="cf-card p-5 animate-slide-up" style={{ animationDelay: `${delay}ms` }}>
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

function QueueCard({
  title,
  items,
}: {
  title: string;
  items: ReturnType<typeof buildFocusQueue>;
}) {
  return (
    <div className="cf-card animate-slide-up">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--cf-border-subtle))]">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-[hsl(var(--cf-lime))]" />
          <span className="text-sm font-display font-semibold text-[hsl(var(--cf-text))]">{title}</span>
        </div>
        <span className="text-[10px] text-[hsl(var(--cf-text-muted))] font-mono">{items.length} active</span>
      </div>
      <div className="p-3 space-y-2">
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed border-[hsl(var(--cf-border-active))] px-3 py-6 text-center text-xs text-[hsl(var(--cf-text-muted))]">
            Queue is clear. Keep agents running and approvals tight.
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="rounded-md border border-[hsl(var(--cf-border-subtle))] bg-[hsl(var(--cf-raised))] px-3 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[hsl(var(--cf-text))]">{item.title}</p>
                  <p className="text-xs text-[hsl(var(--cf-text-muted))] mt-1">{item.detail}</p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-sm text-[10px] font-semibold uppercase tracking-wider ${
                    item.severity === 'high'
                      ? 'bg-[hsl(var(--cf-rose)/0.14)] text-[hsl(var(--cf-rose))]'
                      : item.severity === 'medium'
                        ? 'bg-[hsl(var(--cf-amber)/0.14)] text-[hsl(var(--cf-amber))]'
                        : 'bg-[hsl(var(--cf-cyan)/0.14)] text-[hsl(var(--cf-cyan))]'
                  }`}
                >
                  {item.lane}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AgentGrid({
  items,
}: {
  items: ReturnType<typeof getEnabledAgentCards>;
}) {
  return (
    <div className="cf-card animate-slide-up" style={{ animationDelay: '140ms' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--cf-border-subtle))]">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-[hsl(var(--cf-cyan))]" />
          <span className="text-sm font-display font-semibold text-[hsl(var(--cf-text))]">Accountable Agents</span>
        </div>
        <span className="text-[10px] text-[hsl(var(--cf-text-muted))] font-mono">human-led</span>
      </div>
      <div className="grid gap-3 p-3 md:grid-cols-2">
        {items.map((agent) => (
          <div key={agent.id} className="rounded-md border border-[hsl(var(--cf-border-subtle))] bg-[hsl(var(--cf-raised))] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-[hsl(var(--cf-text))]">{agent.name}</p>
                  <span className="cf-role-badge" data-role={agent.ownerRole}>
                    {agent.ownerRole}
                  </span>
                </div>
                <p className="text-xs text-[hsl(var(--cf-text-muted))] mt-1">{agent.summary}</p>
              </div>
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  agent.state === 'attention'
                    ? 'bg-[hsl(var(--cf-amber))]'
                    : agent.state === 'standby'
                      ? 'bg-[hsl(var(--cf-text-muted))]'
                      : 'bg-[hsl(var(--cf-emerald))]'
                }`}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px]">
              <span className="text-[hsl(var(--cf-text-secondary))]">{agent.metric}</span>
              <span className="text-[hsl(var(--cf-text-muted))]">checkpoint</span>
            </div>
            <p className="text-[11px] text-[hsl(var(--cf-text-muted))] mt-1">{agent.checkpoint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TxnRow({
  title,
  description,
  amount,
  date,
}: {
  title: string;
  description?: string;
  amount: number;
  date?: string;
}) {
  const positive = amount >= 0;
  return (
    <div className="cf-table-row group">
      <div className="w-8 h-8 rounded-md bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border-subtle))] flex items-center justify-center mr-3 flex-shrink-0">
        {positive
          ? <ArrowUpRight className="w-3.5 h-3.5 text-[hsl(var(--cf-emerald))]" />
          : <ArrowDownRight className="w-3.5 h-3.5 text-[hsl(var(--cf-rose))]" />
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

function AIQuickChat() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([
    { role: 'assistant', content: 'Ready. Ask for queue triage, close blockers, or an execution plan for your current scenario.' },
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
    onSuccess: (data) => setMessages((prev) => [...prev, { role: 'assistant', content: data.content }]),
  });

  const send = (event: FormEvent) => {
    event.preventDefault();
    if (!input.trim() || ask.isPending) return;
    setMessages((prev) => [...prev, { role: 'user', content: input }]);
    ask.mutate(input);
    setInput('');
  };

  return (
    <div className="cf-card flex flex-col animate-slide-up" style={{ animationDelay: '180ms' }}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[hsl(var(--cf-border-subtle))]">
        <Sparkles className="w-4 h-4 text-[hsl(var(--cf-lime))]" />
        <span className="text-sm font-display font-semibold text-[hsl(var(--cf-text))]">AI CFO</span>
        <span className="text-[10px] text-[hsl(var(--cf-text-muted))] ml-auto font-mono">scenario assist</span>
      </div>

      <div className="flex-1 overflow-y-auto cf-scrollbar p-4 space-y-3 max-h-[280px] min-h-[180px]">
        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-md px-3 py-2 text-[13px] leading-relaxed ${
              message.role === 'user'
                ? 'bg-[hsl(var(--cf-lime)/0.1)] text-[hsl(var(--cf-text))] border border-[hsl(var(--cf-lime)/0.15)]'
                : 'bg-[hsl(var(--cf-raised))] text-[hsl(var(--cf-text-secondary))]'
            }`}>
              {message.content}
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

      <form onSubmit={send} className="flex items-center gap-2 px-4 py-3 border-t border-[hsl(var(--cf-border-subtle))]">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask how to run this queue..."
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

function IntegrationStrip({
  data,
}: {
  data?: Record<string, IntegrationStatus>;
}) {
  const services = [
    { key: 'mercury', label: 'Mercury' },
    { key: 'wave', label: 'Wave' },
    { key: 'stripe', label: 'Stripe' },
    { key: 'openai', label: 'OpenAI' },
  ];

  return (
    <div className="cf-card p-4 animate-slide-up" style={{ animationDelay: '220ms' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Plug className="w-3.5 h-3.5 text-[hsl(var(--cf-text-muted))]" />
          <span className="cf-section-title">Automation Surface</span>
        </div>
        <Link href="/connections">
          <span className="text-[11px] text-[hsl(var(--cf-lime))] hover:text-[hsl(var(--cf-lime-bright))] cursor-pointer flex items-center gap-0.5">
            Manage <ChevronRight className="w-3 h-3" />
          </span>
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {services.map((service) => {
          const configured = data?.[service.key]?.configured ?? false;
          return (
            <div key={service.key} className="flex items-center gap-2 px-3 py-2 rounded-md bg-[hsl(var(--cf-raised))]">
              <span
                className={`w-1.5 h-1.5 rounded-full ${configured ? 'bg-[hsl(var(--cf-emerald))]' : 'bg-[hsl(var(--cf-text-muted))]'}`}
                style={configured ? { boxShadow: '0 0 6px hsl(var(--cf-emerald) / 0.5)' } : undefined}
              />
              <span className="text-xs text-[hsl(var(--cf-text-secondary))]">{service.label}</span>
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

export default function Dashboard() {
  const tenantId = useTenantId();
  const { currentTenant } = useTenant();
  const { currentRole, roleConfig } = useRole();
  const { preferences } = useOperatingPreferences();
  const scenario = getScenario(currentRole, preferences.activeScenarioId);

  const { data: portfolio, isLoading: portfolioLoading } = usePortfolioSummary();
  const { data: financialSummary } = useQuery<FinancialSummary>({
    queryKey: ['/api/financial-summary'],
    enabled: !tenantId,
  });
  const { data: transactions = [] } = useQuery<Transaction[]>({
    queryKey: ['/api/transactions?limit=6'],
  });
  const { data: tasks = [] } = useQuery<SimpleTask[]>({
    queryKey: ['/api/tasks'],
  });
  const { data: workflows = [] } = useQuery<SimpleWorkflow[]>({
    queryKey: ['/api/workflows'],
    enabled: !!tenantId,
  });
  const { data: integrationStatus } = useQuery<Record<string, IntegrationStatus>>({
    queryKey: ['/api/integrations/status'],
    staleTime: 60_000,
  });
  const { data: reportData } = useConsolidatedReport(
    tenantId
      ? {
          startDate: `${new Date().getFullYear()}-01-01`,
          endDate: `${new Date().getFullYear()}-12-31`,
          includeDescendants: true,
          includeIntercompany: false,
        }
      : null,
  );

  const checks = reportData?.verificationChecklist ?? [];
  const integrationsConfigured = Object.values(integrationStatus ?? {}).filter((item) => item.configured).length;
  const openTaskCount = tasks.filter((task) => !task.completed && task.status !== 'completed').length;
  const pendingApprovals = workflows.filter((workflow) => workflow.status === 'requested').length;
  const agentCards = getEnabledAgentCards({
    role: currentRole,
    preferences,
    tasks,
    workflows,
    integrationsConfigured,
    checks,
  });
  const focusQueue = buildFocusQueue({
    role: currentRole,
    tasks,
    workflows,
    checks,
    preferences,
  });
  const recent = transactions.slice(0, 6);
  const readyToFile = reportData?.preflight?.readyToFileTaxes ?? false;
  const scenarioSummary = `${scenario.trigger} · ${scenario.outcome}`;

  const primaryValue = tenantId
    ? formatCurrency(portfolio?.totalValue ?? 0)
    : formatCurrency(financialSummary?.cashOnHand ?? 0);
  const primarySub = tenantId
    ? `${portfolio?.totalProperties ?? 0} properties`
    : 'cash on hand';
  const secondaryValue = tenantId
    ? formatCurrency(portfolio?.totalNOI ?? 0)
    : formatCurrency(financialSummary?.monthlyRevenue ?? 0);
  const secondarySub = tenantId ? 'Last 12 months' : 'monthly revenue';
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
    <div className="p-6 lg:p-8 space-y-6 max-w-[1440px] mx-auto">
      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
        <div className="cf-card overflow-hidden animate-slide-up">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--cf-lime)/0.12),transparent_45%)] pointer-events-none" />
          <div className="relative p-6 lg:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="cf-role-badge" data-role={currentRole}>{roleConfig.label}</span>
                  <span className="text-[11px] uppercase tracking-[0.08em] text-[hsl(var(--cf-text-muted))]">
                    {preferences.automationMode}
                  </span>
                </div>
                <h1 className="text-2xl lg:text-3xl font-display font-semibold text-[hsl(var(--cf-text))] mt-3 tracking-tight">
                  Human-led finance operations, agent-accountable by design.
                </h1>
                <p className="text-sm text-[hsl(var(--cf-text-secondary))] mt-2 max-w-2xl">
                  {roleConfig.headline}
                </p>
              </div>
              <div className="rounded-md border border-[hsl(var(--cf-border-active))] bg-[hsl(var(--cf-raised))] px-4 py-3 min-w-[260px]">
                <p className="text-[10px] uppercase tracking-[0.08em] text-[hsl(var(--cf-text-muted))]">Command Context</p>
                <p className="text-sm font-medium text-[hsl(var(--cf-text))] mt-1">
                  {currentTenant?.name || 'Standalone operator workspace'}
                </p>
                <p className="text-xs text-[hsl(var(--cf-text-muted))] mt-1">
                  Leader: {preferences.leaderName} · Digest: {preferences.digestCadence}
                </p>
                <p className="text-xs text-[hsl(var(--cf-text-muted))] mt-2">
                  Scenario: {scenario.title}
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3 mt-6">
              <div className="rounded-md border border-[hsl(var(--cf-border-subtle))] bg-[hsl(var(--cf-raised))] px-4 py-4">
                <p className="text-[10px] uppercase tracking-[0.08em] text-[hsl(var(--cf-text-muted))]">Scenario Improvement</p>
                <p className="text-base font-medium text-[hsl(var(--cf-text))] mt-2">{scenario.title}</p>
                <p className="text-xs text-[hsl(var(--cf-text-muted))] mt-1">{scenario.description}</p>
                <p className="text-[11px] text-[hsl(var(--cf-text-secondary))] mt-3">{scenarioSummary}</p>
              </div>
              <div className="rounded-md border border-[hsl(var(--cf-border-subtle))] bg-[hsl(var(--cf-raised))] px-4 py-4">
                <p className="text-[10px] uppercase tracking-[0.08em] text-[hsl(var(--cf-text-muted))]">Approval Load</p>
                <p className="text-2xl font-financial font-semibold text-[hsl(var(--cf-text))] mt-2">{pendingApprovals}</p>
                <p className="text-xs text-[hsl(var(--cf-text-muted))] mt-1">Requests waiting for human signoff</p>
              </div>
              <div className="rounded-md border border-[hsl(var(--cf-border-subtle))] bg-[hsl(var(--cf-raised))] px-4 py-4">
                <p className="text-[10px] uppercase tracking-[0.08em] text-[hsl(var(--cf-text-muted))]">Close Posture</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${readyToFile ? 'bg-[hsl(var(--cf-emerald))]' : 'bg-[hsl(var(--cf-amber))]'}`} />
                  <p className="text-base font-medium text-[hsl(var(--cf-text))]">{readyToFile ? 'Ready to file' : 'Needs remediation'}</p>
                </div>
                <p className="text-xs text-[hsl(var(--cf-text-muted))] mt-1">
                  {checks.length} checks tracked for this operating cycle
                </p>
              </div>
            </div>
          </div>
        </div>

        <QueueCard title="Role Queue" items={focusQueue} />
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={tenantId ? 'Portfolio Value' : 'Liquidity'}
          value={portfolioLoading ? '—' : primaryValue}
          sub={primarySub}
          icon={Building2}
          delay={40}
        />
        <MetricCard
          label={tenantId ? 'Total NOI' : 'Revenue'}
          value={portfolioLoading ? '—' : secondaryValue}
          sub={secondarySub}
          icon={ArrowUpRight}
          delay={80}
          delta={{ value: `${openTaskCount} queued`, positive: true }}
        />
        <MetricCard
          label={tenantId ? 'Avg Cap Rate' : 'Expense Run Rate'}
          value={portfolioLoading ? '—' : tertiaryValue}
          sub={tertiarySub}
          icon={ShieldCheck}
          delay={120}
        />
        <MetricCard
          label={tenantId ? 'Occupancy' : 'Outstanding'}
          value={portfolioLoading ? '—' : quaternaryValue}
          sub={quaternarySub}
          icon={Users}
          delay={160}
          delta={{ value: `${agentCards.length} agents`, positive: true }}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <AgentGrid items={agentCards} />
        <div className="space-y-6">
          <AIQuickChat />
          <IntegrationStrip data={integrationStatus} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="cf-card animate-slide-up" style={{ animationDelay: '120ms' }}>
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
              {recent.map((tx, index) => (
                <TxnRow
                  key={tx.id ?? index}
                  title={tx.title || tx.description || 'Transaction'}
                  description={tx.description ?? undefined}
                  amount={Number(tx.amount)}
                  date={tx.date ? new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : undefined}
                />
              ))}
            </div>
          )}
        </div>

        <div className="cf-card animate-slide-up" style={{ animationDelay: '180ms' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--cf-border-subtle))]">
            <div className="flex items-center gap-2">
              <Workflow className="w-4 h-4 text-[hsl(var(--cf-cyan))]" />
              <span className="text-sm font-display font-semibold text-[hsl(var(--cf-text))]">Role Playbook</span>
            </div>
            <Link href="/settings">
              <span className="text-[11px] text-[hsl(var(--cf-lime))] hover:text-[hsl(var(--cf-lime-bright))] cursor-pointer flex items-center gap-0.5">
                Tune <ChevronRight className="w-3 h-3" />
              </span>
            </Link>
          </div>
          <div className="p-4 space-y-3">
            {roleConfig.focusAreas.map((area) => (
              <div key={area} className="rounded-md border border-[hsl(var(--cf-border-subtle))] bg-[hsl(var(--cf-raised))] px-3 py-3">
                <p className="text-sm font-medium text-[hsl(var(--cf-text))] capitalize">{area}</p>
                <p className="text-xs text-[hsl(var(--cf-text-muted))] mt-1">
                  Human lead remains accountable while agents compress the work into a reviewable queue.
                </p>
              </div>
            ))}
            <div className="rounded-md border border-dashed border-[hsl(var(--cf-border-active))] px-3 py-3">
              <p className="text-sm font-medium text-[hsl(var(--cf-text))]">Automation policy</p>
              <p className="text-xs text-[hsl(var(--cf-text-muted))] mt-1">
                Task creation: {preferences.autoCreateTasks ? 'on' : 'off'} · Escalations: {preferences.autoEscalateApprovals ? 'on' : 'off'} · Human approval: {preferences.requireHumanApproval ? 'required' : 'optional'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
