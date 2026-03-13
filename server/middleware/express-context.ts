import type { NextFunction, Request, Response } from 'express';

type UserRecord = { id: string | number };
type MembershipRecord = { tenant: { id: string } };
type ContextRequest = Request & { userId?: string; tenantId?: string };

interface CallerStorage {
  getSessionUser?: () => Promise<UserRecord | undefined>;
  getUser?: (id: string) => Promise<UserRecord | undefined>;
}

interface TenantStorage {
  getUserTenants?: (userId: string) => Promise<MembershipRecord[]>;
}

export function getCallerId(req: Request): string {
  const headerValue = req.header('x-chitty-user-id') ?? req.header('x-user-id');
  const queryValue = typeof req.query.userId === 'string' ? req.query.userId : '';
  return headerValue ?? queryValue ?? '';
}

export function createCallerContext(storage: CallerStorage) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const contextReq = req as ContextRequest;
    const callerId = getCallerId(contextReq);

    if (callerId) {
      const user = await storage.getUser?.(callerId);
      if (!user) {
        return res.status(404).json({ error: 'user_not_found' });
      }

      contextReq.userId = String(user.id);
      return next();
    }

    const sessionUser = await storage.getSessionUser?.();
    if (!sessionUser) {
      return res.status(400).json({
        error: 'missing_user_id',
        message: 'X-Chitty-User-Id header or userId query param required',
      });
    }

    contextReq.userId = String(sessionUser.id);
    return next();
  };
}

export function getTenantId(req: Request): string {
  const headerValue = req.header('x-tenant-id');
  const queryValue = typeof req.query.tenantId === 'string' ? req.query.tenantId : '';
  return headerValue ?? queryValue ?? '';
}

export function createTenantAccessResolver(storage: TenantStorage) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const contextReq = req as ContextRequest;
    const tenantId = getTenantId(contextReq);
    if (!tenantId) {
      return res.status(400).json({
        error: 'missing_tenant_id',
        message: 'X-Tenant-ID header or tenantId query param required',
      });
    }

    if (contextReq.userId && storage.getUserTenants) {
      const memberships = await storage.getUserTenants(String(contextReq.userId));
      const hasAccess = memberships.some((membership) => membership.tenant.id === tenantId);

      if (!hasAccess) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Caller does not have access to tenant',
        });
      }
    }

    contextReq.tenantId = tenantId;
    return next();
  };
}
