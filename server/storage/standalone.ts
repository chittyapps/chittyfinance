// @ts-nocheck - Standalone storage has type mismatches between string IDs and number columns
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { eq, desc } from "drizzle-orm";
import {
  users as standaloneUsers,
  integrations as standaloneIntegrations,
  financialSummaries as standaloneFinancialSummaries,
  transactions as standaloneTransactions,
  tasks as standaloneTasks,
  aiMessages as standaloneAiMessages,
  type InsertUser as StandaloneInsertUser,
  type InsertIntegration as StandaloneInsertIntegration,
  type InsertFinancialSummary as StandaloneInsertFinancialSummary,
  type InsertTransaction as StandaloneInsertTransaction,
  type InsertTask as StandaloneInsertTask,
  type InsertAiMessage as StandaloneInsertAiMessage,
} from "@shared/schema";
import { webhookEvents, type NewWebhookEvent } from "@shared/finance.schema";

export class StandaloneStorage {
  private db: any;

  constructor(db: any) {
    this.db = db as DrizzleD1Database;
  }

  // ---------------- SESSION ----------------

  async getSessionContext() {
    const [user] = await this.db.select().from(standaloneUsers).limit(1);
    if (!user) return undefined;
    return { userId: user.id.toString() };
  }

  async setSessionContext() {
    return;
  }

  async getSessionUser() {
    const [user] = await this.db.select().from(standaloneUsers).limit(1);
    return user;
  }

  // ---------------- TENANTS (noop in standalone) ----------------

  async getTenant() { return undefined; }
  async getTenantBySlug() { return undefined; }
  async getUserTenants() { return []; }
  async checkTenantAccess() { return { hasAccess: true }; }
  async createTenant() {
    throw new Error("Tenants not supported in standalone mode");
  }

  // ---------------- USERS ----------------

  async getUser(id: string) {
    const [u] = await this.db
      .select()
      .from(standaloneUsers)
      .where(eq(standaloneUsers.id, id));
    return u;
  }

  async getUserByEmail(email: string) {
    const [u] = await this.db
      .select()
      .from(standaloneUsers)
      .where(eq(standaloneUsers.email, email));
    return u;
  }

  async getUserByUsername(username: string) {
    const [u] = await this.db
      .select()
      .from(standaloneUsers)
      .where(eq(standaloneUsers.username, username));
    return u;
  }

  async createUser(user: StandaloneInsertUser) {
    const [u] = await this.db
      .insert(standaloneUsers)
      .values(user)
      .returning();
    return u;
  }

  // ---------------- INTEGRATIONS ----------------

  async getIntegrations(userId?: string) {
    if (!userId) return [];
    return this.db
      .select()
      .from(standaloneIntegrations)
      .where(eq(standaloneIntegrations.userId, userId));
  }

  async getIntegration(id: string) {
    const [x] = await this.db
      .select()
      .from(standaloneIntegrations)
      .where(eq(standaloneIntegrations.id, id));
    return x;
  }

  async listIntegrationsByService(service: string) {
    return this.db
      .select()
      .from(standaloneIntegrations)
      .where(eq(standaloneIntegrations.service, service));
  }

  async createIntegration(integration: StandaloneInsertIntegration) {
    const [x] = await this.db
      .insert(standaloneIntegrations)
      .values(integration)
      .returning();
    return x;
  }

  async updateIntegration(id: string, data: Partial<StandaloneInsertIntegration>) {
    const [x] = await this.db
      .update(standaloneIntegrations)
      .set(data)
      .where(eq(standaloneIntegrations.id, id))
      .returning();
    return x;
  }

  // ---------------- ACCOUNTS ----------------

  async getAccounts(_userId?: string) {
    // Standalone mode doesn't have separate accounts table
    return [];
  }

  async getAccount(_id?: string) {
    return undefined;
  }

  // ---------------- FINANCIAL SUMMARY ----------------

  async getFinancialSummary(userId: string) {
    const [fs] = await this.db
      .select()
      .from(standaloneFinancialSummaries)
      .where(eq(standaloneFinancialSummaries.userId, userId));
    return fs;
  }

  async createFinancialSummary(summary: StandaloneInsertFinancialSummary) {
    const [x] = await this.db
      .insert(standaloneFinancialSummaries)
      .values(summary)
      .returning();
    return x;
  }

  // ---------------- TRANSACTIONS ----------------

  async listTransactions(userId?: string) {
    if (!userId) return [];
    return this.db
      .select()
      .from(standaloneTransactions)
      .where(eq(standaloneTransactions.userId, userId));
  }

  async getTransactions(userId?: string) {
    return this.listTransactions(userId);
  }

  async createTransaction(tx: StandaloneInsertTransaction) {
    const [x] = await this.db
      .insert(standaloneTransactions)
      .values(tx)
      .returning();
    return x;
  }

  async updateTransaction(id: string, data: Partial<StandaloneInsertTransaction>) {
    const [x] = await this.db
      .update(standaloneTransactions)
      .set(data)
      .where(eq(standaloneTransactions.id, id))
      .returning();
    return x;
  }

  // ---------------- TASKS ----------------

  async listTasks(userId?: string) {
    if (!userId) return [];
    return this.db
      .select()
      .from(standaloneTasks)
      .where(eq(standaloneTasks.userId, userId));
  }

  async getTasks(userId?: string) {
    return this.listTasks(userId);
  }

  async getTask(id: string) {
    const [x] = await this.db
      .select()
      .from(standaloneTasks)
      .where(eq(standaloneTasks.id, id));
    return x;
  }

  async createTask(task: StandaloneInsertTask) {
    const [x] = await this.db
      .insert(standaloneTasks)
      .values(task)
      .returning();
    return x;
  }

  async updateTask(id: string, data: Partial<StandaloneInsertTask>) {
    const [x] = await this.db
      .update(standaloneTasks)
      .set(data)
      .where(eq(standaloneTasks.id, id))
      .returning();
    return x;
  }

  async deleteTask(id: string) {
    await this.db
      .delete(standaloneTasks)
      .where(eq(standaloneTasks.id, id));
  }

  // ---------------- AI MESSAGES ----------------

  async listAiMessages(userId?: string) {
    if (!userId) return [];
    return this.db
      .select()
      .from(standaloneAiMessages)
      .where(eq(standaloneAiMessages.userId, userId))
      .orderBy(desc(standaloneAiMessages.createdAt));
  }

  async getAiMessages(userId?: string) {
    return this.listAiMessages(userId);
  }

  async addAiMessage(msg: StandaloneInsertAiMessage) {
    const [x] = await this.db
      .insert(standaloneAiMessages)
      .values(msg)
      .returning();
    return x;
  }

  async createAiMessage(msg: StandaloneInsertAiMessage) {
    return this.addAiMessage(msg);
  }

  // ---------------- PROPERTIES ----------------

  async getProperties(_tenantId?: string) {
    // Standalone mode doesn't have properties table
    return [];
  }

  // ---------------- WEBHOOK EVENTS ----------------

  async recordWebhookEvent(evt: NewWebhookEvent) {
    await this.db.insert(webhookEvents).values(evt);
  }

  async isWebhookDuplicate(eventId: string) {
    const [existing] = await this.db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.id, eventId))
      .limit(1);
    return !!existing;
  }

  async listWebhookEvents(options?: { source?: string; limit?: number }) {
    let query = this.db.select().from(webhookEvents);
    if (options?.source) {
      query = query.where(eq(webhookEvents.source, options.source));
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    return query;
  }
}
