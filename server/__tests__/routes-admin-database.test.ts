import { describe, it, expect } from 'vitest';
import { drizzle } from 'drizzle-orm/neon-http';
import { createApp } from '../app';
import * as schema from '../db/schema';

/**
 * GET /api/admin/database-identity.
 *
 * Same seam as routes-admin-seed.test.ts: a real drizzle neon-http client whose transport
 * records the compiled statement and answers it, so the SQL under test is the SQL
 * production runs. No vi.mock.
 */

const USER_ID = 'user-operator';
const SERVICE_TOKEN = 'test-svc-token';
const DATABASE_URL = 'postgresql://recorded:s3cret-pw@ep-recorded-pooler.example.neon.tech/recorded';

/** The columns a compiled SELECT projects, in order. */
function selectedColumns(sql: string): string[] {
  const list = sql.slice(sql.search(/\bselect\b/i) + 6, sql.search(/\bfrom\b/i));
  return [...list.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

function recordingDeps(opts: { knownUser?: boolean; identityThrows?: boolean } = {}) {
  const { knownUser = true, identityThrows = false } = opts;
  const calls: string[] = [];
  const client = async (sql: string) => {
    calls.push(sql);
    if (/current_database\(\)/i.test(sql)) {
      if (identityThrows) throw new Error('relation "tenants" does not exist');
      return {
        rows: [{ database: 'chittyfinance', endpoint_id: 'ep-placeholder-0000', tenant_count: 8, transaction_count: 12589 }],
        rowCount: 1,
      };
    }
    if (/\bfrom\s+"users"/i.test(sql)) {
      if (!knownUser) return { rows: [], rowCount: 0 };
      return { rows: [selectedColumns(sql).map((c) => (c === 'id' ? USER_ID : null))], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };
  return { calls, deps: { createDb: () => drizzle(client as never, { schema }) as never } };
}

const env = {
  CHITTY_AUTH_SERVICE_TOKEN: SERVICE_TOKEN,
  DATABASE_URL,
  MODE: 'system',
  NODE_ENV: 'test',
  APP_VERSION: '2.0.0',
  FINANCE_KV: {} as any,
  FINANCE_R2: {} as any,
  ASSETS: { fetch: async () => new Response('Not Found', { status: 404 }) } as any,
};

const PATH = '/api/admin/database-identity';
const authed = { headers: { Authorization: `Bearer ${SERVICE_TOKEN}`, 'X-Chitty-User-Id': USER_ID } };
const identityQueries = (calls: string[]) => calls.filter((s) => /current_database\(\)/i.test(s));

describe('GET /api/admin/database-identity', () => {
  it('reports database name, endpoint id and global counts (no X-Tenant-ID required)', async () => {
    const { deps, calls } = recordingDeps();
    const res = await createApp(deps).request(PATH, authed, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      database: 'chittyfinance',
      endpointId: 'ep-placeholder-0000',
      tenantCount: 8,
      transactionCount: 12589,
    });
    const [query] = identityQueries(calls);
    expect(query).toMatch(/current_setting\('neon\.endpoint_id', true\)/);
    expect(query).toMatch(/count\(\*\) from "tenants"/i);
    expect(query).toMatch(/count\(\*\) from "transactions"/i);
  });

  it('on a query failure, the error body carries nothing from the connection string', async () => {
    const { deps } = recordingDeps({ identityThrows: true });
    const res = await createApp(deps).request(PATH, authed, env);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('s3cret-pw');
    expect(text).not.toContain('postgresql://');
    expect(text).not.toContain('ep-recorded-pooler');
  });

  it('refuses a valid bearer with no named operator, before querying', async () => {
    const { deps, calls } = recordingDeps();
    const res = await createApp(deps).request(PATH, { headers: { Authorization: `Bearer ${SERVICE_TOKEN}` } }, env);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(identityQueries(calls)).toHaveLength(0);
  });

  it('refuses an operator id that names no user, before querying', async () => {
    const { deps, calls } = recordingDeps({ knownUser: false });
    const res = await createApp(deps).request(PATH, authed, env);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(identityQueries(calls)).toHaveLength(0);
  });

  it('refuses an unauthenticated request before querying', async () => {
    const { deps, calls } = recordingDeps();
    const res = await createApp(deps).request(PATH, {}, env);
    expect(res.status).toBe(401);
    expect(identityQueries(calls)).toHaveLength(0);
  });

  it('refuses a wrong bearer token before querying', async () => {
    const { deps, calls } = recordingDeps();
    const res = await createApp(deps).request(
      PATH,
      { headers: { Authorization: 'Bearer wrong', 'X-Chitty-User-Id': USER_ID } },
      env,
    );
    expect(res.status).toBe(401);
    expect(identityQueries(calls)).toHaveLength(0);
  });
});
