// System mode storage implementation with multi-tenant support
// Uses database/system.schema.ts with UUID IDs and tenant isolation

import { db } from "./db";
import { eq, desc, and, inArray } from "drizzle-orm";
import type {
  Tenant, InsertTenant,
  User, InsertUser,
  TenantUser, InsertTenantUser,
  Account, InsertAccount,
  Transaction, InsertTransaction,
  Integration, InsertIntegration,
  Task, InsertTask,
  AiMessage, InsertAiMessage,
} from "../database/system.schema";
import {
  tenants, users, tenantUsers, accounts, transactions,
  integrations, tasks, aiMessages,
} from "../database/system.schema";
import { webhookEvents, type NewWebhookEvent } from "@shared/finance.schema";

export interface ISystemStorage {
  // Session helper (for demo mode compatibility)
  getSessionUser(): Promise<User | undefined>;

  // Tenant operations
  getTenants(userId: string): Promise<Tenant[]>;
  getTenant(tenantId: string): Promise<Tenant | undefined>;
  getTenantBySlug(slug: string): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;

  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Tenant-User access
  getUserTenants(userId: string): Promise<Array<Tenant & { role: string }>>;
  grantTenantAccess(access: InsertTenantUser): Promise<TenantUser>;

  // Tenant-scoped account operations
  getAccounts(tenantId: string): Promise<Account[]>;
  getAccount(id: string, tenantId: string): Promise<Account | undefined>;
  createAccount(account: InsertAccount): Promise<Account>;

  // Tenant-scoped transaction operations
  getTransactions(tenantId: string, limit?: number): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;

  // Tenant-scoped integration operations
  getIntegrations(tenantId: string): Promise<Integration[]>;
  getIntegration(id: string, tenantId: string): Promise<Integration | undefined>;
  createIntegration(integration: InsertIntegration): Promise<Integration>;
  updateIntegration(id: string, tenantId: string, data: Partial<Integration>): Promise<Integration | undefined>;

  // Tenant-scoped task operations
  getTasks(tenantId: string, userId?: string, limit?: number): Promise<Task[]>;
  getTask(id: string, tenantId: string): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: string, tenantId: string, data: Partial<Task>): Promise<Task | undefined>;

  // Tenant-scoped AI message operations
  getAiMessages(tenantId: string, userId?: string, limit?: number): Promise<AiMessage[]>;
  createAiMessage(message: InsertAiMessage): Promise<AiMessage>;

  // Financial summary (tenant-scoped)
  getFinancialSummary(tenantId: string): Promise<{
    cashOnHand: string;
    monthlyRevenue: string;
    monthlyExpenses: string;
    accountCount: number;
  }>;

  // Webhook operations (shared across tenants)
  isWebhookDuplicate(source: string, eventId: string): Promise<boolean>;
  recordWebhookEvent(data: Omit<NewWebhookEvent, 'id' | 'receivedAt'>): Promise<any>;
  listWebhookEvents(params: { source?: string; limit?: number; cursor?: number }): Promise<{ items: any[]; nextCursor?: number }>;
}

export class SystemStorage implements ISystemStorage {
  async getTenants(userId: string): Promise<Tenant[]> {
    const userTenants = await db
      .select({ tenant: tenants })
      .from(tenantUsers)
      .innerJoin(tenants, eq(tenantUsers.tenantId, tenants.id))
      .where(eq(tenantUsers.userId, userId));
    return userTenants.map((ut: any) => ut.tenant);
  }

  async getTenant(tenantId: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    return tenant;
  }

  async getTenantBySlug(slug: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
    return tenant;
  }

  async createTenant(insertTenant: InsertTenant): Promise<Tenant> {
    const [tenant] = await db.insert(tenants).values(insertTenant).returning();
    return tenant;
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getUserTenants(userId: string): Promise<Array<Tenant & { role: string }>> {
    const results = await db
      .select({
        tenant: tenants,
        role: tenantUsers.role,
      })
      .from(tenantUsers)
      .innerJoin(tenants, eq(tenantUsers.tenantId, tenants.id))
      .where(eq(tenantUsers.userId, userId));
    return results.map((r: any) => ({ ...r.tenant, role: r.role }));
  }

  async grantTenantAccess(access: InsertTenantUser): Promise<TenantUser> {
    const [tenantUser] = await db.insert(tenantUsers).values(access).returning();
    return tenantUser;
  }

  async getAccounts(tenantId: string): Promise<Account[]> {
    return await db.select().from(accounts).where(eq(accounts.tenantId, tenantId));
  }

  async getAccount(id: string, tenantId: string): Promise<Account | undefined> {
    const [account] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.tenantId, tenantId)));
    return account;
  }

  async createAccount(insertAccount: InsertAccount): Promise<Account> {
    const [account] = await db.insert(accounts).values(insertAccount).returning();
    return account;
  }

  async getTransactions(tenantId: string, limit?: number): Promise<Transaction[]> {
    const query = db
      .select()
      .from(transactions)
      .where(eq(transactions.tenantId, tenantId))
      .orderBy(desc(transactions.date));

    return limit ? await query.limit(limit) : await query;
  }

  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    const [transaction] = await db.insert(transactions).values(insertTransaction).returning();
    return transaction;
  }

  async getFinancialSummary(tenantId: string): Promise<{
    cashOnHand: string;
    monthlyRevenue: string;
    monthlyExpenses: string;
    accountCount: number;
  }> {
    const accts = await this.getAccounts(tenantId);
    const cashOnHand = accts.reduce((sum, a) => sum + parseFloat(a.balance || '0'), 0);

    // Last 30 days revenue/expenses
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentTx = await db
      .select()
      .from(transactions)
      .where(and(
        eq(transactions.tenantId, tenantId),
        desc(transactions.date)
      ));

    const monthlyRevenue = recentTx
      .filter((t: any) => t.type === 'income' && new Date(t.date) >= thirtyDaysAgo)
      .reduce((sum: number, t: any) => sum + parseFloat(t.amount || '0'), 0);

    const monthlyExpenses = recentTx
      .filter((t: any) => t.type === 'expense' && new Date(t.date) >= thirtyDaysAgo)
      .reduce((sum: number, t: any) => sum + Math.abs(parseFloat(t.amount || '0')), 0);

    return {
      cashOnHand: cashOnHand.toFixed(2),
      monthlyRevenue: monthlyRevenue.toFixed(2),
      monthlyExpenses: monthlyExpenses.toFixed(2),
      accountCount: accts.length,
    };
  }

  // Session helper for demo mode compatibility
  async getSessionUser(): Promise<User | undefined> {
    // In system mode, look for a demo user by email
    // In production, this would use real authentication
    return this.getUserByEmail('demo@itcanbe.llc');
  }

  // Integration operations (tenant-scoped)
  async getIntegrations(tenantId: string): Promise<Integration[]> {
    return await db
      .select()
      .from(integrations)
      .where(eq(integrations.tenantId, tenantId));
  }

  async getIntegration(id: string, tenantId: string): Promise<Integration | undefined> {
    const [integration] = await db
      .select()
      .from(integrations)
      .where(and(eq(integrations.id, id), eq(integrations.tenantId, tenantId)));
    return integration;
  }

  async createIntegration(insertIntegration: InsertIntegration): Promise<Integration> {
    const [integration] = await db.insert(integrations).values(insertIntegration).returning();
    return integration;
  }

  async updateIntegration(id: string, tenantId: string, data: Partial<Integration>): Promise<Integration | undefined> {
    const [updated] = await db
      .update(integrations)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(integrations.id, id), eq(integrations.tenantId, tenantId)))
      .returning();
    return updated;
  }

  // Task operations (tenant-scoped)
  async getTasks(tenantId: string, userId?: string, limit?: number): Promise<Task[]> {
    let query = db
      .select()
      .from(tasks)
      .where(eq(tasks.tenantId, tenantId))
      .orderBy(desc(tasks.createdAt));

    if (userId) {
      query = db
        .select()
        .from(tasks)
        .where(and(eq(tasks.tenantId, tenantId), eq(tasks.userId, userId)))
        .orderBy(desc(tasks.createdAt));
    }

    return limit ? await query.limit(limit) : await query;
  }

  async getTask(id: string, tenantId: string): Promise<Task | undefined> {
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)));
    return task;
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const [task] = await db.insert(tasks).values(insertTask).returning();
    return task;
  }

  async updateTask(id: string, tenantId: string, data: Partial<Task>): Promise<Task | undefined> {
    const [updated] = await db
      .update(tasks)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)))
      .returning();
    return updated;
  }

  // AI Message operations (tenant-scoped)
  async getAiMessages(tenantId: string, userId?: string, limit?: number): Promise<AiMessage[]> {
    let query = db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.tenantId, tenantId))
      .orderBy(desc(aiMessages.createdAt));

    if (userId) {
      query = db
        .select()
        .from(aiMessages)
        .where(and(eq(aiMessages.tenantId, tenantId), eq(aiMessages.userId, userId)))
        .orderBy(desc(aiMessages.createdAt));
    }

    return limit ? await query.limit(limit) : await query;
  }

  async createAiMessage(insertMessage: InsertAiMessage): Promise<AiMessage> {
    const [message] = await db.insert(aiMessages).values(insertMessage).returning();
    return message;
  }

  // Webhook operations (shared across all tenants)
  async isWebhookDuplicate(source: string, eventId: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(webhookEvents)
      .where(and(eq(webhookEvents.source, source), eq(webhookEvents.eventId, eventId)))
      .limit(1);
    return !!existing;
  }

  async recordWebhookEvent(data: Omit<NewWebhookEvent, 'id' | 'receivedAt'>): Promise<any> {
    const [event] = await db.insert(webhookEvents).values(data).returning();
    return event;
  }

  async listWebhookEvents(params: {
    source?: string;
    limit?: number;
    cursor?: number;
  }): Promise<{ items: any[]; nextCursor?: number }> {
    const { source, limit = 50, cursor } = params;

    let query = db.select().from(webhookEvents).orderBy(desc(webhookEvents.receivedAt));

    if (source) {
      query = db
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.source, source))
        .orderBy(desc(webhookEvents.receivedAt));
    }

    if (cursor) {
      query = query.where(desc(webhookEvents.id));
    }

    const items = await query.limit(limit + 1);

    const hasMore = items.length > limit;
    const results = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? (results[results.length - 1] as any).id : undefined;

    return { items: results, nextCursor };
  }
}

export const systemStorage = new SystemStorage();
