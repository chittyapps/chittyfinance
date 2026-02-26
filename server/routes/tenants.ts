import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const tenantRoutes = new Hono<HonoEnv>();

// GET /api/tenants — list tenants the authenticated user has access to
tenantRoutes.get('/api/tenants', async (c) => {
  const storage = c.get('storage');
  const userId = c.get('userId');

  if (!userId) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const tenants = await storage.getUserTenants(userId);
  return c.json(tenants);
});

// GET /api/tenants/:id — get a single tenant by ID
tenantRoutes.get('/api/tenants/:id', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.req.param('id');

  const tenant = await storage.getTenant(tenantId);
  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404);
  }

  return c.json(tenant);
});
