import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import type { Database } from '../db/connection';
import * as schema from '../db/schema';

const MS_PER_DAY = 86_400_000;

export class SystemStorage {
  constructor(private db: Database) {}

  // ── SESSION (legacy Express compat shims) ──

  async getSessionUser() {
    const [user] = await this.db.select().from(schema.users).limit(1);
    return user;
  }

  async getSessionContext() {
    const user = await this.getSessionUser();
    if (!user) return undefined;
    return { userId: user.id };
  }

  async setSessionContext() { return; }

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

  async getTransactionByExternalId(externalId: string, tenantId: string) {
    const [row] = await this.db
      .select()
      .from(schema.transactions)
      .where(and(eq(schema.transactions.externalId, externalId), eq(schema.transactions.tenantId, tenantId)));
    return row;
  }

  async createTransaction(data: typeof schema.transactions.$inferInsert) {
    const [row] = await this.db.insert(schema.transactions).values(data).returning();
    return row;
  }

  async updateTransaction(id: string, tenantId: string, data: Partial<typeof schema.transactions.$inferInsert>) {
    const [row] = await this.db
      .update(schema.transactions)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(schema.transactions.id, id), eq(schema.transactions.tenantId, tenantId)))
      .returning();
    return row;
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

  async updateUnit(id: string, propertyId: string, data: Partial<typeof schema.units.$inferInsert>) {
    const { propertyId: _drop, ...safeData } = data;
    const [row] = await this.db
      .update(schema.units)
      .set({ ...safeData, updatedAt: new Date() })
      .where(and(eq(schema.units.id, id), eq(schema.units.propertyId, propertyId)))
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

  async updateLease(id: string, unitIds: string[], data: Partial<typeof schema.leases.$inferInsert>) {
    if (unitIds.length === 0) return undefined;
    const [row] = await this.db
      .update(schema.leases)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(schema.leases.id, id), inArray(schema.leases.unitId, unitIds)))
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

  async getExpiringLeases(withinDays: number, tenantId?: string, minDays?: number) {
    const now = new Date();
    const cutoff = new Date(now.getTime() + withinDays * MS_PER_DAY);
    const floor = minDays ? new Date(now.getTime() + minDays * MS_PER_DAY) : now;
    const conditions = [
      eq(schema.leases.status, 'active'),
      sql`${schema.leases.endDate} >= ${floor}`,
      sql`${schema.leases.endDate} <= ${cutoff}`,
    ];
    if (tenantId) {
      conditions.push(eq(schema.properties.tenantId, tenantId));
    }
    return this.db
      .select({
        lease: schema.leases,
        unit: schema.units,
        property: schema.properties,
      })
      .from(schema.leases)
      .innerJoin(schema.units, eq(schema.leases.unitId, schema.units.id))
      .innerJoin(schema.properties, eq(schema.units.propertyId, schema.properties.id))
      .where(and(...conditions))
      .orderBy(schema.leases.endDate);
  }

  async getTasksByRelation(relatedTo: string, relatedId: string) {
    return this.db
      .select()
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.relatedTo, relatedTo),
          eq(schema.tasks.relatedId, relatedId),
        ),
      );
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
    const property = await this.getProperty(propertyId, tenantId);
    if (!property) return null;

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
    const [row] = await this.db
      .insert(schema.propertyValuations)
      .values(data)
      .onConflictDoUpdate({
        target: [schema.propertyValuations.propertyId, schema.propertyValuations.source],
        set: {
          estimate: data.estimate,
          low: data.low,
          high: data.high,
          rentalEstimate: data.rentalEstimate,
          confidence: data.confidence,
          details: data.details,
          fetchedAt: data.fetchedAt,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  // ── CONSOLIDATED REPORTING HELPERS ──

  async getTenantDescendantIds(rootTenantId: string) {
    const seen = new Set<string>();
    const queue: string[] = [rootTenantId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (seen.has(current)) continue;
      seen.add(current);

      const children = await this.db
        .select({ id: schema.tenants.id })
        .from(schema.tenants)
        .where(eq(schema.tenants.parentId, current));

      for (const child of children) {
        if (!seen.has(child.id)) queue.push(child.id);
      }
    }

    return Array.from(seen);
  }

  async getTenantsByIds(tenantIds: string[]) {
    if (tenantIds.length === 0) return [];
    return this.db
      .select()
      .from(schema.tenants)
      .where(inArray(schema.tenants.id, tenantIds));
  }

  async getTransactionsForTenantScope(
    tenantIds: string[],
    startDateIso: string,
    endDateIso: string,
    entityTypes?: string[],
  ) {
    if (tenantIds.length === 0) return [];

    const conditions = [
      inArray(schema.transactions.tenantId, tenantIds),
      sql`${schema.transactions.date} >= ${startDateIso}`,
      sql`${schema.transactions.date} <= ${endDateIso}`,
    ];

    if (entityTypes && entityTypes.length > 0) {
      conditions.push(inArray(schema.tenants.type, entityTypes));
    }

    return this.db
      .select({
        id: schema.transactions.id,
        tenantId: schema.transactions.tenantId,
        tenantName: schema.tenants.name,
        tenantType: schema.tenants.type,
        tenantMetadata: schema.tenants.metadata,
        accountId: schema.transactions.accountId,
        amount: schema.transactions.amount,
        currency: schema.transactions.currency,
        type: schema.transactions.type,
        category: schema.transactions.category,
        description: schema.transactions.description,
        date: schema.transactions.date,
        payee: schema.transactions.payee,
        propertyId: schema.transactions.propertyId,
        propertyState: schema.properties.state,
        reconciled: schema.transactions.reconciled,
        metadata: schema.transactions.metadata,
      })
      .from(schema.transactions)
      .innerJoin(schema.tenants, eq(schema.transactions.tenantId, schema.tenants.id))
      .leftJoin(schema.properties, eq(schema.transactions.propertyId, schema.properties.id))
      .where(and(...conditions))
      .orderBy(desc(schema.transactions.date));
  }

  async getAccountsForTenantScope(tenantIds: string[]) {
    if (tenantIds.length === 0) return [];
    return this.db
      .select({
        id: schema.accounts.id,
        tenantId: schema.accounts.tenantId,
        tenantName: schema.tenants.name,
        tenantType: schema.tenants.type,
        type: schema.accounts.type,
        balance: schema.accounts.balance,
        currency: schema.accounts.currency,
      })
      .from(schema.accounts)
      .innerJoin(schema.tenants, eq(schema.accounts.tenantId, schema.tenants.id))
      .where(inArray(schema.accounts.tenantId, tenantIds));
  }

  async getInternalIntercompanyLinkedTransactionIds(
    tenantIds: string[],
    startDateIso: string,
    endDateIso: string,
  ) {
    if (tenantIds.length === 0) return new Set<string>();

    const links = await this.db
      .select({
        fromTransactionId: schema.intercompanyTransactions.fromTransactionId,
        toTransactionId: schema.intercompanyTransactions.toTransactionId,
      })
      .from(schema.intercompanyTransactions)
      .where(and(
        inArray(schema.intercompanyTransactions.fromTenantId, tenantIds),
        inArray(schema.intercompanyTransactions.toTenantId, tenantIds),
        sql`${schema.intercompanyTransactions.date} >= ${startDateIso}`,
        sql`${schema.intercompanyTransactions.date} <= ${endDateIso}`,
      ));

    const ids = new Set<string>();
    for (const row of links) {
      if (row.fromTransactionId) ids.add(row.fromTransactionId);
      if (row.toTransactionId) ids.add(row.toTransactionId);
    }
    return ids;
  }

  // ── COMMS LOG ──

  async createCommsLog(data: typeof schema.commsLog.$inferInsert) {
    const [row] = await this.db.insert(schema.commsLog).values(data).returning();
    return row;
  }

  async getCommsLog(tenantId: string, propertyId?: string) {
    const conditions = [eq(schema.commsLog.tenantId, tenantId)];
    if (propertyId) conditions.push(eq(schema.commsLog.propertyId, propertyId));
    return this.db
      .select()
      .from(schema.commsLog)
      .where(and(...conditions))
      .orderBy(desc(schema.commsLog.sentAt));
  }

  // ── WORKFLOWS ──

  async getWorkflows(tenantId: string, propertyId?: string) {
    const conditions = [eq(schema.workflows.tenantId, tenantId)];
    if (propertyId) conditions.push(eq(schema.workflows.propertyId, propertyId));
    return this.db
      .select()
      .from(schema.workflows)
      .where(and(...conditions))
      .orderBy(desc(schema.workflows.createdAt));
  }

  async getWorkflow(id: string) {
    const [row] = await this.db.select().from(schema.workflows).where(eq(schema.workflows.id, id));
    return row;
  }

  async createWorkflow(data: typeof schema.workflows.$inferInsert) {
    const [row] = await this.db.insert(schema.workflows).values(data).returning();
    return row;
  }

  async updateWorkflow(id: string, data: Partial<typeof schema.workflows.$inferInsert>) {
    // Merge metadata instead of overwriting
    const existing = await this.getWorkflow(id);
    if (!existing) return undefined;

    const mergedMetadata = data.metadata
      ? { ...(existing.metadata as Record<string, unknown> || {}), ...(data.metadata as Record<string, unknown>) }
      : existing.metadata;

    const [row] = await this.db
      .update(schema.workflows)
      .set({ ...data, metadata: mergedMetadata, updatedAt: new Date() })
      .where(eq(schema.workflows.id, id))
      .returning();
    return row;
  }
}
