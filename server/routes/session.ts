import { Hono } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import type { HonoEnv } from '../env';
import { createDb } from '../db/connection';
import { SystemStorage } from '../storage/system';
import { SESSION_COOKIE_NAME, SESSION_TTL, parseSession } from '../lib/session';
import { verifyPassword } from '../lib/password';
import { ledgerLog } from '../lib/ledger-client';

function generateSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const sessionRoutes = new Hono<HonoEnv>();

// GET /api/session — return current user from session cookie
sessionRoutes.get('/api/session', async (c) => {
  const kv = c.env.FINANCE_KV;
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);

  if (!sessionId) {
    return c.json({ error: 'not_authenticated' }, 401);
  }

  const raw = await kv.get(`session:${sessionId}`);
  if (!raw) {
    deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
    return c.json({ error: 'session_expired' }, 401);
  }

  const sessionData = parseSession(raw);
  if (!sessionData) {
    await kv.delete(`session:${sessionId}`);
    deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
    return c.json({ error: 'session_expired' }, 401);
  }

  const db = createDb(c.env.DATABASE_URL);
  const storage = new SystemStorage(db);
  const user = await storage.getUser(sessionData.userId);

  if (!user) {
    await kv.delete(`session:${sessionId}`);
    deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
    return c.json({ error: 'user_not_found' }, 401);
  }

  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    chittyId: user.chittyId || null,
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
  const user = await storage.getUserByEmail(body.email.toLowerCase().trim());

  if (!user || !user.passwordHash) {
    return c.json({ error: 'invalid_credentials' }, 401);
  }

  if (!user.isActive) {
    return c.json({ error: 'account_disabled' }, 403);
  }

  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) {
    return c.json({ error: 'invalid_credentials' }, 401);
  }

  // Create session in KV
  const sessionId = generateSessionId();
  const kv = c.env.FINANCE_KV;
  await kv.put(`session:${sessionId}`, JSON.stringify({ userId: user.id }), {
    expirationTtl: SESSION_TTL,
  });

  setCookie(c, SESSION_COOKIE_NAME, sessionId, {
    path: '/',
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    maxAge: SESSION_TTL,
  });

  ledgerLog(c, {
    entityType: 'audit',
    entityId: user.id,
    action: 'session.login',
    metadata: { email: user.email, role: user.role },
  }, c.env);

  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    chittyId: user.chittyId || null,
  });
});

// DELETE /api/session — logout
sessionRoutes.delete('/api/session', async (c) => {
  const kv = c.env.FINANCE_KV;
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);

  if (sessionId) {
    await kv.delete(`session:${sessionId}`);
    deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
  }

  ledgerLog(c, {
    entityType: 'audit',
    action: 'session.logout',
  }, c.env);

  return c.json({ ok: true });
});
