import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { HonoEnv } from './env';
import type { MiddlewareHandler } from 'hono';
import { errorHandler } from './middleware/error';
import { serviceAuth } from './middleware/auth';
import { tenantMiddleware } from './middleware/tenant';
import { healthRoutes } from './routes/health';
import { docRoutes } from './routes/docs';
import { accountRoutes } from './routes/accounts';
import { summaryRoutes } from './routes/summary';
import { tenantRoutes } from './routes/tenants';
import { propertyRoutes } from './routes/properties';
import { transactionRoutes } from './routes/transactions';
import { integrationRoutes } from './routes/integrations';
import { taskRoutes } from './routes/tasks';
import { aiRoutes } from './routes/ai';
import { webhookRoutes } from './routes/webhooks';
import { mercuryRoutes } from './routes/mercury';
import { githubRoutes } from './routes/github';
import { stripeRoutes } from './routes/stripe';
import { waveRoutes, waveCallbackRoute } from './routes/wave';
import { chargeRoutes } from './routes/charges';
import { forensicRoutes } from './routes/forensics';
import { valuationRoutes } from './routes/valuation';
import { portfolioRoutes } from './routes/portfolio';
import { importRoutes } from './routes/import';
import { mcpRoutes } from './routes/mcp';
import { createDb } from './db/connection';
import { SystemStorage } from './storage/system';

// Shared middleware: create DB + storage and attach to context
const storageMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const db = createDb(c.env.DATABASE_URL);
  c.set('storage', new SystemStorage(db));
  await next();
};

// Combined auth + tenant + storage middleware stack
const protectedRoute: MiddlewareHandler<HonoEnv>[] = [serviceAuth, tenantMiddleware, storageMiddleware];

export function createApp() {
  const app = new Hono<HonoEnv>();

  // Global error handler
  app.onError(errorHandler);

  // CORS
  app.use('*', cors({
    origin: ['https://app.command.chitty.cc', 'https://command.chitty.cc', 'https://finance.chitty.cc', 'http://localhost:5000', 'http://localhost:3000'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-Source-Service', 'X-Account-ID', 'Stripe-Signature'],
  }));

  // Request logging
  app.use('*', logger());

  // ── Public routes (no auth) ──
  app.route('/', healthRoutes);
  app.route('/', docRoutes);

  // Redirects (public)
  app.get('/connect', (c) => {
    const target = c.env.CHITTYCONNECT_API_BASE?.replace(/\/?api\/?$/, '') || 'https://connect.chitty.cc';
    return c.redirect(target, 302);
  });
  app.get('/register', (c) => c.redirect('https://get.chitty.cc', 302));

  // Agent routes disabled — ChittyAgent DO is being rebuilt
  app.all('/agent', (c) => c.json({ status: 'agent_disabled', message: 'ChittyAgent is being rebuilt' }, 503));
  app.all('/agent/*', (c) => c.json({ status: 'agent_disabled', message: 'ChittyAgent is being rebuilt' }, 503));

  // ── Webhook routes (custom auth per-route, no tenant required) ──
  app.route('/', webhookRoutes);

  // Wave OAuth callback is public (OAuth redirect from Wave — no auth/tenant needed)
  // Must be mounted before protected middleware covers /api/integrations/*
  app.route('/', waveCallbackRoute);

  // ── Protected API routes (auth + tenant + storage) ──
  // Register middleware for each protected path prefix
  const protectedPrefixes = [
    '/api/accounts', '/api/transactions', '/api/tenants', '/api/properties',
    '/api/integrations', '/api/tasks', '/api/ai-messages', '/api/ai', '/api/summary',
    '/api/mercury', '/api/github', '/api/charges', '/api/forensics', '/api/portfolio', '/api/import', '/mcp',
  ];
  for (const prefix of protectedPrefixes) {
    app.use(prefix, ...protectedRoute);
    app.use(`${prefix}/*`, ...protectedRoute);
  }

  // Mount all authenticated route groups
  app.route('/', tenantRoutes);
  app.route('/', propertyRoutes);
  app.route('/', accountRoutes);
  app.route('/', transactionRoutes);
  app.route('/', summaryRoutes);
  app.route('/', integrationRoutes);
  app.route('/', taskRoutes);
  app.route('/', aiRoutes);
  app.route('/', mercuryRoutes);
  app.route('/', githubRoutes);
  app.route('/', stripeRoutes);
  app.route('/', waveRoutes);
  app.route('/', chargeRoutes);
  app.route('/', forensicRoutes);
  app.route('/', valuationRoutes);
  app.route('/', portfolioRoutes);
  app.route('/', importRoutes);
  app.route('/', mcpRoutes);

  // ── Fallback: try static assets, then 404 ──
  app.all('*', async (c) => {
    try {
      const assetRes = await c.env.ASSETS.fetch(c.req.raw);
      if (assetRes.status !== 404) return assetRes;
    } catch {}
    return c.json({ error: 'Not Found' }, 404);
  });

  return app;
}
