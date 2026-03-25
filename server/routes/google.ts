import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { GoogleAPIClient, listCalendarEvents, createCalendarEvent, listDriveFiles, createDriveFolder } from '../lib/google-api';
import { generateOAuthState, validateOAuthState } from '../lib/oauth-state-edge';
import { createDb } from '../db/connection';
import { SystemStorage } from '../storage/system';

export const googleRoutes = new Hono<HonoEnv>();
export const googleCallbackRoute = new Hono<HonoEnv>();

function googleClient(env: { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; PUBLIC_APP_BASE_URL?: string }) {
  return new GoogleAPIClient({
    clientId: env.GOOGLE_CLIENT_ID || '',
    clientSecret: env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: `${env.PUBLIC_APP_BASE_URL || 'https://finance.chitty.cc'}/api/integrations/google/callback`,
  });
}

// GET /api/integrations/google/authorize — start OAuth flow (protected)
googleRoutes.get('/api/integrations/google/authorize', async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) {
    return c.json({ error: 'Google integration not configured' }, 503);
  }

  if (!c.env.OAUTH_STATE_SECRET) {
    return c.json({ error: 'OAuth state secret not configured' }, 503);
  }
  const tenantId = c.get('tenantId') || 'anonymous';
  const state = await generateOAuthState(tenantId, c.env.OAUTH_STATE_SECRET);
  const client = googleClient(c.env);
  const authUrl = client.getAuthorizationUrl(state);

  return c.json({ authUrl });
});

// GET /api/integrations/google/status — check Google connection status
googleRoutes.get('/api/integrations/google/status', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const integrations = await storage.getIntegrations(tenantId);
  const google = integrations.find(i => i.serviceType === 'google');
  return c.json({
    connected: google?.connected ?? false,
    calendarId: (google?.credentials as Record<string, unknown>)?.calendarId ?? null,
    driveFolderId: (google?.credentials as Record<string, unknown>)?.driveFolderId ?? null,
  });
});

// GET /api/integrations/google/callback — OAuth callback (PUBLIC)
googleCallbackRoute.get('/api/integrations/google/callback', async (c) => {
  const baseUrl = c.env.PUBLIC_APP_BASE_URL || 'https://finance.chitty.cc';
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  if (error) {
    return c.redirect(`${baseUrl}/connections?google=error&reason=${error}`);
  }
  if (!code || !state) {
    return c.redirect(`${baseUrl}/connections?google=error&reason=missing_params`);
  }

  if (!c.env.OAUTH_STATE_SECRET) {
    return c.redirect(`${baseUrl}/connections?google=error&reason=server_misconfigured`);
  }
  const stateData = await validateOAuthState(state, c.env.OAUTH_STATE_SECRET);
  if (!stateData) {
    return c.redirect(`${baseUrl}/connections?google=error&reason=invalid_state`);
  }

  try {
    const client = googleClient(c.env);
    const tokens = await client.exchangeCode(code);

    const db = createDb(c.env.DATABASE_URL);
    const storage = new SystemStorage(db);
    const tenantId = String(stateData.userId);

    // Save or update integration record
    const integrations = await storage.getIntegrations(tenantId);
    const existing = integrations.find(i => i.serviceType === 'google');

    const credentials = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + tokens.expires_in * 1000,
    };

    if (existing) {
      await storage.updateIntegration(existing.id, { connected: true, credentials });
    } else {
      await storage.createIntegration({
        tenantId,
        serviceType: 'google',
        name: 'Google Workspace',
        connected: true,
        credentials,
      });
    }

    return c.redirect(`${baseUrl}/connections?google=connected`);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    return c.redirect(`${baseUrl}/connections?google=error&reason=token_exchange_failed`);
  }
});

// POST /api/google/calendar/events — Create calendar event
googleRoutes.post('/api/google/calendar/events', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const integration = (await storage.getIntegrations(tenantId)).find(i => i.serviceType === 'google');
  if (!integration?.connected) return c.json({ error: 'Google not connected' }, 400);

  const creds = integration.credentials as Record<string, string>;
  const body = await c.req.json();
  const calendarId = body.calendarId || 'primary';

  const result = await createCalendarEvent(creds.access_token, calendarId, {
    summary: body.summary,
    description: body.description,
    start: { dateTime: body.startDateTime },
    end: { dateTime: body.endDateTime },
  });

  return c.json(result);
});

// GET /api/google/calendar/events — List calendar events
googleRoutes.get('/api/google/calendar/events', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const integration = (await storage.getIntegrations(tenantId)).find(i => i.serviceType === 'google');
  if (!integration?.connected) return c.json({ error: 'Google not connected' }, 400);

  const creds = integration.credentials as Record<string, string>;
  const calendarId = c.req.query('calendarId') || 'primary';
  const timeMin = c.req.query('timeMin');
  const timeMax = c.req.query('timeMax');

  const result = await listCalendarEvents(creds.access_token, calendarId, timeMin ?? undefined, timeMax ?? undefined);
  return c.json(result);
});

// GET /api/google/drive/files — List Drive files in folder
googleRoutes.get('/api/google/drive/files', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const integration = (await storage.getIntegrations(tenantId)).find(i => i.serviceType === 'google');
  if (!integration?.connected) return c.json({ error: 'Google not connected' }, 400);

  const creds = integration.credentials as Record<string, string>;
  const folderId = c.req.query('folderId') || 'root';

  const result = await listDriveFiles(creds.access_token, folderId);
  return c.json(result);
});

// POST /api/google/drive/folders — Create Drive folder for property
googleRoutes.post('/api/google/drive/folders', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const integration = (await storage.getIntegrations(tenantId)).find(i => i.serviceType === 'google');
  if (!integration?.connected) return c.json({ error: 'Google not connected' }, 400);

  const creds = integration.credentials as Record<string, string>;
  const body = await c.req.json();

  const result = await createDriveFolder(creds.access_token, body.name, body.parentId);
  return c.json(result);
});
