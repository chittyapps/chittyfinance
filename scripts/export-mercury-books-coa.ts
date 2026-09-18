/**
 * Export the authoritative chart of accounts in Mercury Books' import shape.
 *
 * Source of truth: docs/CHART-OF-ACCOUNTS.md → database/chart-of-accounts.ts.
 * This script only translates; it never defines an account.
 *
 * Why: Mercury's GL list is currently a QuickBooks default template, and its
 * assignments are wrong for a rental partnership (streaming and broadband booked to
 * cost of goods sold, hardware to charitable contributions). Replacing that list with
 * this chart makes Mercury's `glAllocations` agree with ours, which turns it from a
 * field we must ignore into an L1 suggestion we can use.
 *
 *   npx tsx scripts/export-mercury-books-coa.ts > mercury-books-coa.csv
 *
 * Mercury's template (Mercury_Books_COA_Template.xlsx) requires: GL Code (unique,
 * numeric text), Account Name, Type, Subtype — every column filled, values drawn from
 * its dropdowns.
 */
import { REI_CHART_OF_ACCOUNTS, type AccountDefinition } from '../database/chart-of-accounts';

/** Mercury's five types. */
type MercuryType = 'Assets' | 'Liabilities' | 'Equity' | 'Revenues' | 'Expenses';

/** Mercury's subtypes, constrained per type. */
const MERCURY_SUBTYPES: Record<MercuryType, readonly string[]> = {
  Assets: ['Non-Current Assets', 'Current Assets', 'Transfers Between Accounts', 'Uncategorized Assets'],
  Liabilities: ['Current Liabilities', 'Non-Current Liabilities'],
  Equity: ['Equity', 'Retained Earnings'],
  Revenues: ['Operating Revenues', 'Other Income'],
  Expenses: ['Cost of Goods Sold', 'Operating Expenses', 'Other Expenses'],
};

const TYPE_MAP: Record<AccountDefinition['type'], MercuryType> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  income: 'Revenues',
  expense: 'Expenses',
};

/** Accounts whose subtype is not implied by our own `subtype` field. */
const NON_OPERATING_REVENUE = new Set(['4100', '4110', '4120']);
const RETAINED_EARNINGS = new Set(['3020', '3030']);

/**
 * Mercury has no vocabulary for suspense, non-deductible or capitalised accounts, so
 * they all land in Other Expenses. Two consequences worth stating rather than burying:
 *
 *  - 9010 suspense (a work queue) and 9000 owner personal (non-deductible) become
 *    indistinguishable on the Mercury side. Ours remains the authority on which is
 *    which; see docs/CHART-OF-ACCOUNTS.md §6.
 *  - 7000-7040 are capital additions typed `expense` in our legacy chart (§8 flags
 *    this as wrong). They are exported faithfully as Expenses rather than silently
 *    retyped here — fixing the typing is a chart change, not an export decision.
 */
const OTHER_EXPENSE = new Set(['7000', '7010', '7020', '7030', '7040', '9000', '9010', '9020', '9030', '9040']);

function mercurySubtype(a: AccountDefinition): string {
  switch (TYPE_MAP[a.type]) {
    case 'Assets':
      // Our clearing accounts are exactly Mercury's "Transfers Between Accounts".
      if (a.subtype === 'clearing') return 'Transfers Between Accounts';
      if (a.subtype === 'fixed' || a.subtype === 'contra') return 'Non-Current Assets';
      return 'Current Assets';
    case 'Liabilities':
      return a.subtype === 'long-term' ? 'Non-Current Liabilities' : 'Current Liabilities';
    case 'Equity':
      return RETAINED_EARNINGS.has(a.code) ? 'Retained Earnings' : 'Equity';
    case 'Revenues':
      return NON_OPERATING_REVENUE.has(a.code) ? 'Other Income' : 'Operating Revenues';
    case 'Expenses':
      // A rental partnership has no cost of goods sold. The current Mercury template
      // uses it heavily, which is one of the assignments this export corrects.
      return OTHER_EXPENSE.has(a.code) ? 'Other Expenses' : 'Operating Expenses';
  }
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toMercuryRows() {
  return REI_CHART_OF_ACCOUNTS.map((a) => {
    const type = TYPE_MAP[a.type];
    const subtype = mercurySubtype(a);
    if (!MERCURY_SUBTYPES[type].includes(subtype)) {
      throw new Error(`${a.code}: "${subtype}" is not a Mercury subtype for ${type}`);
    }
    return {
      'GL Code': a.code,
      // Names are exported verbatim. Mercury reads a colon as a parent/child
      // separator, so "Utilities - Electric" stays hyphenated: our chart defines no
      // hierarchy, and inventing one here would imply parent accounts that hold no
      // code. See docs/CHART-OF-ACCOUNTS.md §8.
      'Account Name': a.name,
      Type: type,
      Subtype: subtype,
    };
  });
}

function main() {
  const rows = toMercuryRows();
  const codes = new Set(rows.map((r) => r['GL Code']));
  if (codes.size !== rows.length) throw new Error('GL codes must be unique');
  if ([...codes].some((c) => !/^\d+$/.test(c))) throw new Error('GL codes must be numeric');

  const headers = ['GL Code', 'Account Name', 'Type', 'Subtype'] as const;
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((h) => csvCell(row[h])).join(','));
  process.stdout.write(lines.join('\n') + '\n');
  process.stderr.write(`${rows.length} accounts exported\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
