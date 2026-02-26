import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { WaveAPIClient } from '../lib/wave-api';
import { generateOAuthState, validateOAuthState } from '../lib/oauth-state-edge';
import { createDb } from '../db/connection';
import { SystemStorage } from '../storage/system';

export const waveRoutes = new Hono<HonoEnv>();

// Public callback route — mounted before protected middleware in app.ts
export const waveCallbackRoute = new Hono<HonoEnv>();

function waveClient(env: { WAVE_CLIENT_ID?: string; WAVE_CLIENT_SECRET?: string; PUBLIC_APP_BASE_URL?: string }) {
  return new WaveAPIClient({
    clientId: env.WAVE_CLIENT_ID || '',
    clientSecret: env.WAVE_CLIENT_SECRET || '',
    redirectUri: `${env.PUBLIC_APP_BASE_URL || 'https://finance.chitty.cc'}/api/integrations/wave/callback`,
  });
}

// GET /api/integrations/wave/authorize — start OAuth flow (protected)
waveRoutes.get('/api/integrations/wave/authorize', async (c) => {
  if (!c.env.WAVE_CLIENT_ID || !c.env.WAVE_CLIENT_SECRET) {
    return c.json({ error: 'Wave integration not configured' }, 503);
  }

  const secret = c.env.OAUTH_STATE_SECRET || 'default-secret-change-in-production';
  // Encode tenantId in state so the callback can recover it without auth
  const tenantId = c.get('tenantId') || 'anonymous';
  const state = await generateOAuthState(tenantId, secret);
  const client = waveClient(c.env);
  const authUrl = client.getAuthorizationUrl(state);

  return c.json({ authUrl });
});

// GET /api/integrations/wave/callback — OAuth callback (PUBLIC, no auth required)
// Wave redirects here after user grants access. tenantId is recovered from the state token.
waveCallbackRoute.get('/api/integrations/wave/callback', async (c) => {
  const baseUrl = c.env.PUBLIC_APP_BASE_URL || 'https://finance.chitty.cc';
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  if (error) {
    return c.redirect(`${baseUrl}/connections?wave=error&reason=${error}`);
  }

  if (!code || !state) {
    return c.redirect(`${baseUrl}/connections?wave=error&reason=missing_params`);
  }

  const secret = c.env.OAUTH_STATE_SECRET || 'default-secret-change-in-production';
  const stateData = await validateOAuthState(state, secret);
  if (!stateData) {
    return c.redirect(`${baseUrl}/connections?wave=error&reason=invalid_state`);
  }

  try {
    const client = waveClient(c.env);
    const tokens = await client.exchangeCodeForToken(code);
    client.setAccessToken(tokens.access_token);

    const businesses = await client.getBusinesses();
    if (businesses.length === 0) {
      return c.redirect(`${baseUrl}/connections?wave=error&reason=no_businesses`);
    }

    const business = businesses[0];
    // Create storage directly — no middleware available for public callback
    const db = createDb(c.env.DATABASE_URL);
    const storage = new SystemStorage(db);
    const tenantId = String(stateData.userId); // tenantId was encoded as userId in state

    const credentials = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type,
      expires_in: tokens.expires_in,
      business_id: business.id,
      business_name: business.name,
    };

    // Upsert integration record
    const integrations = await storage.getIntegrations(tenantId);
    const existing = integrations.find((i) => i.serviceType === 'wavapps');

    if (existing) {
      await storage.updateIntegration(existing.id, { credentials, connected: true });
    } else {
      await storage.createIntegration({
        tenantId,
        serviceType: 'wavapps',
        name: 'Wave Accounting',
        connected: true,
        credentials,
      });
    }

    return c.redirect(`${baseUrl}/connections?wave=connected`);
  } catch (err) {
    console.error('Wave callback error:', err);
    return c.redirect(`${baseUrl}/connections?wave=error`);
  }
});

// POST /api/integrations/wave/refresh — refresh expired access token
waveRoutes.post('/api/integrations/wave/refresh', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  const integrations = await storage.getIntegrations(tenantId);
  const integration = integrations.find((i) => i.serviceType === 'wavapps');

  if (!integration) {
    return c.json({ error: 'Wave integration not found' }, 404);
  }

  const creds = integration.credentials as any;
  if (!creds?.refresh_token) {
    return c.json({ error: 'No refresh token available' }, 400);
  }

  try {
    const client = waveClient(c.env);
    const newTokens = await client.refreshAccessToken(creds.refresh_token);

    await storage.updateIntegration(integration.id, {
      credentials: {
        ...creds,
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        expires_in: newTokens.expires_in,
      },
    });

    return c.json({ message: 'Token refreshed successfully' });
  } catch (err) {
    console.error('Wave token refresh error:', err);
    return c.json({ error: 'Failed to refresh Wave token' }, 500);
  }
});
