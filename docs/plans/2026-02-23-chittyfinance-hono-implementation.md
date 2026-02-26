# ChittyFinance Hono Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Port ChittyFinance from Express to Hono on Cloudflare Workers, implement the stubbed SystemStorage with real Drizzle queries, and make the consumer contract endpoints (`/api/accounts`, `/api/accounts/:id/transactions`, `/api/summary`) return real data to ChittyCommand.

**Architecture:** Hono app on Cloudflare Workers using `@neondatabase/serverless` HTTP driver for Neon PostgreSQL. Service token auth for ChittyCommand→ChittyFinance. Tenant-scoped storage layer with real Drizzle queries against `database/system.schema.ts`. Existing Durable Object (ChittyAgent) preserved.

**Tech Stack:** Hono, @neondatabase/serverless, drizzle-orm/neon-http, jose, vitest, wrangler

---

## Prerequisites

Before starting, ensure:
- Node.js 18+ installed
- `cd /Users/nb/Desktop/Projects/github.com/chittyapps/chittyfinance`
- `npm install` succeeds
- Access to Neon dashboard for DATABASE_URL
- Access to Cloudflare dashboard for KV/R2 provisioning

---

### Task 1: Install Hono and Edge Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install production dependencies**

Run:
```bash
npm install hono @neondatabase/serverless drizzle-orm jose
```

Expected: Packages added to `dependencies` in `package.json`

**Step 2: Verify no conflicting versions**

Run:
```bash
npm ls drizzle-orm
```

Expected: Single version of drizzle-orm (^0.39.x) — no duplicates

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add hono, neon-serverless, jose dependencies"
```

---

### Task 2: Create Env Type Definition

**Files:**
- Create: `server/env.ts`
- Test: `server/__tests__/env.test.ts`

**Step 1: Write the failing test**

Create `server/__tests__/env.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('Env type', () => {
  it('exports Env interface and HonoEnv type', async () => {
    const mod = await import('../env');
    // Type-only module — just verify it imports without error
    expect(mod).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/env.test.ts`
Expected: FAIL — `Cannot find module '../env'`

**Step 3: Write the implementation**

Create `server/env.ts`:

```typescript
import type { Context } from 'hono';

export interface Env {
  // Database
  DATABASE_URL: string;

  // Auth
  CHITTY_AUTH_SERVICE_TOKEN: string;
  CHITTY_AUTH_JWKS_URL?: string;

  // Service URLs
  CHITTYCONNECT_API_BASE?: string;

  // Integration secrets
  OPENAI_API_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  WAVE_CLIENT_ID?: string;
  WAVE_CLIENT_SECRET?: string;
  OAUTH_STATE_SECRET?: string;
  GITHUB_TOKEN?: string;
  MERCURY_WEBHOOK_SECRET?: string;

  // App config
  MODE?: string;
  NODE_ENV?: string;
  APP_VERSION?: string;
  PUBLIC_APP_BASE_URL?: string;

  // Cloudflare bindings
  FINANCE_KV: KVNamespace;
  FINANCE_R2: R2Bucket;
  ASSETS: Fetcher;
  CF_AGENT: DurableObjectNamespace;
}

// Hono context variables set by middleware
export interface Variables {
  tenantId: string;
  userId: string;
  db: ReturnType<typeof import('./db/connection').createDb>;
}

// Use this as generic param for Hono: new Hono<HonoEnv>()
export type HonoEnv = {
  Bindings: Env;
  Variables: Variables;
};
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/env.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/env.ts server/__tests__/env.test.ts
git commit -m "feat: add Hono Env type definition"
```

---

### Task 3: Create Consolidated Database Connection

**Files:**
- Create: `server/db/connection.ts`
- Create: `server/db/schema.ts`
- Test: `server/__tests__/db-connection.test.ts`

**Step 1: Write the failing test**

Create `server/__tests__/db-connection.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('createDb', () => {
  it('exports createDb function', async () => {
    const { createDb } = await import('../db/connection');
    expect(typeof createDb).toBe('function');
  });

  it('returns a drizzle instance when given a connection string', () => {
    // We can't test actual DB connection in unit tests,
    // but we can verify the function doesn't throw on creation
    const { createDb } = require('../db/connection');
    const db = createDb('postgresql://fake:fake@localhost/fake');
    expect(db).toBeDefined();
    expect(db.select).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/db-connection.test.ts`
Expected: FAIL — `Cannot find module '../db/connection'`

**Step 3: Write the implementation**

Create `server/db/connection.ts`:

```typescript
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export type Database = ReturnType<typeof createDb>;
```

Create `server/db/schema.ts`:

```typescript
// Re-export system schema as the canonical schema for the Hono app
export * from '../../database/system.schema';
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/db-connection.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/db/connection.ts server/db/schema.ts server/__tests__/db-connection.test.ts
git commit -m "feat: consolidated Neon HTTP database connection"
```

---

### Task 4: Create Error Handler Middleware

**Files:**
- Create: `server/middleware/error.ts`
- Test: `server/__tests__/middleware-error.test.ts`

**Step 1: Write the failing test**

Create `server/__tests__/middleware-error.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { errorHandler } from '../middleware/error';

describe('errorHandler middleware', () => {
  it('catches thrown errors and returns JSON', async () => {
    const app = new Hono();
    app.onError(errorHandler);
    app.get('/explode', () => {
      throw new Error('kaboom');
    });

    const res = await app.request('/explode');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('kaboom');
  });

  it('uses status from HTTPException', async () => {
    const { HTTPException } = await import('hono/http-exception');
    const app = new Hono();
    app.onError(errorHandler);
    app.get('/forbidden', () => {
      throw new HTTPException(403, { message: 'no access' });
    });

    const res = await app.request('/forbidden');
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('no access');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/middleware-error.test.ts`
Expected: FAIL — `Cannot find module '../middleware/error'`

**Step 3: Write the implementation**

Rewrite `server/middleware/error.ts`:

```typescript
import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error('[error]', err);
  return c.json({ error: err.message || 'Internal Server Error' }, 500);
};
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/middleware-error.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/middleware/error.ts server/__tests__/middleware-error.test.ts
git commit -m "feat: Hono error handler middleware"
```

---

### Task 5: Create Auth Middleware (Service Token)

**Files:**
- Rewrite: `server/middleware/auth.ts`
- Test: `server/__tests__/middleware-auth.test.ts`

**Step 1: Write the failing test**

Create `server/__tests__/middleware-auth.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';

describe('serviceAuth middleware', () => {
  async function buildApp() {
    const { serviceAuth } = await import('../middleware/auth');
    const app = new Hono<HonoEnv>();
    app.use('/api/*', serviceAuth);
    app.get('/api/test', (c) => c.json({ ok: true }));
    return app;
  }

  const env = {
    CHITTY_AUTH_SERVICE_TOKEN: 'test-token-123',
    DATABASE_URL: 'fake',
    FINANCE_KV: {} as any,
    FINANCE_R2: {} as any,
    ASSETS: {} as any,
    CF_AGENT: {} as any,
  };

  it('rejects requests without Authorization header', async () => {
    const app = await buildApp();
    const res = await app.request('/api/test', {}, env);
    expect(res.status).toBe(401);
  });

  it('rejects requests with wrong token', async () => {
    const app = await buildApp();
    const res = await app.request('/api/test', {
      headers: { Authorization: 'Bearer wrong-token' },
    }, env);
    expect(res.status).toBe(401);
  });

  it('allows requests with correct token', async () => {
    const app = await buildApp();
    const res = await app.request('/api/test', {
      headers: { Authorization: 'Bearer test-token-123' },
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/middleware-auth.test.ts`
Expected: FAIL — module structure mismatch (old Express middleware)

**Step 3: Write the implementation**

Rewrite `server/middleware/auth.ts`:

```typescript
import type { MiddlewareHandler } from 'hono';
import type { HonoEnv } from '../env';

/**
 * Service token auth — validates Bearer token against CHITTY_AUTH_SERVICE_TOKEN.
 * Used for service-to-service calls (e.g., ChittyCommand → ChittyFinance).
 */
export const serviceAuth: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const expected = c.env.CHITTY_AUTH_SERVICE_TOKEN;
  if (!expected) {
    return c.json({ error: 'auth_not_configured' }, 500);
  }

  const auth = c.req.header('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!token || token !== expected) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  await next();
};
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/middleware-auth.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/middleware/auth.ts server/__tests__/middleware-auth.test.ts
git commit -m "feat: Hono service token auth middleware"
```

---

### Task 6: Create Tenant Middleware

**Files:**
- Rewrite: `server/middleware/tenant.ts`
- Test: `server/__tests__/middleware-tenant.test.ts`

**Step 1: Write the failing test**

Create `server/__tests__/middleware-tenant.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';

describe('tenantMiddleware', () => {
  async function buildApp() {
    const { tenantMiddleware } = await import('../middleware/tenant');
    const app = new Hono<HonoEnv>();
    app.use('/api/*', tenantMiddleware);
    app.get('/api/test', (c) => c.json({ tenantId: c.get('tenantId') }));
    return app;
  }

  const env = {
    CHITTY_AUTH_SERVICE_TOKEN: 'x',
    DATABASE_URL: 'fake',
    FINANCE_KV: {} as any,
    FINANCE_R2: {} as any,
    ASSETS: {} as any,
    CF_AGENT: {} as any,
  };

  it('reads tenant from X-Tenant-ID header', async () => {
    const app = await buildApp();
    const res = await app.request('/api/test', {
      headers: { 'X-Tenant-ID': 'tenant-abc' },
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantId).toBe('tenant-abc');
  });

  it('reads tenant from ?tenantId query param', async () => {
    const app = await buildApp();
    const res = await app.request('/api/test?tenantId=tenant-xyz', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantId).toBe('tenant-xyz');
  });

  it('returns 400 when no tenant provided', async () => {
    const app = await buildApp();
    const res = await app.request('/api/test', {}, env);
    expect(res.status).toBe(400);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/middleware-tenant.test.ts`
Expected: FAIL — old Express middleware

**Step 3: Write the implementation**

Rewrite `server/middleware/tenant.ts`:

```typescript
import type { MiddlewareHandler } from 'hono';
import type { HonoEnv } from '../env';

/**
 * Resolves tenant from X-Tenant-ID header or ?tenantId query param.
 * Sets c.set('tenantId', ...) for downstream route handlers.
 */
export const tenantMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const tenantId =
    c.req.header('x-tenant-id') ??
    c.req.query('tenantId') ??
    '';

  if (!tenantId) {
    return c.json({ error: 'missing_tenant_id', message: 'X-Tenant-ID header or tenantId query param required' }, 400);
  }

  c.set('tenantId', tenantId);
  await next();
};
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/middleware-tenant.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/middleware/tenant.ts server/__tests__/middleware-tenant.test.ts
git commit -m "feat: Hono tenant resolution middleware"
```

---

### Task 7: Implement SystemStorage — Accounts, Transactions, Summary

This is the critical task. The current `server/storage/system.ts` is ALL STUBS. Implement the three methods needed for the consumer contract.

**Files:**
- Rewrite: `server/storage/system.ts`
- Test: `server/__tests__/storage-system.test.ts`

**Step 1: Write the failing test**

Create `server/__tests__/storage-system.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

// We can't connect to a real DB in unit tests, so we test the query structure
// by mocking the drizzle instance. This verifies SystemStorage calls the right
// tables and filters.
describe('SystemStorage', () => {
  it('exports SystemStorage class', async () => {
    const { SystemStorage } = await import('../storage/system');
    expect(SystemStorage).toBeDefined();
    expect(typeof SystemStorage).toBe('function');
  });

  it('constructor accepts a drizzle db instance', async () => {
    const { SystemStorage } = await import('../storage/system');
    const fakeDb = {} as any;
    const storage = new SystemStorage(fakeDb);
    expect(storage).toBeInstanceOf(SystemStorage);
  });

  it('getAccounts returns array (with mock db)', async () => {
    const { SystemStorage } = await import('../storage/system');
    const mockSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([
            { id: '1', name: 'Checking', tenantId: 't1', balance: '1000.00' },
          ]),
        }),
      }),
    });
    const fakeDb = { select: mockSelect } as any;
    const storage = new SystemStorage(fakeDb);
    const accounts = await storage.getAccounts('t1');
    expect(Array.isArray(accounts)).toBe(true);
    expect(accounts.length).toBe(1);
    expect(accounts[0].name).toBe('Checking');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/storage-system.test.ts`
Expected: FAIL — current stubs return `[]` without calling db

**Step 3: Write the implementation**

Rewrite `server/storage/system.ts`:

```typescript
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
    let q = this.db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.tenantId, tenantId))
      .orderBy(desc(schema.transactions.date));
    if (limit) q = q.limit(limit) as typeof q;
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
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/storage-system.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/storage/system.ts server/__tests__/storage-system.test.ts
git commit -m "feat: implement SystemStorage with real Drizzle queries"
```

---

### Task 8: Create Health Routes

**Files:**
- Create: `server/routes/health.ts`
- Test: `server/__tests__/routes-health.test.ts`

**Step 1: Write the failing test**

Create `server/__tests__/routes-health.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';

describe('health routes', () => {
  const env = {
    MODE: 'system',
    NODE_ENV: 'test',
    APP_VERSION: '2.0.0-test',
    CHITTY_AUTH_SERVICE_TOKEN: 'x',
    DATABASE_URL: 'fake',
    FINANCE_KV: {} as any,
    FINANCE_R2: {} as any,
    ASSETS: {} as any,
    CF_AGENT: {} as any,
  };

  async function buildApp() {
    const { healthRoutes } = await import('../routes/health');
    const app = new Hono<HonoEnv>();
    app.route('/', healthRoutes);
    return app;
  }

  it('GET /health returns {"status":"ok"}', async () => {
    const app = await buildApp();
    const res = await app.request('/health', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('GET /api/v1/status returns service info', async () => {
    const app = await buildApp();
    const res = await app.request('/api/v1/status', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('ChittyFinance');
    expect(body.mode).toBe('system');
    expect(body.version).toBe('2.0.0-test');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/routes-health.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `server/routes/health.ts`:

```typescript
import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const healthRoutes = new Hono<HonoEnv>();

healthRoutes.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'chittyfinance' });
});

healthRoutes.get('/api/v1/status', (c) => {
  const version = c.env.APP_VERSION || '1.0.0';
  const mode = c.env.MODE || 'system';
  const nodeEnv = c.env.NODE_ENV || 'production';
  const dbConfigured = Boolean(c.env.DATABASE_URL);
  const chittyConfigured = Boolean(c.env.CHITTYCONNECT_API_BASE && c.env.CHITTY_AUTH_SERVICE_TOKEN);

  return c.json({
    name: 'ChittyFinance',
    version,
    mode,
    nodeEnv,
    database: { configured: dbConfigured },
    chittyConnect: { configured: chittyConfigured },
  });
});

healthRoutes.get('/api/v1/metrics', (c) => {
  const dbConfigured = c.env.DATABASE_URL ? 1 : 0;
  const chittyConfigured = (c.env.CHITTYCONNECT_API_BASE && c.env.CHITTY_AUTH_SERVICE_TOKEN) ? 1 : 0;
  const lines = [
    '# HELP service_database_configured Database configured (1) or not (0)',
    '# TYPE service_database_configured gauge',
    `service_database_configured ${dbConfigured}`,
    '# HELP service_chittyconnect_configured ChittyConnect configured (1) or not (0)',
    '# TYPE service_chittyconnect_configured gauge',
    `service_chittyconnect_configured ${chittyConfigured}`,
    '',
  ];
  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; version=0.0.4' },
  });
});
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/routes-health.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/routes/health.ts server/__tests__/routes-health.test.ts
git commit -m "feat: health/status/metrics Hono routes"
```

---

### Task 9: Create Consumer Contract Routes (accounts, transactions, summary)

These are the three endpoints ChittyCommand's `financeClient()` calls. This is the MVP.

**Files:**
- Create: `server/routes/accounts.ts`
- Create: `server/routes/transactions.ts`
- Create: `server/routes/summary.ts`
- Test: `server/__tests__/routes-consumer-contract.test.ts`

**Step 1: Write the failing test**

Create `server/__tests__/routes-consumer-contract.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';

// Mock storage that returns test data
const mockStorage = {
  getAccounts: vi.fn().mockResolvedValue([
    { id: 'a1', name: 'Checking', type: 'checking', institution: 'Mercury', balance: '5000.00', currency: 'USD', tenantId: 't1' },
  ]),
  getTransactionsByAccount: vi.fn().mockResolvedValue([
    { id: 'tx1', accountId: 'a1', amount: '-100.00', type: 'expense', description: 'Office supplies', date: '2026-01-15T00:00:00Z' },
  ]),
  getSummary: vi.fn().mockResolvedValue({ total_cash: 5000, total_owed: 200, net: 4800 }),
};

describe('consumer contract routes', () => {
  const env = {
    CHITTY_AUTH_SERVICE_TOKEN: 'svc-token',
    DATABASE_URL: 'fake',
    FINANCE_KV: {} as any,
    FINANCE_R2: {} as any,
    ASSETS: {} as any,
    CF_AGENT: {} as any,
  };

  it('GET /api/accounts returns account list', async () => {
    const { accountRoutes } = await import('../routes/accounts');
    const app = new Hono<HonoEnv>();
    // Inject mock storage
    app.use('*', async (c, next) => {
      c.set('tenantId', 't1');
      (c as any).storage = mockStorage;
      await next();
    });
    app.route('/', accountRoutes);

    const res = await app.request('/api/accounts', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].name).toBe('Checking');
  });

  it('GET /api/accounts/:id/transactions returns transaction list', async () => {
    const { accountRoutes } = await import('../routes/accounts');
    const app = new Hono<HonoEnv>();
    app.use('*', async (c, next) => {
      c.set('tenantId', 't1');
      (c as any).storage = mockStorage;
      await next();
    });
    app.route('/', accountRoutes);

    const res = await app.request('/api/accounts/a1/transactions', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].description).toBe('Office supplies');
  });

  it('GET /api/summary returns aggregate summary', async () => {
    const { summaryRoutes } = await import('../routes/summary');
    const app = new Hono<HonoEnv>();
    app.use('*', async (c, next) => {
      c.set('tenantId', 't1');
      (c as any).storage = mockStorage;
      await next();
    });
    app.route('/', summaryRoutes);

    const res = await app.request('/api/summary', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total_cash).toBe(5000);
    expect(body.net).toBe(4800);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/routes-consumer-contract.test.ts`
Expected: FAIL — modules not found

**Step 3: Write the implementation**

Create `server/routes/accounts.ts`:

```typescript
import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const accountRoutes = new Hono<HonoEnv>();

// GET /api/accounts — list all accounts for the tenant
accountRoutes.get('/api/accounts', async (c) => {
  const storage = (c as any).storage;
  const tenantId = c.get('tenantId');
  const accounts = await storage.getAccounts(tenantId);

  // Map to consumer contract format (FinanceAccount)
  return c.json(accounts.map((a: any) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    institution: a.institution || '',
    balance: parseFloat(a.balance),
    currency: a.currency,
  })));
});

// GET /api/accounts/:id/transactions — transactions for a specific account
accountRoutes.get('/api/accounts/:id/transactions', async (c) => {
  const storage = (c as any).storage;
  const tenantId = c.get('tenantId');
  const accountId = c.req.param('id');
  const since = c.req.query('since');

  const txns = await storage.getTransactionsByAccount(accountId, tenantId, since);

  // Map to consumer contract format (FinanceTransaction)
  return c.json(txns.map((t: any) => ({
    id: t.id,
    account_id: t.accountId,
    amount: parseFloat(t.amount),
    direction: parseFloat(t.amount) >= 0 ? 'inflow' : 'outflow',
    description: t.description,
    date: t.date,
    category: t.category || undefined,
    counterparty: t.payee || undefined,
  })));
});
```

Create `server/routes/summary.ts`:

```typescript
import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const summaryRoutes = new Hono<HonoEnv>();

// GET /api/summary — aggregate financial summary for the tenant
summaryRoutes.get('/api/summary', async (c) => {
  const storage = (c as any).storage;
  const tenantId = c.get('tenantId');
  const summary = await storage.getSummary(tenantId);
  return c.json(summary);
});
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/routes-consumer-contract.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/routes/accounts.ts server/routes/summary.ts server/__tests__/routes-consumer-contract.test.ts
git commit -m "feat: consumer contract routes — accounts, transactions, summary"
```

---

### Task 10: Create Hono App Factory

Assembles all middleware and routes into the Hono app.

**Files:**
- Create: `server/app.ts`
- Test: `server/__tests__/app.test.ts`

**Step 1: Write the failing test**

Create `server/__tests__/app.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('createApp', () => {
  it('exports createApp function', async () => {
    const { createApp } = await import('../app');
    expect(typeof createApp).toBe('function');
  });

  it('returns a Hono app that responds to /health', async () => {
    const { createApp } = await import('../app');
    const app = createApp();
    const env = {
      CHITTY_AUTH_SERVICE_TOKEN: 'x',
      DATABASE_URL: 'fake',
      MODE: 'system',
      FINANCE_KV: {} as any,
      FINANCE_R2: {} as any,
      ASSETS: {} as any,
      CF_AGENT: {} as any,
    };
    const res = await app.request('/health', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/app.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `server/app.ts`:

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { HonoEnv } from './env';
import { errorHandler } from './middleware/error';
import { serviceAuth } from './middleware/auth';
import { tenantMiddleware } from './middleware/tenant';
import { healthRoutes } from './routes/health';
import { accountRoutes } from './routes/accounts';
import { summaryRoutes } from './routes/summary';
import { createDb } from './db/connection';
import { SystemStorage } from './storage/system';

export function createApp() {
  const app = new Hono<HonoEnv>();

  // Global error handler
  app.onError(errorHandler);

  // CORS
  app.use('*', cors({
    origin: ['https://app.command.chitty.cc', 'https://command.chitty.cc', 'http://localhost:5000', 'http://localhost:3000'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-Source-Service'],
  }));

  // Request logging
  app.use('*', logger());

  // Public routes (no auth)
  app.route('/', healthRoutes);

  // Redirects (public)
  app.get('/connect', (c) => {
    const target = c.env.CHITTYCONNECT_API_BASE?.replace(/\/?api\/?$/, '') || 'https://connect.chitty.cc';
    return c.redirect(target, 302);
  });
  app.get('/register', (c) => c.redirect('https://get.chitty.cc', 302));

  // Durable Object agent passthrough (public)
  app.all('/agent', async (c) => {
    const name = new URL(c.req.url).searchParams.get('id') || 'default';
    const id = c.env.CF_AGENT.idFromName(name);
    const stub = c.env.CF_AGENT.get(id);
    return stub.fetch(c.req.raw);
  });
  app.all('/agent/*', async (c) => {
    const name = new URL(c.req.url).searchParams.get('id') || 'default';
    const id = c.env.CF_AGENT.idFromName(name);
    const stub = c.env.CF_AGENT.get(id);
    return stub.fetch(c.req.raw);
  });

  // Authenticated API routes
  const api = new Hono<HonoEnv>();

  // Auth + tenant middleware for all /api/* routes
  api.use('*', serviceAuth);
  api.use('*', tenantMiddleware);

  // Inject storage into context
  api.use('*', async (c, next) => {
    const db = createDb(c.env.DATABASE_URL);
    const storage = new SystemStorage(db);
    (c as any).storage = storage;
    c.set('db', db);
    await next();
  });

  // Mount route groups onto /api prefix
  api.route('/', accountRoutes);
  api.route('/', summaryRoutes);

  // Mount api under the app — routes are already /api/* prefixed
  app.route('/', api);

  // Fallback: try static assets, then 404
  app.all('*', async (c) => {
    try {
      const assetRes = await c.env.ASSETS.fetch(c.req.raw);
      if (assetRes.status !== 404) return assetRes;
    } catch {}
    return c.json({ error: 'Not Found' }, 404);
  });

  return app;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/app.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/app.ts server/__tests__/app.test.ts
git commit -m "feat: Hono app factory with middleware chain"
```

---

### Task 11: Rewrite worker.ts as Thin Hono Handler

**Files:**
- Rewrite: `server/worker.ts`
- Modify: `server/__tests__/status.test.ts` (update to use new worker)

**Step 1: Write the failing test**

Update `server/__tests__/status.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('worker', () => {
  const env: any = {
    MODE: 'system',
    NODE_ENV: 'test',
    APP_VERSION: '2.0.0-test',
    CHITTY_AUTH_SERVICE_TOKEN: 'test-token',
    DATABASE_URL: 'postgresql://fake:fake@localhost/fake',
    FINANCE_KV: {},
    FINANCE_R2: {},
    ASSETS: { fetch: async () => new Response('Not Found', { status: 404 }) },
    CF_AGENT: {
      idFromName: () => ({}),
      get: () => ({ fetch: async () => new Response('ok') }),
    },
  };

  it('responds to /health', async () => {
    const mod = await import('../worker');
    const worker = mod.default;
    const req = new Request('http://localhost/health');
    const res = await worker.fetch(req, env, {} as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('responds to /api/v1/status', async () => {
    const mod = await import('../worker');
    const worker = mod.default;
    const req = new Request('http://localhost/api/v1/status');
    const res = await worker.fetch(req, env, {} as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('ChittyFinance');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/status.test.ts`
Expected: FAIL — old worker structure

**Step 3: Write the implementation**

Rewrite `server/worker.ts`:

```typescript
import { createApp } from './app';
import type { Env } from './env';

const app = createApp();

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;

// Re-export the Agent DO class so Wrangler can bind it
export { ChittyAgent } from './agents/agent';
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/status.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/worker.ts server/__tests__/status.test.ts
git commit -m "feat: rewrite worker.ts as thin Hono handler"
```

---

### Task 12: Update Wrangler Config for Real Deployment

**Files:**
- Modify: `deploy/system-wrangler.toml`

**Step 1: Review current placeholder IDs**

Read `deploy/system-wrangler.toml` — note which IDs say "your-*-id"

**Step 2: Provision Cloudflare resources**

Run these commands (requires `wrangler login` first):

```bash
# Provision KV namespace
npx wrangler kv namespace create FINANCE_KV
# Note the id from output

# Provision KV preview namespace
npx wrangler kv namespace create FINANCE_KV --preview
# Note the preview_id from output
```

**Step 3: Update wrangler config**

Update `deploy/system-wrangler.toml` with real IDs from Step 2. Update binding names to match `Env` type:

- KV binding: `FINANCE_KV` (was `CACHE`)
- R2 binding: `FINANCE_R2` (was `DOCUMENTS`)
- Remove `[build]` section (Workers handles TypeScript natively)
- Ensure `compatibility_flags = ["nodejs_compat"]`

**Step 4: Set secrets**

```bash
npx wrangler secret put DATABASE_URL -c deploy/system-wrangler.toml
npx wrangler secret put CHITTY_AUTH_SERVICE_TOKEN -c deploy/system-wrangler.toml
```

**Step 5: Commit**

```bash
git add deploy/system-wrangler.toml
git commit -m "chore: update wrangler config with real KV/R2 bindings"
```

---

### Task 13: Deploy and Verify

**Files:** None (deployment task)

**Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass

**Step 2: Deploy to Cloudflare**

```bash
npx wrangler deploy -c deploy/system-wrangler.toml
```

Expected: Deployment succeeds, outputs URL

**Step 3: Verify health endpoint**

```bash
curl -s https://finance.chitty.cc/health | jq .
```

Expected: `{"status":"ok","service":"chittyfinance"}`

**Step 4: Verify status endpoint**

```bash
curl -s https://finance.chitty.cc/api/v1/status | jq .
```

Expected: JSON with `name: "ChittyFinance"`, `mode: "system"`

**Step 5: Verify consumer contract (with auth)**

```bash
# Replace $TOKEN with actual CHITTY_AUTH_SERVICE_TOKEN
curl -s -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: $TENANT_ID" \
  https://finance.chitty.cc/api/accounts | jq .

curl -s -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: $TENANT_ID" \
  https://finance.chitty.cc/api/summary | jq .
```

Expected: JSON arrays/objects with real data from Neon

**Step 6: Commit any fixes, tag release**

```bash
git tag v2.0.0-hono
git push origin main --tags
```

---

### Task 14: Push Schema to Neon (if tables don't exist)

**Step 1: Check if tables exist**

Connect to Neon dashboard or run:
```bash
npx drizzle-kit push --config=drizzle.config.ts
```

Note: This requires `drizzle.config.ts` to point at the system schema and DATABASE_URL.

**Step 2: Seed IT CAN BE LLC entity structure**

```bash
npm run db:seed
```

This runs `database/seeds/it-can-be-llc.ts` which creates all tenants, users, and permissions.

**Step 3: Verify data**

```bash
# Using Neon SQL editor or psql:
SELECT count(*) FROM tenants;
SELECT count(*) FROM users;
SELECT count(*) FROM accounts;
```

---

## Phase 2 Tasks (Full Route Migration)

> These tasks follow the same TDD pattern. Each migrates a route group from `server/routes.ts` (Express) to a new Hono route file.

### Task 15: Migrate Session Routes
- Port `GET /api/session` → `server/routes/session.ts`
- System mode returns 401 (ChittyID integration expected)

### Task 16: Migrate Tenant Routes
- Port `GET /api/tenants`, `GET /api/tenants/:id` → `server/routes/tenants.ts`
- Port `GET /api/properties`, `GET /api/properties/:id`, `/properties/:id/units`, `/properties/:id/leases` → `server/routes/properties.ts`

### Task 17: Migrate Integration CRUD Routes
- Port `GET /api/integrations`, `POST /api/integrations`, `PATCH /api/integrations/:id`, `GET /api/integrations/status` → `server/routes/integrations.ts`

### Task 18: Migrate Mercury Routes
- Port `GET /api/mercury/accounts`, `POST /api/mercury/select-accounts` → `server/routes/mercury.ts`
- Refactor `server/lib/chittyConnect.ts` for edge (no Node.js APIs)

### Task 19: Migrate Wave OAuth Routes — COMPLETED
- Created `server/lib/oauth-state-edge.ts` — Web Crypto API HMAC-SHA256 state tokens
- Created `server/routes/wave.ts` — authorize (protected), callback (public), refresh (protected)
- Callback is self-contained: creates own DB/storage, recovers tenantId from state token
- `wave-api.ts` was already edge-compatible (pure fetch)

### Task 20: Migrate Stripe Routes — COMPLETED
- Created `server/routes/stripe.ts` — connect + checkout endpoints
- Webhook handled in `server/routes/webhooks.ts` with KV-based dedup

### Task 21: Migrate Task Routes — COMPLETED
- Created `server/routes/tasks.ts` — full CRUD (GET/POST/PATCH/DELETE)

### Task 22: Migrate AI Routes — COMPLETED
- Created `server/routes/ai.ts` — GET/POST /api/ai-messages

### Task 23: Migrate Recurring Charges Routes — COMPLETED
- Created `server/routes/charges.ts` — recurring, optimizations, manage
- All integration fetch functions are stubs returning [] (pending real API wiring)
- Optimization analysis logic inlined as pure functions

### Task 24: Migrate GitHub Routes — COMPLETED
- Created `server/routes/github.ts` — repositories, commits, PRs, issues

### Task 25: Migrate Webhook Routes — COMPLETED
- Created `server/routes/webhooks.ts` — Stripe + Mercury webhooks
- KV-based idempotency with 7-day TTL

### Task 26: Migrate Forensic Routes — COMPLETED
- Created `server/routes/forensics.ts` — all 21 endpoints
- Re-exported forensic tables from `server/db/schema.ts` (shared/schema.ts integer-ID based)
- Inlined analysis algorithms: Benford's law, duplicate detection, timing, round-dollar
- Edge-compatible: no Node.js crypto dependency

---

## Phase 3: Mercury Direct Client (ChittyCommand)

> These tasks are in the ChittyCommand repo, not ChittyFinance. See `docs/plans/2026-02-23-mercury-live-data-design.md` for full spec.

### Task 27: Add mercuryClient to ChittyCommand integrations.ts
### Task 28: Add Mercury bridge routes to ChittyCommand
### Task 29: Add Mercury sync steps to ChittyCommand cron
### Task 30: Deploy and verify Mercury data flowing

---

## Testing Reference

All tests use vitest. Run:
```bash
npx vitest run                    # All tests
npx vitest run server/__tests__/  # Server tests only
npx vitest --watch                # Watch mode
```

Test files live adjacent to source: `server/__tests__/*.test.ts`

## Key Reference Files

| File | What It Tells You |
|------|-------------------|
| `database/system.schema.ts` | All table definitions, types, relations |
| `server/routes.ts` | Express routes to port (THE source of truth for behavior) |
| `server/storage/standalone.ts` | Working storage implementation to reference for query patterns |
| `server/middleware/auth.ts` (old) | Express auth patterns to replicate |
| ChittyCommand `src/lib/integrations.ts:101-131` | Consumer contract — exact endpoints + response shapes |
