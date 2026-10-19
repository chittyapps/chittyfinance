import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * §11 of docs/CHART-OF-ACCOUNTS.md maps Mercury categories to chart accounts. Its keys are
 * matched against live category NAMES, which makes a wrong key the one kind of defect
 * nothing detects: it matches no transaction, and matching nothing raises no error. A sync
 * keyed on `expense-petty-cash` against a live `expense-petty_cash` does not fail — it
 * quietly processes zero rows forever.
 *
 * That is not hypothetical. `expense-petty-cash` was the table's only petty-cash key, so
 * its decision to treat petty cash as an asset movement to 1050 reached none of the 20
 * live transactions ($1,784.49, 2025-07-06 → 2026-09-19) under `expense-petty_cash`.
 *
 * So every key must either exist in the recorded snapshot of live categories, or be listed
 * in §11.1 as having no live category. Nothing may be in both, and §11.1 may not list a
 * name the mapping table never mentions — a stale absence claim is its own drift.
 *
 * The snapshot is a recorded read, not a live call: CI holds no Mercury credential, and a
 * suite that silently skips without one is worse than no suite. Refreshing it is a
 * deliberate act documented in the fixture header.
 */
const DOC = readFileSync(join(__dirname, '..', '..', 'docs', 'CHART-OF-ACCOUNTS.md'), 'utf8');
const SNAPSHOT = join(__dirname, 'fixtures', 'mercury-categories.2026-10-19.txt');
const MERCURY_SNAPSHOT_DATE = '2026-10-19';

/** Live category names, from the recorded snapshot. */
function liveCategories(): Map<string, string> {
  const rows = readFileSync(SNAPSHOT, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
  const byName = new Map<string, string>();
  for (const row of rows) {
    const [id, name] = row.split('|');
    if (!id || !name) throw new Error(`malformed snapshot row: ${row}`);
    if (byName.has(name)) throw new Error(`snapshot has two categories named ${name}`);
    byName.set(name, id);
  }
  return byName;
}

/** The section 11 mapping table's body rows, excluding the 11.1 absence table. */
function mappingSection(): string {
  const start = DOC.indexOf('## 11. Mercury → ChittyFinance mapping');
  if (start < 0) throw new Error('section 11 not found');
  const end = DOC.indexOf('### 11.1 ', start);
  if (end < 0) throw new Error('section 11.1 not found');
  return DOC.slice(start, end);
}

/** Every backticked name in the first column of the mapping table. */
function mappedKeys(): string[] {
  const keys: string[] = [];
  for (const line of mappingSection().split('\n')) {
    if (!line.startsWith('|') || line.startsWith('|---')) continue;
    if (line.includes('Mercury category')) continue;
    const first = line.split('|')[1] ?? '';
    for (const m of first.matchAll(/`([^`]+)`/g)) keys.push(m[1]);
  }
  return keys;
}

/** The keys §11.1 declares have no live category. */
function declaredAbsent(): string[] {
  const start = DOC.indexOf('### 11.1 ');
  const rest = DOC.slice(start);
  const end = rest.indexOf('\n### ', 1);
  const section = end < 0 ? rest : rest.slice(0, end);
  const keys: string[] = [];
  for (const line of section.split('\n')) {
    if (!line.startsWith('|') || line.startsWith('|---')) continue;
    if (line.includes('Live category it was probably')) continue;
    const first = line.split('|')[1] ?? '';
    const m = first.match(/`([^`]+)`/);
    if (m) keys.push(m[1]);
  }
  return keys;
}

describe('the snapshot and the sections it checks', () => {
  it('records the 48 live categories, each once, with an id', () => {
    const live = liveCategories();
    expect(live.size).toBe(48);
    for (const [name, id] of live) {
      expect(id, name).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it('names the snapshot date it was reconciled against, in the doc and in this file', () => {
    // A reconciliation claim with no date is not checkable. If the fixture is refreshed
    // without updating these, this fails rather than letting the doc assert a stale date.
    expect(SNAPSHOT).toContain(MERCURY_SNAPSHOT_DATE);
    expect(DOC).toContain(`Reconciled against live Mercury ${MERCURY_SNAPSHOT_DATE}`);
    expect(DOC).toContain(`no live Mercury category (verified ${MERCURY_SNAPSHOT_DATE})`);
  });

  it('finds a non-trivial mapping table and absence list', () => {
    // Non-vacuity: every assertion below is a loop, and an empty loop passes.
    expect(mappedKeys().length).toBeGreaterThan(40);
    expect(declaredAbsent().length).toBeGreaterThan(5);
  });
});

describe('§11 keys against live Mercury', () => {
  it('maps no key that matches no live category and is not declared absent', () => {
    const live = liveCategories();
    const absent = new Set(declaredAbsent());
    const orphans = mappedKeys().filter((k) => !live.has(k) && !absent.has(k));
    expect(
      orphans,
      `these §11 keys match no live Mercury category and are not listed in §11.1. A key ` +
        `that matches nothing fails silently — add it to §11.1 or correct the spelling.`,
    ).toEqual([]);
  });

  it('declares nothing absent that is actually live', () => {
    const live = liveCategories();
    const wrong = declaredAbsent().filter((k) => live.has(k));
    expect(wrong, 'listed in §11.1 as having no live category, but the snapshot has it').toEqual(
      [],
    );
  });

  it('declares nothing absent that the mapping table never mentions', () => {
    const mapped = new Set(mappedKeys());
    const stray = declaredAbsent().filter((k) => !mapped.has(k));
    expect(stray, '§11.1 lists a key §11 does not map').toEqual([]);
  });

  it('keys petty cash on the live underscore spelling, not the hyphen that matched nothing', () => {
    // The specific regression. The hyphen form stays in §11.1 as history; the mapping
    // table must carry the form that can actually match a transaction.
    const live = liveCategories();
    expect(live.has('expense-petty_cash')).toBe(true);
    expect(live.has('expense-petty-cash')).toBe(false);
    expect(mappedKeys()).toContain('expense-petty_cash');
    expect(declaredAbsent()).toContain('expense-petty-cash');
  });

  it('leaves exactly the two retired arias categories live but unmapped', () => {
    // Removed from the table in #211; both hold zero transactions. Mercury exposes no
    // category delete, so they persist. Asserted so their reappearance in the mapping
    // table is a deliberate act.
    const live = liveCategories();
    const mapped = new Set(mappedKeys());
    const unmapped = [...live.keys()].filter((n) => !mapped.has(n)).sort();
    expect(unmapped).toEqual(['arias-liability', 'liability-arias']);
  });
});
