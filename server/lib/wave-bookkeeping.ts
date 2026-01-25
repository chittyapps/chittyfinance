// @ts-nocheck - TODO: Add proper types
/**
 * Enhanced Wave Bookkeeping Integration
 * Comprehensive bookkeeping features: invoices, bills, payments, tax tracking
 */

import { WaveAPIClient, createWaveClient } from './wave-api';
import { storage } from '../storage';
import { logToChronicle } from './chittychronicle-logging';
import { validateTransaction } from './chittyschema-validation';

export interface WaveInvoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  invoiceDate: string;
  dueDate: string;
  status: 'DRAFT' | 'SENT' | 'VIEWED' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  subtotal: number;
  total: number;
  amountDue: number;
  currency: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    accountId?: string;
  }>;
  taxes: Array<{
    name: string;
    rate: number;
    amount: number;
  }>;
  payments: Array<{
    amount: number;
    date: string;
    paymentMethod: string;
  }>;
}

export interface WaveBill {
  id: string;
  billNumber: string;
  vendorId: string;
  vendorName: string;
  billDate: string;
  dueDate: string;
  status: 'UNPAID' | 'PAID' | 'OVERDUE';
  total: number;
  amountDue: number;
  currency: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    accountId?: string;
  }>;
}

export interface WaveCustomer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  balance: number;
  currency: string;
}

export interface WaveVendor {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: {
    line1: string;
    city: string;
    state: string;
    zip: string;
  };
}

export interface WaveAccount {
  id: string;
  name: string;
  type: string;
  subtype: string;
  balance: number;
  currency: string;
}

export interface WavePayment {
  id: string;
  amount: number;
  date: string;
  paymentMethod: string;
  invoiceId?: string;
  billId?: string;
  memo?: string;
}

export interface BookkeepingReport {
  profitLoss: {
    revenue: number;
    expenses: number;
    netIncome: number;
    breakdown: {
      category: string;
      amount: number;
    }[];
  };
  balanceSheet: {
    assets: number;
    liabilities: number;
    equity: number;
    accountBreakdown: {
      account: string;
      balance: number;
    }[];
  };
  cashFlow: {
    operating: number;
    investing: number;
    financing: number;
    netChange: number;
  };
  taxSummary: {
    totalIncome: number;
    totalDeductions: number;
    taxableIncome: number;
    salesTaxCollected: number;
    salesTaxOwed: number;
  };
}

/**
 * Enhanced Wave bookkeeping client
 */
export class WaveBookkeepingClient extends WaveAPIClient {
  /**
   * Get all invoices with detailed information
   */
  async getInvoices(businessId: string, options?: {
    status?: string;
    customerId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
  }): Promise<WaveInvoice[]> {
    const { page = 1, pageSize = 50, status, customerId, startDate, endDate } = options || {};

    const query = `
      query GetInvoices($businessId: ID!, $page: Int!, $pageSize: Int!) {
        business(id: $businessId) {
          invoices(page: $page, pageSize: $pageSize) {
            edges {
              node {
                id
                invoiceNumber
                customer {
                  id
                  name
                }
                invoiceDate
                dueDate
                status
                subTotal {
                  value
                  currency { code }
                }
                total {
                  value
                  currency { code }
                }
                amountDue {
                  value
                }
                items {
                  product {
                    name
                  }
                  description
                  quantity
                  unitPrice
                  total {
                    value
                  }
                  account {
                    id
                  }
                }
                taxes {
                  name
                  rate
                  amount {
                    value
                  }
                }
              }
            }
          }
        }
      }
    `;

    const data = await this.graphql<{ business: { invoices: { edges: Array<{ node: any }> } } }>(
      query,
      { businessId, page, pageSize }
    );

    const invoices = data.business.invoices.edges.map(edge => edge.node);

    // Filter by criteria
    let filtered = invoices;
    if (status) {
      filtered = filtered.filter(inv => inv.status === status);
    }
    if (customerId) {
      filtered = filtered.filter(inv => inv.customer.id === customerId);
    }
    if (startDate) {
      filtered = filtered.filter(inv => inv.invoiceDate >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(inv => inv.invoiceDate <= endDate);
    }

    return filtered.map(inv => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerId: inv.customer.id,
      customerName: inv.customer.name,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      status: inv.status,
      subtotal: parseFloat(inv.subTotal.value),
      total: parseFloat(inv.total.value),
      amountDue: parseFloat(inv.amountDue.value),
      currency: inv.total.currency.code,
      items: inv.items.map((item: any) => ({
        description: item.description || item.product?.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: parseFloat(item.total.value),
        accountId: item.account?.id,
      })),
      taxes: inv.taxes.map((tax: any) => ({
        name: tax.name,
        rate: tax.rate,
        amount: parseFloat(tax.amount.value),
      })),
      payments: [], // Would query payment records separately
    }));
  }

  /**
   * Create invoice
   */
  async createInvoice(businessId: string, invoice: {
    customerId: string;
    invoiceDate: string;
    dueDate: string;
    items: Array<{
      productId?: string;
      description: string;
      quantity: number;
      unitPrice: number;
      accountId?: string;
      taxIds?: string[];
    }>;
    memo?: string;
  }): Promise<WaveInvoice> {
    const mutation = `
      mutation CreateInvoice($input: InvoiceCreateInput!) {
        invoiceCreate(input: $input) {
          invoice {
            id
            invoiceNumber
            status
          }
        }
      }
    `;

    const input = {
      businessId,
      customerId: invoice.customerId,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      items: invoice.items.map(item => ({
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        accountId: item.accountId,
        taxIds: item.taxIds,
      })),
      memo: invoice.memo,
    };

    const data = await this.graphql<{ invoiceCreate: { invoice: any } }>(mutation, { input });

    // Fetch full invoice details
    const invoices = await this.getInvoices(businessId, {
      pageSize: 1,
    });

    return invoices[0];
  }

  /**
   * Record invoice payment
   */
  async recordInvoicePayment(
    invoiceId: string,
    payment: {
      amount: number;
      date: string;
      paymentMethod: string;
      memo?: string;
    }
  ): Promise<WavePayment> {
    const mutation = `
      mutation RecordPayment($input: InvoicePaymentRecordInput!) {
        invoicePaymentRecord(input: $input) {
          payment {
            id
            amount { value }
            date
            paymentMethod
          }
        }
      }
    `;

    const input = {
      invoiceId,
      amount: payment.amount,
      date: payment.date,
      paymentMethod: payment.paymentMethod,
      memo: payment.memo,
    };

    const data = await this.graphql<{ invoicePaymentRecord: { payment: any } }>(mutation, { input });

    return {
      id: data.invoicePaymentRecord.payment.id,
      amount: parseFloat(data.invoicePaymentRecord.payment.amount.value),
      date: data.invoicePaymentRecord.payment.date,
      paymentMethod: data.invoicePaymentRecord.payment.paymentMethod,
      invoiceId,
      memo: payment.memo,
    };
  }

  /**
   * Get customers
   */
  async getCustomers(businessId: string): Promise<WaveCustomer[]> {
    const query = `
      query GetCustomers($businessId: ID!) {
        business(id: $businessId) {
          customers(page: 1, pageSize: 100) {
            edges {
              node {
                id
                name
                email
                phone
                address {
                  addressLine1
                  addressLine2
                  city
                  province { name }
                  postalCode
                  country { name }
                }
                currency {
                  code
                }
              }
            }
          }
        }
      }
    `;

    const data = await this.graphql<{ business: { customers: { edges: Array<{ node: any }> } } }>(
      query,
      { businessId }
    );

    return data.business.customers.edges.map(edge => ({
      id: edge.node.id,
      name: edge.node.name,
      email: edge.node.email,
      phone: edge.node.phone,
      address: edge.node.address ? {
        line1: edge.node.address.addressLine1,
        line2: edge.node.address.addressLine2,
        city: edge.node.address.city,
        state: edge.node.address.province?.name,
        zip: edge.node.address.postalCode,
        country: edge.node.address.country?.name,
      } : undefined,
      balance: 0, // Would calculate from outstanding invoices
      currency: edge.node.currency.code,
    }));
  }

  /**
   * Get vendors
   */
  async getVendors(businessId: string): Promise<WaveVendor[]> {
    const query = `
      query GetVendors($businessId: ID!) {
        business(id: $businessId) {
          vendors(page: 1, pageSize: 100) {
            edges {
              node {
                id
                name
                email
                phone
                address {
                  addressLine1
                  city
                  province { name }
                  postalCode
                }
              }
            }
          }
        }
      }
    `;

    const data = await this.graphql<{ business: { vendors: { edges: Array<{ node: any }> } } }>(
      query,
      { businessId }
    );

    return data.business.vendors.edges.map(edge => ({
      id: edge.node.id,
      name: edge.node.name,
      email: edge.node.email,
      phone: edge.node.phone,
      address: edge.node.address ? {
        line1: edge.node.address.addressLine1,
        city: edge.node.address.city,
        state: edge.node.address.province?.name,
        zip: edge.node.address.postalCode,
      } : undefined,
    }));
  }

  /**
   * Get chart of accounts
   */
  async getAccounts(businessId: string): Promise<WaveAccount[]> {
    const query = `
      query GetAccounts($businessId: ID!) {
        business(id: $businessId) {
          accounts(page: 1, pageSize: 200) {
            edges {
              node {
                id
                name
                type {
                  name
                  normalBalanceType
                }
                subtype {
                  name
                }
                currency {
                  code
                }
              }
            }
          }
        }
      }
    `;

    const data = await this.graphql<{ business: { accounts: { edges: Array<{ node: any }> } } }>(
      query,
      { businessId }
    );

    return data.business.accounts.edges.map(edge => ({
      id: edge.node.id,
      name: edge.node.name,
      type: edge.node.type.name,
      subtype: edge.node.subtype.name,
      balance: 0, // Would calculate from transactions
      currency: edge.node.currency.code,
    }));
  }

  /**
   * Generate profit & loss report
   */
  async getProfitLossReport(
    businessId: string,
    startDate: string,
    endDate: string
  ): Promise<BookkeepingReport['profitLoss']> {
    // Get invoices (revenue) and expenses
    const invoices = await this.getInvoices(businessId, { startDate, endDate, status: 'PAID' });
    const expenses = await this.getExpenses(businessId, 1, 200);

    // Filter expenses by date
    const filteredExpenses = expenses.filter(exp => {
      const expDate = new Date(exp.transactionDate);
      return expDate >= new Date(startDate) && expDate <= new Date(endDate);
    });

    const revenue = invoices.reduce((sum, inv) => sum + inv.total, 0);
    const expenseTotal = filteredExpenses.reduce((sum, exp) => sum + parseFloat(exp.total.value), 0);

    // Group by category
    const breakdown: { [key: string]: number } = {};

    invoices.forEach(inv => {
      inv.items.forEach(item => {
        const category = item.accountId || 'Uncategorized Revenue';
        breakdown[category] = (breakdown[category] || 0) + item.total;
      });
    });

    filteredExpenses.forEach(exp => {
      const category = exp.vendor?.name || 'Uncategorized Expense';
      breakdown[category] = (breakdown[category] || 0) - parseFloat(exp.total.value);
    });

    return {
      revenue,
      expenses: expenseTotal,
      netIncome: revenue - expenseTotal,
      breakdown: Object.entries(breakdown).map(([category, amount]) => ({ category, amount })),
    };
  }

  /**
   * Sync Wave data to ChittyFinance
   */
  async syncToChittyFinance(businessId: string, tenantId: string): Promise<{
    invoices: number;
    expenses: number;
    customers: number;
    vendors: number;
  }> {
    let synced = { invoices: 0, expenses: 0, customers: 0, vendors: 0 };

    try {
      // Sync invoices as income transactions
      const invoices = await this.getInvoices(businessId, { status: 'PAID' });

      for (const invoice of invoices) {
        try {
          // Check if already synced
          const existing = await storage.getTransactions(tenantId);
          const alreadySynced = existing.some(t => t.externalId === invoice.id);

          if (!alreadySynced) {
            const transactionData = {
              tenantId,
              accountId: 'default-income-account', // Would map to correct account
              amount: invoice.total.toString(),
              type: 'income' as const,
              description: `Invoice ${invoice.invoiceNumber} - ${invoice.customerName}`,
              date: new Date(invoice.invoiceDate),
              category: 'business_revenue',
              payee: invoice.customerName,
              externalId: invoice.id,
              reconciled: true,
              metadata: {
                source: 'wave',
                invoiceNumber: invoice.invoiceNumber,
                customerId: invoice.customerId,
              },
            };

            // Validate with ChittySchema
            try {
              const validation = await validateTransaction(transactionData);
              if (!validation.valid) {
                console.error(`Validation failed for invoice ${invoice.id}:`, validation.errors);
                // Continue processing despite validation failure (log but don't block)
              }
            } catch (error) {
              console.warn(`ChittySchema validation unavailable for invoice ${invoice.id}:`, error);
            }

            await storage.createTransaction(transactionData);
            synced.invoices++;
          }
        } catch (error) {
          console.error(`Failed to sync invoice ${invoice.id}:`, error);
        }
      }

      // Sync expenses
      const expenses = await this.getExpenses(businessId, 1, 100);

      for (const expense of expenses) {
        try {
          const existing = await storage.getTransactions(tenantId);
          const alreadySynced = existing.some(t => t.externalId === expense.id);

          if (!alreadySynced) {
            const transactionData = {
              tenantId,
              accountId: 'default-expense-account',
              amount: (-parseFloat(expense.total.value)).toString(),
              type: 'expense' as const,
              description: expense.description,
              date: new Date(expense.transactionDate),
              category: 'other_expense',
              payee: expense.vendor?.name,
              externalId: expense.id,
              reconciled: true,
              metadata: {
                source: 'wave',
                vendorId: expense.vendor?.id,
              },
            };

            // Validate with ChittySchema
            try {
              const validation = await validateTransaction(transactionData);
              if (!validation.valid) {
                console.error(`Validation failed for expense ${expense.id}:`, validation.errors);
                // Continue processing despite validation failure (log but don't block)
              }
            } catch (error) {
              console.warn(`ChittySchema validation unavailable for expense ${expense.id}:`, error);
            }

            await storage.createTransaction(transactionData);
            synced.expenses++;
          }
        } catch (error) {
          console.error(`Failed to sync expense ${expense.id}:`, error);
        }
      }

      // Log sync to Chronicle
      await logToChronicle({
        eventType: 'integration_sync',
        entityId: tenantId,
        entityType: 'tenant',
        action: 'wave_sync_completed',
        metadata: {
          businessId,
          synced,
          timestamp: new Date().toISOString(),
        },
      });

    } catch (error) {
      console.error('Wave sync error:', error);
      throw error;
    }

    return synced;
  }
}

/**
 * Create Wave bookkeeping client
 */
export function createWaveBookkeepingClient(config: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): WaveBookkeepingClient {
  return new WaveBookkeepingClient(config);
}
