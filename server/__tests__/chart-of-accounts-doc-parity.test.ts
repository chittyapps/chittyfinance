import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  REI_CHART_OF_ACCOUNTS,
  TRANSFER_CLEARING_CODES,
  CONTROL_CODES,
  CAPITAL_IMPROVEMENT_CODES,
  getAccountTreatment,
  isProfitAndLossAccount,
  getForm8825Line,
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
