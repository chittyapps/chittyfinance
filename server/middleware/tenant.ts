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

  c.set('tenantId', tenantId);
  await next();
};
