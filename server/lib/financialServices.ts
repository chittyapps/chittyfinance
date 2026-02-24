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
    category?: string;
    status?: 'pending' | 'completed' | 'failed';
    paymentMethod?: string;
  }>;
  metrics?: {
    cashflow?: number;
    runway?: number; // in months
    burnRate?: number;
    growthRate?: number; // percentage 
    customerAcquisitionCost?: number;
    lifetimeValue?: number;
  };
  payroll?: {
    totalEmployees: number;
    payrollAmount: number;
    nextPayrollDate: Date;
    taxes: {
      federal: number;
      state: number;
      local: number;
    }
  };
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

// TODO: Wire to DoorLoop property management API (real integration pending)
export async function fetchDoorLoopData(_integration: Integration): Promise<Partial<FinancialData>> {
  console.warn('DoorLoop integration not yet implemented — returning empty data');
  return {};
}

// TODO: Wire to Stripe API for financial data (real integration exists in stripe.ts for payments)
export async function fetchStripeData(_integration: Integration): Promise<Partial<FinancialData>> {
  console.warn('Stripe financial data fetch not yet implemented — returning empty data');
  return {};
}

// TODO: Wire to QuickBooks API
export async function fetchQuickBooksData(_integration: Integration): Promise<Partial<FinancialData>> {
  console.warn('QuickBooks integration not yet implemented — returning empty data');
  return {};
}

// TODO: Wire to Xero API
export async function fetchXeroData(_integration: Integration): Promise<Partial<FinancialData>> {
  console.warn('Xero integration not yet implemented — returning empty data');
  return {};
}

// TODO: Wire to Brex API
export async function fetchBrexData(_integration: Integration): Promise<Partial<FinancialData>> {
  console.warn('Brex integration not yet implemented — returning empty data');
  return {};
}

// TODO: Wire to Gusto API
export async function fetchGustoData(_integration: Integration): Promise<Partial<FinancialData>> {
  console.warn('Gusto integration not yet implemented — returning empty data');
  return {};
}

// Get financial data from all connected services
export async function getAggregatedFinancialData(integrations: Integration[]): Promise<FinancialData> {
  let aggregatedData: FinancialData = {
    cashOnHand: 0,
    monthlyRevenue: 0,
    monthlyExpenses: 0,
    outstandingInvoices: 0,
    transactions: [],
    metrics: {
      cashflow: 0,
      runway: 0,
      burnRate: 0,
      growthRate: 0,
      customerAcquisitionCost: 0,
      lifetimeValue: 0
    }
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
      case 'stripe':
        serviceData = await fetchStripeData(integration);
        break;
      case 'quickbooks':
        serviceData = await fetchQuickBooksData(integration);
        break;
      case 'xero':
        serviceData = await fetchXeroData(integration);
        break;
      case 'brex':
        serviceData = await fetchBrexData(integration);
        break;
      case 'gusto':
        serviceData = await fetchGustoData(integration);
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
    
    // Merge metrics data
    if (serviceData.metrics) {
      if (aggregatedData.metrics) {
        // Initialize metrics if not already set
        aggregatedData.metrics.cashflow = aggregatedData.metrics.cashflow || 0;
        aggregatedData.metrics.burnRate = aggregatedData.metrics.burnRate || 0;
        aggregatedData.metrics.runway = aggregatedData.metrics.runway || 0;
        
        // Add values
        aggregatedData.metrics.cashflow += serviceData.metrics.cashflow || 0;
        
        // For burnRate, take the sum
        aggregatedData.metrics.burnRate += serviceData.metrics.burnRate || 0;
        
        // For runway, take the weighted average based on burnRate
        if (serviceData.metrics.runway && serviceData.metrics.burnRate) {
          const totalBurnRate = (aggregatedData.metrics.burnRate) + serviceData.metrics.burnRate;
          if (totalBurnRate > 0) {
            const existingWeight = (aggregatedData.metrics.burnRate / totalBurnRate);
            const newWeight = (serviceData.metrics.burnRate / totalBurnRate);
            aggregatedData.metrics.runway = 
              (aggregatedData.metrics.runway) * existingWeight + 
              serviceData.metrics.runway * newWeight;
          }
        }
        
        // For growth metrics, take the highest values
        if (serviceData.metrics.growthRate && 
            (!aggregatedData.metrics.growthRate || 
             serviceData.metrics.growthRate > aggregatedData.metrics.growthRate)) {
          aggregatedData.metrics.growthRate = serviceData.metrics.growthRate;
        }
        
        if (serviceData.metrics.customerAcquisitionCost && 
            (!aggregatedData.metrics.customerAcquisitionCost || 
             serviceData.metrics.customerAcquisitionCost < aggregatedData.metrics.customerAcquisitionCost)) {
          aggregatedData.metrics.customerAcquisitionCost = serviceData.metrics.customerAcquisitionCost;
        }
        
        if (serviceData.metrics.lifetimeValue && 
            (!aggregatedData.metrics.lifetimeValue || 
             serviceData.metrics.lifetimeValue > aggregatedData.metrics.lifetimeValue)) {
          aggregatedData.metrics.lifetimeValue = serviceData.metrics.lifetimeValue;
        }
      }
    }
    
    // Include payroll data if available (only take the most recent payroll info)
    if (serviceData.payroll) {
      aggregatedData.payroll = serviceData.payroll;
    }
  }

  // Sort transactions by date (newest first)
  if (aggregatedData.transactions && aggregatedData.transactions.length > 0) {
    aggregatedData.transactions.sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }
  
  // Calculate additional derived metrics
  if (aggregatedData.metrics) {
    // Calculate cashflow if not provided directly
    if (!aggregatedData.metrics.cashflow) {
      aggregatedData.metrics.cashflow = aggregatedData.monthlyRevenue - aggregatedData.monthlyExpenses;
    }
    
    // Calculate runway if not provided directly and we have burnRate
    if (!aggregatedData.metrics.runway && aggregatedData.metrics.burnRate && aggregatedData.metrics.burnRate > 0) {
      aggregatedData.metrics.runway = aggregatedData.cashOnHand / aggregatedData.metrics.burnRate;
    }
  }

  return aggregatedData;
}
