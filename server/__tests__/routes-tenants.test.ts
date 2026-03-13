import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { tenantRoutes } from '../routes/tenants';

describe('tenantRoutes', () => {
  const env = {
    CHITTY_AUTH_SERVICE_TOKEN: 'test-token',
    DATABASE_URL: 'fake',
    FINANCE_KV: {} as any,
    FINANCE_R2: {} as any,
    ASSETS: {} as any,
    CF_AGENT: {} as any,
  };

  function buildApp(storageOverrides?: {
    getUserTenants?: (userId: string) => Promise<Array<{ tenant: Record<string, unknown>; role: string }>>;
    getTenant?: (tenantId: string) => Promise<Record<string, unknown> | undefined>;
  }) {
    const storage = {
      getUserTenants: storageOverrides?.getUserTenants ?? vi.fn().mockResolvedValue([]),
      getTenant: storageOverrides?.getTenant ?? vi.fn().mockResolvedValue(undefined),
    };

    const app = new Hono<HonoEnv>();
    app.use('/api/tenants/*', async (c, next) => {
      c.set('storage', storage as any);
      c.set('userId', 'user-123');
      await next();
    });
    app.use('/api/tenants', async (c, next) => {
      c.set('storage', storage as any);
      c.set('userId', 'user-123');
      await next();
    });
    app.route('/', tenantRoutes);

    return { app, storage };
  }

  it('lists only the caller memberships and flattens the role onto each tenant', async () => {
    const memberships = [
      {
        tenant: { id: 'tenant-1', name: 'Alpha Holdings', slug: 'alpha' },
        role: 'owner',
      },
      {
        tenant: { id: 'tenant-2', name: 'Beta Ops', slug: 'beta' },
        role: 'accountant',
      },
    ];
    const { app, storage } = buildApp({
      getUserTenants: vi.fn().mockResolvedValue(memberships),
    });

    const res = await app.request('/api/tenants', {}, env);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([
      { id: 'tenant-1', name: 'Alpha Holdings', slug: 'alpha', role: 'owner' },
      { id: 'tenant-2', name: 'Beta Ops', slug: 'beta', role: 'accountant' },
    ]);
    expect(storage.getUserTenants).toHaveBeenCalledWith('user-123');
  });

  it('returns the tenant detail when the caller is a member', async () => {
    const { app, storage } = buildApp({
      getUserTenants: vi.fn().mockResolvedValue([
        { tenant: { id: 'tenant-1', slug: 'alpha' }, role: 'owner' },
      ]),
      getTenant: vi.fn().mockResolvedValue({
        id: 'tenant-1',
        slug: 'alpha',
        name: 'Alpha Holdings',
      }),
    });

    const res = await app.request('/api/tenants/tenant-1', {}, env);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      id: 'tenant-1',
      slug: 'alpha',
      name: 'Alpha Holdings',
      role: 'owner',
    });
    expect(storage.getTenant).toHaveBeenCalledWith('tenant-1');
  });

  it('returns 404 when the caller is not a member of the requested tenant', async () => {
    const { app, storage } = buildApp({
      getUserTenants: vi.fn().mockResolvedValue([
        { tenant: { id: 'tenant-2' }, role: 'accountant' },
      ]),
    });

    const res = await app.request('/api/tenants/tenant-1', {}, env);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Tenant not found' });
    expect(storage.getTenant).not.toHaveBeenCalled();
  });
});
