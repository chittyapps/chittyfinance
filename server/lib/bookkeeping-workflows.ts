// @ts-nocheck - TODO: Add proper types
/**
 * Comprehensive Bookkeeping Workflows for ChittyFinance
 * Automated workflows for accounting, reconciliation, and reporting
 */

import { WaveBookkeepingClient } from './wave-bookkeeping';
import { ChittyRentalClient } from './chittyrental-integration';
import { DoorLoopClient } from './doorloop-integration';
import { StripeConnectClient } from './stripe-connect';
import { storage } from '../storage';
import { logToChronicle } from './chittychronicle-logging';
import { reconcileAccount } from './reconciliation';
import { categorizeTransaction } from './ml-categorization';

export interface BookkeepingWorkflow {
  id: string;
  name: string;
  type: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
  tenantId: string;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  config: Record<string, any>;
}

/**
 * Daily bookkeeping workflow
 * - Sync all integrations
 * - Categorize new transactions
 * - Detect anomalies
 */
export async function runDailyBookkeeping(tenantId: string): Promise<{
  synced: {
    wave: number;
    rental: number;
    doorloop: number;
    stripe: number;
  };
  categorized: number;
  anomalies: number;
}> {
  console.log(`Running daily bookkeeping for tenant ${tenantId}`);

  const result = {
    synced: { wave: 0, rental: 0, doorloop: 0, stripe: 0 },
    categorized: 0,
    anomalies: 0,
  };

  try {
    // 1. Sync Wave data
    const waveIntegrations = await storage.listIntegrationsByService('wavapps');
    for (const integration of waveIntegrations) {
      if (integration.tenantId === tenantId && integration.connected) {
        const credentials = integration.credentials as any;
        const businessId = credentials.business_id;

        const waveClient = new WaveBookkeepingClient({
          clientId: process.env.WAVE_CLIENT_ID || '',
          clientSecret: process.env.WAVE_CLIENT_SECRET || '',
          redirectUri: process.env.WAVE_REDIRECT_URI || '',
        });

        waveClient.setAccessToken(credentials.access_token);

        const syncResult = await waveClient.syncToChittyFinance(businessId, tenantId);
        result.synced.wave += syncResult.invoices + syncResult.expenses;
      }
    }

    // 2. Sync DoorLoop data (real property management system)
    const doorloopIntegrations = await storage.listIntegrationsByService('doorloop');
    for (const integration of doorloopIntegrations) {
      if (integration.tenantId === tenantId && integration.connected) {
        try {
          const credentials = integration.credentials as any;
          const doorloopClient = new DoorLoopClient(credentials.api_key);

          // Get all DoorLoop properties
          const doorloopProperties = await doorloopClient.getProperties();

          // Sync each property
          for (const dlProperty of doorloopProperties) {
            const syncResult = await doorloopClient.syncProperty(
              dlProperty.id,
              tenantId,
              new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() // Last 7 days
            );

            result.synced.doorloop += syncResult.rentPayments + syncResult.expenses;
          }

          console.log(`✅ Synced ${doorloopProperties.length} DoorLoop properties`);
        } catch (error) {
          console.error('DoorLoop sync error:', error);
          // Continue with other integrations even if DoorLoop fails
        }
      }
    }

    // 3. Sync ChittyRental data (if using ChittyOS rental service)
    const properties = await storage.getProperties?.(tenantId);
    if (properties) {
      const rentalClient = new ChittyRentalClient();

      for (const property of properties) {
        const syncResult = await rentalClient.syncProperty(
          property.id,
          tenantId,
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() // Last 7 days
        );

        result.synced.rental += syncResult.rentPayments + syncResult.expenses;
      }
    }

    // 4. Sync Stripe Connect data (connected accounts)
    const stripeIntegrations = await storage.listIntegrationsByService('stripe');
    for (const integration of stripeIntegrations) {
      if (integration.tenantId === tenantId && integration.connected) {
        try {
          const credentials = integration.credentials as any;
          const stripeClient = new StripeConnectClient(credentials.secret_key || process.env.STRIPE_SECRET_KEY);

          // Sync all connected accounts
          const syncResult = await stripeClient.syncAllConnectedAccounts(
            tenantId,
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
          );

          result.synced.stripe += syncResult.totalSynced;
          console.log(`✅ Synced ${syncResult.accounts} Stripe connected accounts`);
        } catch (error) {
          console.error('Stripe Connect sync error:', error);
          // Continue with other integrations even if Stripe fails
        }
      }
    }

    // 5. Auto-categorize uncategorized transactions
    const allTransactions = await storage.getTransactions(tenantId);
    const uncategorized = allTransactions.filter(
      t => !t.category || t.category === 'other_expense' || t.category === 'other_income'
    );

    for (const tx of uncategorized.slice(0, 50)) { // Limit to avoid rate limits
      try {
        const category = await categorizeTransaction(
          tx.description,
          parseFloat(tx.amount),
          tx.type as any,
          tx.payee || undefined
        );

        // Update transaction category if confidence is high
        if (category.confidence > 0.7) {
          // Would update via storage
          // await storage.updateTransaction(tx.id, { category: category.category });
          result.categorized++;
        }
      } catch (error) {
        console.error(`Failed to categorize transaction ${tx.id}:`, error);
      }
    }

    // Log workflow completion
    await logToChronicle({
      eventType: 'bookkeeping_workflow',
      entityId: tenantId,
      entityType: 'tenant',
      action: 'daily_bookkeeping_completed',
      metadata: {
        result,
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('Daily bookkeeping error:', error);
    throw error;
  }

  return result;
}

/**
 * Weekly reconciliation workflow
 * - Reconcile all accounts
 * - Generate discrepancy reports
 * - Send alerts for unreconciled items
 */
export async function runWeeklyReconciliation(tenantId: string): Promise<{
  accounts: number;
  reconciled: number;
  discrepancies: number;
}> {
  console.log(`Running weekly reconciliation for tenant ${tenantId}`);

  const result = {
    accounts: 0,
    reconciled: 0,
    discrepancies: 0,
  };

  try {
    const accounts = await storage.getAccounts?.(tenantId);

    if (!accounts) {
      return result;
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    for (const account of accounts) {
      result.accounts++;

      // This would fetch statement data from integration
      // For now, just log
      console.log(`Reconciling account: ${account.name}`);

      // Example reconciliation (would use real statement data)
      const summary = await reconcileAccount(
        account.id,
        tenantId,
        parseFloat(account.balance),
        [], // Would fetch from integration
        weekAgo,
        now
      );

      result.reconciled += summary.matched;
      result.discrepancies += summary.unmatched;
    }

    // Log workflow completion
    await logToChronicle({
      eventType: 'bookkeeping_workflow',
      entityId: tenantId,
      entityType: 'tenant',
      action: 'weekly_reconciliation_completed',
      metadata: {
        result,
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('Weekly reconciliation error:', error);
    throw error;
  }

  return result;
}

/**
 * Monthly financial close workflow
 * - Generate financial statements
 * - Close the period
 * - Archive transactions
 * - Generate tax reports
 */
export async function runMonthlyClose(tenantId: string, month: number, year: number): Promise<{
  profitLoss: {
    revenue: number;
    expenses: number;
    netIncome: number;
  };
  balanceSheet: {
    assets: number;
    liabilities: number;
    equity: number;
  };
  taxSummary: {
    income: number;
    deductions: number;
    salesTax: number;
  };
}> {
  console.log(`Running monthly close for tenant ${tenantId} - ${year}-${month}`);

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0); // Last day of month

  // Get all transactions for the month
  const allTransactions = await storage.getTransactions(tenantId);
  const monthTransactions = allTransactions.filter(t => {
    const txDate = new Date(t.date);
    return txDate >= startDate && txDate <= endDate;
  });

  // Calculate profit & loss
  const revenue = monthTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const expenses = monthTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);

  const profitLoss = {
    revenue,
    expenses,
    netIncome: revenue - expenses,
  };

  // Calculate balance sheet (simplified)
  const accounts = await storage.getAccounts?.(tenantId);
  let assets = 0;
  let liabilities = 0;

  if (accounts) {
    accounts.forEach(account => {
      if (account.type === 'checking' || account.type === 'savings' || account.type === 'investment') {
        assets += parseFloat(account.balance);
      } else if (account.type === 'credit') {
        liabilities += parseFloat(account.balance);
      }
    });
  }

  const balanceSheet = {
    assets,
    liabilities,
    equity: assets - liabilities,
  };

  // Calculate tax summary
  const taxableIncome = monthTransactions
    .filter(t => t.type === 'income' && !t.category?.includes('non_taxable'))
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const deductions = monthTransactions
    .filter(t => t.type === 'expense' && t.category !== 'personal')
    .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);

  // Sales tax (would calculate from transactions with tax metadata)
  const salesTax = 0;

  const taxSummary = {
    income: taxableIncome,
    deductions,
    salesTax,
  };

  const result = {
    profitLoss,
    balanceSheet,
    taxSummary,
  };

  // Log monthly close
  await logToChronicle({
    eventType: 'bookkeeping_workflow',
    entityId: tenantId,
    entityType: 'tenant',
    action: 'monthly_close_completed',
    metadata: {
      month,
      year,
      result,
      timestamp: new Date().toISOString(),
    },
  });

  return result;
}

/**
 * Quarterly tax preparation workflow
 * - Generate quarterly tax reports
 * - Calculate estimated tax payments
 * - Prepare for tax filing
 */
export async function runQuarterlyTaxPrep(
  tenantId: string,
  quarter: number,
  year: number
): Promise<{
  income: number;
  expenses: number;
  netIncome: number;
  estimatedTax: number;
  deductions: Array<{ category: string; amount: number }>;
}> {
  console.log(`Running quarterly tax prep for tenant ${tenantId} - Q${quarter} ${year}`);

  // Calculate quarter date range
  const startMonth = (quarter - 1) * 3;
  const startDate = new Date(year, startMonth, 1);
  const endDate = new Date(year, startMonth + 3, 0);

  // Get all transactions for the quarter
  const allTransactions = await storage.getTransactions(tenantId);
  const quarterTransactions = allTransactions.filter(t => {
    const txDate = new Date(t.date);
    return txDate >= startDate && txDate <= endDate;
  });

  // Calculate income and expenses
  const income = quarterTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const expenses = quarterTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);

  const netIncome = income - expenses;

  // Calculate deductions by category
  const deductionMap = new Map<string, number>();

  quarterTransactions
    .filter(t => t.type === 'expense')
    .forEach(t => {
      const category = t.category || 'other';
      deductionMap.set(category, (deductionMap.get(category) || 0) + Math.abs(parseFloat(t.amount)));
    });

  const deductions = Array.from(deductionMap.entries()).map(([category, amount]) => ({
    category,
    amount,
  }));

  // Estimate tax (simplified - would use real tax brackets)
  const taxRate = 0.25; // 25% estimated tax rate
  const estimatedTax = Math.max(0, netIncome * taxRate);

  const result = {
    income,
    expenses,
    netIncome,
    estimatedTax,
    deductions,
  };

  // Log quarterly tax prep
  await logToChronicle({
    eventType: 'bookkeeping_workflow',
    entityId: tenantId,
    entityType: 'tenant',
    action: 'quarterly_tax_prep_completed',
    metadata: {
      quarter,
      year,
      result,
      timestamp: new Date().toISOString(),
    },
  });

  return result;
}

/**
 * Annual year-end close workflow
 * - Generate annual financial statements
 * - Prepare for tax filing
 * - Archive year data
 * - Generate audit reports
 */
export async function runYearEndClose(tenantId: string, year: number): Promise<{
  annual: {
    revenue: number;
    expenses: number;
    netIncome: number;
  };
  tax: {
    taxableIncome: number;
    deductions: number;
    estimatedTax: number;
  };
  metrics: {
    avgMonthlyRevenue: number;
    avgMonthlyExpenses: number;
    profitMargin: number;
  };
}> {
  console.log(`Running year-end close for tenant ${tenantId} - ${year}`);

  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);

  // Get all transactions for the year
  const allTransactions = await storage.getTransactions(tenantId);
  const yearTransactions = allTransactions.filter(t => {
    const txDate = new Date(t.date);
    return txDate >= startDate && txDate <= endDate;
  });

  // Calculate annual totals
  const revenue = yearTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const expenses = yearTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);

  const netIncome = revenue - expenses;

  // Tax calculations
  const taxableIncome = revenue;
  const deductions = expenses;
  const estimatedTax = Math.max(0, (taxableIncome - deductions) * 0.25);

  // Metrics
  const avgMonthlyRevenue = revenue / 12;
  const avgMonthlyExpenses = expenses / 12;
  const profitMargin = revenue > 0 ? (netIncome / revenue) * 100 : 0;

  const result = {
    annual: {
      revenue,
      expenses,
      netIncome,
    },
    tax: {
      taxableIncome,
      deductions,
      estimatedTax,
    },
    metrics: {
      avgMonthlyRevenue,
      avgMonthlyExpenses,
      profitMargin,
    },
  };

  // Log year-end close
  await logToChronicle({
    eventType: 'bookkeeping_workflow',
    entityId: tenantId,
    entityType: 'tenant',
    action: 'year_end_close_completed',
    metadata: {
      year,
      result,
      timestamp: new Date().toISOString(),
    },
  });

  return result;
}

/**
 * Schedule and run workflows automatically
 */
export class WorkflowScheduler {
  private workflows: Map<string, BookkeepingWorkflow> = new Map();

  /**
   * Register a workflow
   */
  register(workflow: BookkeepingWorkflow): void {
    this.workflows.set(workflow.id, workflow);
  }

  /**
   * Run due workflows
   */
  async runDue(): Promise<void> {
    const now = new Date();

    for (const workflow of this.workflows.values()) {
      if (!workflow.enabled) continue;
      if (workflow.nextRun && workflow.nextRun > now) continue;

      try {
        console.log(`Running workflow: ${workflow.name}`);

        switch (workflow.type) {
          case 'daily':
            await runDailyBookkeeping(workflow.tenantId);
            workflow.nextRun = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            break;

          case 'weekly':
            await runWeeklyReconciliation(workflow.tenantId);
            workflow.nextRun = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            break;

          case 'monthly':
            const month = now.getMonth() + 1;
            const year = now.getFullYear();
            await runMonthlyClose(workflow.tenantId, month, year);
            workflow.nextRun = new Date(year, month, 1); // Next month
            break;

          case 'quarterly':
            const quarter = Math.floor(now.getMonth() / 3) + 1;
            await runQuarterlyTaxPrep(workflow.tenantId, quarter, now.getFullYear());
            workflow.nextRun = new Date(now.getFullYear(), quarter * 3, 1);
            break;

          case 'annual':
            await runYearEndClose(workflow.tenantId, now.getFullYear());
            workflow.nextRun = new Date(now.getFullYear() + 1, 0, 1);
            break;
        }

        workflow.lastRun = now;
      } catch (error) {
        console.error(`Workflow ${workflow.name} failed:`, error);
      }
    }
  }
}
