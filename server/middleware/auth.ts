import type { MiddlewareHandler } from 'hono';
import { getCookie, deleteCookie } from 'hono/cookie';
import type { HonoEnv } from '../env';
import { SESSION_COOKIE_NAME, parseSession, isJwtSession, extractJwtFromCookie } from '../lib/session';
import { tokenEqual } from '../lib/password';
import { verifyChittyAuthJWT } from '../lib/jwt-auth';

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

  if (!token || !(await tokenEqual(token, expected))) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  await next();
};

/**
 * Hybrid auth: accepts either a service Bearer token OR a browser session cookie.
 * - Path 1: Bearer token → service-to-service (userId from X-Chitty-User-Id header)
 * - Path 2a: JWT cookie (jwt: prefix) → verify via ChittyAuth JWKS, resolve chittyId → userId
 * - Path 2b: KV cookie (plain hex) → legacy KV session lookup
 */
export const hybridAuth: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const auth = c.req.header('authorization') ?? '';
  const bearerToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  // Path 1: Service token auth (constant-time comparison)
  if (bearerToken) {
    const expected = c.env.CHITTY_AUTH_SERVICE_TOKEN;
    if (!expected || !(await tokenEqual(bearerToken, expected))) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    await next();
    return;
  }

  // Path 2: Session cookie auth
  const cookieValue = getCookie(c, SESSION_COOKIE_NAME);
  if (!cookieValue) {
    return c.json({ error: 'not_authenticated', message: 'Bearer token or session cookie required' }, 401);
  }

  // Path 2a: JWT session (ChittyAuth-issued token)
  if (isJwtSession(cookieValue)) {
    const token = extractJwtFromCookie(cookieValue);
    const claims = await verifyChittyAuthJWT(token, c.env);
    if (!claims) {
      deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
      return c.json({ error: 'session_expired' }, 401);
    }

    // Resolve ChittyID → local user
    const storage = c.get('storage');
    const user = await storage.getUserByChittyId(claims.sub);
    if (!user) {
      deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
      return c.json({ error: 'user_not_found', message: 'No local account linked to this ChittyID' }, 401);
    }

    c.set('userId', user.id);
    await next();
    return;
  }

  // Path 2b: KV session (legacy or password-login)
  const kv = c.env.FINANCE_KV;
  const raw = await kv.get(`session:${cookieValue}`);
  if (!raw) {
    deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
    return c.json({ error: 'session_expired' }, 401);
  }

  const sessionData = parseSession(raw);
  if (!sessionData) {
    await kv.delete(`session:${cookieValue}`);
    deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
    return c.json({ error: 'session_expired' }, 401);
  }

  c.set('userId', sessionData.userId);
  await next();
};
