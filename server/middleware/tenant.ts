import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';

const MODE = process.env.MODE || 'standalone';

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      tenantRole?: string;
      tenant?: any;
      userId?: string;
    }
  }
}

// Minimal tenant-scoping middleware (standalone mode compatibility)
export function tenantScope(req: Request, _res: Response, next: NextFunction) {
  if (MODE === 'standalone') {
    // In standalone mode, userId is the tenant context
    req.userId = '1';
    req.tenantId = '1';
    req.tenantRole = 'owner';
    return next();
  }

  const headerTenant = (req.headers['x-tenant-id'] || req.headers['x-tenant']) as string | undefined;
  const queryTenant = (req.query.tenant as string) || (req.query.tenantId as string) || undefined;
  (req as any).tenantId = headerTenant || queryTenant;
  next();
}

// System mode: tenant resolution with access validation
export async function resolveTenant(req: Request, res: Response, next: NextFunction) {
  if (MODE === 'standalone') {
    req.userId = '1';
    req.tenantId = '1';
    req.tenantRole = 'owner';
    return next();
  }

  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    let tenantId = req.headers['x-tenant-id'] as string;
    let tenantSlug = req.query.tenantId as string;

    if (!tenantId && !tenantSlug) {
      const userTenants = await storage.getUserTenants(userId);
      if (userTenants.length === 0) {
        return res.status(403).json({ error: 'No tenant access' });
      }
      req.tenant = userTenants[0];
      req.tenantId = userTenants[0].id;
      req.tenantRole = userTenants[0].role;
      return next();
    }

    let tenant;
    if (tenantSlug) {
      tenant = await storage.getTenantBySlug(tenantSlug);
    } else if (tenantId) {
      tenant = await storage.getTenant(tenantId);
    }

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const access = await storage.checkTenantAccess(userId, tenant.id);

    if (!access.hasAccess) {
      return res.status(403).json({ error: 'Access denied to tenant' });
    }

    req.tenant = tenant;
    req.tenantId = tenant.id;
    req.tenantRole = access.role;
    next();
  } catch (error) {
    console.error('Tenant resolution error:', error);
    res.status(500).json({ error: 'Failed to resolve tenant' });
  }
}

// Optional tenant (no error if missing)
export async function optionalTenant(req: Request, res: Response, next: NextFunction) {
  if (MODE === 'standalone') {
    req.userId = '1';
    req.tenantId = '1';
    req.tenantRole = 'owner';
    return next();
  }

  try {
    const userId = req.userId;
    if (!userId) return next();

    const tenantId = req.headers['x-tenant-id'] as string;
    const tenantSlug = req.query.tenantId as string;

    if (!tenantId && !tenantSlug) return next();

    let tenant;
    if (tenantSlug) {
      tenant = await storage.getTenantBySlug(tenantSlug);
    } else if (tenantId) {
      tenant = await storage.getTenant(tenantId);
    }

    if (tenant) {
      const access = await storage.checkTenantAccess(userId, tenant.id);
      if (access.hasAccess) {
        req.tenant = tenant;
        req.tenantId = tenant.id;
        req.tenantRole = access.role;
      }
    }

    next();
  } catch (error) {
    console.error('Optional tenant resolution error:', error);
    next();
  }
}

// Require specific tenant role(s)
export function requireTenantRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.tenantRole || !allowedRoles.includes(req.tenantRole)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `This action requires one of: ${allowedRoles.join(', ')}`,
        yourRole: req.tenantRole
      });
    }
    next();
  };
}

