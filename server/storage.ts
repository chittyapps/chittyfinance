import { eq, desc, and, inArray } from "drizzle-orm";
import { db } from "./db";

// Import schemas based on MODE
const MODE = process.env.MODE || 'standalone';

// System schema (multi-tenant with PostgreSQL)
import * as SystemSchema from "../database/system.schema";

// Standalone schema (single-user with SQLite) - for backward compatibility
import {
  users as standaloneUsers,
  integrations as standaloneIntegrations,
  financialSummaries as standaloneFinancialSummaries,
  transactions as standaloneTransactions,
  tasks as standaloneTasks,
  aiMessages as standaloneAiMessages,
  type User as StandaloneUser,
  type InsertUser as StandaloneInsertUser,
  type Integration as StandaloneIntegration,
  type InsertIntegration as StandaloneInsertIntegration,
  type FinancialSummary as StandaloneFinancialSummary,
  type InsertFinancialSummary as StandaloneInsertFinancialSummary,
  type Transaction as StandaloneTransaction,
  type InsertTransaction as StandaloneInsertTransaction,
  type Task as StandaloneTask,
  type InsertTask as StandaloneInsertTask,
  type AiMessage as StandaloneAiMessage,
  type InsertAiMessage as StandaloneInsertAiMessage,
} from "@shared/schema";

import { webhookEvents, type NewWebhookEvent } from "@shared/finance.schema";

// Session context interface
export interface SessionContext {
  userId: string;
  tenantId?: string;
  tenantRole?: string;
}

// Storage interface supporting both modes
export interface IStorage {
  // Session management
  getSessionContext(): Promise<SessionContext | undefined>;
  setSessionContext(userId: string, tenantId?: string): Promise<void>;
  getSessionUser(): Promise<any | undefined>; // Backward compatibility for routes

  // Tenant operations (system mode only)
  getTenant(id: string): Promise<SystemSchema.Tenant | undefined>;
  getTenantBySlug(slug: string): Promise<SystemSchema.Tenant | undefined>;
  getUserTenants(userId: string): Promise<Array<SystemSchema.Tenant & { role: string }>>;
  checkTenantAccess(userId: string, tenantId: string): Promise<{ hasAccess: boolean; role?: string }>;
  createTenant(tenant: SystemSchema.InsertTenant): Promise<SystemSchema.Tenant>;

  // User operations
  getUser(id: string): Promise<any | undefined>;
  getUserByEmail(email: string): Promise<any | undefined>;
  getUserByUsername?(username: string): Promise<any | undefined>; // Standalone only
  createUser(user: any): Promise<any>;

  // Integration operations
  getIntegrations(tenantId: string): Promise<any[]>;
  getIntegration(id: string): Promise<any | undefined>;
  createIntegration(integration: any): Promise<any>;
  updateIntegration(id: string, integration: any): Promise<any | undefined>;
  listIntegrationsByService(serviceType: string): Promise<any[]>;

  // Account operations (system mode)
  getAccounts?(tenantId: string): Promise<SystemSchema.Account[]>;
  getAccount?(id: string): Promise<SystemSchema.Account | undefined>;
  createAccount?(account: SystemSchema.InsertAccount): Promise<SystemSchema.Account>;
  updateAccount?(id: string, account: Partial<SystemSchema.Account>): Promise<SystemSchema.Account | undefined>;

  // Financial summary operations (standalone compatibility)
  getFinancialSummary?(userId: string): Promise<any | undefined>;
  createFinancialSummary?(summary: any): Promise<any>;
  updateFinancialSummary?(userId: string, summary: any): Promise<any | undefined>;

  // Transaction operations
  getTransactions(tenantId: string, limit?: number): Promise<any[]>;
  createTransaction(transaction: any): Promise<any>;

  // Task operations
  getTasks(tenantId: string, limit?: number): Promise<any[]>;
  getTask(id: string): Promise<any | undefined>;
  createTask(task: any): Promise<any>;
  updateTask(id: string, task: any): Promise<any | undefined>;

  // AI Message operations
  getAiMessages(tenantId: string, userId: string, limit?: number): Promise<any[]>;
  createAiMessage(message: any): Promise<any>;

  // Property operations (system mode)
  getProperties?(tenantId: string): Promise<SystemSchema.Property[]>;
  getProperty?(id: string): Promise<SystemSchema.Property | undefined>;
  createProperty?(property: SystemSchema.InsertProperty): Promise<SystemSchema.Property>;

  // Webhook operations
  isWebhookDuplicate(source: string, eventId: string): Promise<boolean>;
  recordWebhookEvent(data: Omit<NewWebhookEvent, 'id' | 'receivedAt'>): Promise<any>;
  listWebhookEvents(params: { source?: string; limit?: number; cursor?: number }): Promise<{ items: any[]; nextCursor?: number }>;
}

// System mode storage (PostgreSQL with multi-tenancy)
export class SystemStorage implements IStorage {
  private sessionContext?: SessionContext;

  async getSessionContext(): Promise<SessionContext | undefined> {
    return this.sessionContext;
  }

  async setSessionContext(userId: string, tenantId?: string): Promise<void> {
    this.sessionContext = { userId, tenantId };
  }

  async getSessionUser(): Promise<SystemSchema.User | undefined> {
    // In system mode, return first seeded user for demo (replace with real auth later)
    const [user] = await db.select().from(SystemSchema.users).limit(1);
    return user || undefined;
  }

  // Tenant operations
  async getTenant(id: string): Promise<SystemSchema.Tenant | undefined> {
    const [tenant] = await db.select().from(SystemSchema.tenants).where(eq(SystemSchema.tenants.id, id));
    return tenant || undefined;
  }

  async getTenantBySlug(slug: string): Promise<SystemSchema.Tenant | undefined> {
    const [tenant] = await db.select().from(SystemSchema.tenants).where(eq(SystemSchema.tenants.slug, slug));
    return tenant || undefined;
  }

  async getUserTenants(userId: string): Promise<Array<SystemSchema.Tenant & { role: string }>> {
    const tenantAccess = await db
      .select({
        tenant: SystemSchema.tenants,
        role: SystemSchema.tenantUsers.role,
      })
      .from(SystemSchema.tenantUsers)
      .innerJoin(SystemSchema.tenants, eq(SystemSchema.tenantUsers.tenantId, SystemSchema.tenants.id))
      .where(eq(SystemSchema.tenantUsers.userId, userId));

    return tenantAccess.map((ta: any) => ({ ...ta.tenant, role: ta.role }));
  }

  async checkTenantAccess(userId: string, tenantId: string): Promise<{ hasAccess: boolean; role?: string }> {
    const [access] = await db
      .select()
      .from(SystemSchema.tenantUsers)
      .where(
        and(
          eq(SystemSchema.tenantUsers.userId, userId),
          eq(SystemSchema.tenantUsers.tenantId, tenantId)
        )
      );

    return access ? { hasAccess: true, role: access.role } : { hasAccess: false };
  }

  async createTenant(insertTenant: SystemSchema.InsertTenant): Promise<SystemSchema.Tenant> {
    const [tenant] = await db
      .insert(SystemSchema.tenants)
      .values(insertTenant)
      .returning();
    return tenant;
  }

  // User operations
  async getUser(id: string): Promise<SystemSchema.User | undefined> {
    const [user] = await db.select().from(SystemSchema.users).where(eq(SystemSchema.users.id, id));
    return user || undefined;
  }

async getUserByEmail(email: string): Promise<SystemSchema.User | undefined> {
    const [user] = await db.select().from(SystemSchema.users).where(eq(SystemSchema.users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: SystemSchema.InsertUser): Promise<SystemSchema.User> {
    const [user] = await db
      .insert(SystemSchema.users)
      .values(insertUser)
      .returning();
    return user;
  }

  // Account operations
  async getAccounts(tenantId: string): Promise<SystemSchema.Account[]> {
    return await db
      .select()
      .from(SystemSchema.accounts)
      .where(eq(SystemSchema.accounts.tenantId, tenantId));
  }

  async getAccount(id: string): Promise<SystemSchema.Account | undefined> {
    const [account] = await db
      .select()
      .from(SystemSchema.accounts)
      .where(eq(SystemSchema.accounts.id, id));
    return account || undefined;
  }

  async createAccount(insertAccount: SystemSchema.InsertAccount): Promise<SystemSchema.Account> {
    const [account] = await db
      .insert(SystemSchema.accounts)
      .values(insertAccount)
      .returning();
    return account;
  }

  async updateAccount(id: string, data: Partial<SystemSchema.Account>): Promise<SystemSchema.Account | undefined> {
    const [account] = await db
      .update(SystemSchema.accounts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(SystemSchema.accounts.id, id))
      .returning();
    return account || undefined;
  }

  // Integration operations
  async getIntegrations(tenantId: string): Promise<SystemSchema.Integration[]> {
    return await db
      .select()
      .from(SystemSchema.integrations)
      .where(eq(SystemSchema.integrations.tenantId, tenantId));
  }

  async getIntegration(id: string): Promise<SystemSchema.Integration | undefined> {
    const [integration] = await db
      .select()
      .from(SystemSchema.integrations)
      .where(eq(SystemSchema.integrations.id, id));
    return integration || undefined;
  }

  async createIntegration(insertIntegration: SystemSchema.InsertIntegration): Promise<SystemSchema.Integration> {
    const [integration] = await db
      .insert(SystemSchema.integrations)
      .values(insertIntegration)
      .returning();
    return integration;
  }

  async updateIntegration(id: string, data: Partial<SystemSchema.Integration>): Promise<SystemSchema.Integration | undefined> {
    const [integration] = await db
      .update(SystemSchema.integrations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(SystemSchema.integrations.id, id))
      .returning();
    return integration || undefined;
  }

  async listIntegrationsByService(serviceType: string): Promise<SystemSchema.Integration[]> {
    return await db
      .select()
      .from(SystemSchema.integrations)
      .where(eq(SystemSchema.integrations.serviceType, serviceType));
  }

  // Transaction operations
  async getTransactions(tenantId: string, limit?: number): Promise<SystemSchema.Transaction[]> {
    const baseQuery = db
      .select()
      .from(SystemSchema.transactions)
      .where(eq(SystemSchema.transactions.tenantId, tenantId))
      .orderBy(desc(SystemSchema.transactions.date));

    return limit ? await baseQuery.limit(limit) : await baseQuery;
  }

  async createTransaction(insertTransaction: SystemSchema.InsertTransaction): Promise<SystemSchema.Transaction> {
    const [transaction] = await db
      .insert(SystemSchema.transactions)
      .values(insertTransaction)
      .returning();
    return transaction;
  }

  // Task operations
  async getTasks(tenantId: string, limit?: number): Promise<SystemSchema.Task[]> {
    const baseQuery = db
      .select()
      .from(SystemSchema.tasks)
      .where(eq(SystemSchema.tasks.tenantId, tenantId))
      .orderBy(SystemSchema.tasks.completed, SystemSchema.tasks.dueDate);

    return limit ? await baseQuery.limit(limit) : await baseQuery;
  }

  async getTask(id: string): Promise<SystemSchema.Task | undefined> {
    const [task] = await db
      .select()
      .from(SystemSchema.tasks)
      .where(eq(SystemSchema.tasks.id, id));
    return task || undefined;
  }

  async createTask(insertTask: SystemSchema.InsertTask): Promise<SystemSchema.Task> {
    const [task] = await db
      .insert(SystemSchema.tasks)
      .values(insertTask)
      .returning();
    return task;
  }

  async updateTask(id: string, data: Partial<SystemSchema.Task>): Promise<SystemSchema.Task | undefined> {
    const [task] = await db
      .update(SystemSchema.tasks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(SystemSchema.tasks.id, id))
      .returning();
    return task || undefined;
  }

  // AI Message operations
  async getAiMessages(tenantId: string, userId: string, limit?: number): Promise<SystemSchema.AiMessage[]> {
    const baseQuery = db
      .select()
      .from(SystemSchema.aiMessages)
      .where(
        and(
          eq(SystemSchema.aiMessages.tenantId, tenantId),
          eq(SystemSchema.aiMessages.userId, userId)
        )
      )
      .orderBy(desc(SystemSchema.aiMessages.createdAt));

    return limit ? await baseQuery.limit(limit) : await baseQuery;
  }

  async createAiMessage(insertMessage: SystemSchema.InsertAiMessage): Promise<SystemSchema.AiMessage> {
    const [message] = await db
      .insert(SystemSchema.aiMessages)
      .values(insertMessage)
      .returning();
    return message;
  }

  // Property operations
  async getProperties(tenantId: string): Promise<SystemSchema.Property[]> {
    return await db
      .select()
      .from(SystemSchema.properties)
      .where(eq(SystemSchema.properties.tenantId, tenantId));
  }

  async getProperty(id: string): Promise<SystemSchema.Property | undefined> {
    const [property] = await db
      .select()
      .from(SystemSchema.properties)
      .where(eq(SystemSchema.properties.id, id));
    return property || undefined;
  }

  async createProperty(insertProperty: SystemSchema.InsertProperty): Promise<SystemSchema.Property> {
    const [property] = await db
      .insert(SystemSchema.properties)
      .values(insertProperty)
      .returning();
    return property;
  }

  // Webhook operations
  async isWebhookDuplicate(source: string, eventId: string): Promise<boolean> {
    const [row] = await db
      .select()
      .from(webhookEvents)
      .where(and(eq(webhookEvents.source, source), eq(webhookEvents.eventId, eventId)))
      .limit(1);
    return Boolean(row);
  }

  async recordWebhookEvent(data: Omit<NewWebhookEvent, 'id' | 'receivedAt'>): Promise<any> {
    const [row] = await db
      .insert(webhookEvents)
      .values(data as NewWebhookEvent)
      .onConflictDoNothing({ target: [webhookEvents.source, webhookEvents.eventId] })
      .returning();
    return row;
  }

  async listWebhookEvents(params: { source?: string; limit?: number; cursor?: number }) {
    const { source, limit = 50, cursor } = params;
    let q = db.select().from(webhookEvents).orderBy(desc(webhookEvents.receivedAt));
    if (source) {
      // @ts-ignore drizzle chainable where
      q = (q as any).where(eq(webhookEvents.source, source));
    }
    if (cursor) {
      // @ts-ignore
      q = (q as any).where((eb: any) => eb.lt(webhookEvents.id, cursor));
    }
    // @ts-ignore
    const rows = await (q as any).limit(Math.min(limit, 100));
    const nextCursor = rows.length ? rows[rows.length - 1].id : undefined;
    return { items: rows, nextCursor };
  }
}

// Standalone mode storage (SQLite with single user)
export class StandaloneStorage implements IStorage {
  private sessionContext: SessionContext = { userId: '1' }; // Default demo user

  async getSessionContext(): Promise<SessionContext | undefined> {
    return this.sessionContext;
  }

  async setSessionContext(userId: string): Promise<void> {
    this.sessionContext = { userId };
  }

  async getSessionUser(): Promise<StandaloneUser | undefined> {
    // Return demo user (id=1) or first user in database
    const [user] = await db.select().from(standaloneUsers).limit(1);
    return user || undefined;
  }

  // Tenant operations (not supported in standalone)
  async getTenant(_id: string): Promise<undefined> {
    return undefined;
  }

  async getTenantBySlug(_slug: string): Promise<undefined> {
    return undefined;
  }

  async getUserTenants(_userId: string): Promise<any[]> {
    return [];
  }

  async checkTenantAccess(_userId: string, _tenantId: string): Promise<{ hasAccess: boolean; role?: string }> {
    return { hasAccess: true, role: 'owner' };
  }

  async createTenant(_tenant: any): Promise<any> {
    throw new Error('Tenant operations not supported in standalone mode');
  }

  // User operations
  async getUser(id: string): Promise<StandaloneUser | undefined> {
    const numId = parseInt(id, 10);
    const [user] = await db.select().from(standaloneUsers).where(eq(standaloneUsers.id, numId));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<StandaloneUser | undefined> {
    const [user] = await db.select().from(standaloneUsers).where(eq(standaloneUsers.email, email));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<StandaloneUser | undefined> {
    const [user] = await db.select().from(standaloneUsers).where(eq(standaloneUsers.username, username));
    return user || undefined;
  }

  async createUser(insertUser: StandaloneInsertUser): Promise<StandaloneUser> {
    const [user] = await db
      .insert(standaloneUsers)
      .values(insertUser)
      .returning();
    return user;
  }

  // Integration operations (uses userId in standalone, mapped to tenantId parameter for compatibility)
  async getIntegrations(tenantId: string): Promise<StandaloneIntegration[]> {
    const userId = parseInt(tenantId, 10);
    return await db
      .select()
      .from(standaloneIntegrations)
      .where(eq(standaloneIntegrations.userId, userId));
  }

  async getIntegration(id: string): Promise<StandaloneIntegration | undefined> {
    const numId = parseInt(id, 10);
    const [integration] = await db
      .select()
      .from(standaloneIntegrations)
      .where(eq(standaloneIntegrations.id, numId));
    return integration || undefined;
  }

  async createIntegration(insertIntegration: StandaloneInsertIntegration): Promise<StandaloneIntegration> {
    const [integration] = await db
      .insert(standaloneIntegrations)
      .values(insertIntegration)
      .returning();
    return integration;
  }

  async updateIntegration(id: string, data: Partial<StandaloneIntegration>): Promise<StandaloneIntegration | undefined> {
    const numId = parseInt(id, 10);
    const [integration] = await db
      .update(standaloneIntegrations)
      .set(data)
      .where(eq(standaloneIntegrations.id, numId))
      .returning();
    return integration || undefined;
  }

  async listIntegrationsByService(serviceType: string): Promise<StandaloneIntegration[]> {
    return await db
      .select()
      .from(standaloneIntegrations)
      .where(eq(standaloneIntegrations.serviceType, serviceType));
  }

  // Transaction operations
  async getTransactions(tenantId: string, limit?: number): Promise<StandaloneTransaction[]> {
    const userId = parseInt(tenantId, 10);
    const baseQuery = db
      .select()
      .from(standaloneTransactions)
      .where(eq(standaloneTransactions.userId, userId))
      .orderBy(desc(standaloneTransactions.date));

    return limit ? await baseQuery.limit(limit) : await baseQuery;
  }

  async createTransaction(insertTransaction: StandaloneInsertTransaction): Promise<StandaloneTransaction> {
    const [transaction] = await db
      .insert(standaloneTransactions)
      .values(insertTransaction)
      .returning();
    return transaction;
  }

  // Task operations
  async getTasks(tenantId: string, limit?: number): Promise<StandaloneTask[]> {
    const userId = parseInt(tenantId, 10);
    const baseQuery = db
      .select()
      .from(standaloneTasks)
      .where(eq(standaloneTasks.userId, userId))
      .orderBy(standaloneTasks.completed, standaloneTasks.dueDate);

    return limit ? await baseQuery.limit(limit) : await baseQuery;
  }

  async getTask(id: string): Promise<StandaloneTask | undefined> {
    const numId = parseInt(id, 10);
    const [task] = await db
      .select()
      .from(standaloneTasks)
      .where(eq(standaloneTasks.id, numId));
    return task || undefined;
  }

  async createTask(insertTask: StandaloneInsertTask): Promise<StandaloneTask> {
    const [task] = await db
      .insert(standaloneTasks)
      .values(insertTask)
      .returning();
    return task;
  }

  async updateTask(id: string, data: Partial<StandaloneTask>): Promise<StandaloneTask | undefined> {
    const numId = parseInt(id, 10);
    const [task] = await db
      .update(standaloneTasks)
      .set(data)
      .where(eq(standaloneTasks.id, numId))
      .returning();
    return task || undefined;
  }

  // Financial summary operations (standalone mode)
  async getFinancialSummary(userId: string): Promise<StandaloneFinancialSummary | undefined> {
    const numId = parseInt(userId, 10);
    const [summary] = await db
      .select()
      .from(standaloneFinancialSummaries)
      .where(eq(standaloneFinancialSummaries.userId, numId));
    return summary || undefined;
  }

  async createFinancialSummary(insertSummary: StandaloneInsertFinancialSummary): Promise<StandaloneFinancialSummary> {
    const [summary] = await db
      .insert(standaloneFinancialSummaries)
      .values(insertSummary)
      .returning();
    return summary;
  }

  async updateFinancialSummary(userId: string, data: Partial<StandaloneFinancialSummary>): Promise<StandaloneFinancialSummary | undefined> {
    const numId = parseInt(userId, 10);
    const [summary] = await db
      .update(standaloneFinancialSummaries)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(standaloneFinancialSummaries.userId, numId))
      .returning();
    return summary || undefined;
  }

  // AI Message operations
  async getAiMessages(tenantId: string, _userId: string, limit?: number): Promise<StandaloneAiMessage[]> {
    const userId = parseInt(tenantId, 10);
    const baseQuery = db
      .select()
      .from(standaloneAiMessages)
      .where(eq(standaloneAiMessages.userId, userId))
      .orderBy(desc(standaloneAiMessages.timestamp));

    return limit ? await baseQuery.limit(limit) : await baseQuery;
  }

  async createAiMessage(insertMessage: StandaloneInsertAiMessage): Promise<StandaloneAiMessage> {
    const [message] = await db
      .insert(standaloneAiMessages)
      .values(insertMessage)
      .returning();
    return message;
  }

  // Webhook operations
  async isWebhookDuplicate(source: string, eventId: string): Promise<boolean> {
    const [row] = await db
      .select()
      .from(webhookEvents)
      .where(and(eq(webhookEvents.source, source), eq(webhookEvents.eventId, eventId)))
      .limit(1);
    return Boolean(row);
  }

  async recordWebhookEvent(data: Omit<NewWebhookEvent, 'id' | 'receivedAt'>): Promise<any> {
    const [row] = await db
      .insert(webhookEvents)
      .values(data as NewWebhookEvent)
      .onConflictDoNothing({ target: [webhookEvents.source, webhookEvents.eventId] })
      .returning();
    return row;
  }

  async listWebhookEvents(params: { source?: string; limit?: number; cursor?: number }) {
    const { source, limit = 50, cursor } = params;
    let q = db.select().from(webhookEvents).orderBy(desc(webhookEvents.receivedAt));
    if (source) {
      // @ts-ignore drizzle chainable where
      q = (q as any).where(eq(webhookEvents.source, source));
    }
    if (cursor) {
      // @ts-ignore
      q = (q as any).where((eb: any) => eb.lt(webhookEvents.id, cursor));
    }
    // @ts-ignore
    const rows = await (q as any).limit(Math.min(limit, 100));
    const nextCursor = rows.length ? rows[rows.length - 1].id : undefined;
    return { items: rows, nextCursor };
  }
}

// Export storage instance based on MODE
export const storage: IStorage = MODE === 'system' ? new SystemStorage() : new StandaloneStorage();
