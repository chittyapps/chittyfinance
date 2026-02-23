import type { MiddlewareHandler } from 'hono';
import type { HonoEnv } from '../env';

export const serviceAuth: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const expected = c.env.CHITTY_AUTH_SERVICE_TOKEN;
  if (!expected) {
    return c.json({ error: 'auth_not_configured' }, 500);
  }

  const auth = c.req.header('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!token || token !== expected) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  await next();
};
