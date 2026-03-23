import { Hono } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import type { HonoEnv } from '../env';
import { createDb } from '../db/connection';
import { SystemStorage } from '../storage/system';

const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days
const COOKIE_NAME = 'cf_session';

function generateSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

export const sessionRoutes = new Hono<HonoEnv>();

// GET /api/session — return current user from session cookie
sessionRoutes.get('/api/session', async (c) => {
  const kv = c.env.FINANCE_KV;
  const sessionId = getCookie(c, COOKIE_NAME);

  if (!sessionId) {
    return c.json({ error: 'not_authenticated' }, 401);
  }

  const raw = await kv.get(`session:${sessionId}`);
  if (!raw) {
    deleteCookie(c, COOKIE_NAME, { path: '/' });
    return c.json({ error: 'session_expired' }, 401);
  }
  const sessionData = JSON.parse(raw) as { userId: string };

  const db = createDb(c.env.DATABASE_URL);
  const storage = new SystemStorage(db);
  const user = await storage.getUser(sessionData.userId);

  if (!user) {
    await kv.delete(`session:${sessionId}`);
    deleteCookie(c, COOKIE_NAME, { path: '/' });
    return c.json({ error: 'user_not_found' }, 401);
  }

  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
});

// POST /api/session — login with email + password
sessionRoutes.post('/api/session', async (c) => {
  const body = await c.req.json<{ email: string; password: string }>().catch(() => null);
  if (!body?.email || !body?.password) {
    return c.json({ error: 'missing_credentials' }, 400);
  }

  const db = createDb(c.env.DATABASE_URL);
  const storage = new SystemStorage(db);
  const user = await storage.getUserByEmail(body.email);

  if (!user || !user.passwordHash) {
    return c.json({ error: 'invalid_credentials' }, 401);
  }

  const hash = await hashPassword(body.password);
  if (hash !== user.passwordHash) {
    return c.json({ error: 'invalid_credentials' }, 401);
  }

  // Create session in KV
  const sessionId = generateSessionId();
  const kv = c.env.FINANCE_KV;
  await kv.put(`session:${sessionId}`, JSON.stringify({ userId: user.id }), {
    expirationTtl: SESSION_TTL,
  });

  const isProduction = c.env.NODE_ENV === 'production';
  setCookie(c, COOKIE_NAME, sessionId, {
    path: '/',
    httpOnly: true,
    secure: isProduction,
    sameSite: 'Lax',
    maxAge: SESSION_TTL,
  });

  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
});

// DELETE /api/session — logout
sessionRoutes.delete('/api/session', async (c) => {
  const kv = c.env.FINANCE_KV;
  const sessionId = getCookie(c, COOKIE_NAME);

  if (sessionId) {
    await kv.delete(`session:${sessionId}`);
    deleteCookie(c, COOKIE_NAME, { path: '/' });
  }

  return c.json({ ok: true });
});
