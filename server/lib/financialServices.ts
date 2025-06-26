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

// Stripe API integration for payment processing
export async function fetchStripeData(integration: Integration): Promise<Partial<FinancialData>> {
  console.log(`Fetching data from Stripe for integration ID ${integration.id}`);
  
  return {
    monthlyRevenue: 51250.00,
    transactions: [
      {
        id: "stripe-1",
        title: "Subscription Payment - Premium Plan",
        description: "Customer: John Smith",
        amount: 199.00,
        type: 'income',
        date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        category: 'Subscription',
        status: 'completed',
        paymentMethod: 'credit_card'
      },
      {
        id: "stripe-2",
        title: "One-time Purchase - Enterprise Package",
        description: "Customer: Acme Corp",
        amount: 4999.00,
        type: 'income',
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        category: 'One-time',
        status: 'completed',
        paymentMethod: 'ach_transfer'
      },
      {
        id: "stripe-3",
        title: "Subscription Payment - Basic Plan",
        description: "Customer: Sarah Johnson",
        amount: 99.00,
        type: 'income',
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        category: 'Subscription',
        status: 'completed',
        paymentMethod: 'credit_card'
      }
    ],
    metrics: {
      growthRate: 12.5,
      customerAcquisitionCost: 125.30,
      lifetimeValue: 950.75
    }
  };
}

// QuickBooks API integration for accounting
export async function fetchQuickBooksData(integration: Integration): Promise<Partial<FinancialData>> {
  console.log(`Fetching data from QuickBooks for integration ID ${integration.id}`);
  
  return {
    cashOnHand: 143500.75,
    monthlyRevenue: 75600.50,
    monthlyExpenses: 38750.25,
    outstandingInvoices: 22450.00,
    transactions: [
      {
        id: "qb-1",
        title: "Consulting Services - XYZ Corp",
        description: "Project completion payment",
        amount: 12500.00,
        type: 'income',
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        category: 'Professional Services',
        status: 'completed'
      },
      {
        id: "qb-2",
        title: "Office Equipment",
        description: "New monitors and laptops",
        amount: -6780.50,
        type: 'expense',
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        category: 'Equipment',
        status: 'completed'
      }
    ],
    metrics: {
      cashflow: 36850.25,
      runway: 8.5,
      burnRate: 38750.25
    }
  };
}

// Xero API integration for international accounting
export async function fetchXeroData(integration: Integration): Promise<Partial<FinancialData>> {
  console.log(`Fetching data from Xero for integration ID ${integration.id}`);
  
  return {
    cashOnHand: 92450.30,
    monthlyRevenue: 63250.75,
    monthlyExpenses: 41200.50,
    outstandingInvoices: 15780.25,
    transactions: [
      {
        id: "xero-1",
        title: "International Consulting - ABC Ltd",
        description: "UK client monthly retainer",
        amount: 7500.00,
        type: 'income',
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        category: 'International Services',
        status: 'completed'
      },
      {
        id: "xero-2",
        title: "Software Licenses",
        description: "Annual enterprise licenses",
        amount: -12350.00,
        type: 'expense',
        date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        category: 'Software',
        status: 'completed'
      }
    ],
    metrics: {
      cashflow: 22050.25,
      runway: 6.5,
      burnRate: 41200.50
    }
  };
}

// Brex API integration for business credit cards
export async function fetchBrexData(integration: Integration): Promise<Partial<FinancialData>> {
  console.log(`Fetching data from Brex for integration ID ${integration.id}`);
  
  return {
    cashOnHand: 175250.50,
    transactions: [
      {
        id: "brex-1",
        title: "Business Travel",
        description: "Flight tickets for conference",
        amount: -2450.75,
        type: 'expense',
        date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        category: 'Travel',
        status: 'completed',
        paymentMethod: 'credit_card'
      },
      {
        id: "brex-2",
        title: "Marketing Expenses",
        description: "Google Ads campaign",
        amount: -1875.50,
        type: 'expense',
        date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
        category: 'Marketing',
        status: 'completed',
        paymentMethod: 'credit_card'
      },
      {
        id: "brex-3",
        title: "Dining Expense",
        description: "Client meeting lunch",
        amount: -187.25,
        type: 'expense',
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        category: 'Meals',
        status: 'completed',
        paymentMethod: 'credit_card'
      }
    ],
    metrics: {
      cashflow: 38750.00,
      burnRate: 28450.75
    }
  };
}

// Gusto API integration for payroll
export async function fetchGustoData(integration: Integration): Promise<Partial<FinancialData>> {
  console.log(`Fetching data from Gusto for integration ID ${integration.id}`);
  
  return {
    monthlyExpenses: 47250.00,
    transactions: [
      {
        id: "gusto-1",
        title: "Payroll",
        description: "Semi-monthly payroll",
        amount: -22500.00,
        type: 'expense',
        date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        category: 'Payroll',
        status: 'completed'
      },
      {
        id: "gusto-2",
        title: "Payroll Taxes",
        description: "Federal and state withholding",
        amount: -7850.50,
        type: 'expense',
        date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        category: 'Taxes',
        status: 'completed'
      }
    ],
    payroll: {
      totalEmployees: 12,
      payrollAmount: 22500.00,
      nextPayrollDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      taxes: {
        federal: 5230.50,
        state: 2180.00,
        local: 440.00
      }
    }
  };
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
