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

  c.set('authMethod', 'service');
  await next();
};

async function resolveChittyAuthBearer(c: Parameters<MiddlewareHandler<HonoEnv>>[0], token: string) {
  const claims = await verifyChittyAuthJWT(token, c.env);
  if (!claims) return null;

  const storage = c.get('storage');
  const user = await storage.getUserByChittyId(claims.sub);
  if (!user) return null;

  c.set('userId', user.id);
  c.set('authMethod', 'chittyauth');
  return user;
}

/**
 * Hybrid auth:
 * - Path 1a: service Bearer token → service-to-service compatibility
 * - Path 1b: ChittyAuth Bearer JWT → cryptographically bound end-user/agent caller
 * - Path 2a: ChittyAuth JWT cookie → browser session
 * - Path 2b: KV cookie → legacy browser session
 *
 * Cross-channel agent clients should use Path 1b so the actor comes from the
 * signed ChittyAuth `sub` claim rather than a caller-supplied user header.
 */
export const hybridAuth: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const auth = c.req.header('authorization') ?? '';
  const bearerToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (bearerToken) {
    const expected = c.env.CHITTY_AUTH_SERVICE_TOKEN;

    // Preserve the existing internal service-token lane.
    if (expected && await tokenEqual(bearerToken, expected)) {
      c.set('authMethod', 'service');
      await next();
      return;
    }

    // Otherwise treat the bearer as a ChittyAuth JWT. This binds the actor to
    // a verified `sub` claim and removes the need for X-Chitty-User-Id.
    const user = await resolveChittyAuthBearer(c, bearerToken);
    if (!user) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    await next();
    return;
  }

  const cookieValue = getCookie(c, SESSION_COOKIE_NAME);
  if (!cookieValue) {
    return c.json({ error: 'not_authenticated', message: 'Bearer token or session cookie required' }, 401);
  }

  if (isJwtSession(cookieValue)) {
    const token = extractJwtFromCookie(cookieValue);
    const user = await resolveChittyAuthBearer(c, token);
    if (!user) {
      deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
      return c.json({ error: 'session_expired' }, 401);
    }

    await next();
    return;
  }

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
  c.set('authMethod', 'session');
  await next();
};
