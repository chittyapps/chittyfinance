import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The gate package is the artifact an operator reads before authorizing a production
 * financial write. finance-operating-defaults §7 says the gate is only meaningful if what
 * is presented is COMPLETE — the compiled statement, the snapshot, a rollback covering
 * every column touched, and the blast radius.
 *
 * A package that silently loses a section still looks like a gate. These tests exist so
 * that losing one fails instead, and so the statement count and SET list cannot drift away
 * from what §6 requires (a tax-semantics change with no structural change riding inside it).
 */
const ROOT = join(__dirname, '..', '..');
const SCRIPT = join('scripts', 'coa-apply-gate-package.ts');
const COMMITTED = join(ROOT, 'docs', 'gates', 'coa-scoped-apply-2026-10-19.md');

/**
 * Captured rather than thrown at module scope.
 *
 * A generator that crashes during test COLLECTION means zero tests execute, and vitest
 * reports "no tests" — which greps as zero failures and reads as a pass in CI. That is the
 * same silent-failure shape as a suite whose module never loaded. So the failure is turned
 * into a value here and asserted by the first test below.
 */
function generate(): { out: string; error: Error | null } {
  try {
    return {
      out: execFileSync('npx', ['tsx', SCRIPT], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120_000,
      }),
      error: null,
    };
  } catch (e) {
    return { out: '', error: e as Error };
  }
}

describe('the §7 gate package generator', () => {
  const { out, error } = generate();

  it('runs to completion', () => {
    // First, so a crashing generator is one loud failure rather than nine confusing ones
    // — and never a "no tests" run that reads as green.
    expect(error, error ? `generator failed: ${error.message}` : undefined).toBeNull();
    expect(out.length).toBeGreaterThan(500);
  });

  it('carries every section §7 and §10 require', () => {
    for (const heading of [
      '§2 — the compiled statements that will execute',
      '§4 — the snapshot, to run BEFORE the apply',
      '§7 — rollback recipe',
      '§5 — reconcile AFTER, by digest',
      '§7 — blast radius',
      '§10 — gaps in this package',
    ]) {
      expect(out, `missing section: ${heading}`).toContain(heading);
    }
  });

  it('emits four UPDATEs and zero INSERTs — the §6 separation', () => {
    const updates = [...out.matchAll(/^update "chart_of_accounts" set /gm)];
    expect(updates).toHaveLength(4);
    expect(out).toContain('4 UPDATE, 0 INSERT');
    expect(out).not.toMatch(/^insert into "chart_of_accounts"/m);
    for (const code of ['5015', '5025', '5055', '6050']) {
      expect(out, `code ${code} missing`).toContain(`code ${code} — SET`);
    }
  });

  it('writes only tax_deductible and updated_at', () => {
    // If parent_code ever appears in a SET list here, a structural change is riding inside
    // a tax-semantics change and §6 has been violated.
    const sets = [...out.matchAll(/— SET ([a-z_, ]+)\*\*/g)].map((m) => m[1].trim());
    expect(sets).toHaveLength(4);
    for (const set of sets) expect(set).toBe('tax_deductible, updated_at');
    expect(out).not.toContain('"parent_code" = $');
  });

  it('scopes every statement to tenant_id IS NULL, so a tenant override is unreachable', () => {
    const scoped = [...out.matchAll(/"chart_of_accounts"\."tenant_id" is null/g)];
    expect(scoped.length).toBeGreaterThanOrEqual(4);
  });

  it('labels which bound values are real and which are placeholders', () => {
    // The package shows a synthetic id and a compile-time timestamp. Presenting those as
    // the values that will execute would be the same class of defect as the plan/write
    // confusion in §2 — a description mistaken for the statement.
    expect(out).toContain('tax_deductible — REAL');
    expect(out).toContain('updated_at — PLACEHOLDER');
    expect(out).toContain('id — PLACEHOLDER');
  });

  it('never claims anything was written', () => {
    // The seed logs "Wrote 0 insert(s) and 4 update(s)" against the recording client. In a
    // gate package for an unapplied change that sentence is actively dangerous.
    expect(out).not.toContain('Wrote ');
    expect(out).not.toContain('Applying chart of accounts');
    expect(out).toContain('Nothing in this run touched a database');
  });

  it('restores updated_at in the rollback, not just the value', () => {
    expect(out).toMatch(/updated_at\s*=\s*'<snapshot\.updated_at>'/);
  });

  it('states the §3 tension rather than presenting the rollback as compliant', () => {
    expect(out).toContain('no §3-compliant rollback');
  });

  it('names the credential blocker as the reason the apply has not run', () => {
    expect(out).toContain('serviceAuth');
    expect(out).toContain('/chico');
  });

  it('the committed artifact is current with the generator', () => {
    expect(existsSync(COMMITTED), `${COMMITTED} missing`).toBe(true);
    const committed = readFileSync(COMMITTED, 'utf8');
    // The generated-at line and the placeholder timestamps differ per run by design, so
    // compare everything else.
    const strip = (s: string) =>
      s
        .replace(/^Generated by .*$/m, '')
        .replace(/"2026-\d\d-\d\dT[\d:.]+Z"/g, '"<ts>"')
        .replace(/on 2026-\d\d-\d\dT[\d:.]+Z/g, 'on <ts>');
    expect(strip(committed)).toBe(strip(out));
  });
});
