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
import {
  REI_CHART_OF_ACCOUNTS,
  getAccountByCode,
  type AccountDefinition,
} from '../database/chart-of-accounts';

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
  // A header belongs in whatever section its children do, and our own `subtype` field
  // says only 'header' for one — 2590 Mortgage Payable would otherwise land in Current
  // Liabilities beside the non-current mortgages it rolls up, and 7090 in Operating
  // Expenses beside the capital additions that are Other Expenses. Derived from the
  // children, and a group that does not agree is a chart defect, not an export one.
  if (a.subtype === 'header') {
    const children = REI_CHART_OF_ACCOUNTS.filter((c) => c.parentCode === a.code);
    if (children.length === 0) throw new Error(`${a.code}: header with no children`);
    const subtypes = new Set(children.map(mercurySubtype));
    if (subtypes.size !== 1) {
      throw new Error(
        `${a.code}: children disagree on Mercury subtype (${[...subtypes].join(', ')})`,
      );
    }
    return [...subtypes][0];
  }
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

/**
 * The name Mercury should show, which is not always the name the chart holds.
 *
 * Mercury reads a colon as its parent/child separator, so `Utilities: Electric` renders
 * as Electric nested under Utilities. Our chart spells the same relationship with a
 * hyphen (`Utilities - Electric`) and, for the accounts whose name does not repeat the
 * group at all (`Late Fees` under 4095 Tenant Fees), does not spell it in the name at
 * all — the hierarchy lives in `parentCode`, not in the string.
 *
 * So: strip a redundant `<parent> - ` prefix where the name carries one, and prepend
 * `<parent>: ` either way.
 *
 *   5100 Utilities - Electric   → Utilities: Electric
 *   4010 Late Fees              → Tenant Fees: Late Fees
 *   1050 Petty Cash             → Cash: Petty Cash
 *
 * This is display only. The chart's own names do not change — the §14 register is
 * normative for them and the parity suite holds the projection to it character for
 * character. Nothing reads these strings back.
 */
export function mercuryName(a: AccountDefinition): string {
  if (!a.parentCode) return a.name;
  const parent = getAccountByCode(a.parentCode);
  if (!parent) throw new Error(`${a.code}: parent ${a.parentCode} is not in the chart`);
  const prefix = `${parent.name} - `;
  const leaf = a.name.startsWith(prefix) ? a.name.slice(prefix.length) : a.name;
  return `${parent.name}: ${leaf}`;
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
      // Rewritten to Mercury's `Parent: Child` form where the chart gives the account a
      // parent. The ten header accounts are exported as ordinary rows carrying their own
      // GL code and plain name, so each parent Mercury needs is a real account on both
      // sides rather than a string Mercury invents. See docs/CHART-OF-ACCOUNTS.md §1.7.
      //
      // Import assumption worth verifying on the first upload: that Mercury creates the
      // nesting from the colon and matches the parent to the header row we also supply,
      // rather than creating a second, code-less parent beside it. It fails loudly at
      // import if wrong — the header GL code would be orphaned or duplicated — and the
      // fix is a naming change here, not a chart change.
      'Account Name': mercuryName(a),
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
  // The `Parent: Child` rewrite can in principle collide — two groups whose leaf names
  // match after the prefix strip would produce one string for two codes, and Mercury
  // would have two accounts wearing the same name.
  const names = new Set(rows.map((r) => r['Account Name']));
  if (names.size !== rows.length) throw new Error('exported account names must be unique');

  const headers = ['GL Code', 'Account Name', 'Type', 'Subtype'] as const;
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((h) => csvCell(row[h])).join(','));
  process.stdout.write(lines.join('\n') + '\n');
  process.stderr.write(`${rows.length} accounts exported\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
