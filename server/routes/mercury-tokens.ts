import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import {
  MERCURY_TOKEN_BINDINGS,
  keepaliveAndRecord,
  readLatestKeepaliveReport,
} from '../lib/mercury-token-keepalive';

/**
 * Operational/meta routes for the Mercury token keepalive, so liveness is readable
 * without waiting for the 09:00 UTC cron.
 *
 * AUTH — these are gated by `serviceAuth` in server/app.ts, NOT left public.
 * The /api/v1/* neighbours (`/api/v1/status`, `/api/v1/metrics`,
 * `/api/v1/documentation`) are all unauthenticated, so "gated the way its
 * neighbours are" cannot be followed here: an open endpoint enumerating which
 * banking tokens are alive is an information leak. These carry the same bearer
 * gate as /api/admin, and deliberately no tenant middleware — the seven bindings
 * are account-level and have no tenant scope.
 *
 * The response carries binding NAMES, statuses, error codes and timestamps. It
 * never carries a token value.
 */
export const mercuryTokenRoutes = new Hono<HonoEnv>();

// GET /api/v1/mercury-tokens — last recorded probe result per entity.
mercuryTokenRoutes.get('/api/v1/mercury-tokens', async (c) => {
  const kv = c.env.FINANCE_KV;
  if (!kv) {
    return c.json({ error: 'kv_not_configured' }, 500);
  }

  const report = await readLatestKeepaliveReport(kv);
  if (!report) {
    return c.json(
      {
        status: 'no_run_recorded',
        message:
          'The keepalive has not run on this deployment yet. POST /api/v1/mercury-tokens/probe to run it now, or wait for the 09:00 UTC cron.',
        tokens: MERCURY_TOKEN_BINDINGS,
      },
      200,
    );
  }

  return c.json({ status: 'ok', ...report });
});

// POST /api/v1/mercury-tokens/probe — run the probe now.
//
// Read-only against Mercury: one GET /api/v1/accounts?limit=1 per token. The POST
// verb describes the local side effect (it records a new run), not a Mercury write.
mercuryTokenRoutes.post('/api/v1/mercury-tokens/probe', async (c) => {
  const report = await keepaliveAndRecord(c.env);
  return c.json({ status: 'ok', ...report });
});
