import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildChangeAPackage,
  measuredExistingRows,
  expectedPostChangeARows,
  digestRows,
  setColumns,
  assertSetColumnsMatchPlan,
  normaliseForDigest,
  assertMeasuredState,
  HEADER_CODES,
  POSTING_CODES,
  MISSING_CODES,
  CHANGE_B_SCHEDULE_E,
  CHANGE_A_FIELDS,
  MEASURED_PARENT_CODES,
  MEASURED_PARENT_CLEARS,
  type CompiledStatement,
  type ChangeAPackage,
} from '../../scripts/coa-change-a-gate-package';
import {
  computeSeedPlan,
  projectSeedRows,
  PERSISTED_FIELDS,
} from '../../database/seeds/chart-of-accounts';

/**
 * The gate package is the artifact an operator reads before authorizing a production
 * financial write. §7 says the gate is only meaningful if what is presented is COMPLETE —
 * the compiled statements, the snapshot, a rollback covering every column touched, the
 * reconciliation digest, and the blast radius. A package that silently loses a section, or
 * that quietly widens into the tax-semantic class, still LOOKS like a gate.
 *
 * These guards exist so that losing one fails instead. Each was mutation-tested: the thing
 * it guards was broken and the guard was watched to fail. A guard never seen to fail is
 * decoration.
 */
const ROOT = join(__dirname, '..', '..');
const COMMITTED = join(ROOT, 'docs', 'gates', 'coa-change-a-2026-10-21.md');

/** The five existing rows whose form-line mapping is wrong. Change B, not Change A. */
const CHANGE_B_CODES = CHANGE_B_SCHEDULE_E.map((d) => d.code);

/**
 * Captured rather than thrown at module scope.
 *
 * A generator that crashes during test COLLECTION means zero tests execute, and vitest
 * reports "no tests" — which greps as zero failures and reads as a pass in CI. Observed
 * while mutation-testing G5: breaking the fixture made the whole file report "no tests"
 * instead of a failed assertion. So the failure is turned into a value here and asserted
 * by the first test below.
 */
async function build(): Promise<{ pkg: ChangeAPackage | null; error: Error | null }> {
  try {
    return { pkg: await buildChangeAPackage(), error: null };
  } catch (e) {
    return { pkg: null, error: e as Error };
  }
}
const built = await build();

it('the generator runs to completion', () => {
  // First, so a crashing generator is one loud failure rather than twenty confusing ones
  // — and never a "no tests" run that reads as green.
  expect(built.error, built.error ? `generator failed: ${built.error.message}` : undefined)
    .toBeNull();
});

const pkg = built.pkg ?? ({ statements: [], plans: {}, markdown: '' } as unknown as ChangeAPackage);

describe('G3 — the package runs with no database and no credential', () => {
  it('builds, and emits the 25 inserts as 10 headers then 15 posting accounts', () => {
    const inserts = pkg.statements.filter((s) => s.kind === 'insert');
    expect(inserts).toHaveLength(25);
    expect(inserts.filter((s) => s.phase === 1).map((s) => s.code)).toEqual([...HEADER_CODES]);
    expect(inserts.filter((s) => s.phase === 2).map((s) => s.code)).toEqual([...POSTING_CODES]);
  });

  it('emits the parent, name and description updates in phase 3', () => {
    const updates = pkg.statements.filter((s) => s.kind === 'update');
    expect(updates.length).toBeGreaterThan(0);
    expect(updates.every((s) => s.phase === 3)).toBe(true);
    // Every UPDATE writes updated_at and at least one Change A column, and nothing else.
    for (const s of updates) {
      expect(s.setColumns).toContain('updated_at');
      const written = s.setColumns.filter((c) => c !== 'updated_at');
      expect(written.length).toBeGreaterThan(0);
      for (const col of written) {
        expect(['name', 'type', 'subtype', 'description', 'parent_code', 'tax_deductible'])
          .toContain(col);
      }
    }
    expect(updates.some((s) => s.setColumns.includes('parent_code'))).toBe(true);
    expect(updates.filter((s) => s.setColumns.includes('name')).map((s) => s.code)).toEqual(['4000']);
  });

  it('presents no placeholder UUID and no fabricated timestamp as a real value', () => {
    // A synthetic UUID is indistinguishable from a real one, and an operator who copies one
    // into a WHERE clause writes nothing and sees success. A fabricated instant is worse:
    // it reads as a captured fact. Both must be visibly placeholders.
    expect(pkg.markdown).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}/);
    expect(pkg.markdown).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    for (const s of pkg.statements) {
      for (const p of s.params) {
        expect(p).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        expect(p).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}/);
      }
    }
  });

  it('is byte-deterministic, so the committed artifact can be diffed against a fresh run', async () => {
    const again = await buildChangeAPackage();
    expect(again.markdown).toBe(pkg.markdown);
  });

  it('carries every section §7 and §10 require', () => {
    for (const heading of [
      '§2 — the compiled statements that will execute, in order',
      '§4 — the pre-write snapshot, to run BEFORE phase 1',
      '§7 — rollback recipe',
      '§5 — reconcile AFTER, by digest',
      '§7 — blast radius',
      '§10 — gaps in this package',
    ]) {
      expect(pkg.markdown, `missing section: ${heading}`).toContain(heading);
    }
    // §10 must name the three gaps that bound what the package can show.
    expect(pkg.markdown).toContain('Prior `description` values exist only in the snapshot');
    expect(pkg.markdown).toContain('Tenant-scoped overrides were not checked');
    expect(pkg.markdown).toContain('snapshot has not been taken');
    // §7 must not pretend the inserts are reversible.
    expect(pkg.markdown).toContain('there is NO true rollback');
    expect(pkg.markdown).toContain('compensating action is deactivation, not deletion');
    expect(pkg.markdown).toContain('nothing in it needed a credential');
  });

  it('matches the committed artifact', () => {
    // The committed doc is what an operator reads. If it drifts from the generator, the
    // generator is no longer evidence for it.
    expect(readFileSync(COMMITTED, 'utf8')).toBe(pkg.markdown);
  });
});

/**
 * The invariant whose absence hid the defect.
 *
 * An earlier revision's fixture assumed every existing row held `parent_code = NULL`. That
 * assumption AGREED with the desired state on all 37 rows the document parentless, so those
 * rows diffed to nothing and only 34 of 71 parent changes were compiled. Nothing in the
 * suite noticed, because nothing asked what tree the compiled statements actually leave
 * behind — they were checked one at a time, never as a whole.
 *
 * These two tests ask that question. The first pins the clears individually; the second
 * reconstructs the post-Change-A hierarchy and holds it against CHART-OF-ACCOUNTS §1.7.
 */
describe('§1.7 — the hierarchy the compiled statements actually leave behind', () => {
  const updates = () => pkg.statements.filter((s) => s.kind === 'update');

  /** The value an UPDATE binds to `parent_code`: position in the SET list is the param index. */
  function boundParent(s: CompiledStatement): string | null {
    const i = s.setColumns.indexOf('parent_code');
    expect(i, `${s.code} does not set parent_code`).toBeGreaterThanOrEqual(0);
    // 4110 sets description first, so index-by-position is required, not params[0].
    return JSON.parse(s.params[i]) as string | null;
  }

  it('emits an UPDATE binding parent_code to NULL for every one of the measured clears', () => {
    // The 37 rows where production holds a parent and the document says none. This is the
    // exact set that diffed empty under the all-NULL fixture.
    expect(MEASURED_PARENT_CLEARS).toHaveLength(37);
    const byCode = new Map(updates().map((s) => [s.code, s]));
    for (const code of MEASURED_PARENT_CLEARS) {
      const s = byCode.get(code);
      expect(s, `no UPDATE compiled for measured clear ${code}`).toBeDefined();
      expect(s!.setColumns, `${code} must set parent_code`).toContain('parent_code');
      expect(boundParent(s!), `${code} must be cleared to NULL, not re-parented`).toBeNull();
    }
    const cleared = updates().filter((s) => s.setColumns.includes('parent_code') && boundParent(s) === null);
    expect(cleared.map((s) => s.code).sort()).toEqual([...MEASURED_PARENT_CLEARS].sort());
  });

  it('leaves a tree where every parent is a header at depth exactly 1, equal to the document', () => {
    // Reconstruct: production's measured parents, overlaid with what the UPDATEs bind, plus
    // the parents the 25 INSERTed rows arrive with. (Those 25 come from the plan rows rather
    // than from parsed INSERT params — the defect was in the UPDATE path, and an INSERT
    // writes every column by definition, so there is nothing for it to omit.)
    const after = new Map<string, string | null>(MEASURED_PARENT_CODES);
    for (const s of updates()) {
      if (s.setColumns.includes('parent_code')) after.set(s.code, boundParent(s));
    }
    for (const row of [...pkg.plans.phase1.inserts, ...pkg.plans.phase2.inserts]) {
      after.set(row.code, row.parentCode);
    }
    expect(after.size).toBe(105);

    // §1.7 first, and by itself, so a violation is reported as a violation rather than as a
    // diff against the projection.
    const headers = new Set<string>(HEADER_CODES);
    for (const [code, parent] of after) {
      if (parent === null) continue;
      expect(headers, `${code} is parented to ${parent}, which is not a header (§1.7)`)
        .toContain(parent);
      expect(after.get(parent) ?? null, `${code} -> ${parent} is depth 2; §1.7 allows exactly 1`)
        .toBeNull();
    }

    // And the whole tree equals the document's. Nothing half-migrated, nothing extra.
    const document = new Map(projectSeedRows().map((r) => [r.code, r.parentCode]));
    expect([...after.entries()].sort()).toEqual([...document.entries()].sort());
  });
});

describe('G4 — Change B is provably excluded', () => {
  it('emits no statement that sets schedule_e_line on any of the five Change B codes', () => {
    const touching: CompiledStatement[] = pkg.statements.filter((s) =>
      CHANGE_B_CODES.includes(s.code),
    );
    // The five are existing rows, so nothing should INSERT them either.
    expect(touching.every((s) => s.kind === 'update')).toBe(true);
    for (const s of touching) {
      expect(s.setColumns, `${s.code} must not have schedule_e_line in its SET list`)
        .not.toContain('schedule_e_line');
    }
    // And nowhere in the whole change does an UPDATE write that column, on any code.
    for (const s of pkg.statements.filter((s) => s.kind === 'update')) {
      expect(s.setColumns).not.toContain('schedule_e_line');
    }
  });

  it('holds the five back as still-drifted in the same artifact, rather than silently', () => {
    // A scope that drops a change without saying so is how "the chart is now in sync" gets
    // believed. The deferral must be in the operator-facing text.
    const deferred = [
      ...pkg.plans.phase3.deferred.updates.map((u) => u.row.code),
      ...pkg.plans.phase3.deferred.fields.map((f) => f.code),
    ];
    expect(deferred.sort()).toEqual([...CHANGE_B_CODES].sort());
    for (const code of CHANGE_B_CODES) {
      expect(pkg.markdown).toMatch(new RegExp(`\`${code}\`[^\\n]*still drifted on: scheduleELine`));
    }
  });

  it('excludes the form-line column by subtracting it from PERSISTED_FIELDS, not by a code list', () => {
    // The mechanism matters: a per-code deny-list has to be kept in sync with the drift,
    // and a code that drifts later is silently included.
    expect(CHANGE_A_FIELDS).toEqual(
      PERSISTED_FIELDS.filter((f) => f !== 'scheduleELine' && f !== 'taxDeductible'),
    );
    expect(CHANGE_A_FIELDS).not.toContain('scheduleELine');
    expect(CHANGE_A_FIELDS).not.toContain('taxDeductible');
    expect(pkg.plans.phase3.scope?.fields).toEqual(CHANGE_A_FIELDS);
  });

  it('keeps tax_deductible out of the phase-3 scope and out of every UPDATE SET list (§6)', () => {
    // Two halves, and only the first can fail on today's data. `taxDeductible` is measured
    // IDENTICAL across all 80 common codes, so putting it back in scope emits zero SET
    // entries and the SET-list half alone would pass — a decoration. Mutation-tested: the
    // scope assertion is what fires. The SET-list half is kept because it is the invariant
    // that matters the day the document's deductibility changes before the apply runs.
    expect(pkg.plans.phase3.scope?.fields).not.toContain('taxDeductible');

    // UPDATE SET lists only. An INSERT column list comes from the table definition, so an
    // omitted column still appears there (rendered `default`) and asserting on it is vacuous.
    const updates = pkg.statements.filter((s) => s.kind === 'update');
    expect(updates.length).toBe(71);
    for (const s of updates) {
      expect(s.setColumns, `${s.code} must not set tax_deductible`).not.toContain('tax_deductible');
    }
  });

  it('writes description on exactly the two measured-drift codes, 4000 and 4110, and no other', () => {
    const withDesc = pkg.statements
      .filter((s) => s.kind === 'update' && s.setColumns.includes('description'))
      .map((s) => s.code)
      .sort();
    expect(withDesc).toEqual(['4000', '4110']);
    // Already among the 71 phase-3 updates, so the statement count does not move.
    expect(pkg.statements.filter((s) => s.kind === 'update').length).toBe(71);
    expect(pkg.statements.filter((s) => s.kind === 'insert').length).toBe(25);
    expect(pkg.markdown).not.toContain('lower bound on the measured 71 description');
    expect(pkg.markdown).toContain('`description` drift is measured exactly, not bounded');
  });

  it('inserting a new account with its form line is not a Change B write', () => {
    // An INSERT cannot CHANGE a mapping — the row had none. The guard above is per-code for
    // exactly this reason, and this pins the reasoning so a later reader does not "fix" it
    // by stripping schedule_e_line out of the inserts and shipping 15 rows with no mapping.
    const insertedWithMapping = projectSeedRows().filter(
      (r) => MISSING_CODES.includes(r.code) && r.scheduleELine !== null,
    );
    expect(insertedWithMapping.length).toBeGreaterThan(0);
    for (const row of insertedWithMapping) {
      expect(CHANGE_B_CODES).not.toContain(row.code);
    }
  });
});

describe('G5 — the plan cannot be asserted against a contradicting table', () => {
  /**
   * The #214 defect, pinned so it cannot return. That package compiled four UPDATEs over
   * 5015/5025/5055/6050 claiming a tax_deductible drift. Those codes hold no row, so the
   * UPDATEs would have matched nothing and the apply would have reported success. The bug
   * was the fixture, not computeSeedPlan — so the guard is: feed an `existing` set that
   * lacks them and assert the plan calls them INSERTs.
   */
  const ABSENT = ['5015', '5025', '5055', '6050'];

  it('classifies codes absent from `existing` as INSERTs, never UPDATEs', () => {
    const existing = measuredExistingRows();
    expect(existing.map((r) => r.code).filter((c) => ABSENT.includes(c))).toEqual([]);

    const plan = computeSeedPlan(projectSeedRows(), existing);
    for (const code of ABSENT) {
      expect(plan.inserts.map((r) => r.code), `${code} must be an INSERT`).toContain(code);
      expect(plan.updates.map((u) => u.row.code), `${code} must not be an UPDATE`).not.toContain(code);
    }
  });

  it('compiles them as INSERTs in the package itself', () => {
    for (const code of ABSENT) {
      const sts = pkg.statements.filter((s) => s.code === code);
      expect(sts).toHaveLength(1);
      expect(sts[0].kind).toBe('insert');
      expect(sts[0].phase).toBe(2);
    }
    expect(pkg.markdown).toContain('There is no `tax_deductible` defect.');
  });

  it('fails rather than rendering when the measured constants contradict the document', () => {
    // The fixture is DATA, so it can contradict the document — and when it does, that is a
    // fact about one of them, not something to render into an artifact an operator signs.
    const projected = projectSeedRows();
    expect(() => assertMeasuredState(projected)).not.toThrow();
    expect(() => assertMeasuredState(projected.filter((r) => r.code !== '1090')))
      .toThrow(/contradicts the authoritative document/);
    // A measured drift that is not actually a drift must also fail: the guard that proves
    // Change B is held back would otherwise assert over an empty set.
    const noNameDrift = projected.map((r) =>
      r.code === '4000' ? { ...r, name: 'Rental Income' } : r,
    );
    expect(() => assertMeasuredState(noNameDrift)).toThrow(/there is no drift|says the same/);
  });

  it('refuses to render when the plan and the compiled SQL disagree in count', () => {
    // The statement-to-plan join is positional. Asserted in compilePhase() rather than
    // assumed, because a silent mismatch would attribute a statement to the wrong code —
    // the same class of error as #214, one layer down.
    expect(pkg.statements.filter((s) => s.phase === 1)).toHaveLength(
      pkg.plans.phase1.inserts.length + pkg.plans.phase1.updates.length,
    );
    expect(pkg.statements.filter((s) => s.phase === 3)).toHaveLength(
      pkg.plans.phase3.inserts.length + pkg.plans.phase3.updates.length,
    );
  });
});

describe('G6 — ordering: a header exists before anything names it as a parent', () => {
  it('places every header INSERT before every statement that references it', () => {
    // neon-http commits each statement independently, so an apply that failed partway with
    // the order reversed would leave children pointing at rows that do not exist.
    for (const header of HEADER_CODES) {
      const insertedAt = pkg.statements.findIndex(
        (s) => s.kind === 'insert' && s.code === header,
      );
      expect(insertedAt, `header ${header} is never inserted`).toBeGreaterThanOrEqual(0);

      const referencing = pkg.statements
        .map((s, i) => ({ s, i }))
        .filter(({ s, i }) => i !== insertedAt && s.params.includes(JSON.stringify(header)));
      expect(referencing.length, `nothing references header ${header}`).toBeGreaterThan(0);
      for (const { s, i } of referencing) {
        expect(i, `${s.kind} ${s.code} references header ${header} before it exists`)
          .toBeGreaterThan(insertedAt);
      }
    }
  });

  it('inserts all ten headers before the first posting-account insert', () => {
    const firstPosting = pkg.statements.findIndex((s) => s.phase === 2);
    const lastHeader = pkg.statements.map((s) => s.phase).lastIndexOf(1);
    expect(lastHeader).toBeLessThan(firstPosting);
    expect(pkg.statements.filter((s) => s.phase === 1)).toHaveLength(10);
  });

  it('leaves no statement referencing a parent that no statement and no existing row holds', () => {
    const existingCodes = new Set(measuredExistingRows().map((r) => r.code));
    const children = projectSeedRows().filter((r) => r.parentCode !== null);
    for (const child of children) {
      const parent = child.parentCode!;
      if (existingCodes.has(parent)) continue;
      expect(
        pkg.statements.some((s) => s.kind === 'insert' && s.code === parent),
        `${child.code}'s parent ${parent} neither exists nor is inserted`,
      ).toBe(true);
    }
  });
});

describe('§5 — the digest uses the derivation\'s own normalisation', () => {
  it('normalises NULL to the empty string and booleans to true/false', () => {
    expect(normaliseForDigest(null)).toBe('');
    expect(normaliseForDigest(true)).toBe('true');
    expect(normaliseForDigest(false)).toBe('false');
    expect(normaliseForDigest('Line 7')).toBe('Line 7');
  });

  it('targets the post-Change-A state, not the projection', () => {
    // Checking the projection's digest after Change A reads a correct apply as failed: the
    // two differ by exactly the five form lines Change B still owes.
    const afterA = expectedPostChangeARows();
    const full = projectSeedRows();
    expect(digestRows(afterA)).not.toBe(digestRows(full));
    const differing = afterA.filter(
      (r, i) => r.scheduleELine !== full.find((f) => f.code === r.code)!.scheduleELine,
    );
    expect(differing.map((r) => r.code).sort()).toEqual([...CHANGE_B_CODES].sort());
    expect(pkg.markdown).toContain(digestRows(afterA));
    expect(pkg.markdown).toContain('Check against the first row, not the second.');
  });

  // -------------------------------------------------------------------------
  // §5 DIGEST — pinned against an EXTERNAL oracle, and against injectivity.
  //
  // Every other digest assertion in this file recomputes its expectation with
  // `digestRows` itself, so a wrong encoder makes the markdown and the expectation wrong
  // together and the test still passes. That is how the delimiter collision below survived
  // a live three-row cross-check and 24 green guards. These two tests are the ones that can
  // actually fail.
  // -------------------------------------------------------------------------
  describe('§5 digest encoding', () => {
    // Deliberately adversarial: a ':' in a name, a ',' in both a name and a description,
    // multi-byte UTF-8 (where Postgres octet_length and JS String.length disagree), a NULL
    // boolean, and an empty string.
    const ORACLE_ROWS = [
      { code: '5015', name: 'Repairs: Interior', type: 'expense', subtype: 'operating', description: null, parentCode: '5000', scheduleELine: 'Line 14', taxDeductible: true },
      { code: '5016', name: 'Repairs', type: 'expense', subtype: 'operating', description: 'Interior', parentCode: '5000', scheduleELine: 'Line 14', taxDeductible: true },
      { code: '5017', name: 'Comma, Name', type: 'expense', subtype: null, description: 'desc, with comma', parentCode: null, scheduleELine: null, taxDeductible: false },
      { code: '5018', name: 'Ünïcøde ☕ naïve', type: 'asset', subtype: 'current', description: 'multi-byte: ☕', parentCode: '5000', scheduleELine: null, taxDeductible: null },
      { code: '5019', name: '', type: null, subtype: null, description: null, parentCode: null, scheduleELine: null, taxDeductible: true },
    ] as unknown as Parameters<typeof digestRows>[0];

    it('matches a literal produced by running the emitted SQL on the database', () => {
      // NOT recomputed with digestRows. This literal was produced by executing the §5
      // statement this generator emits against Neon project solitary-rice-14149088 on
      // 2026-10-25, over exactly the rows above supplied as a VALUES list. If the TypeScript
      // encoder and the emitted SQL ever diverge, this fails — which is the whole point:
      // the two agreeing with each other proves only that they compute the same function.
      expect(digestRows(ORACLE_ROWS)).toBe('b8e27fa6dc98');
    });

    it('is injective across a delimiter moving between fields', () => {
      // Under the previous encoding — fields joined by ':' and rows by ',' with no escaping
      // — these two rows both produced 9bf5650f06cd. Two materially different charts, one
      // digest, and §5 would have called a partially-applied chart clean. Measured against
      // production the same day: 14 of 80 live rows carry a ':' or a ',' in name or
      // description, so this was reachable, not theoretical.
      const a = [{ code: '5015', name: 'Repairs:Interior', type: 'expense', subtype: null, description: '', parentCode: '5000', scheduleELine: 'Line 14', taxDeductible: true }];
      const b = [{ code: '5015', name: 'Repairs', type: 'expense', subtype: null, description: 'Interior:', parentCode: '5000', scheduleELine: 'Line 14', taxDeductible: true }];
      expect(digestRows(a as never)).not.toBe(digestRows(b as never));
    });

    it('reads every column Change A writes (§5) — type and subtype included', () => {
      // §5: "Reconciliation reads every column the change claimed to set." §10: "a column
      // never read is a column never verified." Change A writes name, type, subtype,
      // description and parentCode; the digest originally read neither type nor subtype, so
      // a post-apply drift in either reconciled as clean. This asserts the two sets line up,
      // so adding a field to CHANGE_A_FIELDS without adding it to the digest fails here.
      const digested = new Set(['name', 'type', 'subtype', 'description', 'parentCode']);
      for (const f of CHANGE_A_FIELDS) {
        expect(digested.has(f), `CHANGE_A_FIELDS has "${f}" but the §5 digest does not read it`).toBe(true);
      }
      expect([...digested].every((f) => (CHANGE_A_FIELDS as string[]).includes(f))).toBe(true);
      for (const col of ['type', 'subtype']) {
        expect(pkg.markdown).toContain(`octet_length(coalesce(${col},''))::text`);
      }
    });

    it('emits SQL that length-prefixes by BYTES, not characters', () => {
      // length() counts characters and octet_length() counts bytes; they disagree on any
      // non-BMP character, and JS Buffer.byteLength matches the latter. An SQL side built on
      // length() would pass every ASCII fixture and diverge on the first emoji.
      expect(pkg.markdown).toContain('octet_length(coalesce(name,\'\'))::text');
      expect(pkg.markdown).not.toMatch(/\bstring_agg\([^)]*\blength\(/);
      expect(pkg.markdown).toContain('ORDER BY code COLLATE "C"');
    });
  });

  // -------------------------------------------------------------------------
  // §2 — "a plan is not a write". Reconciled COLUMN BY COLUMN, not by count.
  //
  // Until this landed, the plan and the compiled SQL were reconciled only by statement
  // count, which cannot see a dropped column: the statement still exists, still runs, and
  // leaves the old value in place. That is the 2026-09-18 failure verbatim.
  // -------------------------------------------------------------------------
  describe('§2 plan-vs-SQL column reconciliation', () => {
    it('every compiled UPDATE sets exactly its changedFields plus updated_at', () => {
      const updates = pkg.statements.filter((s: CompiledStatement) => s.kind === 'update');
      expect(updates.length).toBeGreaterThan(0);
      for (const s of updates) {
        expect(s.setColumns).toContain('updated_at');
        expect(s.setColumns.length).toBeGreaterThan(1);
      }
    });

    it('rejects a SET list that omits a column the plan claims', () => {
      expect(() =>
        assertSetColumnsMatchPlan('ctx', ['updated_at'], ['parentCode'] as never),
      ).toThrow(/MISSING: parent_code/);
    });

    it('rejects a SET list that writes a column the plan never declared', () => {
      expect(() =>
        assertSetColumnsMatchPlan('ctx', ['parent_code', 'is_active', 'updated_at'], ['parentCode'] as never),
      ).toThrow(/UNDECLARED: is_active/);
      // An undeclared write is not a harmless extra: §7 shows the operator a blast radius
      // built from this list, so a column missing from it is a column written unannounced.
    });

    it('accepts the exact match, both directions', () => {
      expect(() =>
        assertSetColumnsMatchPlan('ctx', ['parent_code', 'name', 'updated_at'], ['parentCode', 'name'] as never),
      ).not.toThrow();
    });

    it('fails closed when the SET clause cannot be parsed', () => {
      // The previous implementation ended `?? ''` and returned [], so an unparseable
      // statement read as "writes nothing" — rendered as an empty blast radius and a
      // rollback that restores nothing.
      expect(() => setColumns('UPDATE "chart_of_accounts" WHERE "id" = $1', 'ctx')).toThrow(
        /no SET clause|zero columns/,
      );
      expect(() => setColumns('not sql at all', 'ctx')).toThrow(/no SET clause/);
    });
  });
});
