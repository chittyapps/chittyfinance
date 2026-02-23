import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import type { SystemStorage } from '../storage/system';

export const summaryRoutes = new Hono<HonoEnv>();

// GET /api/summary — aggregate financial summary for the tenant
summaryRoutes.get('/api/summary', async (c) => {
  const storage: SystemStorage = (c as any).storage;
  const tenantId = c.get('tenantId');
  const summary = await storage.getSummary(tenantId);
  return c.json(summary);
});
