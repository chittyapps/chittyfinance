import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { chargeRoutes } from '../routes/charges';

const baseEnv = {
  CHITTY_AUTH_SERVICE_TOKEN: 'svc-token',
  DATABASE_URL: 'fake',
  FINANCE_KV: {} as any,
  FINANCE_R2: {} as any,
  ASSETS: {} as any,
};

function buildApp(mockStorage: Record<string, any>) {
  const app = new Hono<HonoEnv>();
  app.use('*', async (c, next) => {
    c.set('tenantId', 'tenant-1');
    c.set('storage', mockStorage as any);
    await next();
  });
  app.route('/', chargeRoutes);
  return app;
}

describe('GET /api/charges/recurring', () => {
  it('returns empty array when there are no integrations', async () => {
    const mockStorage = { getIntegrations: vi.fn().mockResolvedValue([]) };
    const app = buildApp(mockStorage);
    const res = await app.request('/api/charges/recurring', {}, baseEnv);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it('returns empty array when all integrations are disconnected', async () => {
    const mockStorage = {
      getIntegrations: vi.fn().mockResolvedValue([
        { id: 'i1', serviceType: 'wavapps', connected: false, credentials: {} },
        { id: 'i2', serviceType: 'stripe', connected: false, credentials: {} },
      ]),
    };
    const app = buildApp(mockStorage);
    const res = await app.request('/api/charges/recurring', {}, baseEnv);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(0);
  });

  it('returns empty array even with connected integrations (stub implementation)', async () => {
    const mockStorage = {
      getIntegrations: vi.fn().mockResolvedValue([
        { id: 'i1', serviceType: 'stripe', connected: true, credentials: { secret_key: 'sk_test_xxx' } },
        { id: 'i2', serviceType: 'wavapps', connected: true, credentials: { access_token: 'tok' } },
      ]),
    };
    const app = buildApp(mockStorage);
    const res = await app.request('/api/charges/recurring', {}, baseEnv);
    expect(res.status).toBe(200);
    const body = await res.json();
    // fetchChargesFromIntegration is a stub returning [] for all services
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it('calls storage.getIntegrations with the tenant id', async () => {
    const getIntegrations = vi.fn().mockResolvedValue([]);
    const app = buildApp({ getIntegrations });
    await app.request('/api/charges/recurring', {}, baseEnv);
    expect(getIntegrations).toHaveBeenCalledWith('tenant-1');
  });
});

describe('GET /api/charges/optimizations', () => {
  it('returns empty array when there are no integrations', async () => {
    const mockStorage = { getIntegrations: vi.fn().mockResolvedValue([]) };
    const app = buildApp(mockStorage);
    const res = await app.request('/api/charges/optimizations', {}, baseEnv);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it('returns empty array when integrations are disconnected', async () => {
    const mockStorage = {
      getIntegrations: vi.fn().mockResolvedValue([
        { id: 'i1', serviceType: 'stripe', connected: false, credentials: {} },
      ]),
    };
    const app = buildApp(mockStorage);
    const res = await app.request('/api/charges/optimizations', {}, baseEnv);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(0);
  });

  it('returns an array (stub charges = no recommendations)', async () => {
    const mockStorage = {
      getIntegrations: vi.fn().mockResolvedValue([
        { id: 'i1', serviceType: 'stripe', connected: true, credentials: {} },
      ]),
    };
    const app = buildApp(mockStorage);
    const res = await app.request('/api/charges/optimizations', {}, baseEnv);
    expect(res.status).toBe(200);
    const body = await res.json();
    // No real charges fetched because integration fetch is a stub
    expect(Array.isArray(body)).toBe(true);
  });

  it('calls storage.getIntegrations with the tenant id', async () => {
    const getIntegrations = vi.fn().mockResolvedValue([]);
    const app = buildApp({ getIntegrations });
    await app.request('/api/charges/optimizations', {}, baseEnv);
    expect(getIntegrations).toHaveBeenCalledWith('tenant-1');
  });
});

describe('POST /api/charges/manage', () => {
  it('returns 400 when chargeId is missing', async () => {
    const app = buildApp({ getIntegrations: vi.fn().mockResolvedValue([]) });
    const res = await app.request('/api/charges/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    }, baseEnv);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('returns 400 when action is missing', async () => {
    const app = buildApp({ getIntegrations: vi.fn().mockResolvedValue([]) });
    const res = await app.request('/api/charges/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chargeId: 'charge-123' }),
    }, baseEnv);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('returns 400 when both chargeId and action are missing', async () => {
    const app = buildApp({ getIntegrations: vi.fn().mockResolvedValue([]) });
    const res = await app.request('/api/charges/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, baseEnv);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid action value', async () => {
    const app = buildApp({ getIntegrations: vi.fn().mockResolvedValue([]) });
    const res = await app.request('/api/charges/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chargeId: 'charge-123', action: 'delete' }),
    }, baseEnv);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("'cancel' or 'modify'");
  });

  it('returns 400 for negotiate action (not a valid action)', async () => {
    const app = buildApp({ getIntegrations: vi.fn().mockResolvedValue([]) });
    const res = await app.request('/api/charges/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chargeId: 'charge-123', action: 'negotiate' }),
    }, baseEnv);
    expect(res.status).toBe(400);
  });

  it('returns 200 with success:false for cancel action', async () => {
    const app = buildApp({ getIntegrations: vi.fn().mockResolvedValue([]) });
    const res = await app.request('/api/charges/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chargeId: 'charge-123', action: 'cancel' }),
    }, baseEnv);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain('cancel');
  });

  it('returns 200 with success:false for modify action', async () => {
    const app = buildApp({ getIntegrations: vi.fn().mockResolvedValue([]) });
    const res = await app.request('/api/charges/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chargeId: 'charge-456', action: 'modify' }),
    }, baseEnv);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain('modify');
  });

  it('indicates the feature is not yet implemented', async () => {
    const app = buildApp({ getIntegrations: vi.fn().mockResolvedValue([]) });
    const res = await app.request('/api/charges/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chargeId: 'charge-789', action: 'cancel' }),
    }, baseEnv);
    const body = await res.json();
    expect(body.message.toLowerCase()).toContain('not yet implemented');
  });
});