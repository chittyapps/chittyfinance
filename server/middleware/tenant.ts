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

  // Fail CLOSED. This previously accepted the caller-supplied tenantId and
  // called next() whenever the membership check could not be performed, which
  // meant a request reaching this middleware without storage or a resolved
  // userId got whatever tenant it asked for. It is unreachable on the mounted
  // routes -- tenantMiddleware only ever runs inside protectedRoute, after
  // storageMiddleware and callerContext -- but "unreachable today" is not a
  // property a tenant-isolation boundary should rely on, and the failure mode
  // if it ever changes is silent cross-tenant data access.
  if (!storage || !userId || typeof storage.getUserTenants !== 'function') {
    return c.json(
      {
        error: 'tenant_check_unavailable',
        message: 'Tenant membership could not be verified',
      },
      500,
    );
  }

  const memberships = await storage.getUserTenants(userId);
  const hasAccess = memberships.some((membership) => membership.tenant.id === tenantId);

  if (!hasAccess) {
    return c.json({ error: 'forbidden', message: 'Caller does not have access to tenant' }, 403);
  }

  c.set('tenantId', tenantId);
  await next();
};
