import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  REI_CHART_OF_ACCOUNTS,
  TRANSFER_CLEARING_CODES,
  CONTROL_CODES,
  CAPITAL_IMPROVEMENT_CODES,
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
 */
const DOC = readFileSync(
  join(__dirname, '..', '..', 'docs', 'CHART-OF-ACCOUNTS.md'),
  'utf8',
);

/** Every 4-digit code appearing in a table cell of the document. */
function codesInDoc(): Set<string> {
  const codes = new Set<string>();
  for (const line of DOC.split('\n')) {
    if (!line.startsWith('|')) continue;
    const firstCell = line.split('|')[1]?.trim() ?? '';
    // "5400–5430" style ranges name their endpoints; both must exist.
    for (const match of firstCell.matchAll(/\b(\d{4})\b/g)) codes.add(match[1]);
  }
  return codes;
}

describe('chart of accounts: document and projection agree', () => {
  const docCodes = codesInDoc();
  const codeCodes = new Set(REI_CHART_OF_ACCOUNTS.map((a) => a.code));

  it('the document actually declares itself authoritative', () => {
    expect(DOC).toContain('Status: **authoritative**');
  });

  it('every account in the projection is documented', () => {
    const undocumented = [...codeCodes].filter((c) => !docCodes.has(c)).sort();
    expect(undocumented).toEqual([]);
  });

  it('every code named in the document exists in the projection', () => {
    // The document also cites Mercury account numbers (e.g. 5381) in prose tables;
    // those are bank accounts, not COA codes, and are listed here deliberately.
    const mercuryAccountNumbers = new Set([
      '0374', '2955', '5890', '3372', '0744', '8208', '8517', '7418', '2144',
      '7238', '0410', '8130', '0402', '4804', '7371', '6811', '2167', '1131',
      '1751', '8918', '5381', '4993', '5608', '4232', '3732', '1039', '5343',
      '2062', '1809', '9860', '3738', '0830', '2624', '8349', '4828', '0406',
      '3310', '4084', '4060', '0578', '3514',
    ]);
    const missing = [...docCodes]
      .filter((c) => !codeCodes.has(c) && !mercuryAccountNumbers.has(c))
      .sort();
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
}

function registerRows(): RegisterRow[] {
  const section = DOC.split('## 14. Complete account register')[1];
  if (!section) throw new Error('the document has no §14 register');
  const rows: RegisterRow[] = [];
  for (const line of section.split('\n')) {
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
    });
  }
  return rows;
}

describe('the §14 register is normative', () => {
  const rows = registerRows();

  it('registers every account exactly once', () => {
    expect(rows.length).toBe(REI_CHART_OF_ACCOUNTS.length);
    expect(new Set(rows.map((r) => r.code)).size).toBe(rows.length);
  });

  it('marks exactly the accounts not yet seeded to production', () => {
    // 80 accounts live; this document adds 15.
    const marked = DOC.split('## 14. Complete account register')[1]
      .split('\n')
      .filter((l) => /^\| \d{4} \*/.test(l));
    expect(marked.length).toBe(15);
    expect(REI_CHART_OF_ACCOUNTS.length - marked.length).toBe(80);
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

describe('reporting treatment', () => {
  it('clearing accounts are transfers, never P&L', () => {
    for (const code of TRANSFER_CLEARING_CODES) {
      expect(getAccountTreatment(code)).toBe('transfer');
      expect(isProfitAndLossAccount(code)).toBe(false);
    }
  });

  it('control accounts are excluded from P&L', () => {
    for (const code of CONTROL_CODES) {
      expect(getAccountTreatment(code)).toBe('control');
      expect(isProfitAndLossAccount(code)).toBe(false);
    }
  });

  it('capital improvements are not deductible expenses', () => {
    // Typed 'expense' in the legacy chart; a capital addition is depreciated instead.
    for (const code of CAPITAL_IMPROVEMENT_CODES) {
      expect(getAccountTreatment(code)).toBe('balance');
      expect(isProfitAndLossAccount(code)).toBe(false);
    }
  });

  it('suspense is not a P&L account', () => {
    // 9010 is typed 'expense' for legacy reasons but must never reach a tax line.
    expect(isProfitAndLossAccount('9010')).toBe(false);
  });

  it('balance-sheet accounts are not P&L', () => {
    for (const code of ['1000', '2010', '2040', '2500', '2540', '1130', '3010']) {
      expect(isProfitAndLossAccount(code)).toBe(false);
    }
  });

  it('ordinary income and expense accounts are P&L', () => {
    for (const code of ['4000', '4005', '5070', '5015', '6050']) {
      expect(isProfitAndLossAccount(code)).toBe(true);
    }
  });

  it('an unknown code has no treatment', () => {
    // 3200 is the code that reached 1,199 live rows without ever existing.
    expect(getAccountTreatment('3200')).toBeUndefined();
    expect(isProfitAndLossAccount('3200')).toBe(false);
  });
});

describe('IRS line references', () => {
  it('maps the accounts that differ between the two forms', () => {
    // Form 8825 has a wages line; Schedule E does not.
    expect(getForm8825Line('5015')).toBe('Line 13');
    // Mid-term furnished rent is gross rents on 8825.
    expect(getForm8825Line('4005')).toBe('Line 2a');
    // Litigation stays on the legal and professional line.
    expect(getForm8825Line('5055')).toBe('Line 9');
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
