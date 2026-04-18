import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import type { HonoEnv } from '../env';
import { createDb } from '../db/connection';
import { SystemStorage } from '../storage/system';
import { SESSION_COOKIE_NAME, JWT_COOKIE_PREFIX } from '../lib/session';
import { generateOAuthState, validateOAuthState } from '../lib/oauth-state-edge';

const CHITTYAUTH_BASE = 'https://auth.chitty.cc';

/** Generate PKCE code_verifier + code_challenge (S256) */
async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const verifier = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { verifier, challenge };
}

export const chittyIdAuthRoutes = new Hono<HonoEnv>();

// GET /api/auth/chittyid/authorize — start OAuth flow
chittyIdAuthRoutes.get('/api/auth/chittyid/authorize', async (c) => {
  const clientId = c.env.CHITTYAUTH_CLIENT_ID;
  const stateSecret = c.env.OAUTH_STATE_SECRET;

  if (!clientId || !stateSecret) {
    return c.json({ error: 'ChittyID SSO not configured' }, 503);
  }

  const baseUrl = c.env.PUBLIC_APP_BASE_URL || new URL(c.req.url).origin;
  const redirectUri = `${baseUrl}/api/auth/chittyid/callback`;

  // Generate PKCE pair and state token
  const { verifier, challenge } = await generatePKCE();
  const state = await generateOAuthState('chittyid-login', stateSecret);

  // Store verifier in KV (keyed by state) for callback retrieval
  const kv = c.env.FINANCE_KV;
  await kv.put(`pkce:${state}`, verifier, { expirationTtl: 600 }); // 10 min TTL

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    scope: 'chittyid:read',
  });

  return c.redirect(`${CHITTYAUTH_BASE}/v1/oauth/authorize?${params}`);
});

// GET /api/auth/chittyid/callback — handle OAuth callback
chittyIdAuthRoutes.get('/api/auth/chittyid/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  if (error) {
    return c.redirect(`/login?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return c.redirect('/login?error=missing_params');
  }

  const stateSecret = c.env.OAUTH_STATE_SECRET;
  if (!stateSecret) {
    return c.redirect('/login?error=server_config');
  }

  // Validate CSRF state token
  const stateData = await validateOAuthState(state, stateSecret);
  if (!stateData) {
    return c.redirect('/login?error=invalid_state');
  }

  // Retrieve PKCE verifier
  const kv = c.env.FINANCE_KV;
  const verifier = await kv.get(`pkce:${state}`);
  await kv.delete(`pkce:${state}`);
  if (!verifier) {
    return c.redirect('/login?error=expired_session');
  }

  const clientId = c.env.CHITTYAUTH_CLIENT_ID!;
  const clientSecret = c.env.CHITTYAUTH_CLIENT_SECRET;
  const baseUrl = c.env.PUBLIC_APP_BASE_URL || new URL(c.req.url).origin;
  const redirectUri = `${baseUrl}/api/auth/chittyid/callback`;

  // Exchange code for tokens
  const tokenBody: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
  };
  if (clientSecret) {
    tokenBody.client_secret = clientSecret;
  }

  let tokenData: { access_token?: string; token_type?: string; error?: string; sub?: string; chitty_id?: string; email?: string };
  try {
    const tokenRes = await fetch(`${CHITTYAUTH_BASE}/v1/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(tokenBody),
    });
    tokenData = await tokenRes.json() as typeof tokenData;
    if (!tokenRes.ok || tokenData.error) {
      console.error('[chittyid-auth] Token exchange failed:', tokenData);
      return c.redirect(`/login?error=token_exchange`);
    }
  } catch (err) {
    console.error('[chittyid-auth] Token exchange error:', err);
    return c.redirect('/login?error=auth_unavailable');
  }

  // Extract identity from token response
  const chittyId = tokenData.chitty_id || tokenData.sub;
  const email = tokenData.email;

  if (!chittyId) {
    console.error('[chittyid-auth] No chitty_id in token response');
    return c.redirect('/login?error=no_identity');
  }

  // Resolve or provision local user
  const db = createDb(c.env.DATABASE_URL);
  const storage = new SystemStorage(db);

  // 1. Look up by ChittyID
  let user = await storage.getUserByChittyId(chittyId);

  // 2. Fall back to email match + link ChittyID
  if (!user && email) {
    user = await storage.getUserByEmail(email.toLowerCase());
    if (user && !user.chittyId) {
      await storage.linkChittyId(user.id, chittyId);
    }
  }

  if (!user) {
    return c.redirect('/login?error=no_account');
  }

  if (!user.isActive) {
    return c.redirect('/login?error=account_disabled');
  }

  // Set JWT cookie (the ChittyAuth access_token is the JWT)
  const jwtToken = tokenData.access_token;
  if (!jwtToken) {
    console.error('[chittyid-auth] No access_token in token response');
    return c.redirect('/login?error=no_token');
  }

  // Derive maxAge from JWT exp claim (local decode, no verification needed here)
  let maxAge = 60 * 60 * 24 * 7; // default 7 days
  try {
    const [, payloadB64] = jwtToken.split('.');
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp) {
      maxAge = Math.max(payload.exp - Math.floor(Date.now() / 1000), 300);
    }
  } catch { /* use default maxAge */ }

  setCookie(c, SESSION_COOKIE_NAME, `${JWT_COOKIE_PREFIX}${jwtToken}`, {
    path: '/',
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    maxAge,
  });

  return c.redirect('/');
});
