import { eq, and, desc, sql, inArray, isNull, asc } from 'drizzle-orm';
import type { Database } from '../db/connection';
import * as schema from '../db/schema';

const MS_PER_DAY = 86_400_000;

/**
 * Sentinel error thrown when a trust-path operation is rejected.
 * Routes can catch this and map the `code` to a stable HTTP response
 * without leaking raw exception messages for unexpected failures.
 */
export class ClassificationError extends Error {
  constructor(
    public readonly code:
      | 'reconciled_locked'
      | 'not_classified'
      | 'transaction_not_found',
    message: string,
  ) {
    super(message);
    this.name = 'ClassificationError';
  }
}

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

  async getUserByChittyId(chittyId: string) {
    const [row] = await this.db.select().from(schema.users).where(eq(schema.users.chittyId, chittyId));
    return row;
  }

  async linkChittyId(userId: string, chittyId: string) {
    const [row] = await this.db.update(schema.users)
      .set({ chittyId })
      .where(eq(schema.users.id, userId))
      .returning();
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
        coaCode: schema.transactions.coaCode,
        suggestedCoaCode: schema.transactions.suggestedCoaCode,
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

  async getPropertiesForTenants(tenantIds: string[]) {
    if (tenantIds.length === 0) return [];
    return this.db
      .select({
        id: schema.properties.id,
        tenantId: schema.properties.tenantId,
        name: schema.properties.name,
        address: schema.properties.address,
        city: schema.properties.city,
        state: schema.properties.state,
      })
      .from(schema.properties)
      .where(and(
        inArray(schema.properties.tenantId, tenantIds),
        eq(schema.properties.isActive, true),
      ));
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

  // ── ALLOCATION RULES ──

  async getAllocationRules(tenantId: string) {
    return this.db
      .select()
      .from(schema.allocationRules)
      .where(
        and(
          eq(schema.allocationRules.sourceTenantId, tenantId),
          eq(schema.allocationRules.isActive, true),
        ),
      )
      .orderBy(desc(schema.allocationRules.createdAt));
  }

  async getAllocationRulesForTenants(tenantIds: string[]) {
    if (tenantIds.length === 0) return [];
    return this.db
      .select()
      .from(schema.allocationRules)
      .where(
        and(
          inArray(schema.allocationRules.sourceTenantId, tenantIds),
          eq(schema.allocationRules.isActive, true),
        ),
      )
      .orderBy(schema.allocationRules.ruleType);
  }

  async getAllocationRule(id: string) {
    const [row] = await this.db
      .select()
      .from(schema.allocationRules)
      .where(eq(schema.allocationRules.id, id));
    return row;
  }

  async createAllocationRule(data: typeof schema.allocationRules.$inferInsert) {
    const [row] = await this.db
      .insert(schema.allocationRules)
      .values(data)
      .returning();
    return row;
  }

  async updateAllocationRule(id: string, data: Partial<typeof schema.allocationRules.$inferInsert>) {
    const [row] = await this.db
      .update(schema.allocationRules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.allocationRules.id, id))
      .returning();
    return row;
  }

  async deleteAllocationRule(id: string) {
    const [row] = await this.db
      .update(schema.allocationRules)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(schema.allocationRules.id, id))
      .returning();
    return row;
  }

  // ── ALLOCATION RUNS ──

  async createAllocationRun(data: typeof schema.allocationRuns.$inferInsert) {
    const [row] = await this.db
      .insert(schema.allocationRuns)
      .values(data)
      .returning();
    return row;
  }

  async getAllocationRuns(ruleId: string) {
    return this.db
      .select()
      .from(schema.allocationRuns)
      .where(eq(schema.allocationRuns.ruleId, ruleId))
      .orderBy(desc(schema.allocationRuns.createdAt));
  }

  async getAllocationRunsForPeriod(tenantIds: string[], periodStart: string, periodEnd: string) {
    if (tenantIds.length === 0) return [];
    const ruleIds = await this.db
      .select({ id: schema.allocationRules.id })
      .from(schema.allocationRules)
      .where(inArray(schema.allocationRules.sourceTenantId, tenantIds));

    if (ruleIds.length === 0) return [];

    return this.db
      .select()
      .from(schema.allocationRuns)
      .where(
        and(
          inArray(schema.allocationRuns.ruleId, ruleIds.map((r) => r.id)),
          sql`${schema.allocationRuns.periodStart} >= ${periodStart}`,
          sql`${schema.allocationRuns.periodEnd} <= ${periodEnd}`,
        ),
      )
      .orderBy(desc(schema.allocationRuns.createdAt));
  }

  async updateAllocationRunStatus(id: string, status: string) {
    const [row] = await this.db
      .update(schema.allocationRuns)
      .set({ status })
      .where(eq(schema.allocationRuns.id, id))
      .returning();
    return row;
  }

  async createIntercompanyTransaction(data: typeof schema.intercompanyTransactions.$inferInsert) {
    const [row] = await this.db
      .insert(schema.intercompanyTransactions)
      .values(data)
      .returning();
    return row;
  }

  // ── CHART OF ACCOUNTS ──

  async getChartOfAccounts(tenantId: string) {
    // Return tenant-specific overrides + global defaults (tenant_id IS NULL)
    return this.db
      .select()
      .from(schema.chartOfAccounts)
      .where(
        sql`${schema.chartOfAccounts.tenantId} = ${tenantId} OR ${schema.chartOfAccounts.tenantId} IS NULL`,
      )
      .orderBy(asc(schema.chartOfAccounts.code));
  }

  async getGlobalChartOfAccounts() {
    return this.db
      .select()
      .from(schema.chartOfAccounts)
      .where(isNull(schema.chartOfAccounts.tenantId))
      .orderBy(asc(schema.chartOfAccounts.code));
  }

  async getChartOfAccountByCode(code: string, tenantId: string) {
    // Prefer tenant-specific, fall back to global
    const [tenantAcct] = await this.db
      .select()
      .from(schema.chartOfAccounts)
      .where(and(eq(schema.chartOfAccounts.code, code), eq(schema.chartOfAccounts.tenantId, tenantId)));
    if (tenantAcct) return tenantAcct;

    const [globalAcct] = await this.db
      .select()
      .from(schema.chartOfAccounts)
      .where(and(eq(schema.chartOfAccounts.code, code), isNull(schema.chartOfAccounts.tenantId)));
    return globalAcct;
  }

  async createChartOfAccount(data: typeof schema.chartOfAccounts.$inferInsert) {
    const [row] = await this.db.insert(schema.chartOfAccounts).values(data).returning();
    return row;
  }

  async updateChartOfAccount(
    id: string,
    tenantId: string,
    data: Partial<typeof schema.chartOfAccounts.$inferInsert>,
  ) {
    // Tenant-scoped: only allow updating accounts belonging to this tenant.
    // Global accounts (tenant_id IS NULL) cannot be edited via this path.
    const [row] = await this.db
      .update(schema.chartOfAccounts)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(schema.chartOfAccounts.id, id),
        eq(schema.chartOfAccounts.tenantId, tenantId),
      ))
      .returning();
    return row;
  }

  async getUserRoleForTenant(userId: string, tenantId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ role: schema.tenantUsers.role })
      .from(schema.tenantUsers)
      .where(and(
        eq(schema.tenantUsers.userId, userId),
        eq(schema.tenantUsers.tenantId, tenantId),
      ));
    return row?.role ?? null;
  }

  // ── CLASSIFICATION (trust-path operations) ──

  async classifyTransaction(
    txId: string,
    tenantId: string,
    coaCode: string,
    opts: { actorId: string; actorType: 'user' | 'agent' | 'system'; trustLevel: string; confidence?: string; reason?: string; isSuggestion?: boolean },
  ) {
    const tx = await this.getTransaction(txId, tenantId);
    if (!tx) return undefined;

    const previousCoaCode = tx.coaCode;
    const previousSuggested = tx.suggestedCoaCode;
    const now = new Date();

    // Decide which fields to update
    const updateSet = opts.isSuggestion
      ? {
          // L1: write to suggested_coa_code only
          suggestedCoaCode: coaCode,
          classificationConfidence: opts.confidence ?? null,
          updatedAt: now,
        }
      : {
          // L2+: write to authoritative coa_code
          coaCode,
          classifiedBy: opts.actorId,
          classifiedAt: now,
          classificationConfidence: opts.confidence ?? null,
          updatedAt: now,
        };

    // Reconciled lock: L0/L1/L2 writes must reject rows that were reconciled
    // between the initial SELECT and this UPDATE. We enforce this inside the
    // WHERE clause of the UPDATE itself (conditional update) so concurrent
    // reconciliations can't race us.
    const canWriteReconciled = opts.trustLevel === 'L3' || opts.trustLevel === 'L4';
    const whereConditions = canWriteReconciled
      ? and(eq(schema.transactions.id, txId), eq(schema.transactions.tenantId, tenantId))
      : and(
          eq(schema.transactions.id, txId),
          eq(schema.transactions.tenantId, tenantId),
          eq(schema.transactions.reconciled, false),
        );

    // Action label distinguishes suggestion vs authoritative writes
    // so the audit trail accurately reflects the L1 path.
    const action = opts.isSuggestion
      ? previousSuggested
        ? 're-suggest'
        : 'suggest'
      : previousCoaCode
        ? 'reclassify'
        : 'classify';

    await this.db.transaction(async (trx) => {
      // Conditional update — returns the row only if the WHERE matched.
      // If the row was already reconciled (and caller is L0/L1/L2), this
      // returns [], letting us throw a ClassificationError and roll back
      // the audit insert via the transaction boundary.
      const updated = await trx
        .update(schema.transactions)
        .set(updateSet)
        .where(whereConditions)
        .returning({ id: schema.transactions.id });

      if (updated.length === 0) {
        // Distinguish "reconciled lock triggered" vs "row vanished"
        const current = await trx
          .select({ id: schema.transactions.id, reconciled: schema.transactions.reconciled })
          .from(schema.transactions)
          .where(and(eq(schema.transactions.id, txId), eq(schema.transactions.tenantId, tenantId)));
        if (current[0]?.reconciled) {
          throw new ClassificationError('reconciled_locked', 'Transaction is reconciled — only L3/L4 can modify');
        }
        throw new ClassificationError('transaction_not_found', 'Transaction not found');
      }

      await trx.insert(schema.classificationAudit).values({
        transactionId: txId,
        tenantId,
        previousCoaCode: opts.isSuggestion ? (previousSuggested ?? null) : previousCoaCode,
        newCoaCode: coaCode,
        action,
        trustLevel: opts.trustLevel,
        actorId: opts.actorId,
        actorType: opts.actorType,
        confidence: opts.confidence ?? null,
        reason: opts.reason ?? null,
      });
    });

    return this.getTransaction(txId, tenantId);
  }

  async reconcileTransaction(
    txId: string,
    tenantId: string,
    actorId: string,
  ) {
    const tx = await this.getTransaction(txId, tenantId);
    if (!tx) return undefined;
    const coaCode = tx.coaCode;
    if (!coaCode) {
      throw new ClassificationError('not_classified', 'Cannot reconcile — transaction has no COA classification');
    }

    const now = new Date();

    await this.db.transaction(async (trx) => {
      await trx
        .update(schema.transactions)
        .set({ reconciled: true, reconciledBy: actorId, reconciledAt: now, updatedAt: now })
        .where(and(eq(schema.transactions.id, txId), eq(schema.transactions.tenantId, tenantId)));

      await trx.insert(schema.classificationAudit).values({
        transactionId: txId,
        tenantId,
        previousCoaCode: coaCode,
        newCoaCode: coaCode,
        action: 'reconcile',
        trustLevel: 'L3',
        actorId,
        actorType: 'user',
      });
    });

    return this.getTransaction(txId, tenantId);
  }

  async getTransaction(txId: string, tenantId: string) {
    const [row] = await this.db
      .select()
      .from(schema.transactions)
      .where(and(eq(schema.transactions.id, txId), eq(schema.transactions.tenantId, tenantId)));
    return row;
  }

  async getUnclassifiedTransactions(tenantId: string, limit = 50) {
    return this.db
      .select()
      .from(schema.transactions)
      .where(and(eq(schema.transactions.tenantId, tenantId), isNull(schema.transactions.coaCode)))
      .orderBy(desc(schema.transactions.date))
      .limit(limit);
  }

  async getClassificationAudit(transactionId: string, tenantId: string) {
    return this.db
      .select()
      .from(schema.classificationAudit)
      .where(and(
        eq(schema.classificationAudit.transactionId, transactionId),
        eq(schema.classificationAudit.tenantId, tenantId),
      ))
      .orderBy(desc(schema.classificationAudit.createdAt));
  }

  async getClassificationStats(tenantId: string) {
    const [stats] = await this.db
      .select({
        total: sql<number>`count(*)`,
        classified: sql<number>`count(${schema.transactions.coaCode})`,
        reconciled: sql<number>`count(CASE WHEN ${schema.transactions.reconciled} = true THEN 1 END)`,
        suggested: sql<number>`count(CASE WHEN ${schema.transactions.suggestedCoaCode} IS NOT NULL AND ${schema.transactions.coaCode} IS NULL THEN 1 END)`,
      })
      .from(schema.transactions)
      .where(eq(schema.transactions.tenantId, tenantId));
    return stats;
  }
}
