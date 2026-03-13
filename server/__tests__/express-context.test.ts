import express, { type Request, type RequestHandler } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  createCallerContext,
  createTenantAccessResolver,
} from '../middleware/express-context';

type ContextRequest = Request & { userId?: string; tenantId?: string };

async function runRequest(app: express.Express, setup?: (url: URL) => void, headers?: Record<string, string>) {
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind test server');
    }

    const url = new URL(`http://127.0.0.1:${address.port}/test`);
    setup?.(url);
    const res = await fetch(url, { headers });
    return {
      status: res.status,
      body: await res.json(),
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function buildApp(middleware: RequestHandler) {
  const app = express();
  app.get('/test', middleware, (req, res) => {
    const contextReq = req as ContextRequest;
    res.json({
      userId: contextReq.userId ?? null,
      tenantId: contextReq.tenantId ?? null,
    });
  });
  return app;
}

describe('express caller context', () => {
  it('loads the explicit caller from headers', async () => {
    const app = buildApp(
      createCallerContext({
        getUser: vi.fn().mockResolvedValue({ id: 'user-123' }),
        getSessionUser: vi.fn(),
      }),
    );

    const res = await runRequest(app, undefined, { 'X-Chitty-User-Id': 'user-123' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: 'user-123', tenantId: null });
  });

  it('falls back to the session user when no explicit caller is provided', async () => {
    const app = buildApp(
      createCallerContext({
        getUser: vi.fn(),
        getSessionUser: vi.fn().mockResolvedValue({ id: 'session-user' }),
      }),
    );

    const res = await runRequest(app);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: 'session-user', tenantId: null });
  });

  it('returns 404 for an unknown explicit caller', async () => {
    const app = buildApp(
      createCallerContext({
        getUser: vi.fn().mockResolvedValue(undefined),
        getSessionUser: vi.fn(),
      }),
    );

    const res = await runRequest(app, undefined, { 'X-User-Id': 'missing-user' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'user_not_found' });
  });
});

describe('express tenant access resolver', () => {
  it('sets tenantId when the caller belongs to the tenant', async () => {
    const app = express();
    app.get(
      '/test',
      ((req, _res, next) => {
        (req as ContextRequest).userId = 'user-123';
        next();
      }) as RequestHandler,
      createTenantAccessResolver({
        getUserTenants: vi.fn().mockResolvedValue([
          { tenant: { id: 'tenant-1' } },
          { tenant: { id: 'tenant-2' } },
        ]),
      }),
      (req, res) => res.json({ tenantId: (req as ContextRequest).tenantId }),
    );

    const res = await runRequest(app, undefined, { 'X-Tenant-ID': 'tenant-2' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tenantId: 'tenant-2' });
  });

  it('rejects access when the caller is not a tenant member', async () => {
    const app = express();
    app.get(
      '/test',
      ((req, _res, next) => {
        (req as ContextRequest).userId = 'user-123';
        next();
      }) as RequestHandler,
      createTenantAccessResolver({
        getUserTenants: vi.fn().mockResolvedValue([{ tenant: { id: 'tenant-1' } }]),
      }),
      (_req, res) => res.json({ ok: true }),
    );

    const res = await runRequest(app, undefined, { 'X-Tenant-ID': 'tenant-9' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: 'forbidden',
      message: 'Caller does not have access to tenant',
    });
  });
});
