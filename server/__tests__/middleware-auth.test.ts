import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { serviceAuth } from '../middleware/auth';

describe('serviceAuth middleware', () => {
  function buildApp() {
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
    const app = buildApp();
    const res = await app.request('/api/test', {}, env);
    expect(res.status).toBe(401);
  });

  it('rejects requests with wrong token', async () => {
    const app = buildApp();
    const res = await app.request('/api/test', {
      headers: { Authorization: 'Bearer wrong-token' },
    }, env);
    expect(res.status).toBe(401);
  });

  it('allows requests with correct token', async () => {
    const app = buildApp();
    const res = await app.request('/api/test', {
      headers: { Authorization: 'Bearer test-token-123' },
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
