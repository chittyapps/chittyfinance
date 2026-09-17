import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  REI_CHART_OF_ACCOUNTS,
  getAccountByCode,
  getAccountTreatment,
  isProfitAndLossAccount,
  getForm8825Line,
  getScheduleELine,
} from '../../database/chart-of-accounts';

/**
 * docs/CHART-OF-ACCOUNTS.md is authoritative (see its header). This suite is what
 * makes that true rather than merely stated: if the document and the projection
 * disagree, CI fails and the document wins.
 *
 * Reads the real document — no fixture, no mock.
 *
 * Every expectation below is derived from the document. Nothing here iterates the
 * constant arrays that define the behaviour under test: a suite that reads
 * `TRANSFER_CLEARING_CODES` to decide what the transfer codes are stays green when
 * a code is deleted from it, which is exactly the failure it exists to catch.
 */
const DOC = readFileSync(
  join(__dirname, '..', '..', 'docs', 'CHART-OF-ACCOUNTS.md'),
  'utf8',
);

/** Document sections, keyed by their `## N.` number. */
function sections(): Map<string, string> {
  const out = new Map<string, string>();
  for (const chunk of DOC.split('\n## ')) {
    const num = chunk.split('.')[0].trim();
    if (/^\d+$/.test(num)) out.set(num, chunk);
  }
  return out;
}

const SECTIONS = sections();

/** IRS form numbers are four digits too; they are never account codes. */
const IRS_FORM_NUMBERS = new Set(['1040', '1065', '1098', '1099', '4562', '8825']);

/**
 * Account codes named in a table cell. Scans every cell, not just the first — §7
 * and §11 name accounts in their second column and went entirely unread while only
 * the code column was scanned.
 *
 * Inline code spans are stripped: Mercury bank accounts and category slugs appear
 * as `CHIT 2062` / `expense-late_fee` and are not chart codes. A four-digit token
 * glued to a hyphen (`1099-NEC`) or opening a date (`1970-01-01`) is not one either.
 */
function codesInCells(text: string): Set<string> {
  const codes = new Set<string>();
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) continue;
    for (const rawCell of line.split('|').slice(1, -1)) {
      const cell = rawCell.replace(/`[^`]*`/g, '');
      for (const match of cell.matchAll(/(?<![\d-])(\d{4})(?!-\d{2}-\d{2})(?![\d-])/g)) {
        if (!IRS_FORM_NUMBERS.has(match[1])) codes.add(match[1]);
      }
    }
  }
  return codes;
}

/** Sections that reference chart accounts. §5, §10 and §12 describe Mercury and sources. */
const ACCOUNT_SECTIONS = ['3', '4', '6', '7', '8', '11', '14'];

function referencedCodes(): Set<string> {
  const codes = new Set<string>();
  for (const num of ACCOUNT_SECTIONS) {
    for (const code of codesInCells(SECTIONS.get(num) ?? '')) codes.add(code);
  }
  return codes;
}

describe('chart of accounts: document and projection agree', () => {
  const docCodes = codesInCells(DOC);
  const referenced = referencedCodes();
  const codeCodes = new Set(REI_CHART_OF_ACCOUNTS.map((a) => a.code));

  it('the document actually declares itself authoritative', () => {
    expect(DOC).toContain('Status: **authoritative**');
  });

  it('every account in the projection is documented', () => {
    const undocumented = [...codeCodes].filter((c) => !docCodes.has(c)).sort();
    expect(undocumented).toEqual([]);
  });

  it('every code named in the document exists in the projection', () => {
    const missing = [...referenced].filter((c) => !codeCodes.has(c)).sort();
    expect(missing).toEqual([]);
  });

  it('has no duplicate codes', () => {
    expect(REI_CHART_OF_ACCOUNTS.length).toBe(codeCodes.size);
  });
});

/**
 * §14 of the document is the complete register and says it is normative for the
 * name, type and treatment of every account. These rows are what make that true:
 * the register is parsed and each field held against the projection.
 */
interface RegisterRow {
  code: string;
  name: string;
  type: string;
  treatment: string;
  form8825?: string;
  scheduleE?: string;
  /** `*` in the register: defined here but not yet seeded to production. */
  isNew: boolean;
}

const REGISTER = SECTIONS.get('14') ?? '';

function registerRows(): RegisterRow[] {
  if (!REGISTER) throw new Error('the document has no §14 register');
  const rows: RegisterRow[] = [];
  for (const line of REGISTER.split('\n')) {
    if (!line.startsWith('| ')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 6 || !/^\d{4}/.test(cells[0])) continue;
    // A leading code may carry ' *' marking an account not yet seeded.
    const line8825 = cells[4] === '—' ? undefined : `Line ${cells[4]}`;
    const lineE = cells[5] === '—' ? undefined : `Line ${cells[5]}`;
    rows.push({
      code: cells[0].replace(/\s*\*$/, ''),
      name: cells[1],
      type: cells[2],
      treatment: cells[3],
      form8825: line8825,
      scheduleE: lineE,
      isNew: /\*$/.test(cells[0]),
    });
  }
  return rows;
}

/** The three counts the header states. They must agree with each other and with §14. */
function headerCounts() {
  const flat = DOC.replace(/\s+/g, ' ');
  const registered = flat.match(/the (\d+) accounts registered in §14/);
  const added = flat.match(/The (\d+) marked NEW/);
  const live = flat.match(/\((\d+) accounts there/);
  if (!registered || !added || !live) {
    throw new Error('the document header no longer states its account counts');
  }
  return {
    registered: Number(registered[1]),
    added: Number(added[1]),
    live: Number(live[1]),
  };
}

describe('the §14 register is normative', () => {
  const rows = registerRows();
  const counts = headerCounts();

  it('registers every account exactly once', () => {
    expect(rows.length).toBe(REI_CHART_OF_ACCOUNTS.length);
    expect(new Set(rows.map((r) => r.code)).size).toBe(rows.length);
  });

  it('marks exactly the accounts not yet seeded to production', () => {
    // Nothing here is a literal: the counts come from the document header and must
    // be arithmetically consistent with the `*` markers actually in the register.
    const marked = rows.filter((r) => r.isNew);
    expect(rows.length).toBe(counts.registered);
    expect(marked.length).toBe(counts.added);
    expect(counts.registered - counts.added).toBe(counts.live);
    expect(REI_CHART_OF_ACCOUNTS.length - marked.length).toBe(counts.live);
  });

  it('gives every account the name, type and treatment the projection carries', () => {
    const mismatches = rows
      .map((r) => {
        const account = getAccountByCode(r.code);
        if (!account) return `${r.code}: not in the projection`;
        if (account.name !== r.name) return `${r.code} name: doc "${r.name}" vs code "${account.name}"`;
        if (account.type !== r.type) return `${r.code} type: doc "${r.type}" vs code "${account.type}"`;
        const treatment = getAccountTreatment(r.code);
        if (treatment !== r.treatment) return `${r.code} treatment: doc "${r.treatment}" vs code "${treatment}"`;
        return null;
      })
      .filter(Boolean);
    expect(mismatches).toEqual([]);
  });

  it('gives every account the IRS lines the projection carries', () => {
    const mismatches = rows
      .map((r) => {
        const f = getForm8825Line(r.code);
        if (f !== r.form8825) return `${r.code} 8825: doc ${r.form8825 ?? 'none'} vs code ${f ?? 'none'}`;
        const e = getScheduleELine(r.code);
        if (e !== r.scheduleE) return `${r.code} Sch E: doc ${r.scheduleE ?? 'none'} vs code ${e ?? 'none'}`;
        return null;
      })
      .filter(Boolean);
    expect(mismatches).toEqual([]);
  });
});

/**
 * §3 and §4 are the narrative tables a preparer actually reads. They carried
 * Schedule E line 7 for commissions for as long as §14 did, and CI stayed green
 * because only §14 was parsed. Both are now held against the register.
 */
function narrativeLines(sectionNumber: string): Array<{ code: string; form8825?: string; scheduleE?: string }> {
  const section = SECTIONS.get(sectionNumber) ?? '';
  const out: Array<{ code: string; form8825?: string; scheduleE?: string }> = [];
  for (const line of section.split('\n')) {
    if (!line.startsWith('| ')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    // | Code | Name | 8825 | Sch E (or E) | Note |
    if (cells.length !== 5 || !/^\d{4}$/.test(cells[0])) continue;
    const norm = (raw: string): string | undefined => {
      const clean = raw.replace(/\*\*/g, '').trim();
      if (clean === '—' || clean === '' || /not 8825/i.test(clean)) return undefined;
      return `Line ${clean}`;
    };
    out.push({ code: cells[0], form8825: norm(cells[2]), scheduleE: norm(cells[3]) });
  }
  return out;
}

describe('the narrative tables agree with the register', () => {
  const register = new Map(registerRows().map((r) => [r.code, r]));

  for (const [sectionNumber, label] of [['3', '§3 income'], ['4', '§4 expense']] as const) {
    it(`${label} gives the same IRS lines as §14`, () => {
      const rows = narrativeLines(sectionNumber);
      expect(rows.length).toBeGreaterThan(0);
      const mismatches = rows
        .map((r) => {
          const reg = register.get(r.code);
          if (!reg) return `${r.code}: in ${label} but not in the §14 register`;
          if (reg.form8825 !== r.form8825) {
            return `${r.code} 8825: ${label} ${r.form8825 ?? 'none'} vs §14 ${reg.form8825 ?? 'none'}`;
          }
          if (reg.scheduleE !== r.scheduleE) {
            return `${r.code} Sch E: ${label} ${r.scheduleE ?? 'none'} vs §14 ${reg.scheduleE ?? 'none'}`;
          }
          return null;
        })
        .filter(Boolean);
      expect(mismatches).toEqual([]);
    });
  }

  it('§2 does not describe 1099 contract labor as wages', () => {
    // Form 8825 line 13 is Wages and salaries — W-2 payroll. 5015 is 1099-NEC
    // non-employee labor and belongs in Other (17).
    const section = SECTIONS.get('2') ?? '';
    expect(section).toContain('| W-2 wages |');
    expect(section).toMatch(/Contract labor \(1099-NEC\) \| no line — Other \(17\)/);
  });
});

/**
 * Reporting treatment, asserted per code against the §14 register. Deleting a code
 * from TRANSFER_CLEARING_CODES, CONTROL_CODES or CAPITAL_IMPROVEMENT_CODES changes
 * what `getAccountTreatment` returns for it and fails here.
 */
describe('reporting treatment', () => {
  const rows = registerRows();
  const byTreatment = (t: string) => rows.filter((r) => r.treatment === t);

  it('every register treatment class is populated', () => {
    // Guards the assertions below against passing vacuously on an empty filter.
    for (const t of ['pl', 'balance', 'transfer', 'control']) {
      expect(byTreatment(t).length).toBeGreaterThan(0);
    }
  });

  it('P&L membership follows the register exactly', () => {
    const mismatches = rows
      .filter((r) => isProfitAndLossAccount(r.code) !== (r.treatment === 'pl'))
      .map((r) => `${r.code} (${r.name}): register says ${r.treatment}, code says ${isProfitAndLossAccount(r.code) ? 'pl' : 'not pl'}`);
    expect(mismatches).toEqual([]);
  });

  it('clearing accounts carry the clearing subtype', () => {
    for (const row of byTreatment('transfer')) {
      expect(getAccountByCode(row.code)?.subtype).toBe('clearing');
    }
  });

  it('control accounts are suspense or non-deductible holdings', () => {
    for (const row of byTreatment('control')) {
      expect(['suspense', 'non-deductible']).toContain(getAccountByCode(row.code)?.subtype);
    }
  });

  it('an expense typed account held off the balance sheet is a capital addition', () => {
    // The 7000-series is typed 'expense' in the legacy chart; a capital addition is
    // recovered through depreciation on Form 4562, never deducted. See §8.
    const capital = rows.filter((r) => r.treatment === 'balance' && r.type === 'expense');
    expect(capital.length).toBeGreaterThan(0);
    for (const row of capital) {
      expect(getAccountByCode(row.code)?.subtype).toBe('capital');
    }
  });

  it('deductibility is exactly P&L expense membership', () => {
    const mismatches = rows
      .filter((r) => {
        const deductible = getAccountByCode(r.code)?.taxDeductible === true;
        return deductible !== (r.type === 'expense' && r.treatment === 'pl');
      })
      .map((r) => `${r.code} (${r.name}): taxDeductible=${getAccountByCode(r.code)?.taxDeductible} for ${r.type}/${r.treatment}`);
    expect(mismatches).toEqual([]);
  });

  it('an unknown code has no treatment', () => {
    // 3200 is the code that reached 1,199 live rows without ever existing.
    expect(getAccountTreatment('3200')).toBeUndefined();
    expect(isProfitAndLossAccount('3200')).toBe(false);
  });
});

describe('IRS line references', () => {
  it('maps the accounts that differ between the two forms', () => {
    // 8825 line 13 is Wages and salaries — W-2 payroll. 1099-NEC contract labor is
    // not wages; it falls to Other (17) and is itemized on Schedule A (Form 8825).
    expect(getForm8825Line('5015')).toBe('Line 17');
    expect(getScheduleELine('5015')).toBe('Line 19');
    // Mid-term furnished rent is gross rents on 8825.
    expect(getForm8825Line('4005')).toBe('Line 2a');
    // Litigation stays on the legal and professional line.
    expect(getForm8825Line('5055')).toBe('Line 9');
  });

  it('keeps cleaning and commissions on different Schedule E lines', () => {
    // Schedule E line 7 is Cleaning and maintenance; line 8 is Commissions.
    expect(getScheduleELine('5020')).toBe('Line 7');
    expect(getScheduleELine('5030')).toBe('Line 8');
    expect(getScheduleELine('5020')).not.toBe(getScheduleELine('5030'));
  });

  it('does not put non-rental business income on Form 8825', () => {
    // 4070/4080 belong on Form 1065 page 1.
    expect(getForm8825Line('4070')).toBeUndefined();
    expect(getForm8825Line('4080')).toBeUndefined();
  });

  it('gives every P&L account an IRS line on at least one form', () => {
    const missing = REI_CHART_OF_ACCOUNTS.filter(
      (a) =>
        isProfitAndLossAccount(a.code) &&
        !a.scheduleE &&
        !a.form8825 &&
        !['4070', '4080', '4100'].includes(a.code), // 1065 page 1 / portfolio income
    ).map((a) => a.code);
    expect(missing).toEqual([]);
  });
});
