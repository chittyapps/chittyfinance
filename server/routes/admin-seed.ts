/**
 * Admin: run the chart-of-accounts seed inside the Worker.
 *
 * WHY THIS ROUTE EXISTS
 *
 * The seed needs DATABASE_URL. Running it locally (`pnpm db:seed:coa -- --apply`) means
 * the Neon connection string exists in a shell environment, a process list, and very
 * likely a shell history file — visible to anything running as that user, an agent
 * included. Inside the deployed Worker the same credential is a `wrangler secret`: it
 * lives in Worker memory for the life of the request and is never revealable. So the
 * apply moves to where the credential already is, rather than the credential moving to
 * where the apply is.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not hand-write SQL. It calls seedChartOfAccounts(), which is the only path
 * that runs assertDocumentParity() before a single write. Hand-written apply SQL that
 * bypassed that gate is what left four production rows with the wrong tax_deductible
 * (it silently omitted the column). There is deliberately no raw-SQL escape hatch here.
 *
 * DOCUMENT PARITY IN A WORKER
 *
 * assertDocumentParity() defaults to readFileSync(docs/CHART-OF-ACCOUNTS.md), which has
 * no meaning in a Worker. The document is bundled as text by the `Text` rule in the
 * wrangler configs and imported by server/worker.ts — the one module that is Worker-only
 * by definition — then handed down through createApp(). It is deliberately NOT imported
 * here: server/app.ts is also loaded by `tsx server/dev.ts` and by the esbuild step in
 * `npm run build`, neither of which has a `.md` loader, so a static import in this file
 * breaks local dev and the Node build while leaving the test suite green.
 *
 * With no bundled document the seed falls back to reading the file, and the response
 * says `source: 'filesystem'`. In practice that is the Node dev-server path only: a
 * Worker built WITHOUT the Text rule does not reach a request at all, because
 * server/worker.ts imports the document statically and the bundle fails to build
 * ("No loader is configured for '.md' files"). The fallback is defense for a state the
 * build already refuses, not a mode a deployed Worker can be in — and it is still
 * fail-closed if one ever were, since the read throws inside assertDocumentParity,
 * which runs before the first write.
 *
 * That is a real semantic shift, and it is a strengthening: parity is now checked
 * against the document THE DEPLOYED BUNDLE CARRIES, not against whatever happens to be
 * in the working tree the operator launched from. The guarantee becomes "the deployed
 * bundle's document agrees with the deployed bundle's projection" rather than "the
 * document agreed on the machine that ran the command".
 *
 * The response carries a sha256 of that bundled document so the audit artifact names
 * which document actually gated the write.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { HonoEnv } from '../env';
import {
  seedChartOfAccounts,
  createDefaultAuditSink,
  type SeedPlan,
} from '../../database/seeds/chart-of-accounts';

/**
 * The apply gate.
 *
 * `.strict()` and `z.literal(true)` together: `{"apply": "true"}`, `{"apply": 1}`,
 * `{"apply": "yes"}` and `{"aply": true}` are all 400s, not quiet dry runs. A request
 * that MEANT to write and got the spelling wrong must not come back reporting success
 * having written nothing — nor may a coerced truthy value ever mean "write".
 *
 * Exported so the guard can be tested (and mutated) as a pure function.
 */
export const seedRequestSchema = z.object({ apply: z.literal(true).optional() }).strict();

/** Stable hex sha256, for naming the exact document that gated the run. */
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Counts first, so an operator reading the response sees the shape before the rows. */
function summarize(plan: SeedPlan) {
  return {
    inserts: plan.inserts.length,
    updates: plan.updates.length,
    unchanged: plan.unchanged.length,
    inactive: plan.inactive.length,
    duplicateCodes: plan.duplicateCodes.length,
    extraneous: plan.extraneous.length,
    statements: plan.inserts.length + plan.updates.length,
  };
}

/**
 * POST /api/admin/seed/chart-of-accounts
 *
 * POST only, and dry run by default: a bare POST computes the delta and writes nothing.
 * Writing requires `{"apply": true}` in the body, exactly. There is no GET — a URL that
 * writes when fetched is not a gate.
 *
 * The plan is returned either way, so the response is the audit artifact for both the
 * rehearsal and the apply.
 *
 * Mounted under /api/admin, which is covered by
 * [storageMiddleware, serviceAuth, hybridAuth, callerContext] in app.ts and deliberately
 * NOT by tenantMiddleware — the seed writes global rows (tenant_id IS NULL) and has no
 * tenant to present to a fail-closed tenant check.
 */
export function createAdminSeedRoutes(chartDocument?: string) {
  const adminSeedRoutes = new Hono<HonoEnv>();

  adminSeedRoutes.post('/api/admin/seed/chart-of-accounts', async (c) => {
    // Read the raw body rather than trusting content-length: an empty body means a dry
    // run, and anything non-empty must parse as JSON or be refused. A malformed body is
    // never quietly downgraded to a dry run — the caller might have meant to write.
    const raw = (await c.req.text()).trim();
    let body: unknown = {};
    if (raw !== '') {
      try {
        body = JSON.parse(raw);
      } catch {
        return c.json({ error: 'invalid_json', message: 'Body must be JSON or empty' }, 400);
      }
    }

    const parsed = seedRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return c.json(
        {
          error: 'invalid_request',
          message: 'Body accepts only {"apply": true}. Any other value is refused rather than treated as a dry run.',
          issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
        400,
      );
    }

    const apply = parsed.data.apply === true;

    const plan = await seedChartOfAccounts({
      db: c.get('db'),
      apply,
      // The bundled document when the Worker entry supplied one. `undefined` leaves the
      // seed on its filesystem default, which is correct under Node and throws — before
      // any write — in a Worker built without the Text rule.
      document: chartDocument,
      // Explicit env. The default is `process.env as AuditEnv`, which under nodejs_compat
      // is not the Worker's bindings — the ledger/chronicle calls would go out unauthenticated.
      audit: createDefaultAuditSink(c.env),
    });

    return c.json({
      mode: apply ? 'applied' : 'dry-run',
      document: {
        path: 'docs/CHART-OF-ACCOUNTS.md',
        source: chartDocument ? 'bundle' : 'filesystem',
        // Only the bundled document can be named here. Under the filesystem fallback the
        // seed reads it internally and this route never holds the bytes.
        sha256: chartDocument ? await sha256Hex(chartDocument) : null,
      },
      summary: summarize(plan),
      plan,
    });
  });

  return adminSeedRoutes;
}
