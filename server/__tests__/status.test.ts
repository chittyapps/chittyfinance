import { describe, it, expect } from 'vitest'
import defaultWorker from '../worker'

// Basic smoke test for status endpoint handler
describe('worker status', () => {
  it('returns status JSON on /api/v1/status', async () => {
    const env: any = {
      MODE: 'system',
      NODE_ENV: 'test',
      APP_VERSION: '0.0.0-test',
      ASSETS: { fetch: async () => new Response('Not Found', { status: 404 }) },
      CF_AGENT: {
        idFromName: () => ({}),
        get: () => ({ fetch: async () => new Response('ok') }),
      },
    };
    const req = new Request('http://localhost/api/v1/status');
    const res = await (defaultWorker as any).fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('name');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('mode');
  });
});

