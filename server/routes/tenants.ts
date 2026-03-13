import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const tenantRoutes = new Hono<HonoEnv>();

// GET /api/tenants — list tenants the authenticated user has access to
tenantRoutes.get('/api/tenants', async (c) => {
  const storage = c.get('storage');
  const userId = c.get('userId');
  const memberships = await storage.getUserTenants(userId);

  return c.json(
    memberships.map((membership) => ({
      ...membership.tenant,
      role: membership.role,
    })),
  );
});

// GET /api/tenants/:id — get a single tenant by ID
tenantRoutes.get('/api/tenants/:id', async (c) => {
  const storage = c.get('storage');
  const userId = c.get('userId');
  const tenantId = c.req.param('id');
  const memberships = await storage.getUserTenants(userId);
  const membership = memberships.find((item) => item.tenant.id === tenantId);

  if (!membership) {
    return c.json({ error: 'Tenant not found' }, 404);
  }

  const tenant = await storage.getTenant(tenantId);
  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404);
  }

  return c.json({
    ...tenant,
    role: membership.role,
  });
});
