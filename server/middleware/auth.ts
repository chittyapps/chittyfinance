import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { HonoEnv } from '../env';

const COOKIE_NAME = 'cf_session';

/**
 * Service-to-service auth via Bearer token.
 * Used by external services calling the ChittyFinance API.
 */
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

/**
 * Hybrid auth: accepts either a service Bearer token OR a browser session cookie.
 * - Bearer token: sets userId from X-Chitty-User-Id header (service-to-service)
 * - Session cookie: resolves userId from KV session (browser client)
 */
export const hybridAuth: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const auth = c.req.header('authorization') ?? '';
  const bearerToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  // Path 1: Service token auth
  if (bearerToken) {
    const expected = c.env.CHITTY_AUTH_SERVICE_TOKEN;
    if (!expected || bearerToken !== expected) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    // Service callers provide userId via header
    await next();
    return;
  }

  // Path 2: Session cookie auth
  const sessionId = getCookie(c, COOKIE_NAME);
  if (!sessionId) {
    return c.json({ error: 'not_authenticated', message: 'Bearer token or session cookie required' }, 401);
  }

  const kv = c.env.FINANCE_KV;
  const raw = await kv.get(`session:${sessionId}`);
  if (!raw) {
    return c.json({ error: 'session_expired' }, 401);
  }

  const sessionData = JSON.parse(raw) as { userId: string };
  // Set userId from session — callerContext will use this
  c.req.raw.headers.set('x-chitty-user-id', sessionData.userId);
  await next();
};
