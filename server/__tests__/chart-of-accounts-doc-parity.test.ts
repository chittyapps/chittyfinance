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
  getChildAccounts,
  isHeaderAccount,
  assertPostableAccount,
  NonPostableAccountError,
  TURBOTENANT_CATEGORY_MAP,
} from '../../database/chart-of-accounts';
import {
  chartParityMismatches,
  headerCounts as parseHeaderCounts,
  registerRows as parseRegisterRows,
  sections as parseSections,
  type RegisterRow,
} from '../../database/chart-of-accounts-parity';

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

const SECTIONS = parseSections(DOC);

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
const registerRows = (): RegisterRow[] => parseRegisterRows(DOC);

const headerCounts = () => parseHeaderCounts(DOC);

/**
 * The subset of this suite the seed also runs, at apply time, against the working tree
 * it is launched from. Kept here so a change that breaks it fails in CI too.
 */
describe('chartParityMismatches (the check the seed runs before it writes)', () => {
  it('finds nothing to report against the real document', () => {
    expect(chartParityMismatches(DOC)).toEqual([]);
  });

  it('reports a projection that has drifted from the register', () => {
    // The §14 register row, not the §4 narrative row that repeats the code.
    const drifted = DOC.replace(
      '| 5070 | Repairs | expense |',
      '| 5070 | Repairs and upkeep | expense |',
    );
    expect(drifted).not.toBe(DOC);
    expect(chartParityMismatches(drifted).join('\n')).toContain('5070 name');
  });

  it('reports a document that no longer declares itself authoritative', () => {
    const unsigned = DOC.replace('Status: **authoritative**', 'Status: draft');
    expect(chartParityMismatches(unsigned)).toContain(
      'the document no longer declares itself authoritative',
    );
  });
});

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
 * The hierarchy §14 defines in its Parent column, held against the projection.
 *
 * Nothing below reads HEADER_CODES to decide what a header is — a suite that did would
 * stay green when a code was dropped from that array, which is the failure it exists to
 * catch. Headers are the rows the document marks `header`, and children are the rows that
 * name a parent.
 */
describe('the account hierarchy', () => {
  const rows = registerRows();
  const headers = rows.filter((r) => r.treatment === 'header');
  const children = rows.filter((r) => r.parentCode);
  const byCode = new Map(rows.map((r) => [r.code, r]));

  it('defines a hierarchy at all', () => {
    // Guards every assertion below against passing vacuously on an empty filter.
    expect(headers.length).toBeGreaterThan(0);
    expect(children.length).toBeGreaterThan(0);
  });

  it('gives every account the parent the register assigns it', () => {
    const mismatches = rows
      .filter((r) => (getAccountByCode(r.code)?.parentCode ?? undefined) !== r.parentCode)
      .map(
        (r) =>
          `${r.code}: doc ${r.parentCode ?? 'none'} vs code ${getAccountByCode(r.code)?.parentCode ?? 'none'}`,
      );
    expect(mismatches).toEqual([]);
  });

  it('points every child at a header that exists', () => {
    const dangling = children
      .filter((r) => byCode.get(r.parentCode as string)?.treatment !== 'header')
      .map((r) => `${r.code} -> ${r.parentCode}`);
    expect(dangling).toEqual([]);
  });

  it('makes no code both a parent and a child', () => {
    // One level deep. A header that also carried a parent would make any rollup
    // ambiguous — the grandparent would have to decide whether to sum the header or
    // its children, and either choice is wrong half the time.
    const both = rows
      .filter((r) => r.treatment === 'header' && r.parentCode)
      .map((r) => `${r.code} is a header and a child of ${r.parentCode}`);
    expect(both).toEqual([]);
  });

  it('gives every header at least one child', () => {
    const childless = headers
      .filter((h) => !children.some((c) => c.parentCode === h.code))
      .map((h) => h.code);
    expect(childless).toEqual([]);
  });

  it('holds no header on a P&L or tax-line treatment', () => {
    // A header that rendered as its own line would sit beside the children it sums,
    // at zero, and double the group on any total that added both.
    for (const header of headers) {
      expect(isProfitAndLossAccount(header.code)).toBe(false);
      expect(getAccountTreatment(header.code)).toBe('header');
      expect(getAccountByCode(header.code)?.subtype).toBe('header');
      expect(getAccountByCode(header.code)?.taxDeductible ?? false).toBe(false);
    }
  });

  it('gives every child its header type, so a rollup lands in one statement section', () => {
    const mismatches = children
      .filter((c) => byCode.get(c.parentCode as string)?.type !== c.type)
      .map((c) => `${c.code} is ${c.type} under ${c.parentCode} ${byCode.get(c.parentCode as string)?.type}`);
    expect(mismatches).toEqual([]);
  });

  it('gives every child its header Form 8825 line', () => {
    // The rule that decides whether a grouping is legitimate. 5320 Bank Charges and
    // 5330 Credit Card Fees (line 17) are in the 53xx block with the interest accounts
    // (line 8) and are deliberately NOT under 5390; this is what would catch it if
    // someone added them.
    const mismatches = children
      .filter((c) => getForm8825Line(c.code) !== getForm8825Line(c.parentCode as string))
      .map(
        (c) =>
          `${c.code} is 8825 ${getForm8825Line(c.code) ?? 'none'} under ${c.parentCode} ` +
          `${getForm8825Line(c.parentCode as string) ?? 'none'}`,
      );
    expect(mismatches).toEqual([]);
  });

  it('does not let the hierarchy merge Schedule E lines', () => {
    // Form 8825 puts all interest on line 8; Schedule E Part I splits it — mortgage
    // interest to 12, other interest to 13. Rolling them up for 8825 must not touch
    // the per-account Schedule E answer, which is what a preparer of a directly held
    // property reads.
    expect(getForm8825Line('5300')).toBe(getForm8825Line('5310'));
    expect(getAccountByCode('5300')?.parentCode).toBe('5390');
    expect(getAccountByCode('5310')?.parentCode).toBe('5390');
    expect(getScheduleELine('5300')).toBe('Line 12');
    expect(getScheduleELine('5310')).toBe('Line 13');
    expect(getScheduleELine('5300')).not.toBe(getScheduleELine('5310'));
    // And the header declines to answer, rather than picking one of the two.
    expect(getScheduleELine('5390')).toBeUndefined();

    // Where the children do agree, the header carries the line they share.
    for (const header of headers.filter((h) => h.scheduleE)) {
      const lines = new Set(
        children.filter((c) => c.parentCode === header.code).map((c) => getScheduleELine(c.code)),
      );
      expect([...lines]).toEqual([getScheduleELine(header.code)]);
    }
  });

  it('refuses to post to a header, wherever a code is assigned', () => {
    for (const header of headers) {
      expect(isHeaderAccount(header.code)).toBe(true);
      expect(() => assertPostableAccount(header.code)).toThrow(NonPostableAccountError);
      expect(getChildAccounts(header.code).length).toBeGreaterThan(0);
    }
    // A posting account is unaffected, and so is a row carrying no code at all.
    expect(() => assertPostableAccount('5100')).not.toThrow();
    expect(() => assertPostableAccount(null)).not.toThrow();
    expect(isHeaderAccount('5100')).toBe(false);
    expect(isHeaderAccount('3200')).toBe(false);
  });

  it('maps no keyword to a header', () => {
    // findAccountCode() can only return a value from this map. Asserting the map
    // directly is what keeps the guard inside findAccountCode from being the thing
    // that hides a bad entry.
    const headerCodes = new Set(headers.map((h) => h.code));
    const offenders = Object.entries(TURBOTENANT_CATEGORY_MAP)
      .filter(([, code]) => headerCodes.has(code))
      .map(([key, code]) => `${key} -> ${code}`);
    expect(offenders).toEqual([]);
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
    for (const t of ['pl', 'balance', 'transfer', 'control', 'header']) {
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
