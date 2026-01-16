import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Circle, ExternalLink, RefreshCw } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Integration {
  id: number;
  serviceType: string;
  name: string;
  connected: boolean;
  credentials?: any;
}

const integrationConfigs = [
  {
    type: 'mercury_bank',
    name: 'Mercury Bank',
    description: 'Connect your Mercury business bank accounts for real-time balance and transaction sync',
    icon: '🏦',
    docsUrl: 'https://mercury.com/api',
    requiresApproval: true,
    features: ['Real-time balances', 'Transaction history', 'Multi-account support'],
  },
  {
    type: 'wavapps',
    name: 'Wave Accounting',
    description: 'Sync invoices, expenses, and revenue from Wave Accounting (requires Wave Pro subscription)',
    icon: '📊',
    docsUrl: 'https://developer.waveapps.com',
    requiresApproval: false,
    features: ['Invoice tracking', 'Expense management', 'Revenue reporting'],
  },
  {
    type: 'stripe',
    name: 'Stripe',
    description: 'Accept payments and manage subscriptions with Stripe',
    icon: '💳',
    docsUrl: 'https://stripe.com/docs',
    requiresApproval: false,
    features: ['Payment processing', 'Subscription management', 'Customer portal'],
  },
  {
    type: 'doorloop',
    name: 'DoorLoop',
    description: 'Property management integration for rent collection and maintenance tracking',
    icon: '🏠',
    docsUrl: 'https://www.doorloop.com',
    requiresApproval: false,
    features: ['Rent roll', 'Maintenance requests', 'Lease management'],
  },
];

export default function Connections() {
  const [_, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [connectingType, setConnectingType] = useState<string | null>(null);

  // Fetch integrations
  const { data: integrations = [], isLoading } = useQuery<Integration[]>({
    queryKey: ['/api/integrations'],
  });

  // Check for OAuth callback success/error
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('wave') === 'connected') {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations'] });
      // Clean up URL
      window.history.replaceState({}, '', '/connections');
    }
  }, [queryClient]);

  // Connect Wave
  const connectWave = async () => {
    setConnectingType('wavapps');
    try {
      const response = await fetch('/api/integrations/wave/authorize');
      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error('Failed to start Wave authorization:', error);
      setConnectingType(null);
    }
  };

  // Disconnect integration
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

  // Refresh Wave token
  const refreshWaveMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/integrations/wave/refresh', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to refresh token');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/integrations'] });
    },
  });

  const getIntegration = (type: string) => {
    return integrations.find(i => i.serviceType === type);
  };

  const handleConnect = async (type: string) => {
    if (type === 'wavapps') {
      await connectWave();
    } else if (type === 'mercury_bank') {
      // Redirect to ChittyConnect
      window.location.href = '/connect';
    } else {
      // For other integrations, show message
      alert(`${type} integration coming soon!`);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Connections</h1>
        <p className="text-muted-foreground mt-2">
          Connect your financial accounts and services to ChittyFinance
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Loading integrations...</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {integrationConfigs.map((config) => {
            const integration = getIntegration(config.type);
            const isConnected = integration?.connected || false;
            const isConnecting = connectingType === config.type;

            return (
              <Card key={config.type} className="relative">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-4xl">{config.icon}</div>
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {config.name}
                          {isConnected && (
                            <Badge variant="default" className="bg-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Connected
                            </Badge>
                          )}
                          {config.requiresApproval && (
                            <Badge variant="outline" className="text-xs">
                              Requires Approval
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {config.description}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Features */}
                    <div>
                      <h4 className="text-sm font-medium mb-2">Features:</h4>
                      <ul className="space-y-1">
                        {config.features.map((feature) => (
                          <li key={feature} className="text-sm flex items-center gap-2">
                            <Circle className="h-2 w-2 fill-current" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Connection status details */}
                    {isConnected && integration?.credentials && (
                      <div className="bg-muted p-3 rounded-md text-sm">
                        {config.type === 'wavapps' && integration.credentials.business_name && (
                          <p>
                            <strong>Business:</strong> {integration.credentials.business_name}
                          </p>
                        )}
                        {config.type === 'mercury_bank' && integration.credentials.selectedAccountIds && (
                          <p>
                            <strong>Accounts:</strong> {integration.credentials.selectedAccountIds.length} connected
                          </p>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {!isConnected ? (
                        <Button
                          onClick={() => handleConnect(config.type)}
                          disabled={isConnecting}
                          className="w-full"
                        >
                          {isConnecting ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            `Connect ${config.name}`
                          )}
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="destructive"
                            onClick={() => integration && disconnectMutation.mutate(integration.id)}
                            disabled={disconnectMutation.isPending}
                            className="flex-1"
                          >
                            Disconnect
                          </Button>
                          {config.type === 'wavapps' && (
                            <Button
                              variant="outline"
                              onClick={() => refreshWaveMutation.mutate()}
                              disabled={refreshWaveMutation.isPending}
                              title="Refresh access token"
                            >
                              {refreshWaveMutation.isPending ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          {config.type === 'stripe' && (
                            <StripeActions />
                          )}
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => window.open(config.docsUrl, '_blank')}
                        title="View documentation"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Help section */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Need Help?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <strong>Mercury Bank:</strong> Requires prior OAuth approval from Mercury. Contact{' '}
            <a href="mailto:api@mercury.com" className="underline">
              api@mercury.com
            </a>{' '}
            to request access.
          </p>
          <p>
            <strong>Wave Accounting:</strong> Requires a Wave Pro or Wave Advisor subscription. Get your
            OAuth credentials from the{' '}
            <a
              href="https://developer.waveapps.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Wave Developer Portal
            </a>
            .
          </p>
          <p>
            <strong>Stripe:</strong> Create a Stripe account and get your API keys from the{' '}
            <a
              href="https://dashboard.stripe.com/apikeys"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Stripe Dashboard
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function StripeActions() {
  const [amount, setAmount] = useState<string>('2000')
  const [pending, setPending] = useState(false)

  const connect = async () => {
    try {
      setPending(true)
      const r = await fetch('/api/integrations/stripe/connect', { method: 'POST' })
      if (!r.ok) throw new Error('Stripe connect failed')
    } finally { setPending(false) }
  }

  const checkout = async () => {
    try {
      setPending(true)
      const cents = parseInt(amount, 10)
      if (!Number.isFinite(cents) || cents < 50) return alert('Enter amount in cents (>=50)')
      const r = await fetch('/api/integrations/stripe/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amountCents: cents, label: 'ChittyFinance Payment', purpose: 'test' }) })
      if (!r.ok) throw new Error('Failed to create checkout')
      const data = await r.json(); if (data.url) window.location.href = data.url
    } finally { setPending(false) }
  }

  return (
    <div className="flex items-center gap-2">
      <input className="border rounded px-2 py-1 w-40" placeholder="Amount (cents)" value={amount} onChange={(e)=>setAmount(e.target.value)} />
      <Button disabled={pending} onClick={checkout}>Create Payment</Button>
      <Button variant="secondary" disabled={pending} onClick={connect}>Connect</Button>
    </div>
  )
}
