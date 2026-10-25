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
 * `subtype` and `taxDeductible` are IDENTICAL. `type` and `subtype` are inside Change A's
 * scope and emit nothing because nothing drifts; `taxDeductible` is outside it by class (§6).
 *
 * Recorded because "there is no tax_deductible defect" is the claim that retires #214, and
 * a claim that retires a shipped package should carry its evidence.
 */
export const MEASURED_IDENTICAL_FIELDS: ReadonlyArray<{ field: PersistedField; digest: string }> = [
  { field: 'taxDeductible', digest: '7b44da66cdfb' },
];

/**
 * The measured `description` drift: exactly these two codes, out of the 80 common codes.
 * Every other common code matches the document byte-for-byte. Both are already among the
 * phase-3 updates (4000: name + parent; 4110: parent), so this adds `description` to their
 * SET lists and does not change the statement count.
 *
 * `from` is NOT production's prior value — that was not captured. It is a marker that
 * differs from every document description, so the plan sees a drift; the real prior value
 * is what the §4 snapshot records. An UPDATE binds the DESIRED value, so the marker never
 * reaches a compiled statement.
 */
export const MEASURED_DESCRIPTION_DRIFT_CODES = ['4000', '4110'] as const;
const DESCRIPTION_DRIFT_MARKER = '<measured: differs from the document; prior value is in the §4 snapshot>';

/**
 * Production's `parent_code` on each of the 80 existing global rows, MEASURED read-only
 * (code>parent, NULL = column null). This replaces the earlier assumption that every
 * existing row held a NULL parent: that assumption made every desired-NULL row look
 * already-correct, so the 37 CLEARS (production holds a parent, the document says none)
 * diffed empty and were never compiled — 34 of 71 parent changes, a half-migrated tree in
 * which 5010 and 5050 stay parented to the POSTING account 5000 (§1.7 violation).
 */
export const MEASURED_PARENT_CODES: ReadonlyMap<string, string | null> = new Map(
  (
    '1000>NULL 1010>1000 1020>1000 1050>1000 1100>NULL 1110>1100 1500>NULL 1510>1500 1515>1500 1520>1500 1525>1500 1600>NULL 1605>NULL 1610>1600 1615>1600 1620>1600 1625>1600 2000>NULL 2010>2000 2020>2000 2030>2000 2040>2000 2500>NULL 2510>2500 2520>2500 2530>2500 3000>NULL 3010>3000 3020>3000 3030>3000 4000>NULL 4010>4000 4020>4000 4030>4000 4040>4000 4050>4000 4060>4000 4100>NULL 4110>4100 4120>4100 5000>NULL 5010>5000 5020>5000 5030>5000 5040>5000 5050>5000 5060>5000 5070>5000 5080>5000 5090>5000 5100>NULL 5110>5100 5120>5100 5130>5100 5140>5100 5200>NULL 5210>5200 5220>5200 5300>NULL 5310>5300 5320>5300 5330>5300 5400>NULL 5410>5400 5420>5400 5430>5400 6000>NULL 6010>6000 6020>6000 6030>6000 6040>6000 7000>NULL 7010>7000 7020>7000 7030>7000 7040>7000 9000>NULL 9010>9000 9020>9000 9030>9000'
  )
    .split(' ')
    .map((pair): [string, string | null] => {
      const [code, parent] = pair.split('>');
      return [code, parent === 'NULL' ? null : parent];
    }),
);

/** The 37 measured clears: production holds a parent, the document says none. */
export const MEASURED_PARENT_CLEARS = '1510 1515 1520 1525 1610 1615 1620 1625 2010 2020 2030 2040 2520 2530 3010 3020 3030 4110 4120 5010 5020 5030 5040 5050 5060 5070 5080 5090 5320 5330 6010 6020 6030 6040 9010 9020 9030'.split(' ');

/**
 * CHANGE A's field scope: every persisted field EXCEPT the two tax-semantic columns,
 * `scheduleELine` and `taxDeductible`.
 *
 * Expressed as a SUBTRACTION from PERSISTED_FIELDS rather than as an allow-list, because
 * that is what §6 actually says — structure is everything that is not tax semantics. An
 * allow-list silently drops any column PERSISTED_FIELDS later gains; a subtraction picks it
 * up and forces whoever adds it to decide which class it belongs to.
 *
 * `taxDeductible` is subtracted although it emits zero statements today. finance-operating-
 * defaults §6 separates CLASSES of change, not diffs that happen to be empty: it is the
 * canonical tax-semantic column, and it is empty only because it was measured identical
 * across all 80 common codes. If the document changes before the apply runs, a deductibility
 * write would otherwise ride inside a structural hierarchy review — the §6 failure mode, "a
 * deductibility change must never ride inside a hierarchy change, where review attention is
 * on the tree".
 */
export const CHANGE_A_FIELDS: PersistedField[] = PERSISTED_FIELDS.filter(
  (f) => f !== 'scheduleELine' && f !== 'taxDeductible',
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
 * `parent_code` (MEASURED_PARENT_CODES) and `description`
 * (MEASURED_DESCRIPTION_DRIFT_CODES) are measured exactly. One assumption remains: the 9
 * measured-identical codes are not identified, so the drifted-row count is checked against
 * the measured total only where the measurement is per-row.
 */
export function measuredExistingRows(): ExistingAccountRow[] {
  const absent = new Set<string>(MISSING_CODES);
  const scheduleEFrom = new Map(CHANGE_B_SCHEDULE_E.map((d) => [d.code, d.from]));
  const descDrift = new Set<string>(MEASURED_DESCRIPTION_DRIFT_CODES);
  return projectSeedRows()
    .filter((row: SeedAccountRow) => !absent.has(row.code))
    .map((row: SeedAccountRow): ExistingAccountRow => ({
      ...row,
      id: `<snapshot.id for ${row.code}>`,
      isActive: true,
      // Measured per row (MEASURED_PARENT_CODES); never assumed.
      parentCode: MEASURED_PARENT_CODES.get(row.code) ?? null,
      // Measured: the five Change B rows carry the wrong form line; everything else matches.
      scheduleELine: scheduleEFrom.has(row.code)
        ? (scheduleEFrom.get(row.code) ?? null)
        : row.scheduleELine,
      name: row.code === MEASURED_NAME_DRIFT.code ? MEASURED_NAME_DRIFT.from : row.name,
      // Measured: exactly two codes drift on description; the rest match the document.
      description: descDrift.has(row.code) ? DESCRIPTION_DRIFT_MARKER : row.description,
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

  const absentSet = new Set<string>(MISSING_CODES);
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

  if (new Set(MEASURED_DESCRIPTION_DRIFT_CODES).size !== 2)
    fail('measured description-drift set is not exactly 2 codes');
  for (const code of MEASURED_DESCRIPTION_DRIFT_CODES) {
    const row = byCode.get(code);
    if (!row) fail(`description-drift code ${code} is not in the chart`);
    if (row!.description === DESCRIPTION_DRIFT_MARKER)
      fail(`description-drift code ${code} is measured drifted but the document holds the drift marker`);
    if (absentSet.has(code)) fail(`description-drift code ${code} is measured absent, so it cannot drift`);
  }

  // The measured parent map must cover exactly the 80 existing codes and must not contradict
  // the document's shape: every rewire targets a header this change inserts (0 target an
  // existing code), every clear is a code the document leaves parentless.
  const existingCodes = projected.map((r) => r.code).filter((c) => !absentSet.has(c)).sort();
  const measuredCodes = [...MEASURED_PARENT_CODES.keys()].sort();
  if (existingCodes.join(',') !== measuredCodes.join(','))
    fail('the measured parent map does not cover exactly the 80 existing codes');
  const clears: string[] = [];
  let rewires = 0;
  for (const code of existingCodes) {
    const have = MEASURED_PARENT_CODES.get(code) ?? null;
    const want = byCode.get(code)!.parentCode;
    if (have === want) continue;
    if (want === null) clears.push(code);
    else {
      rewires++;
      if (!absentSet.has(want)) fail(`${code} is measured rewired to existing code ${want}; measured 0 such rewires`);
    }
  }
  if (clears.sort().join(',') !== [...MEASURED_PARENT_CLEARS].sort().join(','))
    fail(`document clears [${clears.join(' ')}] are not the measured 37 clears`);
  if (rewires !== 34) fail(`${rewires} parent rewires, measured 34`);

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
  /** Unrendered bound parameters, so a test can re-run the real reconciliation over the
   *  real compiled package rather than asserting a proxy for it. Not rendered anywhere. */
  rawParams: readonly unknown[];
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

/**
 * The exact shape drizzle compiles for this seed's UPDATE. Anchored end to end on purpose.
 *
 * The first version of this check split on /\bset\b/i and scraped /"([a-z_]+)" = /g. A
 * separated review broke it on paper in four ways — the word "set" inside a value, a
 * mixed-case or digit-bearing identifier, a value containing `" = `, and a CTE whose own
 * WHERE precedes the SET — and in the misalignment cases it returns a confident, wrong
 * column list rather than failing. A verifier that can misparse the thing it verifies is
 * not a verifier.
 *
 * So the statement must match this shape in full or the package refuses to render. Any
 * future statement shape becomes a loud failure here, which is the correct place for it:
 * the alternative is a gate that quietly stops checking.
 *
 * This DELIBERATELY couples to drizzle's current output — the parenthesised WHERE, the
 * quoting, the `, ` separator. A drizzle upgrade will break it, and the test that feeds in
 * the real compiled statement is the canary. When that test fails after a bump, the regex
 * needs updating to the new shape; it does not mean the check should be relaxed.
 */
const UPDATE_SHAPE =
  /^update "chart_of_accounts" set (.+?) where \("chart_of_accounts"\."id" = \$(\d+) and "chart_of_accounts"\."tenant_id" is null\)$/;

/** Every SET assignment is `"col" = $n`. Drizzle parameterises every value, so a literal
 *  here — the case that defeats a naive scrape — cannot occur without failing this. */
const SET_ASSIGNMENT = /^"([a-z_]+)" = \$(\d+)$/;

export interface ParsedUpdate {
  columns: string[];
  /** 1-based placeholder index of the id in the WHERE clause. */
  idParam: number;
}

/**
 * Parse a compiled UPDATE, failing closed on anything unexpected.
 *
 * The previous implementation ended `?? ''` and returned `[]` when the split found no SET,
 * so an unparseable statement read as "writes nothing": an empty blast radius in §7 and a
 * rollback that restores nothing.
 */
export function parseCompiledUpdate(sql: string, context: string): ParsedUpdate {
  const m = UPDATE_SHAPE.exec(sql.trim());
  if (!m) {
    throw new Error(
      `${context}: the compiled UPDATE does not match the expected shape ` +
        `\`update "chart_of_accounts" set ... where (id = $n and tenant_id is null)\`. ` +
        `Refusing to render rather than guess at its columns. Statement was: ${sql}`,
    );
  }
  const columns = m[1].split(', ').map((pair) => {
    const a = SET_ASSIGNMENT.exec(pair.trim());
    if (!a) {
      throw new Error(
        `${context}: unparseable SET assignment \`${pair.trim()}\`; refusing to render. ` +
          `Each assignment must be \`"col" = $n\` with a lowercase/underscore column name — ` +
          `a column carrying a digit (e.g. \`line_2\`) trips this and needs SET_ASSIGNMENT widened, ` +
          `not the check loosened.`,
      );
    }
    return a[1];
  });
  if (columns.length === 0) {
    throw new Error(`${context}: SET clause parsed to zero columns; refusing to render.`);
  }
  const duplicated = [...new Set(columns.filter((c, i) => columns.indexOf(c) !== i))];
  if (duplicated.length > 0) {
    // Set-equality downstream would not see this. Drizzle cannot emit it from an object's
    // keys, which is exactly why an occurrence would mean the statement is not what we
    // think it is.
    throw new Error(`${context}: column(s) assigned more than once: ${duplicated.join(', ')}.`);
  }
  return { columns, idParam: Number(m[2]) };
}

/**
 * camelCase plan field -> snake_case column.
 *
 * THROWS on an unmapped field rather than returning it unchanged. The fallthrough version
 * happened to work only because five of the seven persisted fields are single words where
 * camelCase and snake_case coincide; a new field such as `taxYear` would have returned
 * `taxYear`, never matched `tax_year`, and reported a permanent phantom MISSING.
 *
 * Resolved on call, not at module load: `READBACK_COLUMNS` is declared further down, and a
 * module-level const here hits the temporal dead zone and takes the whole test FILE down at
 * collection — which vitest reports as "no tests", the zero-failures-reads-as-green shape
 * this package guards against elsewhere.
 */
export function fieldToColumn(field: string): string {
  for (const [column, mapped] of Object.entries(READBACK_COLUMNS)) {
    if (mapped === field) return column;
  }
  throw new Error(
    `no column mapping for plan field "${field}". Add it to READBACK_COLUMNS; a field the ` +
      `reconciliation cannot name is a field it cannot check.`,
  );
}

/**
 * §2, column by column — "enumerate every column the plan says it sets, and confirm each
 * one appears in the statement."
 *
 * Until this existed the plan and the compiled SQL were reconciled by statement COUNT
 * alone. A column the plan claims but the statement omits keeps the count intact, writes
 * nothing, and raises no error: exactly the 2026-09-18 failure this package was written to
 * retire, one level up. The seed builds the SET list from `changedFields` plus
 * `updated_at`, so the two sets must be equal — not merely overlapping.
 *
 * Equality in BOTH directions on purpose. A missing column is the §2 failure; an extra one
 * means the statement writes something the plan never declared, which §7's blast radius
 * would under-report to the operator gating the write.
 */
export function assertSetColumnsMatchPlan(
  context: string,
  parsed: string[],
  changedFields: readonly PersistedField[],
): void {
  const expected = new Set<string>(changedFields.map((f) => fieldToColumn(f)));
  expected.add('updated_at');
  const actual = new Set(parsed);
  const missing = [...expected].filter((c) => !actual.has(c)).sort();
  const extra = [...actual].filter((c) => !expected.has(c)).sort();
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `${context}: the compiled SET list does not match the plan. ` +
        `Plan claims [${[...expected].sort().join(', ')}]; SQL sets [${[...actual].sort().join(', ')}].` +
        (missing.length ? ` MISSING: ${missing.join(', ')}.` : '') +
        (extra.length ? ` UNDECLARED: ${extra.join(', ')}.` : '') +
        ' A plan is not a write (§2); this package must not render either.',
    );
  }
}

/**
 * The shape drizzle compiles for this seed's INSERT. Anchored like UPDATE_SHAPE.
 *
 * An INSERT's column list comes from the TABLE DEFINITION, not from `.values()`, so every
 * column always appears and column presence proves nothing. What distinguishes a supplied
 * value from an omitted one is the values list: drizzle emits `$n` for a column `.values()`
 * supplied and the literal `default` for one it did not. That is what makes the §2 check
 * expressible here at all — an omitted planned column shows up as `default`, and `default`
 * on a planned column is the INSERT form of "writes nothing and raises no error".
 */
const INSERT_SHAPE =
  /^insert into "chart_of_accounts" \(([^)]+)\) values \(([^)]+)\) returning "id"$/;

/**
 * §2 for INSERTs — "a plan is not a write", on the 25 rows Change A creates.
 *
 * #229. The UPDATE check does not transfer: it compares a SET list, and an INSERT has no
 * SET list. This compares BOUND VALUES instead, position by position.
 *
 * Asserts, for each statement:
 *   - every persisted field in the plan row is bound to a parameter, not left `default`;
 *   - the bound value equals the planned value, `null` included;
 *   - `code` likewise — and this doubles as the statement-to-plan PIN. `compilePhase`
 *     pairs positionally (`plan.inserts[i]`, inserts assumed first) and, unlike the UPDATE
 *     path, there is no id to cross-check because Postgres assigns it. Comparing the bound
 *     `code` against the plan row's code pins the pairing anyway: codes are unique, so a
 *     shifted index compares statement A's code against plan row B's and throws;
 *   - `tenant_id` is bound to NULL. A non-null tenant_id writes a tenant override instead
 *     of a global row — not a §2 failure but a worse one, and this is the only place the
 *     compiled statement is read;
 *   - `is_active` is bound true, since the seed sets it explicitly.
 *
 * Columns the seed deliberately leaves to the database (`id`, `created_at`, `updated_at`,
 * `effective_date`, `metadata`) must be `default`: a bound value there would mean the
 * statement writes something the plan never described.
 */
export function reconcileCompiledInsert(
  context: string,
  sql: string,
  params: readonly unknown[],
  row: SeedAccountRow,
): void {
  const m = INSERT_SHAPE.exec(sql.trim());
  if (!m) {
    throw new Error(
      `${context}: the compiled INSERT does not match the expected shape ` +
        `\`insert into "chart_of_accounts" (...) values (...) returning "id"\`. ` +
        `Refusing to render rather than guess at its values. Statement was: ${sql}`,
    );
  }
  const columns = m[1].split(', ').map((c) => {
    const q = /^"([a-z_]+)"$/.exec(c.trim());
    if (!q) throw new Error(`${context}: unparseable column \`${c.trim()}\` in the INSERT list.`);
    return q[1];
  });
  const values = m[2].split(', ').map((v) => v.trim());
  if (columns.length !== values.length) {
    throw new Error(
      `${context}: the INSERT names ${columns.length} column(s) but supplies ` +
        `${values.length} value(s); refusing to render.`,
    );
  }

  // Placeholders must be 1..k, each used once. `bound()` reads params[n-1] off the index
  // in the values list, which is only meaningful if that mapping is a bijection. Drizzle
  // emits them in order today; nothing here depended on that being true until now.
  const placeholders = values
    .map((v) => /^\$(\d+)$/.exec(v))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]));
  const repeated = [...new Set(placeholders.filter((n, i) => placeholders.indexOf(n) !== i))];
  if (repeated.length > 0) {
    // Uniqueness only — NOT contiguity from 1. An earlier version also demanded
    // 1..params.length with no gaps, which fires on exactly the omission the specific
    // checks below are there to describe: replace a bound column with `default` and the
    // remaining placeholders have a gap. That masked the precise error with a generic one.
    // `bound()` range-checks each index, so uniqueness is what is actually load-bearing:
    // two columns sharing a placeholder would make one of them read the other's value.
    throw new Error(
      `${context}: placeholder(s) $${repeated.join(', $')} appear more than once in the ` +
        `values list. Two columns sharing a parameter makes every value read below ` +
        `suspect; refusing to render.`,
    );
  }

  /** The value expression for a column, or throw if the column is absent entirely. */
  const slot = (column: string): string => {
    const i = columns.indexOf(column);
    if (i === -1) {
      throw new Error(`${context}: the INSERT does not name column "${column}"; refusing to render.`);
    }
    return values[i];
  };
  /** The bound parameter for a column, or throw if it was left to the database. */
  const bound = (column: string): unknown => {
    const v = slot(column);
    const pm = /^\$(\d+)$/.exec(v);
    if (!pm) {
      throw new Error(
        `${context}: column "${column}" is \`${v}\` in the compiled INSERT, not a bound ` +
          `parameter. The plan supplies it, so the statement would write a database default ` +
          `instead — silently, with no error. A plan is not a write (§2); this package must ` +
          `not render either.`,
      );
    }
    const n = Number(pm[1]);
    if (n < 1 || n > params.length) {
      throw new Error(`${context}: column "${column}" binds $${n}, outside the ${params.length} parameter(s).`);
    }
    return params[n - 1];
  };
  // NOT `(a ?? null) === (b ?? null)`. That collapses undefined into null, so a plan field
  // that had been renamed or dropped would read as undefined and silently match a bound
  // NULL — the check passing precisely because the plan lost the field.
  const same = (a: unknown, b: unknown): boolean => a === b;

  // Every planned field must be bound, and bound to the planned value.
  const planned: Array<[string, unknown]> = [
    ['code', row.code],
    ...PERSISTED_FIELDS.map((f) => [fieldToColumn(f), row[f]] as [string, unknown]),
  ];
  for (const [column, expected] of planned) {
    if (expected === undefined) {
      throw new Error(
        `${context}: the plan row has no value for "${column}" (undefined, not null). A ` +
          `renamed or dropped plan field must not reconcile against a bound NULL.`,
      );
    }
    const actual = bound(column);
    if (!same(actual, expected)) {
      throw new Error(
        `${context}: column "${column}" is bound to ${JSON.stringify(actual)} but the plan ` +
          `row says ${JSON.stringify(expected)}. A plan is not a write (§2); this package ` +
          `must not render either.`,
      );
    }
  }

  // Global row, not a tenant override.
  if (bound('tenant_id') !== null) {
    throw new Error(
      `${context}: tenant_id is bound to ${JSON.stringify(bound('tenant_id'))}, not NULL. ` +
        `This statement would create a tenant override rather than a global account.`,
    );
  }
  if (bound('is_active') !== true) {
    throw new Error(`${context}: is_active is bound to ${JSON.stringify(bound('is_active'))}, not true.`);
  }

  // The column universe must be EXACTLY what this check knows about. Without this, a
  // column added to the table later is value-checked by nothing and asserted `default` by
  // nothing, while columns.length === values.length still holds — so a newly written
  // column would pass unexamined. Fail closed on schema growth instead: a new column makes
  // this throw until someone decides which list it belongs in.
  const DB_MANAGED = ['id', 'created_at', 'updated_at', 'effective_date', 'metadata'];
  const known = new Set<string>([
    ...planned.map(([c]) => c),
    'tenant_id',
    'is_active',
    'modified_by',
    ...DB_MANAGED,
  ]);
  const unknown = columns.filter((c) => !known.has(c)).sort();
  if (unknown.length > 0) {
    throw new Error(
      `${context}: the INSERT names column(s) this check knows nothing about: ` +
        `${unknown.join(', ')}. Add each to the planned set or to DB_MANAGED — an ` +
        `unclassified column is one nothing verifies. Refusing to render.`,
    );
  }

  // Columns the seed leaves to the database must stay there.
  for (const column of DB_MANAGED) {
    const v = slot(column);
    if (v !== 'default') {
      throw new Error(
        `${context}: column "${column}" is \`${v}\` in the compiled INSERT, not \`default\`. ` +
          `The statement writes a column the plan never described; §7 would under-report it.`,
      );
    }
  }
}

/**
 * The whole per-statement §2 check, in ONE place so that what the tests exercise and what
 * `compilePhase` runs cannot drift apart.
 *
 * The first round of this work was reviewed as "the tests validate the helper, not the
 * control": every rejection test hand-fed arrays to the column comparison, so a wrong
 * parse or a wrong statement-to-plan index would have passed all of them. This function is
 * the control, it takes the raw compiled statement, and the tests drive it.
 *
 * It also closes the statement/plan pairing: `compilePhase` matches positionally
 * (`i - plan.inserts.length`), which assumes inserts-then-updates in plan order. Comparing
 * the id bound in the WHERE clause against the plan entry's id makes that assumption an
 * assertion. Without it, two updates that happen to set the same columns could reconcile
 * against each other's plan entry and pass while verifying the wrong row.
 */
export function reconcileCompiledUpdate(
  context: string,
  sql: string,
  params: readonly unknown[],
  planUpdate: { id: string; changedFields: readonly PersistedField[] },
): string[] {
  const { columns, idParam } = parseCompiledUpdate(sql, context);
  assertSetColumnsMatchPlan(context, columns, planUpdate.changedFields);
  const boundId = params[idParam - 1];
  if (boundId !== planUpdate.id) {
    throw new Error(
      `${context}: the statement updates id ${JSON.stringify(boundId)} but is reconciled ` +
        `against plan entry ${JSON.stringify(planUpdate.id)}. The positional statement-to-plan ` +
        `match has drifted; this package must not render either.`,
    );
  }
  return columns;
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
    let cols: string[] = [];
    if (kind === 'insert') {
      // §2 for INSERTs (#229). Column presence proves nothing here — the list comes from
      // the table definition — so this compares bound VALUES against the plan row.
      reconcileCompiledInsert(
        `phase ${phase}, statement ${i + 1} (code ${code})`,
        c.sql,
        c.params,
        plan.inserts[i],
      );
    }
    if (kind === 'update') {
      // §2: the plan is reconciled against the compiled statement column by column, not by
      // statement count. The count check above cannot see a dropped column.
      const context = `phase ${phase}, statement ${i + 1} (code ${code})`;
      const planUpdate = plan.updates[i - plan.inserts.length];
      if (!planUpdate) {
        // The positional pairing assumes inserts-then-updates in plan order. If that ever
        // breaks, the index runs off the end — and without this the failure surfaces as a
        // TypeError on `.id` with no context, which is the least useful shape it could take.
        throw new Error(
          `${context}: no plan update at position ${i - plan.inserts.length} ` +
            `(${plan.updates.length} update(s) in the plan). The statement-to-plan pairing ` +
            `has drifted; this package must not render either.`,
        );
      }
      cols = reconcileCompiledUpdate(context, c.sql, c.params, planUpdate);
    }
    return {
      phase,
      kind,
      code,
      sql: c.sql,
      params: c.params.map(renderParam),
      setColumns: cols,
      rawParams: c.params,
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

/**
 * Length-prefixed field encoding: `<utf8 byte length>:<value>`.
 *
 * The previous encoding joined fields with `':'` and rows with `','` and escaped nothing,
 * so it was NOT injective: `name="Repairs: Interior"` with an empty description produced the
 * same bytes as `name="Repairs"` with `description="Interior"`. Measured 2026-10-25 against
 * production, 14 of 80 global rows carry a `:` or a `,` in `name` or `description`, so this
 * was reachable, not theoretical. A §5 digest that two different chart states can share
 * cannot do §5's job — tell a partially-applied chart from a clean one.
 *
 * Byte length, not `String.length`: Postgres `octet_length()` counts bytes and JavaScript
 * `.length` counts UTF-16 code units, and the two disagree on any non-BMP character. The
 * emitted SQL in §5 must use `octet_length`, never `length`.
 */
function digestField(value: string | boolean | null): string {
  const s = normaliseForDigest(value);
  return `${Buffer.byteLength(s, 'utf8')}:${s}`;
}

/**
 * sha256 over the length-prefixed fields `code,name,type,subtype,description,parent,
 * schedule_e,tax_deductible` in that order, rows ordered by code, truncated to 12 hex.
 *
 * `type` and `subtype` are in the digest because Change A WRITES them (CHANGE_A_FIELDS is
 * PERSISTED_FIELDS minus the two tax-semantic fields). §5 requires the reconciliation to
 * read every column the change claimed to set; they were omitted, so a post-apply drift in
 * either would have reconciled as clean. `schedule_e_line` and `tax_deductible` are read
 * though Change A does not write them — deliberately, so Change B's outstanding drift stays
 * visible in the digest.
 *
 * Length prefixes make the concatenation self-delimiting, so no separator is needed between
 * fields or rows and no value can be mistaken for a boundary. Arity is fixed at six.
 *
 * sha256 and not md5: this digest is §5's authority — "reconcile AFTER, by digest, not by
 * reading the list" — so it is the one thing standing between a partially-applied chart and
 * a clean bill of health. A collision-broken hash is the wrong primitive for that job, and
 * CodeQL flags it high (js/weak-cryptographic-algorithm).
 *
 * The Postgres statement emitted in §5 MUST produce the same bytes. The two are compared
 * against each other, so changing one alone turns a correct apply into an apparent failure.
 * Agreement between the two is necessary and NOT sufficient: both can implement the same
 * ambiguous encoding and agree, which is exactly how the delimiter collision above survived
 * a live three-row cross-check. `digestRows` is pinned against a literal computed by running
 * the emitted SQL on the database, and against an injectivity case, in the test suite.
 */
export function digestRows(rows: SeedAccountRow[]): string {
  const body = [...rows]
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
    .map((r) =>
      [
        digestField(r.code),
        digestField(r.name),
        digestField(r.type),
        digestField(r.subtype),
        digestField(r.description),
        digestField(r.parentCode),
        digestField(r.scheduleELine),
        digestField(r.taxDeductible),
      ].join(''),
    )
    .join('');
  return createHash('sha256').update(body).digest('hex').slice(0, 12);
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

/** A measured value as a SQL literal. `null` is the SQL keyword, never the string 'null'. */
const sqlLiteral = (v: string | null): string => (v === null ? 'NULL' : `'${v.replace(/'/g, "''")}'`);

/**
 * The rollback for ONE row phase 3 writes: per row, not a template.
 *
 * Restores exactly the columns that row's SET list names, plus `updated_at`. Restoring a
 * column the apply never wrote would itself be a write.
 *
 * `parent_code` and `name` carry their MEASURED prior values, so those statements are
 * runnable the moment the §4 snapshot supplies the row `id`. `description` does NOT: the
 * drift was measured as a difference, never as a before-value, so it keeps a placeholder.
 * Said, not filled with something plausible — a rollback that restores a fabricated prior
 * description is a second wrong write dressed as a recovery.
 *
 * Any other changed field throws. A gate package must not render a rollback it cannot fill.
 */
function rollbackStatement(u: { row: SeedAccountRow; changedFields: PersistedField[] }): string[] {
  const code = u.row.code;
  const assignments: string[] = [];
  for (const field of u.changedFields) {
    if (field === 'parentCode') {
      assignments.push(`parent_code = ${sqlLiteral(MEASURED_PARENT_CODES.get(code) ?? null)}`);
    } else if (field === 'name') {
      if (code !== MEASURED_NAME_DRIFT.code) {
        throw new Error(
          `rollback: ${code} changes name, but only ${MEASURED_NAME_DRIFT.code}'s prior name was measured`,
        );
      }
      assignments.push(`name        = ${sqlLiteral(MEASURED_NAME_DRIFT.from)}`);
    } else if (field === 'description') {
      assignments.push(`description = <snapshot.description for ${code}>   -- NOT captured; §4 query 1`);
    } else {
      throw new Error(
        `rollback: no measured prior value for ${code}.${field}; this package must not render ` +
          'a rollback it cannot fill',
      );
    }
  }
  assignments.push(`updated_at  = '<snapshot.updated_at for ${code}>'`);
  return [
    `UPDATE chart_of_accounts                      -- ${code}`,
    ...assignments.map((a, i) => {
      const lead = i === 0 ? '   SET' : '      ';
      const comma = i === assignments.length - 1 ? '' : ',';
      return a.includes('--')
        ? `${lead} ${a.replace('   -- ', `${comma}   -- `)}`
        : `${lead} ${a}${comma}`;
    }),
    ` WHERE id = '<snapshot.id for ${code}>' AND tenant_id IS NULL;`,
    '',
  ];
}

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
  const clearCount = parentUpdates.filter((u) => u.row.parentCode === null).length;
  const rewireCount = parentUpdates.length - clearCount;

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
    `\`PERSISTED_FIELDS minus scheduleELine and taxDeductible\` = \`${CHANGE_A_FIELDS.join(', ')}\`. There is no`,
    'per-code deny-list to keep in sync — the column simply is not in the SET list the seed',
    'can build. The five rows surface below under "deferred", as still-drifted, in this same',
    'artifact, so a reader cannot mistake Change A for "the chart is now in sync".',
    '',
    '`type` and `subtype` are inside Change A\'s scope and emit no statement, and',
    '`taxDeductible` is outside it by class (the canonical tax-semantic column, §6) — it',
    'would emit none either way, because all three are measured identical across all 80 common codes',
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
      `${descUpdates.length} \`description\` (exactly ` +
      `${MEASURED_DESCRIPTION_DRIFT_CODES.map((c) => `\`${c}\``).join(' and ')}, measured; ` +
      'those rows are also in the parent/name counts, so the total is unchanged).',
    '',
    `**The ${parentUpdates.length} parent changes.** Production's per-row \`parent_code\` was measured`,
    `(read-only), not assumed: ${rewireCount} existing rows are REWIRED to a header phases 1-2 insert,`,
    `and ${clearCount} are CLEARED (production holds a parent, the document says none), 0 rewired`,
    'to an existing code. The clears matter: without them 5010 and 5050 stay parented to 5000',
    'Advertising, a POSTING account, violating CHART-OF-ACCOUNTS §1.7 (a parent must be a',
    'header; depth exactly 1) while the tree looks migrated. An earlier revision of this',
    'package assumed every existing parent was NULL, so desired-NULL rows diffed empty and only',
    '34 of 71 were compiled.',
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
    `### The UPDATEs (phase 3) — a true rollback exists, one statement per row`,
    '',
    `All ${p3.plan.updates.length}, not a template. Each restores **exactly the columns that row's SET list`,
    'names** — restoring a column the apply never wrote would itself be a write — plus',
    '`updated_at`.',
    '',
    `Every \`parent_code\` below is the MEASURED prior value, and \`name\` for`,
    `${MEASURED_NAME_DRIFT.code} is the measured prior \`${MEASURED_NAME_DRIFT.from}\`. So these are runnable as`,
    'soon as §4 query 1 supplies the row `id` and `updated_at`.',
    '',
    '`description` is the exception, stated rather than papered over: its prior value was',
    'never captured — the drift was measured as a difference, not as a before-value — so the',
    `two rows that write it (${MEASURED_DESCRIPTION_DRIFT_CODES.map((c) => `\`${c}\``).join(' and ')}) keep a \`<snapshot.description ...>\``,
    'placeholder and cannot be rolled back until query 1 has run. A rollback that restored a',
    'plausible-looking prior description would be a second wrong write dressed as a recovery.',
    '',
    '```sql',
    ...p3.plan.updates.flatMap((u) => rollbackStatement(u)),
    '```',
    '',
    '`updated_at` is restored deliberately. A rollback that restores the value but not the',
    'timestamp leaves the row looking recently and deliberately set, which corrupts the audit',
    'trail as surely as the wrong value did.',
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
    'so the digest and the plan cannot disagree about what "equal" means. Each field is',
    'length-prefixed `<bytes>:<value>` so the encoding is injective: without that, a `:` or a',
    '`,` inside a name or description shifts a field boundary and two different charts hash',
    'alike. Fourteen of the eighty live rows carry one of those characters today, so this is',
    'the difference between §5 working and §5 only appearing to:',
    '',
    '```sql',
    'SELECT count(*) AS rows,',
    '       substr(encode(sha256(convert_to(string_agg(',
    "            octet_length(coalesce(code,''))::text            || ':' || coalesce(code,'')",
    "         || octet_length(coalesce(name,''))::text            || ':' || coalesce(name,'')",
    "         || octet_length(coalesce(type,''))::text            || ':' || coalesce(type,'')",
    "         || octet_length(coalesce(subtype,''))::text         || ':' || coalesce(subtype,'')",
    "         || octet_length(coalesce(description,''))::text     || ':' || coalesce(description,'')",
    "         || octet_length(coalesce(parent_code,''))::text     || ':' || coalesce(parent_code,'')",
    "         || octet_length(coalesce(schedule_e_line,''))::text || ':' || coalesce(schedule_e_line,'')",
    "         || octet_length(coalesce(tax_deductible::text,''))::text || ':' || coalesce(tax_deductible::text,'')",
    "         , '' ORDER BY code COLLATE \"C\"), 'UTF8')), 'hex'), 1, 12) AS digest",
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
    '- **`description` drift is measured exactly, not bounded.** Production was compared to the',
    `  document on all 80 common codes: ${MEASURED_DESCRIPTION_DRIFT_CODES.map((c) => `\`${c}\``).join(' and ')} drift,`,
    '  the other 78 match byte-for-byte. Both are already phase-3 updates, so this package',
    `  compiles ${descUpdates.length} description write(s) and the statement count is unchanged.`,
    '  Production\'s prior description for those two is not in this package; §4 records it.',
    '- **Prior `description` values exist only in the snapshot.** The description drift was',
    '  measured as a difference, not as a before-value, so this package holds what those two',
    '  rows will BECOME and not what they are. The §7 rollback for them is therefore unusable',
    '  until §4 query 1 has run. Every other rollback value here is measured.',
    `- **The 9 measured-identical codes are not identified by code.** 80 common codes minus the`,
    `  ${p3.plan.updates.length} compiled here leaves 9, which agrees with the measurement — but the measurement`,
    '  reported a count, not a list, so the identity of those 9 is inferred from this package',
    '  rather than confirmed against production. §4 query 1 settles it; the apply recomputes',
    '  from the live table and is unaffected either way.',
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
