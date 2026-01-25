// @ts-nocheck - TODO: Add proper types
/**
 * ChittyRental Integration for ChittyFinance
 * Property management, rent collection, maintenance tracking, and bookkeeping
 */

import { fetchWithRetry, IntegrationError } from './error-handling';
import { storage } from '../storage';
import { logToChronicle } from './chittychronicle-logging';

const CHITTYRENTAL_BASE_URL = process.env.CHITTYRENTAL_URL || 'https://rental.chitty.cc';
const CHITTYRENTAL_TOKEN = process.env.CHITTYRENTAL_TOKEN || process.env.CHITTY_AUTH_SERVICE_TOKEN;

export interface RentalProperty {
  id: string;
  tenantId: string;
  name: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  type: 'single_family' | 'multi_family' | 'condo' | 'apartment' | 'commercial';
  units: number;
  purchasePrice?: number;
  purchaseDate?: string;
  marketValue?: number;
  mortgageBalance?: number;
  monthlyMortgage?: number;
}

export interface RentalUnit {
  id: string;
  propertyId: string;
  unitNumber: string;
  bedrooms: number;
  bathrooms: number;
  sqft?: number;
  monthlyRent: number;
  securityDeposit: number;
  status: 'vacant' | 'occupied' | 'maintenance' | 'notice';
  currentLeaseId?: string;
}

export interface Lease {
  id: string;
  unitId: string;
  tenantId: string;
  tenantName: string;
  tenantEmail?: string;
  tenantPhone?: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  securityDeposit: number;
  status: 'active' | 'expired' | 'terminated' | 'pending';
  paymentDay: number; // Day of month rent is due
  autoPayEnabled: boolean;
}

export interface RentPayment {
  id: string;
  leaseId: string;
  amount: number;
  dueDate: string;
  paidDate?: string;
  status: 'pending' | 'paid' | 'late' | 'partial';
  paymentMethod?: 'ach' | 'card' | 'check' | 'cash';
  lateFee?: number;
  memo?: string;
}

export interface MaintenanceRequest {
  id: string;
  propertyId: string;
  unitId?: string;
  type: 'plumbing' | 'electrical' | 'hvac' | 'appliance' | 'structural' | 'pest' | 'other';
  priority: 'low' | 'medium' | 'high' | 'emergency';
  status: 'open' | 'assigned' | 'in_progress' | 'completed' | 'closed';
  description: string;
  reportedBy: 'tenant' | 'manager' | 'inspector';
  reportedDate: string;
  assignedTo?: string; // Vendor ID
  scheduledDate?: string;
  completedDate?: string;
  estimatedCost?: number;
  actualCost?: number;
}

export interface PropertyExpense {
  id: string;
  propertyId: string;
  date: string;
  category: 'maintenance' | 'repair' | 'utilities' | 'insurance' | 'property_tax' | 'hoa' | 'management_fee' | 'marketing' | 'other';
  amount: number;
  vendor?: string;
  description: string;
  maintenanceRequestId?: string;
  receiptUrl?: string;
}

export interface RentRoll {
  propertyId: string;
  propertyName: string;
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  occupancyRate: number;
  totalMonthlyRent: number;
  collectedRent: number;
  outstandingRent: number;
  units: Array<{
    unitNumber: string;
    tenant: string;
    rent: number;
    leaseEnd: string;
    status: string;
  }>;
}

export interface PropertyFinancials {
  propertyId: string;
  period: { start: string; end: string };
  income: {
    rent: number;
    lateFees: number;
    other: number;
    total: number;
  };
  expenses: {
    mortgage: number;
    maintenance: number;
    utilities: number;
    insurance: number;
    propertyTax: number;
    hoa: number;
    management: number;
    other: number;
    total: number;
  };
  netOperatingIncome: number;
  cashFlow: number;
  capRate?: number;
  roi?: number;
}

/**
 * ChittyRental API Client
 */
export class ChittyRentalClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string = CHITTYRENTAL_BASE_URL, token: string = CHITTYRENTAL_TOKEN) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}/api${endpoint}`;

    const response = await fetchWithRetry(
      url,
      {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
          ...options?.headers,
        },
      },
      {
        maxRetries: 2,
        baseDelay: 1000,
      }
    );

    return response.json();
  }

  /**
   * Get all properties for a tenant
   */
  async getProperties(tenantId: string): Promise<RentalProperty[]> {
    return this.request<RentalProperty[]>(`/properties?tenantId=${tenantId}`);
  }

  /**
   * Get property details
   */
  async getProperty(propertyId: string): Promise<RentalProperty> {
    return this.request<RentalProperty>(`/properties/${propertyId}`);
  }

  /**
   * Get units for a property
   */
  async getUnits(propertyId: string): Promise<RentalUnit[]> {
    return this.request<RentalUnit[]>(`/properties/${propertyId}/units`);
  }

  /**
   * Get active leases for a property
   */
  async getLeases(propertyId: string, status?: string): Promise<Lease[]> {
    const query = status ? `?status=${status}` : '';
    return this.request<Lease[]>(`/properties/${propertyId}/leases${query}`);
  }

  /**
   * Get rent payments
   */
  async getRentPayments(leaseId: string, startDate?: string, endDate?: string): Promise<RentPayment[]> {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<RentPayment[]>(`/leases/${leaseId}/payments${query}`);
  }

  /**
   * Record rent payment
   */
  async recordRentPayment(leaseId: string, payment: {
    amount: number;
    paidDate: string;
    paymentMethod: string;
    memo?: string;
  }): Promise<RentPayment> {
    return this.request<RentPayment>(`/leases/${leaseId}/payments`, {
      method: 'POST',
      body: JSON.stringify(payment),
    });
  }

  /**
   * Get maintenance requests
   */
  async getMaintenanceRequests(propertyId: string, status?: string): Promise<MaintenanceRequest[]> {
    const query = status ? `?status=${status}` : '';
    return this.request<MaintenanceRequest[]>(`/properties/${propertyId}/maintenance${query}`);
  }

  /**
   * Create maintenance request
   */
  async createMaintenanceRequest(request: Omit<MaintenanceRequest, 'id' | 'reportedDate'>): Promise<MaintenanceRequest> {
    return this.request<MaintenanceRequest>('/maintenance', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Get property expenses
   */
  async getPropertyExpenses(
    propertyId: string,
    startDate?: string,
    endDate?: string
  ): Promise<PropertyExpense[]> {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<PropertyExpense[]>(`/properties/${propertyId}/expenses${query}`);
  }

  /**
   * Record property expense
   */
  async recordExpense(expense: Omit<PropertyExpense, 'id'>): Promise<PropertyExpense> {
    return this.request<PropertyExpense>('/expenses', {
      method: 'POST',
      body: JSON.stringify(expense),
    });
  }

  /**
   * Get rent roll for a property
   */
  async getRentRoll(propertyId: string): Promise<RentRoll> {
    return this.request<RentRoll>(`/properties/${propertyId}/rent-roll`);
  }

  /**
   * Get property financial summary
   */
  async getPropertyFinancials(
    propertyId: string,
    startDate: string,
    endDate: string
  ): Promise<PropertyFinancials> {
    return this.request<PropertyFinancials>(
      `/properties/${propertyId}/financials?startDate=${startDate}&endDate=${endDate}`
    );
  }

  /**
   * Sync rent payments to ChittyFinance
   */
  async syncRentPayments(propertyId: string, tenantId: string, startDate?: string): Promise<{
    synced: number;
    errors: string[];
  }> {
    const leases = await this.getLeases(propertyId, 'active');
    let synced = 0;
    const errors: string[] = [];

    for (const lease of leases) {
      try {
        const payments = await this.getRentPayments(lease.id, startDate);

        for (const payment of payments) {
          if (payment.status === 'paid' && payment.paidDate) {
            // Check if already synced
            const existing = await storage.getTransactions(tenantId);
            const alreadySynced = existing.some(t => t.externalId === payment.id);

            if (!alreadySynced) {
              await storage.createTransaction({
                tenantId,
                accountId: 'rent-income-account', // Would map correctly
                amount: payment.amount.toString(),
                type: 'income',
                description: `Rent payment - ${lease.tenantName}`,
                date: new Date(payment.paidDate),
                category: 'rent_income',
                payee: lease.tenantName,
                externalId: payment.id,
                propertyId,
                reconciled: true,
                metadata: {
                  source: 'chittyrental',
                  leaseId: lease.id,
                  unitId: lease.unitId,
                  paymentMethod: payment.paymentMethod,
                },
              });
              synced++;
            }
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
      action: 'chittyrental_rent_sync',
      metadata: {
        propertyId,
        synced,
        errors: errors.length,
        timestamp: new Date().toISOString(),
      },
    });

    return { synced, errors };
  }

  /**
   * Sync property expenses to ChittyFinance
   */
  async syncPropertyExpenses(propertyId: string, tenantId: string, startDate?: string): Promise<{
    synced: number;
    errors: string[];
  }> {
    const expenses = await this.getPropertyExpenses(propertyId, startDate);
    let synced = 0;
    const errors: string[] = [];

    for (const expense of expenses) {
      try {
        // Check if already synced
        const existing = await storage.getTransactions(tenantId);
        const alreadySynced = existing.some(t => t.externalId === expense.id);

        if (!alreadySynced) {
          await storage.createTransaction({
            tenantId,
            accountId: 'property-expense-account',
            amount: (-expense.amount).toString(),
            type: 'expense',
            description: expense.description,
            date: new Date(expense.date),
            category: expense.category,
            payee: expense.vendor,
            externalId: expense.id,
            propertyId,
            reconciled: true,
            metadata: {
              source: 'chittyrental',
              maintenanceRequestId: expense.maintenanceRequestId,
              receiptUrl: expense.receiptUrl,
            },
          });
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
      action: 'chittyrental_expense_sync',
      metadata: {
        propertyId,
        synced,
        errors: errors.length,
        timestamp: new Date().toISOString(),
      },
    });

    return { synced, errors };
  }

  /**
   * Full sync for a property (rent + expenses)
   */
  async syncProperty(propertyId: string, tenantId: string, startDate?: string): Promise<{
    rentPayments: number;
    expenses: number;
    errors: string[];
  }> {
    const [rentResult, expenseResult] = await Promise.all([
      this.syncRentPayments(propertyId, tenantId, startDate),
      this.syncPropertyExpenses(propertyId, tenantId, startDate),
    ]);

    return {
      rentPayments: rentResult.synced,
      expenses: expenseResult.synced,
      errors: [...rentResult.errors, ...expenseResult.errors],
    };
  }

  /**
   * Generate consolidated financial report for all properties
   */
  async getConsolidatedFinancials(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<{
    properties: PropertyFinancials[];
    totals: {
      income: number;
      expenses: number;
      netIncome: number;
      cashFlow: number;
      avgOccupancy: number;
    };
  }> {
    const properties = await this.getProperties(tenantId);

    const financials = await Promise.all(
      properties.map(p => this.getPropertyFinancials(p.id, startDate, endDate))
    );

    const totals = financials.reduce(
      (acc, f) => ({
        income: acc.income + f.income.total,
        expenses: acc.expenses + f.expenses.total,
        netIncome: acc.netIncome + f.netOperatingIncome,
        cashFlow: acc.cashFlow + f.cashFlow,
        avgOccupancy: acc.avgOccupancy,
      }),
      { income: 0, expenses: 0, netIncome: 0, cashFlow: 0, avgOccupancy: 0 }
    );

    // Calculate average occupancy
    const rentRolls = await Promise.all(properties.map(p => this.getRentRoll(p.id)));
    totals.avgOccupancy = rentRolls.reduce((sum, rr) => sum + rr.occupancyRate, 0) / rentRolls.length;

    return {
      properties: financials,
      totals,
    };
  }
}

/**
 * Create ChittyRental client instance
 */
export function createChittyRentalClient(
  baseUrl?: string,
  token?: string
): ChittyRentalClient {
  return new ChittyRentalClient(baseUrl, token);
}
