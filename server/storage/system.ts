import { eq, and, desc, sql, inArray } from 'drizzle-orm';
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

  async getAccountsByType(tenantId: string, type: string) {
    return this.db
      .select()
      .from(schema.accounts)
      .where(and(eq(schema.accounts.tenantId, tenantId), eq(schema.accounts.type, type)))
      .orderBy(desc(schema.accounts.updatedAt));
  }

  async getAccountByExternalId(externalId: string, tenantId: string) {
    const [row] = await this.db
      .select()
      .from(schema.accounts)
      .where(and(eq(schema.accounts.externalId, externalId), eq(schema.accounts.tenantId, tenantId)));
    return row;
  }

  async createAccount(data: typeof schema.accounts.$inferInsert) {
    const [row] = await this.db.insert(schema.accounts).values(data).returning();
    return row;
  }

  async updateAccount(id: string, data: Partial<typeof schema.accounts.$inferInsert>) {
    const [row] = await this.db
      .update(schema.accounts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.accounts.id, id))
      .returning();
    return row;
  }

  async syncAccount(id: string, updates: { balance?: string; liabilityDetails?: unknown; metadata?: unknown }) {
    const setData: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.balance !== undefined) setData.balance = updates.balance;
    if (updates.liabilityDetails !== undefined) setData.liabilityDetails = updates.liabilityDetails;
    if (updates.metadata !== undefined) setData.metadata = updates.metadata;

    const [row] = await this.db
      .update(schema.accounts)
      .set(setData)
      .where(eq(schema.accounts.id, id))
      .returning();
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
    const LIABILITY_TYPES = ['mortgage', 'loan', 'tax_liability'];
    const accts = await this.getAccounts(tenantId);
    let totalCash = 0;
    let totalOwed = 0;
    for (const a of accts) {
      const bal = parseFloat(a.balance);
      if (a.type === 'credit' || LIABILITY_TYPES.includes(a.type)) {
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

  async getProperty(id: string, tenantId: string) {
    const [row] = await this.db
      .select()
      .from(schema.properties)
      .where(and(eq(schema.properties.id, id), eq(schema.properties.tenantId, tenantId)));
    return row;
  }

  async createProperty(data: typeof schema.properties.$inferInsert) {
    const [row] = await this.db.insert(schema.properties).values(data).returning();
    return row;
  }

  async updateProperty(id: string, tenantId: string, data: Partial<typeof schema.properties.$inferInsert>) {
    const [row] = await this.db
      .update(schema.properties)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(schema.properties.id, id), eq(schema.properties.tenantId, tenantId)))
      .returning();
    return row;
  }

  // ── UNITS ──

  async getUnits(propertyId: string) {
    return this.db
      .select()
      .from(schema.units)
      .where(eq(schema.units.propertyId, propertyId));
  }

  async createUnit(data: typeof schema.units.$inferInsert) {
    const [row] = await this.db.insert(schema.units).values(data).returning();
    return row;
  }

  async updateUnit(id: string, data: Partial<typeof schema.units.$inferInsert>) {
    const [row] = await this.db
      .update(schema.units)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.units.id, id))
      .returning();
    return row;
  }

  // ── LEASES ──

  async getLeasesByUnits(unitIds: string[]) {
    if (unitIds.length === 0) return [];
    return this.db
      .select()
      .from(schema.leases)
      .where(inArray(schema.leases.unitId, unitIds));
  }

  async createLease(data: typeof schema.leases.$inferInsert) {
    const [row] = await this.db.insert(schema.leases).values(data).returning();
    return row;
  }

  async updateLease(id: string, data: Partial<typeof schema.leases.$inferInsert>) {
    const [row] = await this.db
      .update(schema.leases)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.leases.id, id))
      .returning();
    return row;
  }

  async getActiveLeasesForProperty(propertyId: string) {
    const propertyUnits = await this.getUnits(propertyId);
    const unitIds = propertyUnits.map((u) => u.id);
    if (unitIds.length === 0) return [];
    return this.db
      .select()
      .from(schema.leases)
      .where(and(inArray(schema.leases.unitId, unitIds), eq(schema.leases.status, 'active')));
  }

  // ── PROPERTY FINANCIALS ──

  async getPropertyTransactions(propertyId: string, tenantId: string, since?: string, until?: string) {
    const conditions = [
      eq(schema.transactions.propertyId, propertyId),
      eq(schema.transactions.tenantId, tenantId),
    ];
    if (since) conditions.push(sql`${schema.transactions.date} >= ${since}`);
    if (until) conditions.push(sql`${schema.transactions.date} <= ${until}`);
    return this.db
      .select()
      .from(schema.transactions)
      .where(and(...conditions))
      .orderBy(desc(schema.transactions.date));
  }

  async getPropertyFinancials(propertyId: string, tenantId: string) {
    const property = await this.getProperty(propertyId, tenantId);
    if (!property) return null;

    const units = await this.getUnits(propertyId);
    const unitIds = units.map((u) => u.id);
    const activeLeases = unitIds.length > 0
      ? await this.db.select().from(schema.leases)
          .where(and(inArray(schema.leases.unitId, unitIds), eq(schema.leases.status, 'active')))
      : [];

    // Last 12 months of transactions
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const txns = await this.getPropertyTransactions(propertyId, tenantId, oneYearAgo.toISOString());

    let totalIncome = 0;
    let totalExpenses = 0;
    for (const t of txns) {
      const amt = parseFloat(t.amount);
      if (t.type === 'income') totalIncome += amt;
      else if (t.type === 'expense') totalExpenses += Math.abs(amt);
    }

    const noi = totalIncome - totalExpenses;
    const currentValue = property.currentValue ? parseFloat(property.currentValue) : 0;
    const purchasePrice = property.purchasePrice ? parseFloat(property.purchasePrice) : 0;

    return {
      propertyId,
      noi,
      capRate: currentValue > 0 ? (noi / currentValue) * 100 : 0,
      cashOnCash: purchasePrice > 0 ? (noi / purchasePrice) * 100 : 0,
      occupancyRate: units.length > 0 ? (activeLeases.length / units.length) * 100 : 0,
      totalUnits: units.length,
      occupiedUnits: activeLeases.length,
      totalIncome,
      totalExpenses,
    };
  }

  async getPropertyRentRoll(propertyId: string, tenantId: string) {
    const property = await this.getProperty(propertyId, tenantId);
    if (!property) return null;

    const units = await this.getUnits(propertyId);
    const unitIds = units.map((u) => u.id);
    const leases = unitIds.length > 0 ? await this.getLeasesByUnits(unitIds) : [];

    // Current month transactions
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
    const txns = await this.getPropertyTransactions(propertyId, tenantId, monthStart, monthEnd);

    return units.map((unit) => {
      const lease = leases.find((l) => l.unitId === unit.id && l.status === 'active');
      const unitTxns = txns.filter((t) => t.unitId === unit.id && t.category === 'rent');
      const actualPaid = unitTxns.reduce((sum, t) => sum + parseFloat(t.amount), 0);
      const expectedRent = lease ? parseFloat(lease.monthlyRent) : (unit.monthlyRent ? parseFloat(unit.monthlyRent) : 0);

      return {
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        bedrooms: unit.bedrooms,
        bathrooms: unit.bathrooms,
        squareFeet: unit.squareFeet,
        expectedRent,
        actualPaid,
        status: !lease ? 'vacant' : actualPaid >= expectedRent ? 'paid' : actualPaid > 0 ? 'partial' : 'overdue',
        tenantName: lease?.tenantName || null,
        leaseEnd: lease?.endDate || null,
      };
    });
  }

  async getPropertyPnL(propertyId: string, tenantId: string, startDate: string, endDate: string) {
    const txns = await this.getPropertyTransactions(propertyId, tenantId, startDate, endDate);

    const income: Record<string, number> = {};
    const expenses: Record<string, number> = {};
    let totalIncome = 0;
    let totalExpenses = 0;

    for (const t of txns) {
      const amt = parseFloat(t.amount);
      const category = t.category || 'uncategorized';
      if (t.type === 'income') {
        income[category] = (income[category] || 0) + amt;
        totalIncome += amt;
      } else if (t.type === 'expense') {
        expenses[category] = (expenses[category] || 0) + Math.abs(amt);
        totalExpenses += Math.abs(amt);
      }
    }

    return { income, expenses, totalIncome, totalExpenses, net: totalIncome - totalExpenses };
  }

  // ── VALUATIONS ──

  async getPropertyValuations(propertyId: string, tenantId: string) {
    return this.db
      .select()
      .from(schema.propertyValuations)
      .where(and(
        eq(schema.propertyValuations.propertyId, propertyId),
        eq(schema.propertyValuations.tenantId, tenantId),
      ))
      .orderBy(desc(schema.propertyValuations.fetchedAt));
  }

  async upsertPropertyValuation(data: typeof schema.propertyValuations.$inferInsert) {
    // Check if a valuation from this source already exists for this property
    const [existing] = await this.db
      .select()
      .from(schema.propertyValuations)
      .where(and(
        eq(schema.propertyValuations.propertyId, data.propertyId),
        eq(schema.propertyValuations.source, data.source),
      ));

    if (existing) {
      const [row] = await this.db
        .update(schema.propertyValuations)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.propertyValuations.id, existing.id))
        .returning();
      return row;
    }

    const [row] = await this.db.insert(schema.propertyValuations).values(data).returning();
    return row;
  }
}
