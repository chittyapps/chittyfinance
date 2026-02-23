import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { HonoEnv } from './env';
import { errorHandler } from './middleware/error';
import { serviceAuth } from './middleware/auth';
import { tenantMiddleware } from './middleware/tenant';
import { healthRoutes } from './routes/health';
import { accountRoutes } from './routes/accounts';
import { summaryRoutes } from './routes/summary';
import { createDb } from './db/connection';
import { SystemStorage } from './storage/system';

export function createApp() {
  const app = new Hono<HonoEnv>();

  // Global error handler
  app.onError(errorHandler);

  // CORS
  app.use('*', cors({
    origin: ['https://app.command.chitty.cc', 'https://command.chitty.cc', 'https://finance.chitty.cc', 'http://localhost:5000', 'http://localhost:3000'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-Source-Service'],
  }));

  // Request logging
  app.use('*', logger());

  // Public routes (no auth required)
  app.route('/', healthRoutes);

  // Redirects (public)
  app.get('/connect', (c) => {
    const target = c.env.CHITTYCONNECT_API_BASE?.replace(/\/?api\/?$/, '') || 'https://connect.chitty.cc';
    return c.redirect(target, 302);
  });
  app.get('/register', (c) => c.redirect('https://get.chitty.cc', 302));

  // Durable Object agent passthrough (public)
  app.all('/agent', async (c) => {
    const name = new URL(c.req.url).searchParams.get('id') || 'default';
    const id = c.env.CF_AGENT.idFromName(name);
    const stub = c.env.CF_AGENT.get(id);
    return stub.fetch(c.req.raw);
  });
  app.all('/agent/*', async (c) => {
    const name = new URL(c.req.url).searchParams.get('id') || 'default';
    const id = c.env.CF_AGENT.idFromName(name);
    const stub = c.env.CF_AGENT.get(id);
    return stub.fetch(c.req.raw);
  });

  // Authenticated middleware for protected API routes
  app.use('/api/accounts/*', serviceAuth, tenantMiddleware, async (c, next) => {
    const db = createDb(c.env.DATABASE_URL);
    const storage = new SystemStorage(db);
    (c as any).storage = storage;
    await next();
  });
  app.use('/api/accounts', serviceAuth, tenantMiddleware, async (c, next) => {
    const db = createDb(c.env.DATABASE_URL);
    const storage = new SystemStorage(db);
    (c as any).storage = storage;
    await next();
  });
  app.use('/api/summary', serviceAuth, tenantMiddleware, async (c, next) => {
    const db = createDb(c.env.DATABASE_URL);
    const storage = new SystemStorage(db);
    (c as any).storage = storage;
    await next();
  });

  // Mount authenticated route groups
  app.route('/', accountRoutes);
  app.route('/', summaryRoutes);

  // Fallback: try static assets, then 404
  app.all('*', async (c) => {
    try {
      const assetRes = await c.env.ASSETS.fetch(c.req.raw);
      if (assetRes.status !== 404) return assetRes;
    } catch {}
    return c.json({ error: 'Not Found' }, 404);
  });

  return app;
}
