/**
 * Produce the §7 gate package for "Change A" of the chart-of-accounts migration —
 * the STRUCTURAL change: the 25 missing accounts, the parent_code hierarchy, the one
 * renamed account, and the description drift.
 *
 * finance-operating-defaults §7 says a production financial write is operator-gated, and
 * that the gate is only meaningful if what is presented is complete: the COMPILED statements
 * (§2), the pre-write snapshot (§4), a rollback recipe covering every column touched
 * including updated_at, the §5 reconciliation digest, and the blast radius. Asking an
 * operator to approve a *described* change is not a gate — it is a request to trust a
 * description.
 *
 * WHY THIS SUPERSEDES scripts/coa-apply-gate-package.ts
 *
 * That package (#214) compiled four UPDATEs over codes 5015/5025/5055/6050, asserting a
 * `tax_deductible` defect on them. Those four codes hold NO ROW in production — they were
 * never inserted. The four UPDATEs would have matched zero rows and the apply would have
 * reported success. The defect was not in computeSeedPlan; it was in the FIXTURE the plan
 * was computed against, which was built by inverting `tax_deductible` on rows the fixture
 * itself invented. A plan derived from a fabricated `existing` set can assert anything.
 *
 * So the rule this package is built to: every statement is derived from
 * `computeSeedPlan(projectSeedRows(), existing, scope)`, and `existing` is a declared
 * MEASURED constant whose every assumption is named in §10 — never a transform of the
 * projection that happens to produce the delta being claimed.
 *
 * Nothing here touches a database. Nothing here needs a credential. The output is
 * byte-deterministic so the committed artifact can be diffed against a fresh run.
 *
 *   npx tsx scripts/coa-change-a-gate-package.ts > docs/gates/coa-change-a-2026-10-21.md
 */
import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/neon-http';
import {
  computeSeedPlan,
  projectSeedRows,
  seedChartOfAccounts,
  PERSISTED_FIELDS,
  type ExistingAccountRow,
  type PersistedField,
  type SeedAccountRow,
  type SeedPlan,
  type SeedScope,
} from '../database/seeds/chart-of-accounts';
import * as schema from '../database/system.schema';

// ---------------------------------------------------------------------------
// MEASURED STATE
//
// Measured against production `chart_of_accounts` on 2026-10-21. These are DATA, not
// derivations: nothing below is computed from the projection, because computing the
// "existing" set from the projection is precisely how #214 came to assert a plan the live
// table contradicted. Every constant here is asserted against the projection in
// assertMeasuredState() so a drifting document fails the generator rather than silently
// re-shaping the package.
// ---------------------------------------------------------------------------

/** Phase 1: the ten rollup headers. Absent from production; every child points at one. */
export const HEADER_CODES = [
  '1090', '1190', '2590', '4090', '4095', '5190', '5290', '5390', '5490', '7090',
] as const;

/** Phase 2: the fifteen posting accounts absent from production. */
export const POSTING_CODES = [
  '1900', '1910', '1920', '1130', '2045', '2540', '4005', '4008', '4070', '4080',
  '5015', '5025', '5055', '6050', '9040',
] as const;

/** Every code the projection defines and production does not hold. 10 + 15 = 25. */
export const MISSING_CODES = [...HEADER_CODES, ...POSTING_CODES];

/** Rows production holds. Measured: 80, every one `tenant_id IS NULL`. */
export const MEASURED_EXISTING_COUNT = 80;

/**
 * CHANGE B — form-line mapping, EXCLUDED from this package.
 *
 * §6 separates tax semantics from structure: a form-line change is the tax-semantic class
 * and ships as its own independently auditable change, because its reviewer is asking a
 * different question ("is Line 7 the right line for 5020?") than a structural reviewer is.
 * Shipping the two together means neither question gets asked.
 *
 * The `from` values are the measured production values, carried here for exactly one
 * reason: the drift must EXIST in the fixture, or the guard that proves the scope holds it
 * back is asserting over an empty set and proves nothing.
 */
export const CHANGE_B_SCHEDULE_E: ReadonlyArray<{ code: string; from: string | null }> = [
  { code: '4110', from: null },
  { code: '4120', from: null },
  { code: '5020', from: 'Line 14' },
  { code: '5030', from: 'Line 7' },
  { code: '5080', from: 'Line 14' },
];

/** The one measured `name` drift. */
export const MEASURED_NAME_DRIFT = { code: '4000', from: 'Rental Income' } as const;

/**
 * Per-field aggregate digests measured on both sides for the 80 common codes. `type`,
 * `subtype` and `taxDeductible` are IDENTICAL — which is why Change A emits no statement
 * for them even though two of the three are inside its field scope.
 *
 * Recorded because "there is no tax_deductible defect" is the claim that retires #214, and
 * a claim that retires a shipped package should carry its evidence.
 */
export const MEASURED_IDENTICAL_FIELDS: ReadonlyArray<{ field: PersistedField; digest: string }> = [
  { field: 'taxDeductible', digest: '7b44da66cdfb' },
];

/**
 * CHANGE A's field scope: every persisted field EXCEPT the form-line mapping.
 *
 * Expressed as a SUBTRACTION from PERSISTED_FIELDS rather than as an allow-list, because
 * that is what §6 actually says — structure is everything that is not tax semantics. An
 * allow-list silently drops any column PERSISTED_FIELDS later gains; a subtraction picks it
 * up and forces whoever adds it to decide which class it belongs to.
 */
export const CHANGE_A_FIELDS: PersistedField[] = PERSISTED_FIELDS.filter(
  (f) => f !== 'scheduleELine',
);

// ---------------------------------------------------------------------------
// The fixture
// ---------------------------------------------------------------------------

/**
 * Production's 80 global rows, as measured.
 *
 * Built by removing the 25 measured-absent codes from the projection and then applying the
 * measured drift. The ids are self-documenting strings rather than synthetic UUIDs: a
 * synthetic UUID in a gate package is indistinguishable from a real one, and an operator
 * who copies one into a WHERE clause writes nothing and sees success.
 *
 * Three assumptions, each named again in §10 because they bound what this package can show:
 *   - `parent_code` is taken as NULL on all 80. Production's per-row parent values were not
 *     captured. Where a row holds a STRAY parent the document clears to NULL (5050, 9010
 *     were cited as examples), the live apply emits an UPDATE this package does not compile.
 *   - `description` is taken as matching the document on all 80. The description drift was
 *     measured only in aggregate and never isolated to a code list, so the live apply emits
 *     description UPDATEs this package does not compile.
 *   - The 9 measured-identical codes are not identified, so this fixture's drifted-row count
 *     is a LOWER BOUND on the measured 71.
 *
 * None of the three affects a compiled statement's SQL shape, SET list, WHERE clause, or
 * bound value — an UPDATE binds the DESIRED value, which comes from the authoritative
 * projection. They affect only WHICH rows appear. The snapshot in §4 resolves all three.
 */
export function measuredExistingRows(): ExistingAccountRow[] {
  const absent = new Set<string>(MISSING_CODES);
  const scheduleEFrom = new Map(CHANGE_B_SCHEDULE_E.map((d) => [d.code, d.from]));
  return projectSeedRows()
    .filter((row: SeedAccountRow) => !absent.has(row.code))
    .map((row: SeedAccountRow): ExistingAccountRow => ({
      ...row,
      id: `<snapshot.id for ${row.code}>`,
      isActive: true,
      // Measured: production holds no parent_code on the rows this package compiles.
      parentCode: null,
      // Measured: the five Change B rows carry the wrong form line; everything else matches.
      scheduleELine: scheduleEFrom.has(row.code)
        ? (scheduleEFrom.get(row.code) ?? null)
        : row.scheduleELine,
      name: row.code === MEASURED_NAME_DRIFT.code ? MEASURED_NAME_DRIFT.from : row.name,
    }));
}

/**
 * Fail the generator when the measured constants and the authoritative document disagree.
 *
 * This is the guard that makes #214's defect unrepeatable in kind. #214's fixture could not
 * contradict its plan because the fixture WAS the plan's input, reshaped. Here the fixture
 * is data, so it CAN contradict the document — and when it does, that is a fact about one
 * of them, not something to render into an artifact an operator will sign.
 */
export function assertMeasuredState(projected: SeedAccountRow[]): void {
  const byCode = new Map(projected.map((r) => [r.code, r]));
  const fail = (m: string): never => {
    throw new Error(`measured state contradicts the authoritative document: ${m}`);
  };

  if (projected.length !== 105) fail(`projection holds ${projected.length} accounts, measured 105`);

  const unknown = MISSING_CODES.filter((c) => !byCode.has(c));
  if (unknown.length) fail(`${unknown.length} measured-absent code(s) are not in the chart: ${unknown.join(', ')}`);
  if (new Set(MISSING_CODES).size !== 25) fail(`measured-absent set is ${new Set(MISSING_CODES).size} codes, expected 25`);

  const documentHeaders = projected.filter((r) => r.subtype === 'header').map((r) => r.code).sort();
  const declaredHeaders = [...HEADER_CODES].sort();
  if (documentHeaders.join(',') !== declaredHeaders.join(','))
    fail(`the document's header accounts (${documentHeaders.join(', ')}) are not HEADER_CODES (${declaredHeaders.join(', ')})`);

  if (projected.length - MISSING_CODES.length !== MEASURED_EXISTING_COUNT)
    fail(`105 - 25 is not the measured ${MEASURED_EXISTING_COUNT} existing rows`);

  for (const d of CHANGE_B_SCHEDULE_E) {
    const row = byCode.get(d.code);
    if (!row) fail(`Change B code ${d.code} is not in the chart`);
    if (row!.scheduleELine === d.from)
      fail(`Change B code ${d.code} is measured drifted from ${JSON.stringify(d.from)} but the document also says ${JSON.stringify(d.from)} — there is no drift to defer`);
  }
  const nameRow = byCode.get(MEASURED_NAME_DRIFT.code);
  if (!nameRow) fail(`${MEASURED_NAME_DRIFT.code} is not in the chart`);
  if (nameRow!.name === MEASURED_NAME_DRIFT.from)
    fail(`${MEASURED_NAME_DRIFT.code} is measured drifted from "${MEASURED_NAME_DRIFT.from}" but the document says the same`);

  // §1.7 integrity, asserted rather than rediscovered.
  const headers = new Set<string>(HEADER_CODES);
  const children = projected.filter((r) => r.parentCode !== null);
  const dangling = children.filter((r) => !byCode.has(r.parentCode!));
  if (dangling.length) fail(`${dangling.length} dangling parent ref(s)`);
  const nonHeaderParents = children.filter((r) => !headers.has(r.parentCode!));
  if (nonHeaderParents.length) fail(`${nonHeaderParents.length} row(s) point at a non-header parent`);
  const parentedHeaders = projected.filter((r) => headers.has(r.code) && r.parentCode !== null);
  if (parentedHeaders.length) fail(`${parentedHeaders.length} header(s) carry a parent`);
  const tooDeep = children.filter((r) => byCode.get(r.parentCode!)!.parentCode !== null);
  if (tooDeep.length) fail(`tree depth exceeds 1 on ${tooDeep.length} row(s)`);
}

// ---------------------------------------------------------------------------
// Compilation against a recording client
// ---------------------------------------------------------------------------

export interface CompiledStatement {
  phase: 1 | 2 | 3;
  kind: 'insert' | 'update';
  /** The account code this statement writes. */
  code: string;
  sql: string;
  /** Bind values in `$n` order. A Date is rendered, never stringified as a fake instant. */
  params: string[];
  /** The columns in an UPDATE's SET list, read off the compiled SQL. Empty for an INSERT. */
  setColumns: string[];
}

/**
 * A bind value, rendered so nothing in the artifact reads as a real captured value.
 *
 * The timestamp case is not hypothetical and it is not cosmetic. The seed stamps
 * `new Date()` at execution; drizzle's neon-http param mapper serializes it to an ISO
 * string BEFORE the client sees it, so an `instanceof Date` check never fires and the
 * generator's own clock reading lands in the artifact looking like a captured value. It
 * also made the output non-deterministic, so a committed package could not be diffed
 * against a fresh run. Matched on shape for that reason: no account name, description or
 * code in the chart is an ISO-8601 instant.
 */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

function renderParam(value: unknown): string {
  if (value instanceof Date) return '<apply-time: new Date() stamped at execution>';
  if (typeof value === 'string' && ISO_INSTANT.test(value)) {
    return '<apply-time: new Date() stamped at execution>';
  }
  return JSON.stringify(value);
}

function setColumns(sql: string): string[] {
  const clause = sql.split(/\bset\b/i)[1]?.split(/\bwhere\b/i)[0] ?? '';
  return [...clause.matchAll(/"([a-z_]+)" = /g)].map((m) => m[1]);
}

const READBACK_COLUMNS: Record<string, keyof ExistingAccountRow> = {
  id: 'id', code: 'code', name: 'name', type: 'type', subtype: 'subtype',
  description: 'description', schedule_e_line: 'scheduleELine',
  tax_deductible: 'taxDeductible', parent_code: 'parentCode', is_active: 'isActive',
};

/**
 * Run the real seed path against a client that RECORDS each statement and sends nothing.
 *
 * The seed is the only sanctioned write path for the books (§2: never hand-write apply SQL)
 * and the only thing that calls assertDocumentParity() before writing. Compiling through it
 * means the statements in this artifact are drizzle's output from the same code the Worker
 * runs — not a transcription of it, which is the failure mode §2 exists to prevent.
 */
async function compilePhase(
  phase: 1 | 2 | 3,
  existing: ExistingAccountRow[],
  scope: SeedScope,
): Promise<{ plan: SeedPlan; statements: CompiledStatement[] }> {
  const recorded: Array<{ sql: string; params: unknown[] }> = [];
  const client = async (sql: string, params: unknown[]) => {
    recorded.push({ sql, params });
    if (/^\s*select/i.test(sql)) {
      const list = sql.slice(sql.search(/\bselect\b/i) + 6, sql.search(/\bfrom\b/i));
      const columns = [...list.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
      return {
        rows: existing.map((r) => columns.map((c) => r[READBACK_COLUMNS[c]])),
        rowCount: existing.length,
      };
    }
    // INSERT ... RETURNING "id". The seed reads inserted.id for its audit record, so a
    // client that returns no row throws on the first header. #214's client returned none
    // and never found out, because its scope compiled zero inserts.
    if (/\breturning\b/i.test(sql)) {
      return { rows: [['<id assigned by postgres at insert time>']], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };

  // The seed logs "Applying chart of accounts: ... Wrote 10 insert(s)". Nothing was
  // written — the client records and discards. Leaving that line in a gate package would
  // be the single most misleading sentence in it.
  const realLog = console.log;
  console.log = () => {};
  let plan: SeedPlan;
  try {
    plan = await seedChartOfAccounts({
      apply: true,
      db: drizzle(client as never, { schema }),
      scope,
      audit: async () => {},
    });
  } finally {
    console.log = realLog;
  }

  // Match each recorded DML statement to the plan entry that produced it. The seed writes
  // every insert in plan order, then every update in plan order, so position is the join
  // key — and the join is asserted, not assumed.
  const dml = recorded.filter((c) => !/^\s*select/i.test(c.sql));
  const expected = plan.inserts.length + plan.updates.length;
  if (dml.length !== expected) {
    throw new Error(
      `phase ${phase}: the plan holds ${plan.inserts.length} insert(s) and ${plan.updates.length} ` +
        `update(s) but ${dml.length} statement(s) were compiled. The plan and the SQL have ` +
        `diverged; this package must not render either.`,
    );
  }
  const statements: CompiledStatement[] = dml.map((c, i) => {
    const isInsert = i < plan.inserts.length;
    const code = isInsert
      ? plan.inserts[i].code
      : plan.updates[i - plan.inserts.length].row.code;
    const kind: 'insert' | 'update' = isInsert ? 'insert' : 'update';
    if (kind === 'insert' !== /^\s*insert/i.test(c.sql)) {
      throw new Error(`phase ${phase}: statement ${i + 1} is a ${kind} in the plan and not in the SQL`);
    }
    return {
      phase,
      kind,
      code,
      sql: c.sql,
      params: c.params.map(renderParam),
      setColumns: kind === 'update' ? setColumns(c.sql) : [],
    };
  });
  return { plan, statements };
}

// ---------------------------------------------------------------------------
// §5 digest
// ---------------------------------------------------------------------------

/**
 * The normalisation the derivation uses, so the §5 digest and the plan cannot disagree
 * about what "equal" means: NULL → '', boolean → 'true'/'false'.
 */
export function normaliseForDigest(value: string | boolean | null): string {
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return value;
}

/** md5 of `code:name:description:parent:schedule_e:tax_deductible` joined by ',' ordered by code. */
export function digestRows(rows: SeedAccountRow[]): string {
  const body = [...rows]
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
    .map((r) =>
      [
        r.code,
        normaliseForDigest(r.name),
        normaliseForDigest(r.description),
        normaliseForDigest(r.parentCode),
        normaliseForDigest(r.scheduleELine),
        normaliseForDigest(r.taxDeductible),
      ].join(':'),
    )
    .join(',');
  return createHash('md5').update(body).digest('hex').slice(0, 12);
}

/**
 * The chart as it stands AFTER Change A and BEFORE Change B: the document on every column
 * Change A writes, with the five form lines still at their measured production values.
 *
 * This is the only digest an operator can legitimately check after Change A. The
 * projection's own digest is the post-Change-B state and would read as a failed apply.
 */
export function expectedPostChangeARows(): SeedAccountRow[] {
  const held = new Map(CHANGE_B_SCHEDULE_E.map((d) => [d.code, d.from]));
  return projectSeedRows().map((row) =>
    held.has(row.code) ? { ...row, scheduleELine: held.get(row.code) ?? null } : row,
  );
}

// ---------------------------------------------------------------------------
// The package
// ---------------------------------------------------------------------------

export interface ChangeAPackage {
  statements: CompiledStatement[];
  plans: { phase1: SeedPlan; phase2: SeedPlan; phase3: SeedPlan };
  markdown: string;
}

const sqlList = (codes: readonly string[]): string => codes.map((c) => `'${c}'`).join(', ');

export async function buildChangeAPackage(): Promise<ChangeAPackage> {
  const projected = projectSeedRows();
  assertMeasuredState(projected);

  const existing = measuredExistingRows();
  if (existing.length !== MEASURED_EXISTING_COUNT) {
    throw new Error(`fixture holds ${existing.length} rows, measured ${MEASURED_EXISTING_COUNT}`);
  }

  // Phase 1 — the ten headers. A CODE scope, which may insert; a field scope never can,
  // because an INSERT writes every column by definition.
  const p1 = await compilePhase(1, existing, { codes: [...HEADER_CODES] });

  // Phase 2 — the fifteen posting accounts, against the table phase 1 leaves behind. Some
  // of them carry a parent_code pointing at a phase 1 header, which is why the order is
  // not cosmetic.
  const afterP1 = [...existing, ...p1.plan.inserts.map(insertedRow)];
  const p2 = await compilePhase(2, afterP1, { codes: [...POSTING_CODES] });

  // Phase 3 — the updates, against the full 105-row table phases 1-2 leave behind. A FIELD
  // scope: every persisted column except the form-line mapping. This is the mechanism that
  // holds Change B back, and it is the only one — there is no second list of excluded codes
  // to keep in sync.
  const afterP2 = [...afterP1, ...p2.plan.inserts.map(insertedRow)];
  const p3 = await compilePhase(3, afterP2, { fields: CHANGE_A_FIELDS });

  const statements = [...p1.statements, ...p2.statements, ...p3.statements];
  const markdown = render({ projected, existing, p1, p2, p3, statements });
  return {
    statements,
    plans: { phase1: p1.plan, phase2: p2.plan, phase3: p3.plan },
    markdown,
  };
}

/** A row phase 1/2 inserted, as phase 3 will read it back. */
function insertedRow(row: SeedAccountRow): ExistingAccountRow {
  return { ...row, id: `<snapshot.id for ${row.code}>`, isActive: true };
}

function render(ctx: {
  projected: SeedAccountRow[];
  existing: ExistingAccountRow[];
  p1: { plan: SeedPlan; statements: CompiledStatement[] };
  p2: { plan: SeedPlan; statements: CompiledStatement[] };
  p3: { plan: SeedPlan; statements: CompiledStatement[] };
  statements: CompiledStatement[];
}): string {
  const { projected, p1, p2, p3, statements } = ctx;
  const out: string[] = [];
  const h = (t: string) => out.push('', `## ${t}`, '');
  const parentUpdates = p3.plan.updates.filter((u) => u.changedFields.includes('parentCode'));
  const nameUpdates = p3.plan.updates.filter((u) => u.changedFields.includes('name'));
  const descUpdates = p3.plan.updates.filter((u) => u.changedFields.includes('description'));
  const documentChildren = projected.filter((r) => r.parentCode !== null).length;

  out.push(
    '# Chart of accounts — Change A (structural) — §7 gate package',
    '',
    'Generated by `scripts/coa-change-a-gate-package.ts`. **Nothing in this run touched a',
    'database and nothing in it needed a credential.** No statement below has been executed.',
    'The apply remains operator-gated.',
    '',
    'The output is byte-deterministic: re-running the generator on the same tree reproduces',
    'this file exactly, so a diff against a fresh run is a real check.',
  );

  h('What this change is, and what it deliberately is not');
  out.push(
    '**Change A — structural.** Bring the live global chart (`tenant_id IS NULL`) up to the',
    'authoritative document on everything that is not a tax-form mapping: the 25 accounts the',
    'document defines and the table does not hold, the `parent_code` hierarchy, the one renamed',
    'account, and the `description` drift.',
    '',
    '**Change B — form-line mapping. NOT IN THIS PACKAGE.** Five `schedule_e_line` drifts',
    '(4110, 4120, 5020, 5030, 5080) are the tax-semantic class and ship as their own',
    'independently auditable change, per §6. A structural reviewer is asking "is this account',
    'in the right place in the tree?"; a form-line reviewer is asking "is Line 7 the right line',
    'for 5020?". Put the two in one package and neither question gets asked properly.',
    '',
    'The exclusion is **mechanical, not editorial**: Change A runs under the field scope',
    `\`PERSISTED_FIELDS minus scheduleELine\` = \`${CHANGE_A_FIELDS.join(', ')}\`. There is no`,
    'per-code deny-list to keep in sync — the column simply is not in the SET list the seed',
    'can build. The five rows surface below under "deferred", as still-drifted, in this same',
    'artifact, so a reader cannot mistake Change A for "the chart is now in sync".',
    '',
    '`type`, `subtype` and `taxDeductible` **are** inside Change A\'s scope and emit no',
    'statement, because they are measured identical across all 80 common codes',
    `(\`taxDeductible\` per-field digest \`${MEASURED_IDENTICAL_FIELDS[0].digest}\` on both sides).`,
    '**There is no `tax_deductible` defect.** The earlier package',
    '`scripts/coa-apply-gate-package.ts` (#214) asserted four `tax_deductible` UPDATEs on',
    '5015/5025/5055/6050. Those four codes hold no row at all; they are INSERTs here, in',
    'phase 2. Those UPDATEs would have matched zero rows and reported success.',
  );

  h('§2 — the compiled statements that will execute, in order');
  out.push(
    `${statements.filter((s) => s.kind === 'insert').length} INSERT, ` +
      `${statements.filter((s) => s.kind === 'update').length} UPDATE, in three phases.`,
    '',
    'Compiled by drizzle through `seedChartOfAccounts()` — the same code path the Worker',
    'runs, and the only path that calls `assertDocumentParity()` before writing — against a',
    'client that records the SQL and sends nothing. These are not transcriptions. §2 exists',
    'because the 2026-09-18 hand-written apply was transcribed from a correct plan and dropped',
    'a column.',
    '',
    '`$n` in the SQL is `params[n-1]`. Every bound value below is **real**, read off the',
    'authoritative projection, with two exceptions that are labelled in place rather than',
    'rendered as plausible values:',
    '',
    '- `updated_at` renders as `<apply-time: ...>`. The apply stamps its own `new Date()`.',
    '- an UPDATE\'s `id` renders as `<snapshot.id for NNNN>`. The real id comes from the §4',
    '  snapshot. The *shape* of the WHERE — id plus `tenant_id IS NULL` — is real compiled',
    '  output, and that is what makes a tenant override unreachable.',
    '',
    'No synthetic UUID and no fabricated timestamp appears anywhere in this package. An',
    'operator who copies a value out of it either gets a working value or gets an obvious',
    'placeholder; never a well-formed value that silently matches no row.',
  );

  const phase = (n: 1 | 2 | 3, title: string, blurb: string[], sts: CompiledStatement[]) => {
    out.push('', `### Phase ${n} — ${title}`, '', ...blurb, '');
    sts.forEach((s, i) => {
      out.push(
        s.kind === 'insert'
          ? `**${n}.${i + 1} INSERT ${s.code}**`
          : `**${n}.${i + 1} UPDATE ${s.code} — SET ${s.setColumns.join(', ')}**`,
        '',
        '```sql',
        s.sql,
        '```',
        '',
        'params:',
        ...s.params.map((p, j) => `- \`$${j + 1}\` = ${p}`),
        '',
      );
    });
  };

  phase(1, `the ${p1.plan.inserts.length} rollup headers`, [
    'First, and not for tidiness: every one of the parent rewirings in phase 3, and some of',
    'the inserts in phase 2, name one of these codes as a parent. `neon-http` commits each',
    'statement independently, so an apply that failed partway with the order reversed would',
    'leave children pointing at rows that do not exist. A code scope is used here because a',
    'field scope cannot insert — an INSERT writes every column by definition, so calling it a',
    'scoped change would be false.',
  ], p1.statements);

  phase(2, `the ${p2.plan.inserts.length} missing posting accounts`, [
    'Computed against the table phase 1 leaves behind. These rows carry the document\'s',
    '`schedule_e_line` where it defines one — that is not a Change B write: an INSERT cannot',
    '*change* a form-line mapping, because the row had none. Change B is about the five',
    'EXISTING rows whose mapping is wrong, and none of the five is inserted here.',
  ], p2.statements);

  phase(3, `the ${p3.plan.updates.length} structural updates`, [
    `Computed against the full ${projected.length}-row table phases 1-2 leave behind, under the`,
    'field scope. Each SET list is exactly that row\'s changed fields plus `updated_at` —',
    'built from `changedFields`, not hardcoded, which is what makes the scope affect the SQL',
    'and not merely the plan.',
    '',
    `Breakdown: ${parentUpdates.length} \`parent_code\`, ${nameUpdates.length} \`name\`, ` +
      `${descUpdates.length} \`description\`. See §10 on why the description count here is a` +
      ' lower bound.',
    '',
    `**Where the 37 rewirings are.** The document gives ${documentChildren} accounts a parent.`,
    `${parentUpdates.length} of them already exist and are rewired by an UPDATE here;`,
    `${documentChildren - parentUpdates.length} are among the 25 accounts phases 1-2 INSERT, and`,
    'arrive with their parent already set, so they need no UPDATE. 37 total either way — the',
    'difference is which statement carries it.',
  ], p3.statements);

  out.push(
    '',
    '### Deferred, in the same artifact',
    '',
    `Phase 3's field scope held back ${p3.plan.deferred.updates.length + p3.plan.deferred.fields.length}` +
      ' row(s), each still drifted after Change A:',
    '',
    // Both buckets, because computeSeedPlan splits them: a row drifted ONLY on an
    // out-of-scope column has nothing to write and lands in `deferred.updates`, while a
    // row drifted on both lands in `deferred.fields`. All five Change B rows are the
    // former. Rendering only `deferred.fields` printed "held back 0 row(s)" over a
    // non-empty exclusion — a deferral report that silently reads as nothing deferred.
    ...p3.plan.deferred.updates.map(
      (u) => `- \`${u.row.code}\` — nothing written · **still drifted on: ${u.changedFields.join(', ')}**`,
    ),
    ...p3.plan.deferred.fields.map(
      (f) => `- \`${f.code}\` — written: ${f.applied.join(', ')} · **still drifted on: ${f.deferred.join(', ')}**`,
    ),
    '',
    'That is Change B, and it is owed. It is stated here rather than in a separate document',
    'so that this package cannot be read as "the chart is in sync".',
  );

  h('§4 — the pre-write snapshot, to run BEFORE phase 1');
  out.push(
    'Required, not advisory. **Which primitive is in play:** the seed path as it stands awaits',
    '`db.insert()` and `db.update()` one statement at a time, so over `neon-http` each one',
    'commits independently and partial state is the default failure, not an edge case. There',
    'is no transaction to abort. `db.batch()` *is* transactional on this driver',
    '(`drizzle-orm/neon-http/session.js:131` → neon `client.transaction()`, which sets',
    '`Neon-Batch-Isolation-Level`), and converting the seed\'s apply loop to it would make a',
    'phase atomic — but that changes a production write path and belongs in its own PR, not',
    'smuggled into a gate package. **Until then this snapshot is the only thing to go back to.**',
    '',
    'Reads every row and every column Change A touches, plus `updated_at` (which the apply also',
    'writes), `id` (the UPDATE key), and `is_active`/`modified_by` (which the seed never writes —',
    'captured so a rollback can prove it did not):',
    '',
    '```sql',
    '-- 1. every global row, every column this change touches. Expect 80 rows.',
    'SELECT id, code, name, type, subtype, description, schedule_e_line,',
    '       tax_deductible, parent_code, is_active, modified_by, updated_at',
    '  FROM chart_of_accounts',
    ' WHERE tenant_id IS NULL',
    ' ORDER BY code;',
    '```',
    '',
    '```sql',
    '-- 2. insert-collision guard. Expect 0 rows. A non-zero result means a code this change',
    '--    INSERTs already exists, the measured state is stale, and phase 1/2 must not run:',
    '--    the table has no unique index on (tenant_id, code) for global rows, because',
    '--    NULL != NULL in Postgres, so a duplicate would be created rather than rejected.',
    'SELECT code, count(*) FROM chart_of_accounts',
    ` WHERE tenant_id IS NULL AND code IN (${sqlList(MISSING_CODES)})`,
    ' GROUP BY code;',
    '```',
    '',
    '```sql',
    '-- 3. tenant-scoped overrides of any code in this change. Expect: not checked yet (§10).',
    '--    Every statement above is scoped `tenant_id IS NULL`, so these rows cannot be',
    '--    written. This read exists to find out whether any exist to be left behind.',
    'SELECT tenant_id, code, count(*) FROM chart_of_accounts',
    ' WHERE tenant_id IS NOT NULL GROUP BY tenant_id, code ORDER BY tenant_id, code;',
    '```',
    '',
    'Keep the output of all three. The rollback below is a template over query 1 and is',
    'unusable without it.',
  );

  h('§7 — rollback recipe');
  out.push(
    '### The UPDATEs (phase 3) — a true rollback exists',
    '',
    'For each row phase 3 wrote, restoring every column it set **and `updated_at`**:',
    '',
    '```sql',
    'UPDATE chart_of_accounts',
    "   SET name           = <snapshot.name>,",
    "       description    = <snapshot.description>,",
    "       parent_code    = <snapshot.parent_code>,   -- NULL restores to NULL",
    "       updated_at     = '<snapshot.updated_at>'",
    " WHERE id = '<snapshot.id>' AND tenant_id IS NULL;",
    '```',
    '',
    '`updated_at` is restored deliberately. A rollback that restores the value but not the',
    'timestamp leaves the row looking recently and deliberately set, which corrupts the audit',
    'trail as surely as the wrong value did. Restore only the columns that row\'s SET list',
    'actually names — restoring a column the apply never wrote would itself be a write.',
    '',
    '### The INSERTs (phases 1-2) — there is NO true rollback. Stated, not papered over.',
    '',
    'An inserted row cannot be un-inserted:',
    '',
    '- `DELETE` is not a rollback. It is a destructive write that removes the row AND the',
    '  evidence that it ever existed, and if anything referenced the account in between — a',
    '  classification, a journal line — the delete either fails on the reference or orphans it.',
    '- The seed path cannot express it. The seed converges *toward* the document, and the',
    '  document defines all 25 of these accounts; re-running it re-inserts them.',
    '',
    '**The compensating action is deactivation, not deletion:** `is_active = false` on the',
    'inserted rows, which takes them out of every picker and report while leaving the row and',
    'its audit trail intact.',
    '',
    'Two consequences an operator must know before authorizing, because neither is obvious:',
    '',
    '1. `is_active` is **not** a column the seed writes, in either direction — activation state',
    '   is an operational decision, not a chart definition. So deactivation is an operator',
    '   action outside the seed path, and it is the one write in this document that has no',
    '   §2-compliant path. Taking it means knowingly taking a §2 exception.',
    '2. A deactivated row still **exists**. The next `computeSeedPlan` sees it as present, so',
    '   it classifies as UPDATE-or-unchanged, never again as an INSERT, and reports it under',
    '   `inactive`. Deactivating does not return the chart to its pre-Change-A plan.',
    '',
    'So the recovery path for phases 1-2 is forward, not backward. That is a reason to take',
    'the §4 snapshot and to run the phases in order, not a reason to treat them as reversible.',
  );

  h('§5 — reconcile AFTER, by digest, not by reading the list');
  out.push(
    'Eyeballing a list is how the original drift survived: a human reading eighty rows',
    'reliably confirms what they expect to see.',
    '',
    'Same normalisation as the derivation — `NULL` → `\'\'`, boolean → `\'true\'`/`\'false\'` —',
    'so the digest and the plan cannot disagree about what "equal" means:',
    '',
    '```sql',
    'SELECT count(*) AS rows,',
    '       substr(md5(string_agg(',
    "         code || ':' || coalesce(name,'') || ':' || coalesce(description,'')",
    "              || ':' || coalesce(parent_code,'') || ':' || coalesce(schedule_e_line,'')",
    "              || ':' || tax_deductible::text, ',' ORDER BY code)), 1, 12) AS digest",
    '  FROM chart_of_accounts',
    ' WHERE tenant_id IS NULL;',
    '```',
    '',
    '| after | rows | digest |',
    '|---|---|---|',
    `| **Change A** (what this package delivers) | ${projected.length} | \`${digestRows(expectedPostChangeARows())}\` |`,
    `| Change A **+ Change B** (the document in full) | ${projected.length} | \`${digestRows(projected)}\` |`,
    '',
    '**Check against the first row, not the second.** The second is the projection\'s own',
    'digest and it is the post-Change-B state: after a fully successful Change A it will NOT',
    'match, and reading it as the target makes a correct apply look failed. The two differ',
    'only in the five `schedule_e_line` values Change B owes.',
    '',
    'A mismatch localizes by bisecting the row set, not by re-reading it. A `rows` count below',
    `${projected.length} with a mismatched digest means a phase committed partially — see §4 on`,
    'why that is the default failure here.',
  );

  h('§7 — blast radius');
  const inserts = statements.filter((s) => s.kind === 'insert');
  const updates = statements.filter((s) => s.kind === 'update');
  out.push(
    `- **Statements:** ${statements.length} total — ${inserts.length} INSERT ` +
      `(${p1.plan.inserts.length} headers, then ${p2.plan.inserts.length} posting accounts), ` +
      `${updates.length} UPDATE.`,
    `- **Rows created:** ${inserts.length}. **Rows modified:** ${updates.length}. All`,
    '  `tenant_id IS NULL`.',
    `- **Columns written on an UPDATE:** ${[...new Set(updates.flatMap((s) => s.setColumns))].sort().join(', ')}.`,
    '  Every SET list was read off the compiled SQL above, not assumed.',
    '- **Never written by this path:** `is_active` (an operational decision, not a chart',
    '  definition), `modified_by` on an existing row (a row last touched by a human L4 auditor',
    '  keeps that attribution), `metadata`, and `schedule_e_line` on an existing row (held back',
    '  by the field scope — that is Change B).',
    '- **Tenant overrides are unreachable:** every INSERT binds `tenant_id = null` and every',
    '  UPDATE carries `tenant_id IS NULL` alongside the row id, so a tenant row sharing a code',
    '  cannot be hit. Whether any such row exists is a §10 gap.',
    '',
    '**What reads `chart_of_accounts` downstream** — the surface this change moves:',
    '',
    '- `server/storage/system.ts` — the single DB access path; every COA read and the',
    '  `guardedWrite` audit gate go through it.',
    '- `server/routes/classification.ts` — transaction classification; writes',
    '  `classification_audit` rows against an account code. New codes become classifiable the',
    '  moment phase 2 commits.',
    '- `server/routes/admin.ts` → `POST /api/admin/seed/chart-of-accounts` — the operator-facing',
    '  scoped apply, i.e. the route that would execute this package.',
    '- Reporting and tax derivation — `schedule_e_line` and `tax_deductible` feed Schedule E /',
    '  Form 8825 line derivation (`getForm8825Line()` resolves at read time). Change A moves',
    '  neither on an existing row; the 15 inserted posting accounts arrive carrying the',
    '  document\'s mapping.',
    '- **`parent_code` consumers: none today.** The hierarchy is written by this change and read',
    '  by nothing yet, which is what makes the rewiring low-risk to apply and high-risk to get',
    '  wrong quietly — a wrong parent would surface only once a rollup is built on it.',
    '',
    '**Integrity of the resulting tree**, asserted by the generator against the document',
    '(`assertMeasuredState()`), not rediscovered here: 0 dangling parent refs, 0 rows whose',
    'parent is not a header, 0 headers carrying a parent, max depth exactly 1 (§1.7), 0 cycles.',
    'The generator fails rather than rendering if any of those stops holding.',
  );

  h('§10 — gaps in this package');
  out.push(
    '- **The §4 snapshot has not been taken.** This package contains no claim about what',
    '  production currently holds beyond the measured aggregates below. Every "current value"',
    '  question is open until it is run.',
    '- **`description` drift was never isolated to a code list.** It was measured only in',
    `  aggregate, as part of "71 of 80 common codes drifted". So this package compiles`,
    `  ${descUpdates.length} description UPDATE(s) and the live apply will emit more. The`,
    '  statement count here is a **lower bound**, and the §2 section says so where it counts',
    '  them. What is *not* uncertain: the value each description UPDATE binds comes from the',
    '  authoritative projection, so the digest in §5 is exact even though the statement list',
    '  is not.',
    '- **`parent_code` starting values were not captured per row.** The fixture takes all 80 as',
    '  NULL. Where a row holds a STRAY parent the document clears (5050 and 9010 were cited as',
    `  examples), the live apply emits an UPDATE this package does not compile. So the`,
    `  ${parentUpdates.length} compiled \`parent_code\` statements are the rows the document gives`,
    '  a header, and the clears are additional.',
    '- **The 9 measured-identical codes are not identified**, so the fixture\'s drifted-row count',
    '  is a lower bound on the measured 71. The three gaps above are the whole of the',
    '  difference; the apply recomputes from the live table and is unaffected by any of them.',
    '- **Tenant-scoped overrides were not checked.** Nothing here can write one — every',
    '  statement is `tenant_id IS NULL` — but whether a tenant holds an override of any of',
    '  these 105 codes, which would then diverge from the global chart, is unknown. Query 3 in',
    '  §4 answers it.',
    '- **`is_active` and `modified_by` on the 80 existing rows are unread.** The seed never',
    '  writes either; this package cannot say whether any existing row is already inactive.',
    '- **Change B is unscheduled.** The five form-line drifts are stated, held back',
    '  mechanically, and owed. Nothing in this package fixes them and nothing in it schedules',
    '  the change that does.',
    '- **The apply is blocked on a credential, not on this package.** `/api/admin/*` sits behind',
    '  `serviceAuth`, which needs the Worker\'s service token, whose resolution needs a',
    '  Cloudflare Access service principal. Routed through `/chico`; never resolved inline, and',
    '  not needed to produce or review this artifact.',
    '- **Whether the deployed bundle carries the phased scoped-apply code is unverified.** The',
    '  401 fires before body validation, so no unauthenticated probe can see the schema.',
    '- **Not re-measured here.** The row counts, the 25 absent codes, the per-field digests and',
    '  the drift lists are carried as declared constants measured on 2026-10-21 and asserted',
    '  against the document. If production has moved since, §4 query 1 and 2 are what catch it',
    '  — this package will not.',
  );

  return out.join('\n') + '\n';
}

const invokedDirectly =
  typeof process !== 'undefined' &&
  !!process.argv[1] &&
  /coa-change-a-gate-package\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  buildChangeAPackage()
    .then((pkg) => {
      process.stdout.write(pkg.markdown);
    })
    .catch((e) => {
      console.error('gate package failed:', e);
      process.exit(1);
    });
}
