import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { healthRoutes } from '../routes/health';

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

  function buildApp() {
    const app = new Hono<HonoEnv>();
    app.route('/', healthRoutes);
    return app;
  }

  it('GET /health returns {"status":"ok"}', async () => {
    const app = buildApp();
    const res = await app.request('/health', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('chittyfinance');
  });

  it('GET /api/v1/status returns service info', async () => {
    const app = buildApp();
    const res = await app.request('/api/v1/status', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('ChittyFinance');
    expect(body.mode).toBe('system');
    expect(body.version).toBe('2.0.0-test');
  });

  it('GET /api/v1/metrics returns prometheus format', async () => {
    const app = buildApp();
    const res = await app.request('/api/v1/metrics', {}, env);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('service_database_configured 1');
  });
});
