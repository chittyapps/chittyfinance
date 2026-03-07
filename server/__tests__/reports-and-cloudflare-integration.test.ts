import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { reportRoutes } from '../routes/reports';
import { integrationRoutes } from '../routes/integrations';

const env = {
  CHITTY_AUTH_SERVICE_TOKEN: 'svc-token',
  DATABASE_URL: 'fake',
  FINANCE_KV: {} as any,
  FINANCE_R2: {} as any,
  ASSETS: {} as any,
};

function withStorage(app: Hono<HonoEnv>, storage: any) {
  app.use('*', async (c, next) => {
    c.set('tenantId', 't-root');
    c.set('storage', storage);
    await next();
  });
  return app;
}

describe('reportRoutes', () => {
  it('GET /api/reports/consolidated returns consolidated totals and preflight checks', async () => {
    const storage = {
      getTenantDescendantIds: vi.fn().mockResolvedValue(['t-root', 't-child']),
      getTenantsByIds: vi.fn().mockResolvedValue([
        { id: 't-root', type: 'holding' },
        { id: 't-child', type: 'property' },
      ]),
      getTransactionsForTenantScope: vi.fn().mockResolvedValue([
        {
          id: 'tx-1',
          tenantId: 't-root',
          tenantName: 'Root Entity',
          tenantType: 'holding',
          tenantMetadata: { state: 'IL' },
          amount: '1000.00',
          type: 'income',
          category: 'rent',
          description: 'Rent income',
          date: '2026-01-15T00:00:00.000Z',
          reconciled: true,
          metadata: {},
          propertyState: 'IL',
        },
        {
          id: 'tx-2',
          tenantId: 't-child',
          tenantName: 'Child Entity',
          tenantType: 'property',
          tenantMetadata: {},
          amount: '-400.00',
          type: 'expense',
          category: 'maintenance',
          description: 'Maintenance expense',
          date: '2026-01-16T00:00:00.000Z',
          reconciled: false,
          metadata: {},
          propertyState: 'IL',
        },
      ]),
      getInternalIntercompanyLinkedTransactionIds: vi.fn().mockResolvedValue(new Set<string>()),
      getAccountsForTenantScope: vi.fn().mockResolvedValue([
        {
          id: 'a-1',
          tenantId: 't-root',
          tenantName: 'Root Entity',
          tenantType: 'holding',
          type: 'checking',
          balance: '5000.00',
          currency: 'USD',
        },
      ]),
    };

    const app = withStorage(new Hono<HonoEnv>(), storage);
    app.route('/', reportRoutes);

    const res = await app.request(
      '/api/reports/consolidated?startDate=2026-01-01&endDate=2026-01-31&federalTaxRate=0.21',
      {},
      env as any,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.report.totals.income).toBe(1000);
    expect(body.report.totals.expenses).toBe(400);
    expect(body.report.totals.taxableIncome).toBe(600);
    expect(body.preflight.checks.length).toBeGreaterThan(0);
    expect(Array.isArray(body.remediationPrompts)).toBe(true);
  });
});

describe('integrationRoutes cloudflare proxy', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/integrations/chittyagent/cloudflare/capabilities returns capability status', async () => {
    const app = withStorage(new Hono<HonoEnv>(), {});
    app.route('/', integrationRoutes);

    const res = await app.request('/api/integrations/chittyagent/cloudflare/capabilities', {}, env as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.operations)).toBe(true);
    expect(body.operations).toContain('workers');
  });

  it('POST /api/integrations/chittyagent/cloudflare/execute validates intent and rollbackNotes', async () => {
    const app = withStorage(new Hono<HonoEnv>(), {});
    app.route('/', integrationRoutes);

    const res = await app.request('/api/integrations/chittyagent/cloudflare/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'workers', action: 'query' }),
    }, env as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('intent and rollbackNotes');
  });

  it('POST /api/integrations/chittyagent/cloudflare/execute forwards to proxy', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: 'done' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const app = withStorage(new Hono<HonoEnv>(), {});
    app.route('/', integrationRoutes);

    const res = await app.request('/api/integrations/chittyagent/cloudflare/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'workers',
        action: 'query',
        payload: { script: 'finance-worker' },
        intent: 'Check worker deployment status before cutover.',
        rollbackNotes: 'No changes applied; query-only operation.',
      }),
    }, {
      ...env,
      CHITTYAGENT_API_TOKEN: 'agent-token',
      CHITTYAGENT_API_BASE: 'https://agent.chitty.cc',
    } as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
