import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { tenantMiddleware } from '../middleware/tenant';

describe('tenantMiddleware', () => {
  function buildApp() {
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
});
