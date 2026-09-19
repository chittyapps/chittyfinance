import { describe, it, expect } from 'vitest';
import { drizzle } from 'drizzle-orm/neon-http';
import { createApp } from '../app';
import { seedRequestSchema } from '../routes/admin-seed';
import * as schema from '../db/schema';

/**
 * The admin seed route.
 *
 * No `vi.mock` anywhere, and no mocked DB module: the app is built with a real drizzle
 * neon-http client whose transport records the compiled statement instead of sending it.
 * Drizzle compiles exactly the SQL production would; only the wire is substituted. That
 * is what lets "a dry run writes nothing" be an assertion about real SQL rather than
 * about a stub's call count.
 */

const USER_ID = 'user-operator';
const SERVICE_TOKEN = 'test-svc-token';

interface RecordedCall {
  sql: string;
  params: unknown[];
}

/** The columns a compiled SELECT projects, in order. */
function selectedColumns(sql: string): string[] {
  const list = sql.slice(sql.search(/\bselect\b/i) + 6, sql.search(/\bfrom\b/i));
  return [...list.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

/**
 * A recording neon-http transport.
 *
 * - SELECT on users → one row, so callerContext resolves the operator.
 * - SELECT on chart_of_accounts → no rows, so the plan is "insert everything". The exact
 *   delta is not what these tests are about; the existing seed suite owns that against a
 *   recorded dev-branch snapshot. What matters here is whether the route writes at all.
 * - INSERT → a generated id, so an apply that DOES run can complete and be observed.
 */
function recordingDeps() {
  const calls: RecordedCall[] = [];
  const client = async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    if (/^\s*select/i.test(sql)) {
      if (/\bfrom\s+"users"/i.test(sql)) {
        const columns = selectedColumns(sql);
        return {
          rows: [columns.map((c) => (c === 'id' ? USER_ID : null))],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    }
    if (/^\s*insert/i.test(sql)) {
      return { rows: [[`inserted-${calls.length}`]], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };
  return {
    calls,
    deps: { createDb: () => drizzle(client as never, { schema }) as never },
  };
}

const env = {
  CHITTY_AUTH_SERVICE_TOKEN: SERVICE_TOKEN,
  DATABASE_URL: 'postgresql://recorded:recorded@localhost/recorded',
  CHITTY_LEDGER_BASE: 'https://ledger.chitty.cc',
  MODE: 'system',
  NODE_ENV: 'test',
  APP_VERSION: '2.0.0',
  FINANCE_KV: {} as any,
  FINANCE_R2: {} as any,
  ASSETS: { fetch: async () => new Response('Not Found', { status: 404 }) } as any,
};

const PATH = '/api/admin/seed/chart-of-accounts';

function post(body?: unknown, headers: Record<string, string> = {}) {
  const init: RequestInit = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_TOKEN}`,
      'X-Chitty-User-Id': USER_ID,
      ...headers,
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  return init;
}

const WRITES = (calls: RecordedCall[]) =>
  calls.filter((c) => /^\s*(insert|update|delete)/i.test(c.sql));

describe('POST /api/admin/seed/chart-of-accounts — access', () => {
  it('is NOT behind tenantMiddleware: no X-Tenant-ID, still 200', async () => {
    // The seed writes global rows (tenant_id IS NULL) and has no tenant to present.
    // tenantMiddleware is fail-closed since #144 and answers 400 for a missing header,
    // so /api/admin must stay out of protectedPrefixes. Adding it there turns this 200
    // into a 400 — that is the mutation this asserts against.
    const { deps, calls } = recordingDeps();
    const res = await createApp(deps).request(PATH, post(), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.mode).toBe('dry-run');
    expect(WRITES(calls)).toHaveLength(0);
  });

  it('refuses an unauthenticated request', async () => {
    const { deps, calls } = recordingDeps();
    const res = await createApp(deps).request(PATH, { method: 'POST' }, env);
    expect(res.status).toBe(401);
    expect(WRITES(calls)).toHaveLength(0);
  });

  it('refuses a wrong bearer token', async () => {
    const { deps, calls } = recordingDeps();
    const res = await createApp(deps).request(
      PATH,
      post(undefined, { Authorization: 'Bearer not-the-service-token' }),
      env,
    );
    expect(res.status).toBe(401);
    expect(WRITES(calls)).toHaveLength(0);
  });

  it('refuses a browser session: serviceAuth runs before the cookie path', async () => {
    // hybridAuth would accept a session cookie. serviceAuth precedes it on /api/admin
    // precisely so a logged-in browser cannot reach a route that rewrites the chart.
    const { deps, calls } = recordingDeps();
    const res = await createApp(deps).request(
      PATH,
      { method: 'POST', headers: { Cookie: 'chittyfinance_session=deadbeef' } },
      env,
    );
    expect(res.status).toBe(401);
    expect(WRITES(calls)).toHaveLength(0);
  });

  it('fails closed, loudly, when no service token is configured', async () => {
    const { deps } = recordingDeps();
    const res = await createApp(deps).request(PATH, post(), {
      ...env,
      CHITTY_AUTH_SERVICE_TOKEN: '',
    } as any);
    expect(res.status).toBe(500);
    expect((await res.json()) as any).toMatchObject({ error: 'auth_not_configured' });
  });

  it('requires a caller identity as well as the service token', async () => {
    // callerContext still applies: the service token alone does not reach the route.
    const { deps, calls } = recordingDeps();
    const res = await createApp(deps).request(
      PATH,
      { method: 'POST', headers: { Authorization: `Bearer ${SERVICE_TOKEN}` } },
      env,
    );
    expect(res.status).toBe(400);
    expect(WRITES(calls)).toHaveLength(0);
  });

  it('has no GET: a URL that writes when fetched is not a gate', async () => {
    const { deps } = recordingDeps();
    const res = await createApp(deps).request(
      PATH,
      { headers: { Authorization: `Bearer ${SERVICE_TOKEN}`, 'X-Chitty-User-Id': USER_ID } },
      env,
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/seed/chart-of-accounts — the apply gate', () => {
  it('defaults to a dry run and emits no write statement', async () => {
    const { deps, calls } = recordingDeps();
    const res = await createApp(deps).request(PATH, post({}), env);
    expect(res.status).toBe(200);
    // The SQL, before the self-report: hardcoding `apply: true` in the handler is the
    // mutation this is here to catch, and it must be caught by the statements actually
    // compiled, not by the mode field the same handler writes.
    expect(WRITES(calls)).toHaveLength(0);
    expect(calls.some((c) => /^\s*select/i.test(c.sql))).toBe(true);
    expect((await res.json()) as any).toMatchObject({ mode: 'dry-run' });
  });

  it('returns the plan on a dry run, so the rehearsal is itself the audit artifact', async () => {
    const { deps } = recordingDeps();
    const res = await createApp(deps).request(PATH, post(), env);
    const body = (await res.json()) as any;
    expect(body.plan.inserts.length).toBeGreaterThan(0);
    expect(body.summary.statements).toBe(
      body.plan.inserts.length + body.plan.updates.length,
    );
  });

  it('names the bundled document, by sha256, that gated the run', async () => {
    // Parity is checked against the document the BUNDLE carries, not a file on the
    // machine that launched the request. The digest is what makes that auditable.
    const { deps } = recordingDeps();
    const res = await createApp(deps).request(PATH, post(), env);
    const body = (await res.json()) as any;
    expect(body.document).toMatchObject({
      path: 'docs/CHART-OF-ACCOUNTS.md',
      source: 'bundle',
    });
    expect(body.document.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ['a string', { apply: 'true' }],
    ['a number', { apply: 1 }],
    ['a word', { apply: 'yes' }],
    ['a typo', { aply: true }],
    ['an explicit false', { apply: false }],
  ])('refuses %s rather than treating it as a dry run', async (_label, body) => {
    const { deps, calls } = recordingDeps();
    const res = await createApp(deps).request(PATH, post(body), env);
    expect(res.status).toBe(400);
    expect((await res.json()) as any).toMatchObject({ error: 'invalid_request' });
    expect(WRITES(calls)).toHaveLength(0);
  });

  it('refuses a body that is not JSON', async () => {
    const { deps } = recordingDeps();
    const res = await createApp(deps).request(
      PATH,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SERVICE_TOKEN}`,
          'X-Chitty-User-Id': USER_ID,
          'Content-Type': 'application/json',
        },
        body: 'apply=true',
      },
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe('seedRequestSchema', () => {
  /**
   * The gate as a pure function, so the mutation is a one-line edit with no HTTP around
   * it: relaxing `z.literal(true)` to `z.boolean()` makes the `false` case pass, and
   * dropping `.strict()` makes the `{aply: true}` case pass. Both are red today.
   */
  it('accepts only an absent apply or exactly true', () => {
    expect(seedRequestSchema.safeParse({}).success).toBe(true);
    expect(seedRequestSchema.safeParse({ apply: true }).success).toBe(true);
  });

  it('rejects every coercible near-miss', () => {
    for (const body of [{ apply: 'true' }, { apply: 1 }, { apply: 'yes' }, { apply: false }]) {
      expect(seedRequestSchema.safeParse(body).success).toBe(false);
    }
  });

  it('rejects an unknown key rather than silently ignoring it', () => {
    expect(seedRequestSchema.safeParse({ aply: true }).success).toBe(false);
    expect(seedRequestSchema.safeParse({ apply: true, force: true }).success).toBe(false);
  });
});
