import { eq, and, desc, sql } from 'drizzle-orm';
import type { Database } from '../db/connection';
import * as schema from '../db/schema';

export class SystemStorage {
  constructor(private db: Database) {}

  // ── ACCOUNTS ──

  async getAccounts(tenantId: string) {
    return this.db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.tenantId, tenantId))
      .orderBy(desc(schema.accounts.updatedAt));
  }

  async getAccount(id: string, tenantId: string) {
    const [row] = await this.db
      .select()
      .from(schema.accounts)
      .where(and(eq(schema.accounts.id, id), eq(schema.accounts.tenantId, tenantId)));
    return row;
  }

  // ── TRANSACTIONS ──

  async getTransactions(tenantId: string, limit?: number) {
    const q = this.db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.tenantId, tenantId))
      .orderBy(desc(schema.transactions.date));
    if (limit) return q.limit(limit);
    return q;
  }

  async getTransactionsByAccount(accountId: string, tenantId: string, since?: string) {
    const conditions = [
      eq(schema.transactions.accountId, accountId),
      eq(schema.transactions.tenantId, tenantId),
    ];
    if (since) {
      conditions.push(sql`${schema.transactions.date} >= ${since}`);
    }
    return this.db
      .select()
      .from(schema.transactions)
      .where(and(...conditions))
      .orderBy(desc(schema.transactions.date));
  }

  // ── SUMMARY ──

  async getSummary(tenantId: string) {
    const accts = await this.getAccounts(tenantId);
    let totalCash = 0;
    let totalOwed = 0;
    for (const a of accts) {
      const bal = parseFloat(a.balance);
      if (a.type === 'credit') {
        totalOwed += Math.abs(bal);
      } else {
        totalCash += bal;
      }
    }
    return { total_cash: totalCash, total_owed: totalOwed, net: totalCash - totalOwed };
  }

  // ── TENANTS ──

  async getTenants() {
    return this.db.select().from(schema.tenants).where(eq(schema.tenants.isActive, true));
  }

  async getTenant(id: string) {
    const [row] = await this.db.select().from(schema.tenants).where(eq(schema.tenants.id, id));
    return row;
  }

  async getTenantBySlug(slug: string) {
    const [row] = await this.db.select().from(schema.tenants).where(eq(schema.tenants.slug, slug));
    return row;
  }

  async getUserTenants(userId: string) {
    return this.db
      .select({ tenant: schema.tenants, role: schema.tenantUsers.role })
      .from(schema.tenantUsers)
      .innerJoin(schema.tenants, eq(schema.tenantUsers.tenantId, schema.tenants.id))
      .where(eq(schema.tenantUsers.userId, userId));
  }

  // ── USERS ──

  async getUser(id: string) {
    const [row] = await this.db.select().from(schema.users).where(eq(schema.users.id, id));
    return row;
  }

  async getUserByEmail(email: string) {
    const [row] = await this.db.select().from(schema.users).where(eq(schema.users.email, email));
    return row;
  }

  // ── INTEGRATIONS ──

  async getIntegrations(tenantId: string) {
    return this.db
      .select()
      .from(schema.integrations)
      .where(eq(schema.integrations.tenantId, tenantId));
  }

  async getIntegration(id: string) {
    const [row] = await this.db.select().from(schema.integrations).where(eq(schema.integrations.id, id));
    return row;
  }

  async createIntegration(data: typeof schema.integrations.$inferInsert) {
    const [row] = await this.db.insert(schema.integrations).values(data).returning();
    return row;
  }

  async updateIntegration(id: string, data: Partial<typeof schema.integrations.$inferInsert>) {
    const [row] = await this.db
      .update(schema.integrations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.integrations.id, id))
      .returning();
    return row;
  }

  // ── TASKS ──

  async getTasks(tenantId: string) {
    return this.db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.tenantId, tenantId))
      .orderBy(desc(schema.tasks.createdAt));
  }

  async getTask(id: string) {
    const [row] = await this.db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
    return row;
  }

  async createTask(data: typeof schema.tasks.$inferInsert) {
    const [row] = await this.db.insert(schema.tasks).values(data).returning();
    return row;
  }

  async updateTask(id: string, data: Partial<typeof schema.tasks.$inferInsert>) {
    const [row] = await this.db
      .update(schema.tasks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.tasks.id, id))
      .returning();
    return row;
  }

  async deleteTask(id: string) {
    await this.db.delete(schema.tasks).where(eq(schema.tasks.id, id));
  }

  // ── AI MESSAGES ──

  async getAiMessages(tenantId: string) {
    return this.db
      .select()
      .from(schema.aiMessages)
      .where(eq(schema.aiMessages.tenantId, tenantId))
      .orderBy(schema.aiMessages.createdAt);
  }

  async createAiMessage(data: typeof schema.aiMessages.$inferInsert) {
    const [row] = await this.db.insert(schema.aiMessages).values(data).returning();
    return row;
  }

  // ── PROPERTIES ──

  async getProperties(tenantId: string) {
    return this.db
      .select()
      .from(schema.properties)
      .where(eq(schema.properties.tenantId, tenantId));
  }
}
