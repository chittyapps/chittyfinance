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

// ── Settings helpers ──

const settingsSchema = z.object({
  bulkAcceptDisabled: z.boolean().optional(),
}).strict();

/** Verify user membership and fetch tenant, returning both or a 404 response. */
async function resolveUserTenant(c: any) {
  const storage = c.get('storage');
  const userId = c.get('userId');
  const tenantId = c.req.param('id');

  const memberships = await storage.getUserTenants(userId);
  const membership = memberships.find((item: any) => item.tenant.id === tenantId);
  if (!membership) return { error: c.json({ error: 'Tenant not found' }, 404) } as const;

  const tenant = await storage.getTenant(tenantId);
  if (!tenant) return { error: c.json({ error: 'Tenant not found' }, 404) } as const;

  return { membership, tenant, tenantId, userId, storage } as const;
}

// GET /api/tenants/:id/settings — get tenant settings (classification flags, etc.)
tenantRoutes.get('/api/tenants/:id/settings', async (c) => {
  const result = await resolveUserTenant(c);
  if ('error' in result) return result.error;

  const metadata = (result.tenant.metadata as Record<string, unknown>) ?? {};
  return c.json({
    bulkAcceptDisabled: metadata.bulkAcceptDisabled ?? false,
  });
});

// PATCH /api/tenants/:id/settings — update tenant metadata settings (owner/admin only)
tenantRoutes.patch('/api/tenants/:id/settings', async (c) => {
  const result = await resolveUserTenant(c);
  if ('error' in result) return result.error;

  if (!['owner', 'admin'].includes(result.membership.role)) {
    return c.json({ error: 'Owner or admin role required to modify tenant settings' }, 403);
  }

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: 'Request body must be valid JSON' }, 400);
  }
  const body = settingsSchema.safeParse(rawBody);
  if (!body.success) {
    return c.json({ error: 'invalid_body', details: body.error.flatten() }, 400);
  }

  const currentMetadata = (result.tenant.metadata as Record<string, unknown>) ?? {};
  const updatedMetadata = { ...currentMetadata, ...body.data };

  const updated = await result.storage.updateTenant(result.tenantId, { metadata: updatedMetadata });
  if (!updated) return c.json({ error: 'Update failed' }, 500);

  ledgerLog(c, {
    entityType: 'audit',
    action: 'tenant.settings_updated',
    metadata: { tenantId: result.tenantId, changes: Object.keys(body.data), actorId: result.userId },
  }, c.env);

  return c.json(updated);
});
