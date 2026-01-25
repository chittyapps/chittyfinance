// @ts-nocheck - TODO: Add proper types
/**
 * Enhanced DoorLoop Property Management Integration
 * Real-time property management, rent collection, and financial tracking
 */

import { fetchWithRetry, IntegrationError } from './error-handling';
import { storage } from '../storage';
import { logToChronicle } from './chittychronicle-logging';
import { validateTransaction } from './chittyschema-validation';

const DOORLOOP_BASE_URL = 'https://app.doorloop.com/api';
const DOORLOOP_API_KEY = process.env.DOORLOOP_API_KEY;

export interface DoorLoopProperty {
  id: number;
  name: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    full?: string;
  };
  type: string;
  units: number;
  status: string;
  portfolio?: {
    id: number;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface DoorLoopUnit {
  id: number;
  propertyId: number;
  name: string;
  bedrooms: number;
  bathrooms: number;
  sqft?: number;
  marketRent?: number;
  status: string;
  createdAt: string;
}

export interface DoorLoopLease {
  id: number;
  propertyId: number;
  unitId?: number;
  tenant: {
    id: number;
    name: string;
    email?: string;
    phone?: string;
  };
  startDate: string;
  endDate: string;
  monthlyRent: number;
  securityDeposit: number;
  status: 'active' | 'past' | 'future' | 'terminated';
  leaseType: string;
  createdAt: string;
  updatedAt: string;
}

export interface DoorLoopPayment {
  id: number;
  leaseId: number;
  tenantId: number;
  amount: number;
  date: string;
  status: 'pending' | 'cleared' | 'void' | 'bounced';
  paymentMethod: string;
  memo?: string;
  reference?: string;
  createdAt: string;
}

export interface DoorLoopExpense {
  id: number;
  propertyId: number;
  amount: number;
  date: string;
  category: string;
  vendor?: string;
  description: string;
  status: string;
  createdAt: string;
}

export interface DoorLoopMaintenanceRequest {
  id: number;
  propertyId: number;
  unitId?: number;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'emergency';
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * DoorLoop API Client
 */
export class DoorLoopClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl: string = DOORLOOP_BASE_URL) {
    this.apiKey = apiKey || DOORLOOP_API_KEY || '';
    this.baseUrl = baseUrl;

    if (!this.apiKey) {
      throw new Error('DoorLoop API key is required. Set DOORLOOP_API_KEY environment variable.');
    }
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetchWithRetry(
      url,
      {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      },
      {
        maxRetries: 2,
        baseDelay: 1000,
      }
    );

    const text = await response.text();
    const trimmed = text.trim();

    // Error responses
    if (!response.ok) {
      throw new IntegrationError(
        `DoorLoop API error ${response.status}: ${trimmed}`,
        'doorloop',
        response.status >= 500
      );
    }

    // If HTML is returned instead of JSON (non-premium account)
    if (trimmed.startsWith('<')) {
      // Payments endpoint frequently returns HTML for non-premium accounts
      if (endpoint.startsWith('/payments')) {
        console.warn('⚠️  DoorLoop payments endpoint returned HTML (likely requires premium account)');
        return { data: [], html: trimmed, isPremiumRequired: true } as unknown as T;
      }
      throw new IntegrationError(
        'DoorLoop returned HTML instead of JSON. This may require a premium account.',
        'doorloop',
        false
      );
    }

    // Parse JSON content
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      throw new IntegrationError(
        `Invalid JSON from DoorLoop: ${trimmed.slice(0, 200)}`,
        'doorloop',
        false
      );
    }
  }

  /**
   * Get all properties
   */
  async getProperties(limit: number = 200, offset: number = 0): Promise<DoorLoopProperty[]> {
    const response = await this.request<{ data: DoorLoopProperty[] }>(
      `/properties?limit=${limit}&offset=${offset}`
    );
    return response.data || [];
  }

  /**
   * Get property by ID
   */
  async getProperty(propertyId: number): Promise<DoorLoopProperty> {
    const response = await this.request<DoorLoopProperty>(`/properties/${propertyId}`);
    return response;
  }

  /**
   * Get units for a property
   */
  async getUnits(propertyId: number): Promise<DoorLoopUnit[]> {
    const response = await this.request<{ data: DoorLoopUnit[] }>(
      `/properties/${propertyId}/units`
    );
    return response.data || [];
  }

  /**
   * Get all leases
   */
  async getLeases(limit: number = 200, offset: number = 0): Promise<DoorLoopLease[]> {
    const response = await this.request<{ data: DoorLoopLease[] }>(
      `/leases?limit=${limit}&offset=${offset}`
    );
    return response.data || [];
  }

  /**
   * Get leases for a specific property
   */
  async getPropertyLeases(propertyId: number): Promise<DoorLoopLease[]> {
    const allLeases = await this.getLeases();
    return allLeases.filter(lease => lease.propertyId === propertyId);
  }

  /**
   * Get lease by ID
   */
  async getLease(leaseId: number): Promise<DoorLoopLease> {
    const response = await this.request<DoorLoopLease>(`/leases/${leaseId}`);
    return response;
  }

  /**
   * Get payments (may require premium account)
   */
  async getPayments(limit: number = 200, offset: number = 0): Promise<DoorLoopPayment[]> {
    const response = await this.request<{ data: DoorLoopPayment[]; isPremiumRequired?: boolean }>(
      `/payments?limit=${limit}&offset=${offset}`
    );

    if (response.isPremiumRequired) {
      console.warn('⚠️  DoorLoop payments require premium account - returning empty array');
      return [];
    }

    return response.data || [];
  }

  /**
   * Get payments for a specific lease
   */
  async getLeasePayments(leaseId: number): Promise<DoorLoopPayment[]> {
    try {
      const allPayments = await this.getPayments();
      return allPayments.filter(payment => payment.leaseId === leaseId);
    } catch (error) {
      console.warn(`Failed to fetch payments for lease ${leaseId}:`, error);
      return [];
    }
  }

  /**
   * Get expenses
   */
  async getExpenses(limit: number = 200, offset: number = 0): Promise<DoorLoopExpense[]> {
    const response = await this.request<{ data: DoorLoopExpense[] }>(
      `/expenses?limit=${limit}&offset=${offset}`
    );
    return response.data || [];
  }

  /**
   * Get maintenance requests
   */
  async getMaintenanceRequests(propertyId?: number): Promise<DoorLoopMaintenanceRequest[]> {
    const endpoint = propertyId
      ? `/maintenance?propertyId=${propertyId}`
      : '/maintenance';

    const response = await this.request<{ data: DoorLoopMaintenanceRequest[] }>(endpoint);
    return response.data || [];
  }

  /**
   * Find property by address
   */
  async findPropertyByAddress(searchAddress: string): Promise<DoorLoopProperty | undefined> {
    const properties = await this.getProperties();
    return properties.find(p =>
      p.address?.line1?.toLowerCase().includes(searchAddress.toLowerCase()) ||
      p.address?.full?.toLowerCase().includes(searchAddress.toLowerCase()) ||
      p.name?.toLowerCase().includes(searchAddress.toLowerCase())
    );
  }

  /**
   * Sync rent payments to ChittyFinance
   */
  async syncRentPayments(propertyId: number, tenantId: string, startDate?: string): Promise<{
    synced: number;
    errors: string[];
  }> {
    let synced = 0;
    const errors: string[] = [];

    try {
      const leases = await this.getPropertyLeases(propertyId);

      for (const lease of leases) {
        try {
          const payments = await this.getLeasePayments(lease.id);

          for (const payment of payments) {
            // Filter by start date if provided
            if (startDate && new Date(payment.date) < new Date(startDate)) {
              continue;
            }

            // Only sync cleared payments
            if (payment.status !== 'cleared') {
              continue;
            }

            // Check if already synced
            const existing = await storage.getTransactions(tenantId);
            const alreadySynced = existing.some(t => t.externalId === `doorloop-payment-${payment.id}`);

            if (!alreadySynced) {
              const transactionData = {
                tenantId,
                accountId: 'doorloop-rent-income', // Would map to correct account
                amount: payment.amount.toString(),
                type: 'income',
                description: `Rent payment - ${lease.tenant.name}`,
                date: new Date(payment.date),
                category: 'rent_income',
                payee: lease.tenant.name,
                externalId: `doorloop-payment-${payment.id}`,
                propertyId: propertyId.toString(),
                reconciled: true,
                metadata: {
                  source: 'doorloop',
                  leaseId: lease.id,
                  paymentMethod: payment.paymentMethod,
                  reference: payment.reference,
                },
              };

              // Validate with ChittySchema
              try {
                const validation = await validateTransaction(transactionData);
                if (!validation.valid) {
                  errors.push(`Validation failed for payment ${payment.id}: ${validation.errors?.map(e => e.message).join(', ')}`);
                  continue;
                }
              } catch (error) {
                // Log validation error but continue (schema service may be unavailable)
                console.warn(`ChittySchema validation unavailable for payment ${payment.id}:`, error);
              }

              await storage.createTransaction(transactionData);
              synced++;
            }
          }
        } catch (error) {
          errors.push(`Failed to sync lease ${lease.id}: ${error}`);
        }
      }

      // Log sync
      await logToChronicle({
        eventType: 'integration_sync',
        entityId: tenantId,
        entityType: 'tenant',
        action: 'doorloop_rent_sync',
        metadata: {
          propertyId,
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
   * Sync property expenses to ChittyFinance
   */
  async syncExpenses(propertyId: number, tenantId: string, startDate?: string): Promise<{
    synced: number;
    errors: string[];
  }> {
    let synced = 0;
    const errors: string[] = [];

    try {
      const allExpenses = await this.getExpenses();
      const propertyExpenses = allExpenses.filter(e => e.propertyId === propertyId);

      for (const expense of propertyExpenses) {
        // Filter by start date if provided
        if (startDate && new Date(expense.date) < new Date(startDate)) {
          continue;
        }

        try {
          // Check if already synced
          const existing = await storage.getTransactions(tenantId);
          const alreadySynced = existing.some(t => t.externalId === `doorloop-expense-${expense.id}`);

          if (!alreadySynced) {
            const transactionData = {
              tenantId,
              accountId: 'doorloop-expense-account',
              amount: (-expense.amount).toString(),
              type: 'expense',
              description: expense.description,
              date: new Date(expense.date),
              category: expense.category || 'other_expense',
              payee: expense.vendor,
              externalId: `doorloop-expense-${expense.id}`,
              propertyId: propertyId.toString(),
              reconciled: true,
              metadata: {
                source: 'doorloop',
                expenseStatus: expense.status,
              },
            };

            // Validate with ChittySchema
            try {
              const validation = await validateTransaction(transactionData);
              if (!validation.valid) {
                errors.push(`Validation failed for expense ${expense.id}: ${validation.errors?.map(e => e.message).join(', ')}`);
                continue;
              }
            } catch (error) {
              // Log validation error but continue (schema service may be unavailable)
              console.warn(`ChittySchema validation unavailable for expense ${expense.id}:`, error);
            }

            await storage.createTransaction(transactionData);
            synced++;
          }
        } catch (error) {
          errors.push(`Failed to sync expense ${expense.id}: ${error}`);
        }
      }

      // Log sync
      await logToChronicle({
        eventType: 'integration_sync',
        entityId: tenantId,
        entityType: 'tenant',
        action: 'doorloop_expense_sync',
        metadata: {
          propertyId,
          synced,
          errors: errors.length,
          timestamp: new Date().toISOString(),
        },
      });

    } catch (error) {
      errors.push(`Expense sync failed: ${error}`);
    }

    return { synced, errors };
  }

  /**
   * Full sync for a property
   */
  async syncProperty(propertyId: number, tenantId: string, startDate?: string): Promise<{
    rentPayments: number;
    expenses: number;
    errors: string[];
  }> {
    const [rentResult, expenseResult] = await Promise.all([
      this.syncRentPayments(propertyId, tenantId, startDate),
      this.syncExpenses(propertyId, tenantId, startDate),
    ]);

    return {
      rentPayments: rentResult.synced,
      expenses: expenseResult.synced,
      errors: [...rentResult.errors, ...expenseResult.errors],
    };
  }

  /**
   * Debug: Test API connection
   */
  async testConnection(): Promise<{
    connected: boolean;
    properties: number;
    leases: number;
    paymentsAvailable: boolean;
    error?: string;
  }> {
    try {
      const properties = await this.getProperties(1, 0);
      const leases = await this.getLeases(1, 0);

      let paymentsAvailable = false;
      try {
        const payments = await this.getPayments(1, 0);
        paymentsAvailable = payments.length >= 0;
      } catch (error) {
        // Payments may not be available on free tier
        paymentsAvailable = false;
      }

      return {
        connected: true,
        properties: properties.length,
        leases: leases.length,
        paymentsAvailable,
      };
    } catch (error) {
      return {
        connected: false,
        properties: 0,
        leases: 0,
        paymentsAvailable: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Create DoorLoop client instance
 */
export function createDoorLoopClient(apiKey?: string): DoorLoopClient {
  return new DoorLoopClient(apiKey);
}
