import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { tenantMiddleware } from '../middleware/tenant';

describe('tenantMiddleware', () => {
  function buildApp(options?: {
    userId?: string;
    storage?: {
      getUserTenants?: (userId: string) => Promise<Array<{ tenant: { id: string } }>>;
    };
  }) {
    const app = new Hono<HonoEnv>();
    app.use('/api/*', async (c, next) => {
      if (options?.userId) {
        c.set('userId', options.userId);
      }
      if (options?.storage) {
        c.set('storage', options.storage as any);
      }
      await next();
    });
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
    const app = buildApp();
    const res = await app.request('/api/test', {
      headers: { 'X-Tenant-ID': 'tenant-abc' },
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantId).toBe('tenant-abc');
  });

  it('reads tenant from ?tenantId query param', async () => {
    const app = buildApp();
    const res = await app.request('/api/test?tenantId=tenant-xyz', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantId).toBe('tenant-xyz');
  });

  it('returns 400 when no tenant provided', async () => {
    const app = buildApp();
    const res = await app.request('/api/test', {}, env);
    expect(res.status).toBe(400);
  });

  it('allows the request when the caller belongs to the tenant', async () => {
    const getUserTenants = vi.fn().mockResolvedValue([
      { tenant: { id: 'tenant-abc' } },
      { tenant: { id: 'tenant-other' } },
    ]);
    const app = buildApp({
      userId: 'user-123',
      storage: { getUserTenants },
    });

    const res = await app.request('/api/test', {
      headers: { 'X-Tenant-ID': 'tenant-abc' },
    }, env);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ tenantId: 'tenant-abc' });
    expect(getUserTenants).toHaveBeenCalledWith('user-123');
  });

  it('returns 403 when the caller does not belong to the tenant', async () => {
    const app = buildApp({
      userId: 'user-123',
      storage: {
        getUserTenants: vi.fn().mockResolvedValue([{ tenant: { id: 'tenant-other' } }]),
      },
    });

    const res = await app.request('/api/test', {
      headers: { 'X-Tenant-ID': 'tenant-abc' },
    }, env);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: 'forbidden',
    });
  });
});
