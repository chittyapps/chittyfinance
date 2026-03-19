import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Cable, ChevronDown, ChevronRight, ExternalLink, Loader2, Plug,
  RefreshCw, ShieldCheck, Unplug, Zap,
} from 'lucide-react';

/* ─── Types ─── */
interface Integration {
  id: number;
  serviceType: string;
  name: string;
  connected: boolean;
  credentials?: Record<string, any>;
}

interface IntegrationStatus {
  configured: boolean;
  label?: string;
}

/* ─── Service Configs ─── */
interface ServiceConfig {
  type: string;
  name: string;
  shortName: string;
  description: string;
  docsUrl: string;
  protocol: string;
  requiresApproval: boolean;
  capabilities: string[];
  helpNote: string;
  color: string;
}

const SERVICES: ServiceConfig[] = [
  {
    type: 'mercury_bank',
    name: 'Mercury Bank',
    shortName: 'MRC',
    description: 'Business banking — real-time balances and transaction sync via ChittyConnect static egress',
    docsUrl: 'https://mercury.com/api',
    protocol: 'REST + Proxy',
    requiresApproval: true,
    capabilities: ['Real-time balances', 'Transaction history', 'Multi-account', 'Webhook events'],
    helpNote: 'Requires OAuth approval from Mercury. Contact api@mercury.com for access.',
    color: 'var(--cf-cyan)',
  },
  {
    type: 'wavapps',
    name: 'Wave Accounting',
    shortName: 'WAV',
    description: 'Invoices, expenses, and revenue via OAuth 2.0 + GraphQL API',
    docsUrl: 'https://developer.waveapps.com',
    protocol: 'OAuth 2.0',
    requiresApproval: false,
    capabilities: ['Invoice tracking', 'Expense management', 'Revenue reporting', 'Token refresh'],
    helpNote: 'Requires Wave Pro subscription. Get OAuth credentials from the Wave Developer Portal.',
    color: 'var(--cf-emerald)',
  },
  {
    type: 'stripe',
    name: 'Stripe',
    shortName: 'STP',
    description: 'Payment processing, checkout sessions, and webhook-driven event processing',
    docsUrl: 'https://stripe.com/docs',
    protocol: 'REST + Webhooks',
    requiresApproval: false,
    capabilities: ['Payment processing', 'Checkout sessions', 'Webhook verification', 'Customer mgmt'],
    helpNote: 'Get API keys from the Stripe Dashboard at dashboard.stripe.com/apikeys.',
    color: 'var(--cf-violet)',
  },
  {
    type: 'google',
    name: 'Google Workspace',
    shortName: 'GWS',
    description: 'Calendar scheduling, Sheets data sync, and Drive document management for properties',
    docsUrl: 'https://developers.google.com/workspace',
    protocol: 'OAuth 2.0',
    requiresApproval: false,
    capabilities: ['Calendar scheduling', 'Sheets integration', 'Drive storage', 'Multi-API'],
    helpNote: 'Create OAuth credentials in Google Cloud Console. Enable Calendar, Sheets, and Drive APIs.',
    color: 'var(--cf-amber)',
  },
];

/* ─── Service Monogram ─── */
function ServiceMark({ shortName, color, connected }: { shortName: string; color: string; connected: boolean }) {
  return (
    <div className="relative">
      <div
        className="w-11 h-11 rounded-lg flex items-center justify-center text-sm font-display font-bold tracking-tight transition-all duration-300"
        style={{
          background: connected
            ? `hsl(${color} / 0.12)`
            : 'hsl(var(--cf-raised))',
          border: `1px solid hsl(${connected ? `${color} / 0.25` : 'var(--cf-border-subtle)'})`,
          color: connected
            ? `hsl(${color})`
            : 'hsl(var(--cf-text-muted))',
        }}
      >
        {shortName}
      </div>
      {/* Status dot */}
      <span
        className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[hsl(var(--cf-surface))] transition-colors duration-300"
        style={{
          background: connected
            ? `hsl(${color})`
            : 'hsl(var(--cf-text-muted))',
          boxShadow: connected ? `0 0 8px hsl(${color} / 0.5)` : 'none',
        }}
      />
    </div>
  );
}

/* ─── Integration Card ─── */
function IntegrationCard({
  config,
  integration,
  envConfigured,
  isConnecting,
  onConnect,
  onDisconnect,
  onRefresh,
  refreshPending,
}: {
  config: ServiceConfig;
  integration?: Integration;
  envConfigured: boolean;
  isConnecting: boolean;
  onConnect: () => void;
  onDisconnect: (id: number) => void;
  onRefresh?: () => void;
  refreshPending?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const connected = integration?.connected ?? false;

  return (
    <div
      className="cf-card group transition-all duration-300"
      style={{
        borderColor: connected ? `hsl(${config.color} / 0.2)` : undefined,
      }}
    >
      {/* Top glow line when connected */}
      {connected && (
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, hsl(${config.color} / 0.5), transparent)` }}
        />
      )}

      <div className="p-4">
        <div className="flex items-start gap-3.5">
          <ServiceMark shortName={config.shortName} color={config.color} connected={connected} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-display font-semibold text-[hsl(var(--cf-text))]">{config.name}</h3>
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  background: connected
                    ? `hsl(${config.color} / 0.1)`
                    : 'hsl(var(--cf-raised))',
                  color: connected
                    ? `hsl(${config.color})`
                    : 'hsl(var(--cf-text-muted))',
                  border: `1px solid ${connected ? `hsl(${config.color} / 0.2)` : 'hsl(var(--cf-border-subtle))'}`,
                }}
              >
                {connected ? (
                  <>
                    <span
                      className="w-1 h-1 rounded-full"
                      style={{ background: `hsl(${config.color})` }}
                    />
                    Live
                  </>
                ) : envConfigured ? 'Ready' : 'Offline'}
              </span>
              {config.requiresApproval && !connected && (
                <span className="text-[10px] text-[hsl(var(--cf-amber))] font-mono">approval-gated</span>
              )}
            </div>
            <p className="text-xs text-[hsl(var(--cf-text-muted))] mt-1 leading-relaxed">{config.description}</p>

            {/* Protocol tag */}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] font-mono text-[hsl(var(--cf-text-muted))] bg-[hsl(var(--cf-raised))] px-1.5 py-0.5 rounded">
                {config.protocol}
              </span>
              {envConfigured && !connected && (
                <span className="text-[10px] font-mono text-[hsl(var(--cf-emerald))]">env configured</span>
              )}
            </div>
          </div>

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-md text-[hsl(var(--cf-text-muted))] hover:text-[hsl(var(--cf-text))] hover:bg-[hsl(var(--cf-raised))] transition-colors"
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Capabilities strip — always visible */}
        <div className="flex flex-wrap gap-1.5 mt-3 pl-[58px]">
          {config.capabilities.map((cap) => (
            <span
              key={cap}
              className="text-[10px] text-[hsl(var(--cf-text-secondary))] bg-[hsl(var(--cf-raised))] px-2 py-0.5 rounded-sm border border-[hsl(var(--cf-border-subtle))]"
            >
              {cap}
            </span>
          ))}
        </div>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-[hsl(var(--cf-border-subtle))]">
          {/* Connection details */}
          {connected && integration?.credentials && (
            <div className="px-4 py-3 bg-[hsl(var(--cf-raised))] border-b border-[hsl(var(--cf-border-subtle))]">
              <p className="text-[10px] uppercase tracking-[0.08em] text-[hsl(var(--cf-text-muted))] mb-2">Connection Details</p>
              <div className="space-y-1">
                {config.type === 'wavapps' && integration.credentials.business_name && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">Business:</span>
                    <span className="text-xs text-[hsl(var(--cf-text))] font-medium">{String(integration.credentials.business_name)}</span>
                  </div>
                )}
                {config.type === 'mercury_bank' && integration.credentials.selectedAccountIds && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">Accounts:</span>
                    <span className="text-xs text-[hsl(var(--cf-text))] font-mono">{(integration.credentials.selectedAccountIds as string[]).length} synced</span>
                  </div>
                )}
                {config.type === 'stripe' && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[hsl(var(--cf-text-muted))]">Webhook:</span>
                    <span className="text-xs text-[hsl(var(--cf-emerald))] font-mono">verified</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Help note */}
          <div className="px-4 py-3 bg-[hsl(var(--cf-raised))] border-b border-[hsl(var(--cf-border-subtle))]">
            <p className="text-xs text-[hsl(var(--cf-text-secondary))] leading-relaxed">{config.helpNote}</p>
          </div>

          {/* Stripe checkout (inline) */}
          {connected && config.type === 'stripe' && (
            <div className="px-4 py-3 border-b border-[hsl(var(--cf-border-subtle))]">
              <StripeInlineActions />
            </div>
          )}

          {/* Actions */}
          <div className="px-4 py-3 flex items-center gap-2">
            {!connected ? (
              <button
                onClick={onConnect}
                disabled={isConnecting}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: `hsl(${config.color} / 0.1)`,
                  color: `hsl(${config.color})`,
                  border: `1px solid hsl(${config.color} / 0.2)`,
                }}
              >
                {isConnecting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plug className="w-3.5 h-3.5" />
                )}
                {isConnecting ? 'Establishing...' : `Connect ${config.shortName}`}
              </button>
            ) : (
              <>
                <button
                  onClick={() => integration && onDisconnect(integration.id)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-[hsl(var(--cf-rose)/0.08)] text-[hsl(var(--cf-rose))] border border-[hsl(var(--cf-rose)/0.15)] hover:bg-[hsl(var(--cf-rose)/0.14)] transition-colors"
                >
                  <Unplug className="w-3.5 h-3.5" />
                  Disconnect
                </button>
                {config.type === 'wavapps' && onRefresh && (
                  <button
                    onClick={onRefresh}
                    disabled={refreshPending}
                    className="p-2 rounded-md text-[hsl(var(--cf-text-secondary))] hover:text-[hsl(var(--cf-text))] hover:bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border-subtle))] transition-colors disabled:opacity-40"
                    title="Refresh access token"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshPending ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </>
            )}
            <a
              href={config.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-md text-[hsl(var(--cf-text-muted))] hover:text-[hsl(var(--cf-text))] hover:bg-[hsl(var(--cf-raised))] border border-[hsl(var(--cf-border-subtle))] transition-colors"
              title="API docs"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Stripe Inline Actions ─── */
function StripeInlineActions() {
  const [amount, setAmount] = useState('2000');
  const [pending, setPending] = useState(false);

  const connect = async () => {
    try {
      setPending(true);
      const r = await fetch('/api/integrations/stripe/connect', { method: 'POST' });
      if (!r.ok) throw new Error('Stripe connect failed');
    } finally {
      setPending(false);
    }
  };

  const checkout = async () => {
    try {
      setPending(true);
      const cents = parseInt(amount, 10);
      if (!Number.isFinite(cents) || cents < 50) return;
      const r = await fetch('/api/integrations/stripe/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amountCents: cents, label: 'ChittyFinance Payment', purpose: 'test' }),
      });
      if (!r.ok) throw new Error('Failed to create checkout');
      const data: { url?: string } = await r.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider mr-2">Quick Actions</p>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Cents"
        className="w-20 h-7 px-2 rounded-md text-xs font-mono bg-[hsl(var(--cf-surface))] border border-[hsl(var(--cf-border-subtle))] text-[hsl(var(--cf-text))] placeholder:text-[hsl(var(--cf-text-muted))] focus:border-[hsl(var(--cf-violet)/0.4)] focus:outline-none transition-colors"
      />
      <button
        disabled={pending}
        onClick={checkout}
        className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-[hsl(var(--cf-violet)/0.1)] text-[hsl(var(--cf-violet))] border border-[hsl(var(--cf-violet)/0.2)] hover:bg-[hsl(var(--cf-violet)/0.15)] disabled:opacity-40 transition-colors"
      >
        Checkout
      </button>
      <button
        disabled={pending}
        onClick={connect}
        className="px-2.5 py-1 rounded-md text-[11px] font-medium text-[hsl(var(--cf-text-secondary))] border border-[hsl(var(--cf-border-subtle))] hover:bg-[hsl(var(--cf-raised))] disabled:opacity-40 transition-colors"
      >
        Sync Customer
      </button>
    </div>
  );
}

/* ─── Main Page ─── */
export default function Connections() {
  const [_] = useLocation();
  const queryClient = useQueryClient();
  const [connectingType, setConnectingType] = useState<string | null>(null);

  const { data: integrations = [], isLoading } = useQuery<Integration[]>({
    queryKey: ['/api/integrations'],
  });

  const { data: integrationStatus } = useQuery<Record<string, IntegrationStatus>>({
    queryKey: ['/api/integrations/status'],
    staleTime: 60_000,
  });

  // OAuth callback handler
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('wave') === 'connected' || params.get('google') === 'connected') {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations'] });
      window.history.replaceState({}, '', '/connections');
    }
  }, [queryClient]);

  const disconnectMutation = useMutation({
    mutationFn: async (integrationId: number) => {
      const response = await fetch(`/api/integrations/${integrationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connected: false }),
      });
      if (!response.ok) throw new Error('Failed to disconnect');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations'] });
    },
  });

  const refreshWaveMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/integrations/wave/refresh', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to refresh token');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations'] });
    },
  });

  const handleConnect = async (type: string) => {
    setConnectingType(type);
    try {
      if (type === 'wavapps') {
        const response = await fetch('/api/integrations/wave/authorize');
        const data: { authUrl?: string } = await response.json();
        if (data.authUrl) window.location.href = data.authUrl;
      } else if (type === 'google') {
        const response = await fetch('/api/integrations/google/authorize');
        const data: { authUrl?: string } = await response.json();
        if (data.authUrl) window.location.href = data.authUrl;
      } else if (type === 'mercury_bank') {
        window.location.href = '/connect';
      }
    } catch (error) {
      console.error(`Failed to start ${type} authorization:`, error);
    } finally {
      setConnectingType(null);
    }
  };

  const getIntegration = (type: string) => integrations.find((i) => i.serviceType === type);

  const connectedCount = SERVICES.filter((s) => getIntegration(s.type)?.connected).length;
  const configuredCount = Object.values(integrationStatus ?? {}).filter((s) => s.configured).length;

  return (
    <div className="p-6 lg:p-8 max-w-[1280px] mx-auto space-y-6">
      {/* Header */}
      <div className="animate-slide-up">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-semibold text-[hsl(var(--cf-text))] tracking-tight">Connections</h1>
            <p className="text-sm text-[hsl(var(--cf-text-muted))] mt-1">
              Integration control surface — banking, accounting, payments, and workspace services.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-[0.08em] text-[hsl(var(--cf-text-muted))] font-mono">
              {connectedCount}/{SERVICES.length} live
            </span>
          </div>
        </div>
      </div>

      {/* Status strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-slide-up" style={{ animationDelay: '40ms' }}>
        <div className="cf-card px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <Cable className="w-3.5 h-3.5 text-[hsl(var(--cf-lime))]" />
            <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">Connected</p>
          </div>
          <p className="text-lg font-financial font-bold text-[hsl(var(--cf-text))]">{connectedCount}</p>
          <p className="text-[10px] text-[hsl(var(--cf-text-muted))]">of {SERVICES.length} services</p>
        </div>
        <div className="cf-card px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[hsl(var(--cf-emerald))]" />
            <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">Configured</p>
          </div>
          <p className="text-lg font-financial font-bold text-[hsl(var(--cf-text))]">{configuredCount}</p>
          <p className="text-[10px] text-[hsl(var(--cf-text-muted))]">env vars set</p>
        </div>
        <div className="cf-card px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-3.5 h-3.5 text-[hsl(var(--cf-amber))]" />
            <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">Protocols</p>
          </div>
          <p className="text-lg font-financial font-bold text-[hsl(var(--cf-text))]">3</p>
          <p className="text-[10px] text-[hsl(var(--cf-text-muted))]">OAuth, REST, Webhook</p>
        </div>
        <div className="cf-card px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <Plug className="w-3.5 h-3.5 text-[hsl(var(--cf-cyan))]" />
            <p className="text-[10px] text-[hsl(var(--cf-text-muted))] uppercase tracking-wider">Capabilities</p>
          </div>
          <p className="text-lg font-financial font-bold text-[hsl(var(--cf-text))]">{SERVICES.reduce((s, svc) => s + svc.capabilities.length, 0)}</p>
          <p className="text-[10px] text-[hsl(var(--cf-text-muted))]">across all services</p>
        </div>
      </div>

      {/* Service cards */}
      {isLoading ? (
        <div className="cf-card p-12 text-center animate-slide-up" style={{ animationDelay: '80ms' }}>
          <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--cf-lime))] mx-auto mb-3" />
          <p className="text-sm text-[hsl(var(--cf-text-muted))]">Loading integration state...</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {SERVICES.map((config, index) => {
            const integration = getIntegration(config.type);
            const envKey = config.type === 'mercury_bank' ? 'mercury'
              : config.type === 'wavapps' ? 'wave'
              : config.type;
            const envConfigured = integrationStatus?.[envKey]?.configured ?? false;

            return (
              <div
                key={config.type}
                className="animate-slide-up"
                style={{ animationDelay: `${80 + index * 40}ms` }}
              >
                <IntegrationCard
                  config={config}
                  integration={integration}
                  envConfigured={envConfigured}
                  isConnecting={connectingType === config.type}
                  onConnect={() => handleConnect(config.type)}
                  onDisconnect={(id) => disconnectMutation.mutate(id)}
                  onRefresh={config.type === 'wavapps' ? () => refreshWaveMutation.mutate() : undefined}
                  refreshPending={refreshWaveMutation.isPending}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Automation surface footer */}
      <div className="cf-card p-4 animate-slide-up" style={{ animationDelay: '240ms' }}>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-3.5 h-3.5 text-[hsl(var(--cf-text-muted))]" />
          <span className="cf-section-title">Integration Surface Map</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {SERVICES.map((svc) => {
            const connected = getIntegration(svc.type)?.connected ?? false;
            return (
              <div key={svc.type} className="flex items-center gap-2 px-3 py-2 rounded-md bg-[hsl(var(--cf-raised))]">
                <span
                  className="w-1.5 h-1.5 rounded-full transition-colors"
                  style={{
                    background: connected ? `hsl(${svc.color})` : 'hsl(var(--cf-text-muted))',
                    boxShadow: connected ? `0 0 6px hsl(${svc.color} / 0.5)` : 'none',
                  }}
                />
                <span className="text-xs text-[hsl(var(--cf-text-secondary))]">{svc.name}</span>
                <span
                  className="ml-auto text-[10px] font-mono"
                  style={{ color: connected ? `hsl(${svc.color})` : 'hsl(var(--cf-text-muted))' }}
                >
                  {connected ? 'live' : 'off'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
