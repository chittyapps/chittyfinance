import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const integrationRoutes = new Hono<HonoEnv>();

// GET /api/integrations — list integrations for the tenant
integrationRoutes.get('/api/integrations', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  const integrations = await storage.getIntegrations(tenantId);
  return c.json(integrations);
});

// GET /api/integrations/status — check which integrations are configured
integrationRoutes.get('/api/integrations/status', async (c) => {
  const env = c.env;
  const status = {
    wave: { configured: Boolean(env.WAVE_CLIENT_ID && env.WAVE_CLIENT_SECRET) },
    stripe: { configured: Boolean(env.STRIPE_SECRET_KEY) },
    mercury: { configured: Boolean(env.CHITTYCONNECT_API_BASE && env.CHITTY_AUTH_SERVICE_TOKEN) },
    openai: { configured: Boolean(env.OPENAI_API_KEY) },
    github: { configured: Boolean(env.GITHUB_TOKEN) },
  };
  return c.json(status);
});

// POST /api/integrations — create a new integration
integrationRoutes.post('/api/integrations', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const body = await c.req.json();

  if (!body.serviceType || !body.name) {
    return c.json({ error: 'serviceType and name are required' }, 400);
  }

  const integration = await storage.createIntegration({
    tenantId,
    serviceType: body.serviceType,
    name: body.name,
    description: body.description || null,
    connected: body.connected ?? false,
    credentials: body.credentials || null,
    lastSynced: body.lastSynced ? new Date(body.lastSynced) : null,
    metadata: body.metadata || null,
  });

  return c.json(integration, 201);
});

// PATCH /api/integrations/:id — update an integration
integrationRoutes.patch('/api/integrations/:id', async (c) => {
  const storage = c.get('storage');
  const id = c.req.param('id');

  const existing = await storage.getIntegration(id);
  if (!existing) {
    return c.json({ error: 'Integration not found' }, 404);
  }

  const body = await c.req.json();
  const updated = await storage.updateIntegration(id, body);
  return c.json(updated);
});
