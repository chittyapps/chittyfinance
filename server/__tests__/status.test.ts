import { describe, it, expect } from 'vitest';

describe('worker', { timeout: 15000 }, () => {
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
