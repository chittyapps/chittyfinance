import { describe, it, expect } from 'vitest';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../../database/system.schema';
import { SystemStorage } from '../storage/system';

/**
 * `guardedWrite` is the §8 trust-path guarantee: a classification or reconciliation mutation
 * may not land without its `classification_audit` row. It is the only thing standing between
 * the books and an authoritative row nobody was authorized to write — and before this file,
 * nothing in `server/__tests__/` referenced it. §12 is explicit that a guard never seen to
 * fail is decoration, and it names §8.
 *
 * The guarantee is structural, not procedural, so it is asserted on the compiled SQL:
 *
 *   1. the audit INSERT is the FIRST statement,
 *   2. the UPDATE's WHERE carries `EXISTS (SELECT 1 FROM classification_audit WHERE id = …)`,
 *   3. the id bound in the INSERT is the SAME id the EXISTS tests for,
 *   4. both statements travel through the driver's `transaction()` — not as two independent
 *      requests.
 *
 * (3) is the one that cannot be eyeballed. If the two ids ever diverged, every write would
 * silently become a no-op; if the EXISTS were dropped, writes would land unaudited. Both
 * failures are invisible in any test that only checks the returned value.
 *
 * (4) matters because `neon-http` has no INTERACTIVE transactions, which is often mis-stated
 * as "no transactions". `db.batch` maps to the driver's `transaction()`
 * (`drizzle-orm/neon-http/session.js` → `client.transaction()`), so the pair IS atomic. This
 * test pins that the write path uses it, rather than two sequential calls that can half-apply.
 *
 * Real drizzle compilation over a recording client. No `vi.mock`.
 */

const TX_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';

interface Recorded {
  sql: string;
  params: unknown[];
}

/** The columns a compiled SELECT projects, in order. */
function selectedColumns(sql: string): string[] {
  const list = sql.slice(sql.search(/\bselect\b/i) + 6, sql.search(/\bfrom\b/i));
  return [...list.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

/** The transaction row `reconcileTransaction` reads before it writes: classified, unreconciled. */
const ROW: Record<string, unknown> = {
  id: TX_ID,
  tenant_id: TENANT_ID,
  coa_code: '5070',
  reconciled: false,
  type: 'expense',
  amount: '-125.00',
  suggested_coa_code: null,
  classified_by: 'user-1',
};

function recordingDb() {
  const built: Recorded[] = [];
  const batches: Recorded[][] = [];
  const singles: Recorded[] = [];

  const client = Object.assign(
    async (sql: string, params: unknown[]) => {
      const call = { sql, params };
      built.push(call);
      if (/^\s*select/i.test(sql) && /from\s+"transactions"/i.test(sql) && !/for update/i.test(sql)) {
        singles.push(call);
        const cols = selectedColumns(sql);
        return { rows: [cols.map((c) => (c in ROW ? ROW[c] : null))], rowCount: 1, fields: [] };
      }
      singles.push(call);
      return { rows: [], rowCount: 0, fields: [] };
    },
    {
      transaction: async (queries: unknown[]) => {
        // Each queued query was built through the function form above, so the last N recorded
        // builds are this batch's statements, in order.
        const stmts = built.slice(built.length - queries.length);
        batches.push(stmts);
        return queries.map((_, i) =>
          // audit INSERT returns its id; the UPDATE returns the row it wrote.
          i === 0
            ? { rows: [['audit-row']], rowCount: 1, fields: [] }
            : { rows: [[TX_ID]], rowCount: 1, fields: [] },
        );
      },
    },
  );

  return { db: drizzle(client as never, { schema }), batches, singles };
}

async function runReconcile() {
  const { db, batches, singles } = recordingDb();
  const storage = new SystemStorage(db as never);
  const result = await storage.reconcileTransaction(TX_ID, TENANT_ID, 'user-1');
  return { result, batches, singles };
}

describe('guardedWrite: the §8 audit gate', () => {
  it('sends the pair through the driver transaction, not as two requests', async () => {
    const { batches } = await runReconcile();
    expect(batches, 'no batch was issued — the write path is not using db.batch').toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
  });

  it('writes the audit row FIRST', async () => {
    const [[first]] = (await runReconcile()).batches;
    expect(first.sql).toMatch(/^\s*insert\s+into\s+"classification_audit"/i);
    // Selected from transactions under the same guard, locked, so the audit cannot describe
    // a row that no longer qualifies by the time the update runs.
    expect(first.sql).toMatch(/from\s+"transactions"/i);
    expect(first.sql).toMatch(/for update/i);
  });

  it('gates the UPDATE on that audit row existing', async () => {
    const [[, second]] = (await runReconcile()).batches;
    expect(second.sql).toMatch(/^\s*update\s+"transactions"/i);
    expect(
      second.sql,
      'the UPDATE has no EXISTS gate — a mutation could land with no audit row',
    ).toMatch(/exists\s*\(\s*select/i);
    expect(second.sql).toMatch(/from\s+"classification_audit"/i);
  });

  it('gates on the SAME id it just inserted', async () => {
    // The assertion that cannot be eyeballed. Diverging ids make every write a silent
    // no-op; a dropped gate makes writes unaudited. Neither shows up in the return value.
    const [[first, second]] = (await runReconcile()).batches;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const insertedId = first.params.find((p) => typeof p === 'string' && uuid.test(p) && p !== TX_ID && p !== TENANT_ID);
    expect(insertedId, `no audit uuid bound in the INSERT; params=${JSON.stringify(first.params)}`).toBeDefined();
    expect(
      second.params,
      'the EXISTS gate tests an id the INSERT never wrote',
    ).toContain(insertedId);
  });

  it('reports written only when the UPDATE returned a row', async () => {
    const { result } = await runReconcile();
    expect(result?.written).toBe(true);
  });
});
