import { Integration } from "@shared/schema";

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
  // In a real implementation, this would connect to Mercury Bank API
  console.log(`Fetching data from Mercury Bank for integration ID ${integration.id}`);

  // Return mock data for demo purposes
  return {
    cashOnHand: 127842.50,
    transactions: [
      {
        id: "merc-1",
        title: "Client Payment - Acme Corp",
        description: "Invoice #12345",
        amount: 7500.00,
        type: 'income',
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        id: "merc-2",
        title: "Office Rent",
        description: "Monthly office space",
        amount: -3500.00,
        type: 'expense',
        date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      }
    ]
  };
}

// Mock service for WavApps
export async function fetchWavAppsData(integration: Integration): Promise<Partial<FinancialData>> {
  // In a real implementation, this would connect to WavApps API
  console.log(`Fetching data from WavApps for integration ID ${integration.id}`);

  // Return mock data for demo purposes
  return {
    monthlyRevenue: 43291.75,
    monthlyExpenses: 26142.30,
    outstandingInvoices: 18520.00,
    transactions: [
      {
        id: "wavapps-1",
        title: "Software Subscription",
        description: "Monthly SaaS Tools",
        amount: -1299.00,
        type: 'expense',
        date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      },
      {
        id: "wavapps-2",
        title: "Client Payment - XYZ Inc",
        description: "Invoice #12347",
        amount: 4200.00,
        type: 'income',
        date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
      }
    ]
  };
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