// @ts-nocheck - TODO: Add proper types
/**
 * Stripe Connect Integration for ChittyFinance
 * Access financial data from connected Stripe accounts
 */

import Stripe from 'stripe';
import { storage } from '../storage';
import { logToChronicle } from './chittychronicle-logging';
import { validateTransaction } from './chittyschema-validation';

const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2024-06-20' as any;

export interface StripeConnectedAccount {
  id: string;
  type: 'standard' | 'express' | 'custom';
  email: string;
  businessProfile?: {
    name?: string;
    url?: string;
  };
  capabilities?: {
    [key: string]: string;
  };
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  defaultCurrency: string;
}

export interface StripeBalance {
  available: Array<{ amount: number; currency: string }>;
  pending: Array<{ amount: number; currency: string }>;
  connectReserved?: Array<{ amount: number; currency: string }>;
}

export interface StripeTransaction {
  id: string;
  type: 'charge' | 'refund' | 'payout' | 'transfer';
  amount: number;
  currency: string;
  date: Date;
  description: string;
  status: string;
  customer?: string;
  metadata?: Record<string, string>;
}

/**
 * Stripe Connect Client
 */
export class StripeConnectClient {
  private stripe: Stripe;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }
    this.stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  }

  /**
   * List all connected accounts
   */
  async listConnectedAccounts(limit: number = 100): Promise<StripeConnectedAccount[]> {
    const accounts = await this.stripe.accounts.list({ limit });

    return accounts.data.map(account => ({
      id: account.id,
      type: account.type as 'standard' | 'express' | 'custom',
      email: account.email || '',
      businessProfile: account.business_profile ? {
        name: account.business_profile.name || undefined,
        url: account.business_profile.url || undefined,
      } : undefined,
      capabilities: account.capabilities || {},
      chargesEnabled: account.charges_enabled || false,
      payoutsEnabled: account.payouts_enabled || false,
      defaultCurrency: account.default_currency || 'usd',
    }));
  }

  /**
   * Get connected account details
   */
  async getConnectedAccount(accountId: string): Promise<StripeConnectedAccount> {
    const account = await this.stripe.accounts.retrieve(accountId);

    return {
      id: account.id,
      type: account.type as 'standard' | 'express' | 'custom',
      email: account.email || '',
      businessProfile: account.business_profile ? {
        name: account.business_profile.name || undefined,
        url: account.business_profile.url || undefined,
      } : undefined,
      capabilities: account.capabilities || {},
      chargesEnabled: account.charges_enabled || false,
      payoutsEnabled: account.payouts_enabled || false,
      defaultCurrency: account.default_currency || 'usd',
    };
  }

  /**
   * Get balance for a connected account
   */
  async getAccountBalance(accountId: string): Promise<StripeBalance> {
    const balance = await this.stripe.balance.retrieve({
      stripeAccount: accountId,
    });

    return {
      available: balance.available.map(b => ({
        amount: b.amount,
        currency: b.currency,
      })),
      pending: balance.pending.map(b => ({
        amount: b.amount,
        currency: b.currency,
      })),
      connectReserved: balance.connect_reserved?.map(b => ({
        amount: b.amount,
        currency: b.currency,
      })),
    };
  }

  /**
   * Get charges for a connected account
   */
  async getAccountCharges(
    accountId: string,
    options?: {
      limit?: number;
      startingAfter?: string;
      endingBefore?: string;
      created?: { gte?: number; lte?: number };
    }
  ): Promise<StripeTransaction[]> {
    const charges = await this.stripe.charges.list({
      limit: options?.limit || 100,
      starting_after: options?.startingAfter,
      ending_before: options?.endingBefore,
      created: options?.created,
    }, {
      stripeAccount: accountId,
    });

    return charges.data.map(charge => ({
      id: charge.id,
      type: 'charge' as const,
      amount: charge.amount / 100, // Convert from cents
      currency: charge.currency,
      date: new Date(charge.created * 1000),
      description: charge.description || 'Stripe charge',
      status: charge.status,
      customer: charge.customer as string || undefined,
      metadata: charge.metadata,
    }));
  }

  /**
   * Get payouts for a connected account
   */
  async getAccountPayouts(
    accountId: string,
    options?: {
      limit?: number;
      startingAfter?: string;
      created?: { gte?: number; lte?: number };
    }
  ): Promise<StripeTransaction[]> {
    const payouts = await this.stripe.payouts.list({
      limit: options?.limit || 100,
      starting_after: options?.startingAfter,
      created: options?.created,
    }, {
      stripeAccount: accountId,
    });

    return payouts.data.map(payout => ({
      id: payout.id,
      type: 'payout' as const,
      amount: payout.amount / 100, // Convert from cents
      currency: payout.currency,
      date: new Date(payout.created * 1000),
      description: payout.description || `Payout to ${payout.destination || 'bank'}`,
      status: payout.status,
      metadata: payout.metadata,
    }));
  }

  /**
   * Get refunds for a connected account
   */
  async getAccountRefunds(
    accountId: string,
    options?: {
      limit?: number;
      created?: { gte?: number; lte?: number };
    }
  ): Promise<StripeTransaction[]> {
    const refunds = await this.stripe.refunds.list({
      limit: options?.limit || 100,
      created: options?.created,
    }, {
      stripeAccount: accountId,
    });

    return refunds.data.map(refund => ({
      id: refund.id,
      type: 'refund' as const,
      amount: refund.amount / 100, // Convert from cents
      currency: refund.currency,
      date: new Date(refund.created * 1000),
      description: refund.reason || 'Refund',
      status: refund.status || 'succeeded',
      metadata: refund.metadata,
    }));
  }

  /**
   * Get all transactions for a connected account
   */
  async getAccountTransactions(
    accountId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<StripeTransaction[]> {
    const dateFilter = {
      gte: startDate ? Math.floor(startDate.getTime() / 1000) : undefined,
      lte: endDate ? Math.floor(endDate.getTime() / 1000) : undefined,
    };

    const [charges, payouts, refunds] = await Promise.all([
      this.getAccountCharges(accountId, { created: dateFilter }),
      this.getAccountPayouts(accountId, { created: dateFilter }),
      this.getAccountRefunds(accountId, { created: dateFilter }),
    ]);

    // Combine and sort by date
    const allTransactions = [...charges, ...payouts, ...refunds];
    return allTransactions.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /**
   * Get financial summary for a connected account
   */
  async getAccountFinancialSummary(
    accountId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    balance: StripeBalance;
    transactions: {
      charges: number;
      payouts: number;
      refunds: number;
      net: number;
    };
    count: {
      charges: number;
      payouts: number;
      refunds: number;
    };
  }> {
    const [balance, transactions] = await Promise.all([
      this.getAccountBalance(accountId),
      this.getAccountTransactions(accountId, startDate, endDate),
    ]);

    const charges = transactions.filter(t => t.type === 'charge');
    const payouts = transactions.filter(t => t.type === 'payout');
    const refunds = transactions.filter(t => t.type === 'refund');

    const chargesTotal = charges.reduce((sum, t) => sum + t.amount, 0);
    const payoutsTotal = payouts.reduce((sum, t) => sum + t.amount, 0);
    const refundsTotal = refunds.reduce((sum, t) => sum + t.amount, 0);

    return {
      balance,
      transactions: {
        charges: chargesTotal,
        payouts: payoutsTotal,
        refunds: refundsTotal,
        net: chargesTotal - refundsTotal - payoutsTotal,
      },
      count: {
        charges: charges.length,
        payouts: payouts.length,
        refunds: refunds.length,
      },
    };
  }

  /**
   * Sync connected account transactions to ChittyFinance
   */
  async syncAccountTransactions(
    accountId: string,
    tenantId: string,
    startDate?: Date
  ): Promise<{
    synced: number;
    errors: string[];
  }> {
    let synced = 0;
    const errors: string[] = [];

    try {
      const transactions = await this.getAccountTransactions(
        accountId,
        startDate,
        new Date()
      );

      for (const transaction of transactions) {
        try {
          // Check if already synced
          const existing = await storage.getTransactions(tenantId);
          const alreadySynced = existing.some(
            t => t.externalId === `stripe-${transaction.type}-${transaction.id}`
          );

          if (!alreadySynced) {
            let amount: number;
            let type: 'income' | 'expense';
            let category: string;

            // Determine transaction type and category
            switch (transaction.type) {
              case 'charge':
                amount = transaction.amount;
                type = 'income';
                category = 'payment_received';
                break;
              case 'payout':
                amount = -transaction.amount;
                type = 'expense';
                category = 'payout';
                break;
              case 'refund':
                amount = -transaction.amount;
                type = 'expense';
                category = 'refund';
                break;
              default:
                amount = transaction.amount;
                type = 'income';
                category = 'other_income';
            }

            const transactionData = {
              tenantId,
              accountId: 'stripe-connected-account',
              amount: amount.toString(),
              type,
              description: transaction.description,
              date: transaction.date,
              category,
              externalId: `stripe-${transaction.type}-${transaction.id}`,
              reconciled: transaction.status === 'succeeded' || transaction.status === 'paid',
              metadata: {
                source: 'stripe_connect',
                stripeAccountId: accountId,
                stripeTransactionType: transaction.type,
                stripeStatus: transaction.status,
                ...transaction.metadata,
              },
            };

            // Validate with ChittySchema
            try {
              const validation = await validateTransaction(transactionData);
              if (!validation.valid) {
                errors.push(`Validation failed for ${transaction.type} ${transaction.id}: ${validation.errors?.map(e => e.message).join(', ')}`);
                continue;
              }
            } catch (error) {
              // Log validation error but continue (schema service may be unavailable)
              console.warn(`ChittySchema validation unavailable for ${transaction.type} ${transaction.id}:`, error);
            }

            await storage.createTransaction(transactionData);

            synced++;
          }
        } catch (error) {
          errors.push(`Failed to sync ${transaction.type} ${transaction.id}: ${error}`);
        }
      }

      // Log sync
      await logToChronicle({
        eventType: 'integration_sync',
        entityId: tenantId,
        entityType: 'tenant',
        action: 'stripe_connect_sync',
        metadata: {
          accountId,
          synced,
          errors: errors.length,
          timestamp: new Date().toISOString(),
        },
      });

    } catch (error) {
      errors.push(`Sync failed: ${error}`);
    }

    return { synced, errors };
  }

  /**
   * Sync all connected accounts for a tenant
   */
  async syncAllConnectedAccounts(tenantId: string, startDate?: Date): Promise<{
    accounts: number;
    totalSynced: number;
    errors: string[];
  }> {
    const accounts = await this.listConnectedAccounts();
    let totalSynced = 0;
    const allErrors: string[] = [];

    for (const account of accounts) {
      try {
        const result = await this.syncAccountTransactions(account.id, tenantId, startDate);
        totalSynced += result.synced;
        allErrors.push(...result.errors);
      } catch (error) {
        allErrors.push(`Failed to sync account ${account.id}: ${error}`);
      }
    }

    return {
      accounts: accounts.length,
      totalSynced,
      errors: allErrors,
    };
  }
}

/**
 * Create Stripe Connect client instance
 */
export function createStripeConnectClient(apiKey?: string): StripeConnectClient {
  return new StripeConnectClient(apiKey);
}
