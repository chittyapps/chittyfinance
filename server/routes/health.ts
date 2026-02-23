import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const healthRoutes = new Hono<HonoEnv>();

healthRoutes.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'chittyfinance' });
});

healthRoutes.get('/api/v1/status', (c) => {
  const version = c.env.APP_VERSION || '1.0.0';
  const mode = c.env.MODE || 'system';
  const nodeEnv = c.env.NODE_ENV || 'production';
  const dbConfigured = Boolean(c.env.DATABASE_URL);
  const chittyConfigured = Boolean(c.env.CHITTYCONNECT_API_BASE && c.env.CHITTY_AUTH_SERVICE_TOKEN);

  return c.json({
    name: 'ChittyFinance',
    version,
    mode,
    nodeEnv,
    database: { configured: dbConfigured },
    chittyConnect: { configured: chittyConfigured },
  });
});

healthRoutes.get('/api/v1/metrics', (c) => {
  const dbConfigured = c.env.DATABASE_URL ? 1 : 0;
  const chittyConfigured = (c.env.CHITTYCONNECT_API_BASE && c.env.CHITTY_AUTH_SERVICE_TOKEN) ? 1 : 0;
  const lines = [
    '# HELP service_database_configured Database configured (1) or not (0)',
    '# TYPE service_database_configured gauge',
    `service_database_configured ${dbConfigured}`,
    '# HELP service_chittyconnect_configured ChittyConnect configured (1) or not (0)',
    '# TYPE service_chittyconnect_configured gauge',
    `service_chittyconnect_configured ${chittyConfigured}`,
    '',
  ];
  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; version=0.0.4' },
  });
});
