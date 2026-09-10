import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { tenantMiddleware } from '../middleware/tenant';

const TENANT = 'tenant-a';
const OTHER = 'tenant-b';
const USER = 'user-1';

function buildApp(opts: { storage?: unknown; userId?: string | undefined }) {
  const app = new Hono<HonoEnv>();
  app.use('*', async (c, next) => {
    if (opts.storage !== undefined) c.set('storage', opts.storage as any);
    if (opts.userId !== undefined) c.set('userId', opts.userId);
    await next();
  });
  app.use('*', tenantMiddleware);
  app.get('/probe', (c) => c.json({ tenantId: c.get('tenantId') }));
  return app;
}

const memberOf = (...ids: string[]) => ({
  getUserTenants: vi.fn().mockResolvedValue(ids.map((id) => ({ tenant: { id } }))),
});

describe('tenantMiddleware', () => {
  it('requires a tenant id', async () => {
    const res = await buildApp({ storage: memberOf(TENANT), userId: USER }).request('/probe');
    expect(res.status).toBe(400);
  });

  it('accepts a tenant the caller belongs to', async () => {
    const app = buildApp({ storage: memberOf(TENANT), userId: USER });
    const res = await app.request('/probe', { headers: { 'x-tenant-id': TENANT } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tenantId: TENANT });
  });

  it('rejects a tenant the caller does not belong to', async () => {
    const app = buildApp({ storage: memberOf(TENANT), userId: USER });
    const res = await app.request('/probe', { headers: { 'x-tenant-id': OTHER } });
    expect(res.status).toBe(403);
  });

  it('checks membership for a tenant supplied via query string too', async () => {
    // The query fallback is a legitimate input path, so it must be subject to
    // the same membership check as the header -- not a way around it.
    const app = buildApp({ storage: memberOf(TENANT), userId: USER });
    expect((await app.request(`/probe?tenantId=${OTHER}`)).status).toBe(403);
    expect((await app.request(`/probe?tenantId=${TENANT}`)).status).toBe(200);
  });

  describe('fails closed when membership cannot be verified', () => {
    it('refuses when storage is absent', async () => {
      const app = buildApp({ userId: USER });
      const res = await app.request('/probe', { headers: { 'x-tenant-id': OTHER } });
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe('tenant_check_unavailable');
    });

    it('refuses when no caller has been resolved', async () => {
      const app = buildApp({ storage: memberOf(TENANT) });
      const res = await app.request('/probe', { headers: { 'x-tenant-id': OTHER } });
      expect(res.status).toBe(500);
    });

    it('refuses when the storage implementation cannot answer', async () => {
      const app = buildApp({ storage: {}, userId: USER });
      const res = await app.request('/probe', { headers: { 'x-tenant-id': OTHER } });
      expect(res.status).toBe(500);
    });

    it('never sets tenantId on any of those paths', async () => {
      for (const opts of [{ userId: USER }, { storage: memberOf(TENANT) }, { storage: {}, userId: USER }]) {
        const res = await buildApp(opts).request('/probe', { headers: { 'x-tenant-id': OTHER } });
        // the probe handler is never reached, so no tenant is echoed back
        expect(await res.text()).not.toContain(OTHER);
      }
    });
  });
});
