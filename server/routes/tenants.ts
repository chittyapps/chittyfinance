import { Hono } from 'hono';
import { z } from 'zod';
import type { HonoEnv } from '../env';
import { ledgerLog } from '../lib/ledger-client';

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

// PATCH /api/tenants/:id/settings — update tenant metadata settings (owner/admin only)
const settingsSchema = z.object({
  bulkAcceptDisabled: z.boolean().optional(),
}).passthrough(); // allow arbitrary metadata keys

tenantRoutes.patch('/api/tenants/:id/settings', async (c) => {
  const storage = c.get('storage');
  const userId = c.get('userId');
  const tenantId = c.req.param('id');

  // Verify access and role
  const memberships = await storage.getUserTenants(userId);
  const membership = memberships.find((item) => item.tenant.id === tenantId);
  if (!membership) return c.json({ error: 'Tenant not found' }, 404);

  if (!['owner', 'admin'].includes(membership.role)) {
    return c.json({ error: 'Owner or admin role required to modify tenant settings' }, 403);
  }

  const body = settingsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ error: 'invalid_body', details: body.error.flatten() }, 400);
  }

  const tenant = await storage.getTenant(tenantId);
  if (!tenant) return c.json({ error: 'Tenant not found' }, 404);

  const currentMetadata = (tenant.metadata as Record<string, unknown>) ?? {};
  const updatedMetadata = { ...currentMetadata, ...body.data };

  const updated = await storage.updateTenant(tenantId, { metadata: updatedMetadata });
  if (!updated) return c.json({ error: 'Update failed' }, 500);

  ledgerLog(c, {
    entityType: 'audit',
    action: 'tenant.settings_updated',
    metadata: { tenantId, changes: Object.keys(body.data), actorId: userId },
  }, c.env);

  return c.json(updated);
});

// GET /api/tenants/:id/settings — get tenant settings (classification flags, etc.)
tenantRoutes.get('/api/tenants/:id/settings', async (c) => {
  const storage = c.get('storage');
  const userId = c.get('userId');
  const tenantId = c.req.param('id');

  const memberships = await storage.getUserTenants(userId);
  const membership = memberships.find((item) => item.tenant.id === tenantId);
  if (!membership) return c.json({ error: 'Tenant not found' }, 404);

  const tenant = await storage.getTenant(tenantId);
  if (!tenant) return c.json({ error: 'Tenant not found' }, 404);

  const metadata = (tenant.metadata as Record<string, unknown>) ?? {};
  return c.json({
    bulkAcceptDisabled: metadata.bulkAcceptDisabled ?? false,
  });
});
