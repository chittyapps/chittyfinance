import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { callerContext } from '../middleware/caller';

describe('callerContext middleware', () => {
  const env = {
    CHITTY_AUTH_SERVICE_TOKEN: 'test-token',
    DATABASE_URL: 'fake',
    FINANCE_KV: {} as any,
    FINANCE_R2: {} as any,
    ASSETS: {} as any,
    CF_AGENT: {} as any,
  };

  function buildApp(getUser = vi.fn()) {
    const storage = { getUser };
    const app = new Hono<HonoEnv>();

    app.use('/api/*', async (c, next) => {
      c.set('storage', storage as any);
      c.set('authMethod', 'service');
      await next();
    });
    app.use('/api/*', callerContext);
    app.get('/api/test', (c) => c.json({ userId: c.get('userId') }));

    return { app, getUser };
  }

  it('returns 400 when no caller header is provided', async () => {
    const { app } = buildApp();
    const res = await app.request('/api/test', {}, env);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: 'missing_user_id',
    });
  });

  it('returns 404 when the service caller is not found', async () => {
    const getUser = vi.fn().mockResolvedValue(undefined);
    const { app } = buildApp(getUser);
    const res = await app.request('/api/test', {
      headers: { 'X-Chitty-User-Id': 'user-404' },
    }, env);

    expect(res.status).toBe(404);
    expect(getUser).toHaveBeenCalledWith('user-404');
  });

  it('rejects the generic x-user-id impersonation header', async () => {
    const { app, getUser } = buildApp(vi.fn().mockResolvedValue({ id: 'user-123' }));
    const res = await app.request('/api/test', {
      headers: { 'X-User-Id': 'user-123' },
    }, env);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: 'missing_user_id',
    });
    expect(getUser).not.toHaveBeenCalled();
  });
});
