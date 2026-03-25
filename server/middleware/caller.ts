import type { MiddlewareHandler } from 'hono';
import type { HonoEnv } from '../env';

export const callerContext: MiddlewareHandler<HonoEnv> = async (c, next) => {
  // Session auth sets userId via c.set(); service callers pass it as a header
  const userId =
    c.get('userId') ??
    c.req.header('x-chitty-user-id') ??
    c.req.header('x-user-id') ??
    c.req.query('userId') ??
    '';

  if (!userId) {
    return c.json({
      error: 'missing_user_id',
      message: 'X-Chitty-User-Id header or userId query param required',
    }, 400);
  }

  const storage = c.get('storage');
  const user = await storage.getUser(userId);

  if (!user) {
    return c.json({ error: 'user_not_found' }, 404);
  }

  c.set('userId', user.id);
  await next();
};
