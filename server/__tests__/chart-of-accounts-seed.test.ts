import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeSeedPlan,
  deriveParentCode,
  getKeywordsForCode,
  projectSeedRows,
  type ExistingAccountRow,
  type SeedAccountRow,
} from '../../database/seeds/chart-of-accounts';
import { REI_CHART_OF_ACCOUNTS } from '../../database/chart-of-accounts';

/**
 * Unit tests for the seed's delta computation. Nothing here touches a database and
 * nothing is mocked: computeSeedPlan is pure, and every fixture is derived from the
 * real chart and the real document rather than invented.
 *
 * The production state is not queried. docs/CHART-OF-ACCOUNTS.md states it: 80 global
 * accounts, "verified identical to the pre-change projection on 2026-09-17", with the
 * 15 accounts added by that document marked `*` in its §14 register. That is what the
 * fixtures below reconstruct.
 */
const DOC = readFileSync(
  join(__dirname, '..', '..', 'docs', 'CHART-OF-ACCOUNTS.md'),
  'utf8',
);

/** Codes marked `*` in the §14 register: defined by the document, not yet in production. */
function starredCodes(): Set<string> {
  const codes = new Set<string>();
  for (const line of DOC.split('\n')) {
    const match = /^\|\s*(\d{4})\s*\*\s*\|/.exec(line);
    if (match) codes.add(match[1]);
  }
  return codes;
}

/** Give a projected row an id, as the table would. */
function asExisting(row: SeedAccountRow, index: number): ExistingAccountRow {
  return { ...row, id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` };
}

const PROJECTED = projectSeedRows();

/**
 * The persisted-field values these accounts carried before PR #157 changed them,
 * recovered from the projection as it stood at 34bf347^. Production still holds these.
 */
const PRE_157_VALUES: Record<string, Partial<SeedAccountRow>> = {
  '4000': { name: 'Rental Income', description: 'Base rent received' },
  '4110': { description: 'Security deposits retained', scheduleELine: null },
  '4120': { scheduleELine: null },
  '5020': { scheduleELine: 'Line 14' },
  '5030': { scheduleELine: 'Line 7' },
  '5080': { scheduleELine: 'Line 14' },
};

/** The 80 global rows production is documented to hold today. */
function productionRows(): ExistingAccountRow[] {
  const starred = starredCodes();
  return PROJECTED.filter((row) => !starred.has(row.code))
    .map((row) => ({ ...row, ...(PRE_157_VALUES[row.code] ?? {}) }))
    .map(asExisting);
}

describe('deriveParentCode', () => {
  it('points a sub-account at the head of its hundred-range', () => {
    expect(deriveParentCode('5110')).toBe('5100');
    expect(deriveParentCode('5015')).toBe('5000');
    expect(deriveParentCode('1515')).toBe('1500');
  });

  it('gives a range head no parent rather than pointing it at itself', () => {
    expect(deriveParentCode('5100')).toBeNull();
    expect(deriveParentCode('1900')).toBeNull();
    expect(deriveParentCode('2500')).toBeNull();
  });

  it('gives a top-level account no parent', () => {
    expect(deriveParentCode('4000')).toBeNull();
    expect(deriveParentCode('1000')).toBeNull();
  });

  it('never makes any account in the chart its own parent', () => {
    const selfParented = REI_CHART_OF_ACCOUNTS.filter(
      (a) => deriveParentCode(a.code) === a.code,
    ).map((a) => a.code);
    expect(selfParented).toEqual([]);
  });

  it('only names a parent that exists in the chart', () => {
    const codes = new Set(REI_CHART_OF_ACCOUNTS.map((a) => a.code));
    for (const account of REI_CHART_OF_ACCOUNTS) {
      const parent = deriveParentCode(account.code);
      if (parent !== null) expect(codes.has(parent)).toBe(true);
    }
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

  it('sorts keywords so their source order is not a difference', () => {
    const keywords = getKeywordsForCode('4000');
    expect(keywords).toEqual([...keywords].sort());
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
    const existing = productionRows();
    const first = computeSeedPlan(PROJECTED, existing);

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

  it('treats a corrected Schedule E line as an update', () => {
    const existing = PROJECTED.map(asExisting).map((row) =>
      row.code === '5020' ? { ...row, scheduleELine: 'Line 14' } : row,
    );
    const plan = computeSeedPlan(PROJECTED, existing);
    expect(plan.updates.map((u) => u.row.code)).toEqual(['5020']);
    expect(plan.updates[0].changedFields).toEqual(['scheduleELine']);
  });

  it('does not call a row changed because its keywords are in another order', () => {
    const existing = PROJECTED.map(asExisting).map((row) =>
      row.metadata.keywords.length > 1
        ? { ...row, metadata: { keywords: [...row.metadata.keywords].reverse() } }
        : row,
    );
    const plan = computeSeedPlan(PROJECTED, existing);
    expect(plan.updates).toEqual([]);
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

describe('the delta this seed would apply to the documented production state', () => {
  const plan = computeSeedPlan(PROJECTED, productionRows());

  it('starts from the 80 global accounts the document records', () => {
    expect(productionRows()).toHaveLength(80);
    expect(PROJECTED).toHaveLength(95);
  });

  it('inserts exactly the 15 accounts the register marks as not yet seeded', () => {
    expect(plan.inserts.map((r) => r.code).sort()).toEqual([...starredCodes()].sort());
    expect(plan.inserts).toHaveLength(15);
  });

  it('updates the 4000 rename and the five other corrections PR #157 made', () => {
    expect(plan.updates.map((u) => u.row.code).sort()).toEqual([
      '4000',
      '4110',
      '4120',
      '5020',
      '5030',
      '5080',
    ]);
  });

  it('leaves the remaining 74 accounts untouched', () => {
    expect(plan.unchanged).toHaveLength(74);
  });

  it('finds no duplicate and no extraneous global code', () => {
    expect(plan.duplicateCodes).toEqual([]);
    expect(plan.extraneous).toEqual([]);
  });
});
