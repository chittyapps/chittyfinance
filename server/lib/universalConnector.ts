import { Integration } from "@shared/schema";
import { FinancialData } from "./financialServices";
import { 
  fetchMercuryBankData,
  fetchWavAppsData,
  fetchDoorLoopData,
  fetchStripeData,
  fetchQuickBooksData,
  fetchXeroData,
  fetchBrexData,
  fetchGustoData,
  getAggregatedFinancialData
} from "./financialServices";
import { ChargeDetails, getRecurringCharges, OptimizationRecommendation, getChargeOptimizations } from "./chargeAutomation";

// Interface for normalized financial data to be sent to Universal Connector
export interface UniversalConnectorPayload {
  version: string;
  timestamp: string;
  source: string;
  accountId: string | number;
  authInfo?: {
    authenticatedUserId: string;
    authenticatedAt: string;
    authMethod: string;
  };
  data: {
    summary: {
      cashOnHand: number;
      monthlyRevenue: number;
      monthlyExpenses: number;
      outstandingInvoices: number;
      metrics?: {
        cashflow?: number;
        runway?: number;
        burnRate?: number;
        growthRate?: number;
        customerAcquisitionCost?: number;
        lifetimeValue?: number;
      };
    };
    transactions: Array<{
      id: string;
      title: string;
      description?: string;
      amount: number;
      type: 'income' | 'expense';
      date: string;
      category?: string;
      status?: string;
      paymentMethod?: string;
      source: string;
    }>;
    recurringCharges: Array<{
      id: string;
      merchantName: string;
      amount: number;
      date: string;
      category: string;
      recurring: boolean;
      nextChargeDate?: string;
      subscriptionId?: string;
      source: string;
    }>;
    optimizations?: Array<{
      chargeId: string;
      merchantName: string;
      currentAmount: number;
      suggestedAction: string;
      potentialSavings: number;
      reasoning: string;
      alternativeOptions?: string[];
    }>;
    payroll?: {
      totalEmployees: number;
      payrollAmount: number;
      nextPayrollDate: string;
      taxes: {
        federal: number;
        state: number;
        local: number;
      };
    };
  };
  connectedServices: Array<{
    id: string;
    name: string;
    type: string;
    lastSynced?: string;
  }>;
}

/**
 * Transform our financial data into the Universal Connector format
 */
export async function transformToUniversalFormat(
  userId: number,
  integrations: Integration[]
): Promise<UniversalConnectorPayload> {
  // Get aggregated financial data from all connected services
  const financialData = await getAggregatedFinancialData(integrations);
  
  // Get recurring charges
  const recurringCharges = await getRecurringCharges(userId);
  
  // Get optimization recommendations
  const optimizations = await getChargeOptimizations(userId);
  
  // Transform the data into the universal format
  const universalData: UniversalConnectorPayload = {
    version: "1.0",
    timestamp: new Date().toISOString(),
    source: "ChittyServices-CFO",
    accountId: userId,
    data: {
      summary: {
        cashOnHand: financialData.cashOnHand,
        monthlyRevenue: financialData.monthlyRevenue,
        monthlyExpenses: financialData.monthlyExpenses,
        outstandingInvoices: financialData.outstandingInvoices,
        metrics: financialData.metrics
      },
      transactions: financialData.transactions?.map(transaction => ({
        id: transaction.id,
        title: transaction.title,
        description: transaction.description,
        amount: transaction.amount,
        type: transaction.type,
        date: transaction.date.toISOString(),
        category: transaction.category,
        status: transaction.status,
        paymentMethod: transaction.paymentMethod,
        source: getSourceFromTransactionId(transaction.id)
      })) || [],
      recurringCharges: recurringCharges.map(charge => ({
        id: charge.id,
        merchantName: charge.merchantName,
        amount: charge.amount,
        date: charge.date.toISOString(),
        category: charge.category,
        recurring: charge.recurring,
        nextChargeDate: charge.nextChargeDate?.toISOString(),
        subscriptionId: charge.subscriptionId,
        source: getSourceFromChargeId(charge.id)
      })),
      optimizations: optimizations.map(opt => ({
        chargeId: opt.chargeId,
        merchantName: opt.merchantName,
        currentAmount: opt.currentAmount,
        suggestedAction: opt.suggestedAction,
        potentialSavings: opt.potentialSavings,
        reasoning: opt.reasoning,
        alternativeOptions: opt.alternativeOptions
      })),
      payroll: financialData.payroll ? {
        totalEmployees: financialData.payroll.totalEmployees,
        payrollAmount: financialData.payroll.payrollAmount,
        nextPayrollDate: financialData.payroll.nextPayrollDate.toISOString(),
        taxes: financialData.payroll.taxes
      } : undefined
    },
    connectedServices: integrations
      .filter(integration => integration.connected)
      .map(integration => ({
        id: integration.id.toString(),
        name: integration.name,
        type: integration.serviceType,
        lastSynced: integration.lastSynced?.toISOString()
      }))
  };
  
  return universalData;
}

/**
 * Helper function to determine the source from a transaction ID
 */
function getSourceFromTransactionId(id: string): string {
  if (id.startsWith('merc-')) return 'mercury_bank';
  if (id.startsWith('wavapps-')) return 'wavapps';
  if (id.startsWith('doorloop-')) return 'doorloop';
  if (id.startsWith('stripe-')) return 'stripe';
  if (id.startsWith('qb-')) return 'quickbooks';
  if (id.startsWith('xero-')) return 'xero';
  if (id.startsWith('brex-')) return 'brex';
  if (id.startsWith('gusto-')) return 'gusto';
  return 'unknown';
}

/**
 * Helper function to determine the source from a charge ID
 */
function getSourceFromChargeId(id: string): string {
  if (id.startsWith('merc-charge-')) return 'mercury_bank';
  if (id.startsWith('wavapps-charge-')) return 'wavapps';
  if (id.startsWith('doorloop-charge-')) return 'doorloop';
  if (id.startsWith('stripe-charge-')) return 'stripe';
  if (id.startsWith('qb-charge-')) return 'quickbooks';
  if (id.startsWith('xero-charge-')) return 'xero';
  if (id.startsWith('brex-charge-')) return 'brex';
  return 'unknown';
}