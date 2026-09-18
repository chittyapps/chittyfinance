import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/neon-http';
import {
  assertDocumentParity,
  computeSeedPlan,
  formatSeedPlan,
  isMainModule,
  projectSeedRows,
  seedChartOfAccounts,
  PERSISTED_FIELDS,
  type ExistingAccountRow,
  type SeedAccountRow,
  type SeedAuditEvent,
} from '../../database/seeds/chart-of-accounts';
import { REI_CHART_OF_ACCOUNTS } from '../../database/chart-of-accounts';
import { registerRows, starredCodes } from '../../database/chart-of-accounts-parity';
import * as schema from '../../database/system.schema';

/**
 * Two layers, because no single artifact can be both credential-free and live:
 *
 *   1. The pure planner, and the SQL the write path actually emits. Real drizzle
 *      compilation over a recording client — no `vi.mock`, no module mocking, no fake
 *      database. Runs in CI with no credentials.
 *   2. The same statements executed on the Neon dev branch (project
 *      solitary-rice-14149088, database chittyfinance, branch br-long-voice-aki88uhh).
 *      That cannot run here — vitest has no connection string and is not given one — so
 *      it is recorded as evidence in the PR body instead, produced from the SQL layer 1
 *      captures rather than from SQL retyped by hand.
 *
 * No fixture is invented. The chart comes from the projection, the register from the
 * authoritative document, and the existing-rows fixture is a recorded read of the dev
 * branch whose md5 this suite recomputes.
 */
const DOC = readFileSync(join(__dirname, '..', '..', 'docs', 'CHART-OF-ACCOUNTS.md'), 'utf8');

const SNAPSHOT_PATH = join(
  __dirname,
  'fixtures',
  'chart-of-accounts-global-rows.dev-branch.txt',
);
/** The digest the branch itself reported for this snapshot; see the fixture's header. */
const SNAPSHOT_DIGEST = 'd28cca944484773d9fbc7a8d4805446b';

function snapshotLines(): string[] {
  return readFileSync(SNAPSHOT_PATH, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('#'));
}

/** Give a projected row an id, as the table would. */
function asExisting(row: SeedAccountRow, index: number): ExistingAccountRow {
  return {
    ...row,
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    isActive: true,
  };
}

const PROJECTED = projectSeedRows();

/**
 * The 80 global rows the dev branch holds, parsed from the recorded snapshot.
 *
 * This replaces a fixture that was built from the projection plus six hand-injected
 * pre-#157 values, and therefore asserted properties of itself. Nothing below derives a
 * field from PROJECTED; every recorded value comes out of the file. The one column the
 * file does not record is parent_code — see the note at that field.
 */
function devBranchRows(): ExistingAccountRow[] {
  return snapshotLines().map((line, index) => {
    const [code, name, type, subtype, description, scheduleELine, taxDeductible, isActive] =
      line.split('|');
    const orNull = (v: string) => (v === '~' ? null : v);
    return {
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      code,
      name,
      type,
      subtype: orNull(subtype),
      description: orNull(description),
      scheduleELine: orNull(scheduleELine),
      taxDeductible: taxDeductible === 'true',
      // The recorded SELECT did not read parent_code — see the fixture's format header —
      // so the snapshot cannot say what the column held. NULL is what the branch is
      // expected to hold (nothing has ever written the column: the derived-parent
      // revision was reverted before any apply, and the 2026-09-18 production apply
      // recorded in scripts/remediation/ sets no parent_code). It is supplied here rather
      // than back-filled into the md5-pinned fixture, and the pre-apply dry run is what
      // confirms it against the live table.
      parentCode: null,
      isActive: isActive === 'true',
    };
  });
}

describe('the recorded dev-branch snapshot', () => {
  it('still hashes to the digest the branch reported for it', () => {
    const digest = createHash('md5')
      .update([...snapshotLines()].sort().join('\n'))
      .digest('hex');
    expect(digest).toBe(SNAPSHOT_DIGEST);
  });

  it('holds 80 rows and no duplicate code', () => {
    const rows = devBranchRows();
    expect(rows).toHaveLength(80);
    expect(new Set(rows.map((r) => r.code)).size).toBe(80);
  });
});

describe('projectSeedRows', () => {
  it('projects every account in the chart, once', () => {
    expect(PROJECTED).toHaveLength(REI_CHART_OF_ACCOUNTS.length);
    expect(new Set(PROJECTED.map((r) => r.code)).size).toBe(PROJECTED.length);
  });

  it('carries the Schedule E line, which the table has a column for', () => {
    expect(PROJECTED.find((r) => r.code === '5070')?.scheduleELine).toBe('Line 14');
  });

  it('projects only the columns the authoritative document defines', () => {
    // parent_code is in, metadata is out, and the difference is the document. §1.7 and
    // §14 write the hierarchy down, so parent_code is a defined column like any other.
    // `metadata` has no definition in the document and stays out.
    expect(Object.keys(PROJECTED[0]).sort()).toEqual([
      'code',
      'description',
      'name',
      'parentCode',
      'scheduleELine',
      'subtype',
      'taxDeductible',
      'type',
    ]);
    expect(PERSISTED_FIELDS).toContain('parentCode');
    expect(PERSISTED_FIELDS).not.toContain('metadata');
  });

  it('carries a real hierarchy, not an empty one', () => {
    // Non-vacuity: every assertion below about parent_code would pass trivially if the
    // projection carried none. The count is cross-checked against the document's own
    // Parent column rather than pinned to a bare number here.
    const documented = registerRows(DOC).filter((r) => r.parentCode);
    const projected = PROJECTED.filter((r) => r.parentCode !== null);
    expect(documented.length).toBe(37);
    expect(projected).toHaveLength(documented.length);
    expect(projected.map((r) => r.code).sort()).toEqual(documented.map((r) => r.code).sort());
    expect(PROJECTED.find((r) => r.code === '4000')?.parentCode).toBe('4090');
  });

  it('gives every header account a null parent', () => {
    // One level deep: a header is nobody's child. §1.7.
    const headerCodes = new Set(
      registerRows(DOC).filter((r) => r.treatment === 'header').map((r) => r.code),
    );
    expect(headerCodes.size).toBe(10);
    for (const code of headerCodes) {
      const row = PROJECTED.find((r) => r.code === code);
      expect(row, `${code} is a header the projection does not hold`).toBeDefined();
      expect(row?.parentCode, `${code} is a header with a parent`).toBeNull();
    }
  });
});

describe('computeSeedPlan', () => {
  it('reports everything unchanged when the table already matches the chart', () => {
    const plan = computeSeedPlan(PROJECTED, PROJECTED.map(asExisting));
    expect(plan.inserts).toEqual([]);
    expect(plan.updates).toEqual([]);
    expect(plan.unchanged).toHaveLength(PROJECTED.length);
  });

  it('is idempotent: applying the plan to the table leaves nothing to do', () => {
    const existing = devBranchRows();
    const first = computeSeedPlan(PROJECTED, existing);
    // The first pass must actually be writing parent_code, or the second pass proves
    // nothing about it.
    expect(first.updates.filter((u) => u.changedFields.includes('parentCode'))).toHaveLength(
      34,
    );

    const applied: ExistingAccountRow[] = [
      ...existing.map((row) => {
        const update = first.updates.find((u) => u.id === row.id);
        return update ? { ...row, ...update.row } : row;
      }),
      ...first.inserts.map((row, i) => asExisting(row, 1000 + i)),
    ];

    const second = computeSeedPlan(PROJECTED, applied);
    expect(second.inserts).toEqual([]);
    expect(second.updates).toEqual([]);
    expect(second.unchanged).toHaveLength(PROJECTED.length);
  });

  it('treats a code the table does not hold as an insert', () => {
    const existing = PROJECTED.filter((r) => r.code !== '6050').map(asExisting);
    const plan = computeSeedPlan(PROJECTED, existing);
    expect(plan.inserts.map((r) => r.code)).toEqual(['6050']);
    expect(plan.updates).toEqual([]);
  });

  it('treats a renamed code as an update, naming the field that changed', () => {
    const existing = PROJECTED.map(asExisting).map((row) =>
      row.code === '4000' ? { ...row, name: 'Rental Income' } : row,
    );
    const plan = computeSeedPlan(PROJECTED, existing);
    expect(plan.inserts).toEqual([]);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].row.code).toBe('4000');
    expect(plan.updates[0].changedFields).toEqual(['name']);
    expect(plan.updates[0].row.name).toBe('Rental Income - Long-Term');
  });

  it('treats a row whose parent_code is NULL in the table as an update', () => {
    // The live-row case this whole change exists for: the projection says 4000 belongs
    // to header 4090, the table says nothing, so the plan must name parentCode.
    const existing = PROJECTED.map(asExisting).map((row) =>
      row.code === '4000' ? { ...row, parentCode: null } : row,
    );
    const plan = computeSeedPlan(PROJECTED, existing);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].row.code).toBe('4000');
    expect(plan.updates[0].changedFields).toEqual(['parentCode']);
    expect(plan.updates[0].row.parentCode).toBe('4090');
  });

  it('clears a stray parent the document does not define', () => {
    // A header with a parent on the live row is wrong in the other direction; the
    // document is the only source, so the seed writes NULL over it.
    const existing = PROJECTED.map(asExisting).map((row) =>
      row.code === '4090' ? { ...row, parentCode: '4000' } : row,
    );
    const plan = computeSeedPlan(PROJECTED, existing);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].row.code).toBe('4090');
    expect(plan.updates[0].changedFields).toEqual(['parentCode']);
    expect(plan.updates[0].row.parentCode).toBeNull();
  });

  it('treats a corrected Schedule E line as an update', () => {
    const existing = PROJECTED.map(asExisting).map((row) =>
      row.code === '5020' ? { ...row, scheduleELine: 'Line 14' } : row,
    );
    const plan = computeSeedPlan(PROJECTED, existing);
    expect(plan.updates.map((u) => u.row.code)).toEqual(['5020']);
    expect(plan.updates[0].changedFields).toEqual(['scheduleELine']);
  });

  it('does not call a row changed because it is inactive', () => {
    const existing = PROJECTED.map(asExisting).map((row) =>
      row.code === '9020' ? { ...row, isActive: false } : row,
    );
    const plan = computeSeedPlan(PROJECTED, existing);
    expect(plan.updates).toEqual([]);
    expect(plan.inactive).toEqual(['9020']);
  });

  it('reports a code held by more than one global row instead of picking one', () => {
    const existing = PROJECTED.map(asExisting);
    const duplicate = { ...existing[0], id: 'duplicate', name: 'Something else' };
    const plan = computeSeedPlan(PROJECTED, [...existing, duplicate]);
    expect(plan.duplicateCodes).toEqual([existing[0].code]);
    expect(plan.updates.map((u) => u.row.code)).not.toContain(existing[0].code);
    expect(plan.inserts).toEqual([]);
  });

  it('reports a global code the chart no longer defines without deleting it', () => {
    const retired: ExistingAccountRow = {
      ...asExisting(PROJECTED[0], 900),
      id: 'retired',
      code: '3200',
      name: 'Retired account',
    };
    const plan = computeSeedPlan(PROJECTED, [...PROJECTED.map(asExisting), retired]);
    expect(plan.extraneous).toEqual(['3200']);
    expect(plan.updates).toEqual([]);
    expect(plan.inserts).toEqual([]);
  });
});

describe('formatSeedPlan', () => {
  it('says activation state is untouched when every row is active', () => {
    const out = formatSeedPlan(computeSeedPlan(PROJECTED, PROJECTED.map(asExisting)));
    expect(out).toContain('the seed never changes is_active');
  });

  it('names the inactive rows so a dry run shows them', () => {
    const existing = PROJECTED.map(asExisting).map((row) =>
      row.code === '9020' ? { ...row, isActive: false } : row,
    );
    const out = formatSeedPlan(computeSeedPlan(PROJECTED, existing));
    expect(out).toContain('1 existing global row(s) are inactive and stay that way: 9020');
  });
});

describe('the delta this seed would apply to the dev branch as it stands', () => {
  const existing = devBranchRows();
  const plan = computeSeedPlan(PROJECTED, existing);

  it('starts from the 80 global accounts the snapshot holds', () => {
    expect(existing).toHaveLength(80);
    expect(PROJECTED).toHaveLength(105);
  });

  it('inserts exactly the 25 accounts the register marks as not yet seeded', () => {
    // 15 from #157 plus the 10 header accounts the hierarchy adds.
    expect(plan.inserts.map((r) => r.code).sort()).toEqual([...starredCodes(DOC)].sort());
    expect(plan.inserts).toHaveLength(25);
  });

  it('updates the six accounts #157 changed plus every child missing its parent', () => {
    // 39 = the six #157 field corrections, plus the 34 children the snapshot already
    // holds with parent_code NULL, minus 4000 which is in both sets. Written as the
    // arithmetic so the overlap stays visible.
    const fieldFixes = ['4000', '4110', '4120', '5020', '5030', '5080'];
    const parentFixes = plan.updates
      .filter((u) => u.changedFields.includes('parentCode'))
      .map((u) => u.row.code);
    expect(parentFixes).toHaveLength(34);
    expect(plan.updates).toHaveLength(
      new Set([...fieldFixes, ...parentFixes]).size,
    );
    expect(plan.updates).toHaveLength(39);
    // Every code #157 changed is still updated, and 4000 carries both reasons.
    for (const code of fieldFixes) {
      expect(plan.updates.map((u) => u.row.code)).toContain(code);
    }
    expect(plan.updates.find((u) => u.row.code === '4000')?.changedFields.sort()).toEqual([
      'description',
      'name',
      'parentCode',
    ]);
    // 80 existing rows, 39 of them touched.
    expect(plan.unchanged).toHaveLength(41);
  });

  it('finds no duplicate, no extraneous and no inactive global code', () => {
    expect(plan.duplicateCodes).toEqual([]);
    expect(plan.extraneous).toEqual([]);
    expect(plan.inactive).toEqual([]);
  });
});

describe('assertDocumentParity', () => {
  it('passes against the real document', () => {
    expect(() => assertDocumentParity(DOC)).not.toThrow();
  });

  it('refuses a projection that has drifted from the document', () => {
    const drifted = DOC.replace(
      '| 5070 | Repairs | expense |',
      '| 5070 | Repairs and upkeep | expense |',
    );
    expect(drifted).not.toBe(DOC);
    expect(() => assertDocumentParity(drifted)).toThrow(/Refusing to seed/);
  });
});

describe('isMainModule', () => {
  it('matches the module it is given, resolved through a relative path', () => {
    const self = join(__dirname, '..', '..', 'database', 'seeds', 'chart-of-accounts.ts');
    const url = new URL('../../database/seeds/chart-of-accounts.ts', import.meta.url).href;
    expect(isMainModule(url, self)).toBe(true);
    expect(isMainModule(url, join(__dirname, '..', '..', 'package.json'))).toBe(false);
  });

  it('fails loudly rather than exiting 0 when the entry script is unknown', () => {
    expect(() => isMainModule(import.meta.url, undefined)).toThrow(/process.argv\[1\]/);
    expect(() => isMainModule(import.meta.url, '/nonexistent/entry.ts')).toThrow(
      /Cannot resolve the entry script/,
    );
  });
});

// ── The write path ───────────────────────────────────────────────────────────────────
//
// A real drizzle neon-http database over a client that records the statement instead of
// sending it. Drizzle compiles the SQL exactly as it would in production; only the
// transport is substituted. This is not a mocked DB module — nothing is intercepted at
// module scope, and the assertions are on real compiled SQL.

interface RecordedCall {
  sql: string;
  params: unknown[];
}

/** snake_case column name -> the ExistingAccountRow key holding its value. */
const COLUMN_TO_FIELD: Record<string, keyof ExistingAccountRow> = {
  id: 'id',
  code: 'code',
  name: 'name',
  type: 'type',
  subtype: 'subtype',
  description: 'description',
  schedule_e_line: 'scheduleELine',
  tax_deductible: 'taxDeductible',
  parent_code: 'parentCode',
  is_active: 'isActive',
};

/** The ExistingAccountRow key -> the snake_case column it is written to. */
const FIELD_TO_COLUMN = Object.fromEntries(
  Object.entries(COLUMN_TO_FIELD).map(([column, field]) => [field, column]),
) as Record<keyof ExistingAccountRow, string>;

/**
 * The value drizzle sent for one column of an INSERT, or NOT_BOUND when it sent the
 * literal `default` keyword instead — i.e. when nothing was supplied for that column and
 * the server-side column default decides the value.
 */
const NOT_BOUND = Symbol('default');

/**
 * Zip a compiled INSERT's column list against its VALUES tuple, resolving each `$n` to
 * the parameter actually bound and every `default` to NOT_BOUND.
 *
 * This is the only way to tell an omitted column from a written one. Drizzle builds the
 * column list from the TABLE definition, not from the keys of `.values()` — every column
 * of chart_of_accounts appears in every compiled INSERT no matter what was supplied, so
 * asserting a column NAME appears in the SQL is vacuous. An omitted column shows up
 * solely as `default` occupying its slot in the VALUES tuple and consuming no parameter.
 */
function insertedValues(call: RecordedCall): Record<string, unknown> {
  const shape = call.sql.match(/\(([^)]*)\)\s+values\s+\(([^)]*)\)/i);
  if (!shape) throw new Error(`Not a compiled single-row INSERT: ${call.sql}`);
  const columns = shape[1].split(',').map((c) => c.trim().replace(/"/g, ''));
  const slots = shape[2].split(',').map((s) => s.trim());
  if (columns.length !== slots.length) {
    throw new Error(`INSERT has ${columns.length} columns and ${slots.length} values`);
  }
  return Object.fromEntries(
    columns.map((column, i) => {
      const slot = slots[i];
      const bound = slot.match(/^\$(\d+)$/);
      return [column, bound ? call.params[Number(bound[1]) - 1] : NOT_BOUND];
    }),
  );
}

/**
 * The columns an INSERT is expected to leave to the server: the generated id, and the
 * four columns with a table default the seed deliberately does not override.
 */
const UNBOUND_COLUMNS = ['created_at', 'effective_date', 'id', 'metadata', 'updated_at'];

/** The columns a compiled SELECT projects, in order. */
function selectedColumns(sql: string): string[] {
  const list = sql.slice(sql.search(/\bselect\b/i) + 6, sql.search(/\bfrom\b/i));
  return [...list.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

function recordingDb(existingRows: ExistingAccountRow[]) {
  const calls: RecordedCall[] = [];
  // neon-http is asked for arrayMode when drizzle has fields to map, so a recorded row
  // is returned positionally, in the order the compiled statement selects.
  const client = async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    if (/^\s*select/i.test(sql)) {
      const columns = selectedColumns(sql);
      return {
        rows: existingRows.map((row) => columns.map((c) => row[COLUMN_TO_FIELD[c]])),
        rowCount: existingRows.length,
      };
    }
    if (/^\s*insert/i.test(sql)) {
      return { rows: [[`inserted-${calls.length}`]], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };
  return { db: drizzle(client as never, { schema }), calls };
}

async function runApply(existingRows: ExistingAccountRow[]) {
  const { db, calls } = recordingDb(existingRows);
  const audit: SeedAuditEvent[] = [];
  const plan = await seedChartOfAccounts({
    apply: true,
    db,
    audit: async (event) => {
      audit.push(event);
    },
  });
  return { plan, calls, audit };
}

const SELECT = (calls: RecordedCall[]) => calls.filter((c) => /^\s*select/i.test(c.sql));
const INSERTS = (calls: RecordedCall[]) => calls.filter((c) => /^\s*insert/i.test(c.sql));
const UPDATES = (calls: RecordedCall[]) => calls.filter((c) => /^\s*update/i.test(c.sql));

describe('seedChartOfAccounts: the statements it emits', () => {
  it('reads only global rows', async () => {
    const { calls } = await runApply(devBranchRows());
    expect(SELECT(calls)).toHaveLength(1);
    expect(SELECT(calls)[0].sql).toContain('"tenant_id" is null');
  });

  it('scopes every update to tenant_id IS NULL as well as the row id', async () => {
    // Deleting isNull(chartOfAccounts.tenantId) from the update WHERE is exactly the
    // mutation this asserts against: a tenant override sharing a code must be unreachable.
    const { calls } = await runApply(devBranchRows());
    const updates = UPDATES(calls);
    expect(updates).toHaveLength(39);
    for (const call of updates) {
      expect(call.sql).toMatch(/"id" = \$\d+ and "chart_of_accounts"\."tenant_id" is null/);
    }
  });

  it('sets exactly the persisted fields plus updated_at, and nothing else', async () => {
    // Unlike the INSERT column list, an UPDATE's SET list IS built from the keys of
    // `.set()`, so parsing it does detect an omitted column: dropping taxDeductible from
    // the seed's `.set({...})` fails this assertion. Its limits, both deliberate: it
    // inspects one statement, and it checks column names rather than bound values — the
    // per-column value check lives on the insert guard below.
    const { calls } = await runApply(devBranchRows());
    const setClause = UPDATES(calls)[0].sql.split(/\bset\b/i)[1].split(/\bwhere\b/i)[0];
    const columns = [...setClause.matchAll(/"([a-z_]+)" = /g)].map((m) => m[1]).sort();
    expect(columns).toEqual([
      'description',
      'name',
      'parent_code',
      'schedule_e_line',
      'subtype',
      'tax_deductible',
      'type',
      'updated_at',
    ]);
    // parent_code is in the SET list, not just in the plan: a plan that reports the
    // change while the SQL omits the column would leave every child NULL forever.
    expect(setClause).toContain('parent_code');
    // The three the review named, each its own mutation:
    expect(setClause).not.toContain('is_active');
    expect(setClause).not.toContain('modified_by');
    expect(setClause).not.toContain('metadata');
  });

  it('inserts global rows: tenant_id bound null, modified_by the seed', async () => {
    const { calls } = await runApply(devBranchRows());
    const inserts = INSERTS(calls);
    expect(inserts).toHaveLength(25);

    // Every insert is checked against the row the projection says it is inserting, column
    // by column, on the VALUE drizzle actually bound. Asserting on the SQL text cannot do
    // this: drizzle emits the whole table's column list regardless of what `.values()`
    // supplied, so `sql` names tax_deductible and parent_code even when neither is
    // written. Only the VALUES tuple distinguishes a bound column from `default` —
    // which is exactly how the 2026-09-18 production apply
    // (scripts/remediation/2026-09-18-chart-of-accounts-seed.sql) silently left four
    // deductible accounts at the column default of false.
    for (const call of inserts) {
      const written = insertedValues(call);
      const code = written.code;
      const row = PROJECTED.find((r) => r.code === code);
      expect(row, `insert for an unprojected code ${String(code)}`).toBeDefined();

      for (const field of PERSISTED_FIELDS) {
        const column = FIELD_TO_COLUMN[field];
        expect(column, `${field} has no column mapping`).toBeDefined();
        expect(
          written[column],
          `${String(code)}: ${column} is not written (drizzle sent \`default\`)`,
        ).not.toBe(NOT_BOUND);
        expect(written[column], `${String(code)}: ${column} written wrong`).toStrictEqual(
          row![field],
        );
      }

      // The three columns the seed sets itself rather than taking from the projection.
      expect(written.tenant_id).toBeNull();
      expect(written.is_active).toBe(true);
      expect(written.modified_by).toBe('seed:chart-of-accounts');

      // …and exactly these are left to the table's own defaults. Both directions matter:
      // a column that stops being written joins this set, and a column that starts being
      // hardcoded leaves it.
      const unbound = Object.entries(written)
        .filter(([, value]) => value === NOT_BOUND)
        .map(([column]) => column)
        .sort();
      expect(unbound, `${String(code)}: unexpected default columns`).toEqual(UNBOUND_COLUMNS);
    }

    // The four codes whose tax_deductible the production apply got wrong are inserts here,
    // and land as true. Non-vacuity for the check above: if every projected row were
    // tax_deductible false, omitting the column would still satisfy it by accident.
    for (const code of ['5015', '5025', '5055', '6050']) {
      const call = inserts.find((c) => insertedValues(c).code === code);
      expect(call, `${code} is not among the inserts`).toBeDefined();
      expect(insertedValues(call!).tax_deductible, `${code} tax_deductible`).toBe(true);
    }

    // 4005 is a child that arrives by insert: it must land already pointing at 4090.
    const midTerm = inserts.find(
      (c) => insertedValues(c).name === 'Rental Income - Mid-Term Furnished',
    );
    expect(midTerm).toBeDefined();
    expect(insertedValues(midTerm!).parent_code).toBe('4090');
  });

  it('never emits a delete', async () => {
    const extraneous: ExistingAccountRow = {
      ...asExisting(PROJECTED[0], 900),
      id: 'retired',
      code: '3200',
      name: 'Retired account',
    };
    const { calls, plan } = await runApply([...devBranchRows(), extraneous]);
    expect(plan.extraneous).toEqual(['3200']);
    expect(calls.some((c) => /^\s*delete/i.test(c.sql))).toBe(false);
  });

  it('writes nothing for a code held by more than one global row', async () => {
    const rows = devBranchRows();
    const { calls, plan } = await runApply([...rows, { ...rows[0], id: 'duplicate' }]);
    expect(plan.duplicateCodes).toEqual([rows[0].code]);
    expect(UPDATES(calls).map((c) => c.params).flat()).not.toContain(rows[0].id);
  });

  it('writes nothing at all on a second run', async () => {
    // Re-run against a table that already holds the whole projection: no thrash on
    // updated_at, no re-insert.
    const { calls, plan, audit } = await runApply(PROJECTED.map(asExisting));
    expect(plan.inserts).toEqual([]);
    expect(plan.updates).toEqual([]);
    expect(INSERTS(calls)).toHaveLength(0);
    expect(UPDATES(calls)).toHaveLength(0);
    expect(audit).toEqual([]);
  });

  it('writes nothing in a dry run', async () => {
    const { db, calls } = recordingDb(devBranchRows());
    const plan = await seedChartOfAccounts({ db });
    expect(plan.inserts).toHaveLength(25);
    expect(INSERTS(calls)).toHaveLength(0);
    expect(UPDATES(calls)).toHaveLength(0);
  });
});

describe('seedChartOfAccounts: the audit trail', () => {
  it('emits one record per written row, naming the fields that changed', async () => {
    const { audit, plan } = await runApply(devBranchRows());
    expect(audit).toHaveLength(plan.inserts.length + plan.updates.length);
    expect(audit.filter((e) => e.action === 'create')).toHaveLength(25);
    const updates = audit.filter((e) => e.action === 'update');
    expect(updates).toHaveLength(39);
    expect(updates.map((e) => e.code)).toEqual(plan.updates.map((u) => u.row.code));
    expect(
      updates.filter((e) => e.changedFields?.includes('parentCode')),
    ).toHaveLength(34);
    expect(updates.every((e) => (e.changedFields?.length ?? 0) > 0)).toBe(true);
  });

  it('carries the id of the row it wrote, so the record points at something', async () => {
    const { audit } = await runApply(devBranchRows());
    for (const event of audit) expect(event.accountId).toBeTruthy();
  });
});

describe('seedChartOfAccounts: it refuses to write a drifted tree', () => {
  const DRIFTED = DOC.replace(
    '| 5070 | Repairs | expense |',
    '| 5070 | Repairs and upkeep | expense |',
  );

  it('throws before emitting a single write', async () => {
    const { db, calls } = recordingDb(devBranchRows());
    await expect(
      seedChartOfAccounts({ apply: true, db, document: DRIFTED, audit: async () => {} }),
    ).rejects.toThrow(/Refusing to seed/);
    expect(INSERTS(calls)).toHaveLength(0);
    expect(UPDATES(calls)).toHaveLength(0);
  });

  it('requires a database url or a client', async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      await expect(seedChartOfAccounts({})).rejects.toThrow(/DATABASE_URL is required/);
    } finally {
      if (saved !== undefined) process.env.DATABASE_URL = saved;
    }
  });
});
