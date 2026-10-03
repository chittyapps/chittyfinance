import type { MiddlewareHandler } from 'hono';
import type { HonoEnv } from '../env';

export const callerContext: MiddlewareHandler<HonoEnv> = async (c, next) => {
  // ChittyAuth/session auth binds userId before this middleware. Only the
  // legacy service-token lane may name a caller explicitly.
  const boundUserId = c.get('userId');
  const serviceUserId = c.get('authMethod') === 'service'
    ? c.req.header('x-chitty-user-id')
    : undefined;
  const userId = boundUserId ?? serviceUserId ?? '';

  if (!userId) {
    return c.json({
      error: 'missing_user_id',
      message: c.get('authMethod') === 'service'
        ? 'X-Chitty-User-Id header required for service-token callers'
        : 'Authenticated caller identity could not be resolved',
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
