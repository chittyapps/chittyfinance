/**
 * Admin: report which database DATABASE_URL actually points at.
 *
 * The connection string is a wrangler secret and cannot be read back, so the only way to
 * verify the binding is to ask the database itself. This returns the database name, the
 * Neon endpoint id, and global tenant/transaction counts — enough to tell the production
 * ledger apart from a seed or smoke-test database — and nothing from the secret.
 *
 * Mounted under /api/admin, so it inherits that prefix's middleware in server/app.ts:
 * service bearer token + a named operator, deliberately no tenant (the counts are global).
 */
import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const adminDatabaseRoutes = new Hono<HonoEnv>();

adminDatabaseRoutes.get('/api/admin/database-identity', async (c) => {
  const identity = await c.get('storage').getDatabaseIdentity();
  return c.json(identity);
});
