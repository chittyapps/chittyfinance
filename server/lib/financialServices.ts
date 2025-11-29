import { Integration } from "@shared/schema";
import { getMercurySummary } from "./chittyConnect";
import { createWaveClient, WaveAPIClient } from "./wave-api";

// Interface for financial data returned by services
export interface FinancialData {
  cashOnHand: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
  outstandingInvoices: number;
  transactions?: Array<{
    id: string;
    title: string;
    description?: string;
    amount: number;
    type: 'income' | 'expense';
    date: Date;
  }>;
}

// Mock service for Mercury Bank
export async function fetchMercuryBankData(integration: Integration): Promise<Partial<FinancialData>> {
  // Prefer ChittyConnect backend if configured (supports static egress + multi-account)
  const selected: string[] | undefined = (integration.credentials as any)?.selectedAccountIds;
  const tenantId: string | undefined = (integration.credentials as any)?.tenantId;
  const hasConnect = !!process.env.CHITTYCONNECT_API_BASE && !!(process.env.CHITTYCONNECT_API_TOKEN || process.env.CHITTY_AUTH_SERVICE_TOKEN);

  if (hasConnect && selected && selected.length > 0) {
    const summary = await getMercurySummary({ userId: integration.userId, tenantId, accountIds: selected });
    return {
      cashOnHand: summary.cashOnHand ?? 0,
      transactions: (summary.transactions || []).map(t => ({
        id: t.id,
        title: t.description || 'Transaction',
        amount: t.amount,
        type: t.amount >= 0 ? 'income' : 'expense',
        date: new Date(t.date),
      })),
    };
  }

  // In production system mode, do not return mock data
  const isProdSystem = (process.env.NODE_ENV === 'production') && ((process.env.MODE || 'standalone') === 'system');
  if (isProdSystem) {
    throw new Error('Mercury data unavailable: ChittyConnect not configured or no accounts selected');
  }

  // Fallback minimal demo data only for non-production or standalone
  console.log(`Fetching data from Mercury Bank (dev fallback) for integration ID ${integration.id}`);
  return { cashOnHand: 0, transactions: [] };
}

// Real Wave Accounting API integration
export async function fetchWavAppsData(integration: Integration): Promise<Partial<FinancialData>> {
  console.log(`Fetching data from Wave Accounting for integration ID ${integration.id}`);

  // Check if Wave OAuth credentials are configured
  const credentials = integration.credentials as any;
  const accessToken = credentials?.access_token;
  const businessId = credentials?.business_id;

  if (!accessToken || !businessId) {
    console.warn('Wave integration not fully configured - missing access_token or business_id');

    // In production system mode, throw error
    const isProdSystem = (process.env.NODE_ENV === 'production') && ((process.env.MODE || 'standalone') === 'system');
    if (isProdSystem) {
      throw new Error('Wave integration not configured: missing credentials');
    }

    // Return empty data in dev mode
    return {
      monthlyRevenue: 0,
      monthlyExpenses: 0,
      outstandingInvoices: 0,
      transactions: []
    };
  }

  try {
    // Create Wave API client
    const waveClient = createWaveClient({
      clientId: process.env.WAVE_CLIENT_ID || '',
      clientSecret: process.env.WAVE_CLIENT_SECRET || '',
      redirectUri: process.env.WAVE_REDIRECT_URI || `${process.env.PUBLIC_APP_BASE_URL}/integrations/wave/callback`,
    });

    waveClient.setAccessToken(accessToken);

    // Fetch financial summary from Wave
    const summary = await waveClient.getFinancialSummary(businessId);

    return {
      monthlyRevenue: summary.monthlyRevenue,
      monthlyExpenses: summary.monthlyExpenses,
      outstandingInvoices: summary.outstandingInvoices,
      transactions: summary.transactions.map(t => ({
        id: t.id,
        title: t.description,
        description: t.category,
        amount: t.amount,
        type: t.type,
        date: new Date(t.date),
      })),
    };
  } catch (error) {
    console.error('Error fetching Wave data:', error);

    // If token expired, we should refresh it
    if (error instanceof Error && error.message.includes('unauthorized')) {
      throw new Error('Wave access token expired - please reconnect integration');
    }

    throw error;
  }
}

// Mock service for DoorLoop
export async function fetchDoorLoopData(integration: Integration): Promise<Partial<FinancialData>> {
  // In a real implementation, this would connect to DoorLoop API
  console.log(`Fetching data from DoorLoop for integration ID ${integration.id}`);
  
  // Return mock data for demo purposes
  return {
    monthlyRevenue: 12500.00, // Rental income
    monthlyExpenses: 4320.00, // Property maintenance, etc.
    outstandingInvoices: 3250.00, // Outstanding rent payments
    transactions: [
      {
        id: "doorloop-1",
        title: "Rental Payment - 123 Main St",
        description: "April 2025 Rent",
        amount: 2500.00,
        type: 'income',
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
      {
        id: "doorloop-2",
        title: "Property Maintenance",
        description: "Plumbing repairs - 456 Oak Ave",
        amount: -750.00,
        type: 'expense',
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      }
    ]
  };
}

// Get financial data from all connected services
export async function getAggregatedFinancialData(integrations: Integration[]): Promise<FinancialData> {
  let aggregatedData: FinancialData = {
    cashOnHand: 0,
    monthlyRevenue: 0,
    monthlyExpenses: 0,
    outstandingInvoices: 0,
    transactions: []
  };

  for (const integration of integrations) {
    if (!integration.connected) continue;

    let serviceData: Partial<FinancialData> = {};

    // Call the appropriate service based on the integration type
    switch (integration.serviceType) {
      case 'mercury_bank':
        serviceData = await fetchMercuryBankData(integration);
        break;
      case 'wavapps':
        serviceData = await fetchWavAppsData(integration);
        break;
      case 'doorloop':
        serviceData = await fetchDoorLoopData(integration);
        break;
      default:
        console.log(`No handler for service type: ${integration.serviceType}`);
        continue;
    }

    // Merge the data
    aggregatedData.cashOnHand += serviceData.cashOnHand || 0;
    aggregatedData.monthlyRevenue += serviceData.monthlyRevenue || 0;
    aggregatedData.monthlyExpenses += serviceData.monthlyExpenses || 0;
    aggregatedData.outstandingInvoices += serviceData.outstandingInvoices || 0;

    if (serviceData.transactions) {
      aggregatedData.transactions = [
        ...aggregatedData.transactions!,
        ...serviceData.transactions
      ];
    }
  }

  // Sort transactions by date (newest first)
  if (aggregatedData.transactions && aggregatedData.transactions.length > 0) {
    aggregatedData.transactions.sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  return aggregatedData;
}
