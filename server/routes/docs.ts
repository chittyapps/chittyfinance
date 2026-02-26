import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const docRoutes = new Hono<HonoEnv>();

// GET /api/v1/documentation — OpenAPI spec
docRoutes.get('/api/v1/documentation', (c) => {
  const version = c.env.APP_VERSION || '2.0.0';

  return c.json({
    openapi: '3.0.3',
    info: {
      title: 'ChittyFinance API',
      version,
      description: 'Financial management API for the ChittyOS ecosystem.',
    },
    servers: [{ url: 'https://finance.chitty.cc' }],
    paths: {
      '/health': {
        get: { summary: 'Health check', responses: { '200': { description: 'OK' } } },
      },
      '/api/v1/status': {
        get: { summary: 'Service status', responses: { '200': { description: 'Service status' } } },
      },
      '/api/accounts': {
        get: { summary: 'List accounts', security: [{ BearerAuth: [] }], responses: { '200': { description: 'Accounts list' } } },
      },
      '/api/transactions': {
        get: { summary: 'List transactions', security: [{ BearerAuth: [] }], responses: { '200': { description: 'Transactions list' } } },
      },
      '/api/tenants': {
        get: { summary: 'List tenants for user', security: [{ BearerAuth: [] }], responses: { '200': { description: 'Tenants list' } } },
      },
      '/api/properties': {
        get: { summary: 'List properties', security: [{ BearerAuth: [] }], responses: { '200': { description: 'Properties list' } } },
      },
      '/api/integrations': {
        get: { summary: 'List integrations', security: [{ BearerAuth: [] }], responses: { '200': { description: 'Integrations list' } } },
      },
      '/api/tasks': {
        get: { summary: 'List tasks', security: [{ BearerAuth: [] }], responses: { '200': { description: 'Tasks list' } } },
      },
      '/api/summary': {
        get: { summary: 'Financial summary', security: [{ BearerAuth: [] }], responses: { '200': { description: 'Summary' } } },
      },
    },
    components: {
      securitySchemes: {
        BearerAuth: { type: 'http', scheme: 'bearer' },
      },
    },
  });
});
