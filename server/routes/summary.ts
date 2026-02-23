import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const summaryRoutes = new Hono<HonoEnv>();

// GET /api/summary — aggregate financial summary for the tenant
summaryRoutes.get('/api/summary', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const summary = await storage.getSummary(tenantId);
  return c.json(summary);
});
