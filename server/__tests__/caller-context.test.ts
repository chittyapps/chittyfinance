import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { callerContext } from '../middleware/caller';

function buildApp(options: { authMethod?: 'service' | 'chittyauth' | 'session'; userId?: string } = {}) {
  const app = new Hono<HonoEnv>();
  const storage = {
    getUser: vi.fn(async (id: string) => id === 'user-1' ? { id: 'user-1' } : null),
  };

  app.use('*', async (c, next) => {
    c.set('storage', storage as any);
    if (options.authMethod) c.set('authMethod', options.authMethod);
    if (options.userId) c.set('userId', options.userId);
    await next();
  });
  app.use('*', callerContext);
  app.get('/', (c) => c.json({ userId: c.get('userId') }));

  return { app, storage };
}

describe('callerContext', () => {
  it('uses an identity already bound by ChittyAuth', async () => {
    const { app, storage } = buildApp({ authMethod: 'chittyauth', userId: 'user-1' });
    const res = await app.request('/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 'user-1' });
    expect(storage.getUser).toHaveBeenCalledWith('user-1');
  });

  it('preserves X-Chitty-User-Id for the legacy service-token lane', async () => {
    const { app } = buildApp({ authMethod: 'service' });
    const res = await app.request('/', { headers: { 'X-Chitty-User-Id': 'user-1' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 'user-1' });
  });

  it('rejects generic X-User-Id impersonation', async () => {
    const { app } = buildApp({ authMethod: 'service' });
    const res = await app.request('/', { headers: { 'X-User-Id': 'user-1' } });
    expect(res.status).toBe(400);
    expect((await res.json() as any).error).toBe('missing_user_id');
  });

  it('rejects userId query-param impersonation', async () => {
    const { app } = buildApp({ authMethod: 'service' });
    const res = await app.request('/?userId=user-1');
    expect(res.status).toBe(400);
    expect((await res.json() as any).error).toBe('missing_user_id');
  });
});
