// System mode storage - multi-tenant PostgreSQL
// Methods return empty/undefined stubs - implement as needed

export class SystemStorage {
  private db: unknown;

  constructor(db: unknown) {
    this.db = db;
  }

  // ---------------- SESSION ----------------
  async getSessionContext(): Promise<{ userId: string } | undefined> { return undefined; }
  async setSessionContext(): Promise<void> {}
  async getSessionUser(): Promise<unknown> { return undefined; }

  // ---------------- TENANTS ----------------
  async getTenant(_id?: string): Promise<unknown> { return undefined; }
  async getTenantBySlug(_slug?: string): Promise<unknown> { return undefined; }
  async getUserTenants(_userId?: string): Promise<unknown[]> { return []; }
  async checkTenantAccess(_userId?: string, _tenantId?: string): Promise<{ hasAccess: boolean }> { return { hasAccess: true }; }
  async createTenant(_tenant: unknown): Promise<unknown> { throw new Error("Not implemented"); }

  // ---------------- USERS ----------------
  async getUser(_id?: string): Promise<unknown> { return undefined; }
  async getUserByEmail(_email?: string): Promise<unknown> { return undefined; }
  async getUserByUsername(_username?: string): Promise<unknown> { return undefined; }
  async createUser(_user: unknown): Promise<unknown> { throw new Error("Not implemented"); }

  // ---------------- INTEGRATIONS ----------------
  async getIntegrations(_userId?: string): Promise<unknown[]> { return []; }
  async getIntegration(_id?: string): Promise<unknown> { return undefined; }
  async listIntegrationsByService(_service?: string): Promise<unknown[]> { return []; }
  async createIntegration(_integration: unknown): Promise<unknown> { throw new Error("Not implemented"); }
  async updateIntegration(_id?: string, _data?: unknown): Promise<unknown> { return undefined; }

  // ---------------- ACCOUNTS ----------------
  async getAccounts(_userId?: string): Promise<unknown[]> { return []; }
  async getAccount(_id?: string): Promise<unknown> { return undefined; }

  // ---------------- FINANCIAL SUMMARY ----------------
  async getFinancialSummary(_userId?: string): Promise<unknown> { return undefined; }
  async createFinancialSummary(_summary: unknown): Promise<unknown> { throw new Error("Not implemented"); }

  // ---------------- TRANSACTIONS ----------------
  async listTransactions(_userId?: string): Promise<unknown[]> { return []; }
  async getTransactions(_userId?: string): Promise<unknown[]> { return []; }
  async createTransaction(_tx: unknown): Promise<unknown> { throw new Error("Not implemented"); }
  async updateTransaction(_id?: string, _data?: unknown): Promise<unknown> { return undefined; }

  // ---------------- TASKS ----------------
  async listTasks(_userId?: string): Promise<unknown[]> { return []; }
  async getTasks(_userId?: string): Promise<unknown[]> { return []; }
  async getTask(_id?: string): Promise<unknown> { return undefined; }
  async createTask(_task: unknown): Promise<unknown> { throw new Error("Not implemented"); }
  async updateTask(_id?: string, _data?: unknown): Promise<unknown> { return undefined; }
  async deleteTask(_id?: string): Promise<void> {}

  // ---------------- AI MESSAGES ----------------
  async listAiMessages(_userId?: string): Promise<unknown[]> { return []; }
  async getAiMessages(_userId?: string): Promise<unknown[]> { return []; }
  async addAiMessage(_msg: unknown): Promise<unknown> { throw new Error("Not implemented"); }
  async createAiMessage(_msg: unknown): Promise<unknown> { throw new Error("Not implemented"); }

  // ---------------- PROPERTIES ----------------
  async getProperties(_tenantId?: string): Promise<unknown[]> { return []; }

  // ---------------- WEBHOOK EVENTS ----------------
  async recordWebhookEvent(_evt: unknown): Promise<void> {}
  async isWebhookDuplicate(_eventId?: string): Promise<boolean> { return false; }
  async listWebhookEvents(_options?: { source?: string; limit?: number }): Promise<unknown[]> { return []; }
}
