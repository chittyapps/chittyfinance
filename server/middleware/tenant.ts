import type { MiddlewareHandler } from 'hono';
import type { HonoEnv } from '../env';

export const tenantMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const tenantId =
    c.req.header('x-tenant-id') ??
    c.req.query('tenantId') ??
    '';

  if (!tenantId) {
    return c.json({ error: 'missing_tenant_id', message: 'X-Tenant-ID header or tenantId query param required' }, 400);
  }

  const storage = c.get('storage');
  const userId = c.get('userId');

  if (!storage || !userId || typeof storage.getUserTenants !== 'function') {
    c.set('tenantId', tenantId);
    await next();
    return;
  }

  const memberships = await storage.getUserTenants(userId);
  const hasAccess = memberships.some((membership) => membership.tenant.id === tenantId);

  if (!hasAccess) {
    return c.json({ error: 'forbidden', message: 'Caller does not have access to tenant' }, 403);
  }

  c.set('tenantId', tenantId);
  await next();
};
