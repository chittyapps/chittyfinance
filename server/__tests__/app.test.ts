import { describe, it, expect } from 'vitest';
import { createApp } from '../app';

describe('createApp', () => {
  const env = {
    CHITTY_AUTH_SERVICE_TOKEN: 'test-svc-token',
    DATABASE_URL: 'postgresql://fake:fake@localhost/fake',
    MODE: 'system',
    NODE_ENV: 'test',
    APP_VERSION: '2.0.0',
    FINANCE_KV: {} as any,
    FINANCE_R2: {} as any,
    ASSETS: { fetch: async () => new Response('Not Found', { status: 404 }) } as any,
    CF_AGENT: {
      idFromName: () => ({}),
      get: () => ({ fetch: async () => new Response('agent ok') }),
    } as any,
  };

  it('exports createApp function', () => {
    expect(typeof createApp).toBe('function');
  });

  it('responds to /health without auth', async () => {
    const app = createApp();
    const res = await app.request('/health', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('responds to /api/v1/status without auth', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/status', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('ChittyFinance');
  });

  it('serves /mcp/manifest without auth while leaving execution protected', async () => {
    const app = createApp();
    const manifestRes = await app.request('/mcp/manifest', {}, env);
    expect(manifestRes.status).toBe(200);
    const manifest = await manifestRes.json() as any;
    expect(manifest.domain).toBe('finance.chitty.cc');
    expect(manifest.tools.map((tool: any) => tool.name)).toContain('compare-rei-hub-snapshot');

    const executeRes = await app.request('/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }, env);
    expect(executeRes.status).toBe(401);
  });

  it('rejects /api/accounts without auth', async () => {
    const app = createApp();
    const res = await app.request('/api/accounts', {}, env);
    expect(res.status).toBe(401);
  });

  it('rejects /api/accounts with auth but no tenant', async () => {
    const app = createApp();
    const res = await app.request('/api/accounts', {
      headers: { Authorization: 'Bearer test-svc-token' },
    }, env);
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown routes', async () => {
    const app = createApp();
    const res = await app.request('/nonexistent', {}, env);
    expect(res.status).toBe(404);
  });
});
