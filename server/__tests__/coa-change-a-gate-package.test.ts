import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildChangeAPackage,
  measuredExistingRows,
  expectedPostChangeARows,
  digestRows,
  normaliseForDigest,
  assertMeasuredState,
  HEADER_CODES,
  POSTING_CODES,
  MISSING_CODES,
  CHANGE_B_SCHEDULE_E,
  CHANGE_A_FIELDS,
  type CompiledStatement,
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

const pkg = await buildChangeAPackage();

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
    expect(pkg.markdown).toContain('never isolated to a code list');
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
    expect(CHANGE_A_FIELDS).toEqual(PERSISTED_FIELDS.filter((f) => f !== 'scheduleELine'));
    expect(CHANGE_A_FIELDS).not.toContain('scheduleELine');
    expect(pkg.plans.phase3.scope?.fields).toEqual(CHANGE_A_FIELDS);
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
});
