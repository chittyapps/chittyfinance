// Parity between docs/CHART-OF-ACCOUNTS.md (authoritative) and REI_CHART_OF_ACCOUNTS
// (its machine-readable projection).
//
// This lived inline in server/__tests__/chart-of-accounts-doc-parity.test.ts, where only
// CI could reach it. The seed writes the projection into a database, so it needs the same
// check at apply time: a working tree whose document and projection have drifted must not
// be able to seed. Extracted here so the test and the seed run the same comparison.
//
// Deliberately free of `node:fs`: the caller supplies the document text. Nothing in the
// Workers bundle imports this module, and nothing in it should make that unsafe.

import {
  REI_CHART_OF_ACCOUNTS,
  getAccountByCode,
  getAccountTreatment,
  getForm8825Line,
  getScheduleELine,
} from './chart-of-accounts';

/** Document sections, keyed by their `## N.` number. */
export function sections(doc: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const chunk of doc.split('\n## ')) {
    const num = chunk.split('.')[0].trim();
    if (/^\d+$/.test(num)) out.set(num, chunk);
  }
  return out;
}

export interface RegisterRow {
  code: string;
  name: string;
  type: string;
  treatment: string;
  form8825?: string;
  scheduleE?: string;
  /** The header account this one rolls up into. `—` in the register becomes undefined. */
  parentCode?: string;
  /** `*` in the register: defined by the document but not yet seeded to production. */
  isNew: boolean;
}

/** Parse the §14 register, which the document states is normative for every account. */
export function registerRows(doc: string): RegisterRow[] {
  const register = sections(doc).get('14') ?? '';
  if (!register) throw new Error('the document has no §14 register');
  const rows: RegisterRow[] = [];
  for (const line of register.split('\n')) {
    if (!line.startsWith('| ')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 7 || !/^\d{4}/.test(cells[0])) continue;
    // A leading code may carry ' *' marking an account not yet seeded.
    rows.push({
      code: cells[0].replace(/\s*\*$/, ''),
      name: cells[1],
      type: cells[2],
      treatment: cells[3],
      form8825: cells[4] === '—' ? undefined : `Line ${cells[4]}`,
      scheduleE: cells[5] === '—' ? undefined : `Line ${cells[5]}`,
      parentCode: cells[6] === '—' ? undefined : cells[6],
      isNew: /\*$/.test(cells[0]),
    });
  }
  return rows;
}

/** Codes the §14 register marks `*`: defined by the document, not yet in the table. */
export function starredCodes(doc: string): Set<string> {
  return new Set(registerRows(doc).filter((r) => r.isNew).map((r) => r.code));
}

/** The three counts the document header states. They must agree with each other and §14. */
export function headerCounts(doc: string): { registered: number; added: number; live: number } {
  const flat = doc.replace(/\s+/g, ' ');
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

/**
 * Every way the document and the projection can disagree on an account, as a list of
 * human-readable mismatches. Empty means they agree.
 *
 * This is the subset of the parity suite that bears on what the seed writes: the set of
 * accounts, and each account's name, type, treatment and IRS lines. The test file keeps
 * the wider assertions (narrative tables, subtypes, deductibility) that the seed does not
 * persist.
 */
export function chartParityMismatches(doc: string): string[] {
  const mismatches: string[] = [];

  let rows: RegisterRow[];
  let counts: ReturnType<typeof headerCounts>;
  try {
    rows = registerRows(doc);
    counts = headerCounts(doc);
  } catch (err) {
    return [(err as Error).message];
  }

  if (!doc.includes('Status: **authoritative**')) {
    mismatches.push('the document no longer declares itself authoritative');
  }

  const registered = new Set(rows.map((r) => r.code));
  if (registered.size !== rows.length) {
    mismatches.push('the §14 register lists a code more than once');
  }
  for (const account of REI_CHART_OF_ACCOUNTS) {
    if (!registered.has(account.code)) {
      mismatches.push(`${account.code}: in the projection but not registered in §14`);
    }
  }
  if (rows.length !== counts.registered) {
    mismatches.push(
      `the header states ${counts.registered} registered accounts; §14 lists ${rows.length}`,
    );
  }
  if (counts.registered - counts.added !== counts.live) {
    mismatches.push(
      `the header counts do not add up: ${counts.registered} registered - ${counts.added} new != ${counts.live} live`,
    );
  }

  for (const row of rows) {
    const account = getAccountByCode(row.code);
    if (!account) {
      mismatches.push(`${row.code}: registered in §14 but not in the projection`);
      continue;
    }
    if (account.name !== row.name) {
      mismatches.push(`${row.code} name: doc "${row.name}" vs code "${account.name}"`);
    }
    if (account.type !== row.type) {
      mismatches.push(`${row.code} type: doc "${row.type}" vs code "${account.type}"`);
    }
    const treatment = getAccountTreatment(row.code);
    if (treatment !== row.treatment) {
      mismatches.push(`${row.code} treatment: doc "${row.treatment}" vs code "${treatment}"`);
    }
    const f = getForm8825Line(row.code);
    if (f !== row.form8825) {
      mismatches.push(`${row.code} 8825: doc ${row.form8825 ?? 'none'} vs code ${f ?? 'none'}`);
    }
    const e = getScheduleELine(row.code);
    if (e !== row.scheduleE) {
      mismatches.push(`${row.code} Sch E: doc ${row.scheduleE ?? 'none'} vs code ${e ?? 'none'}`);
    }
    // The seed writes parent_code (since #171), and the document defines it, so a
    // projection that disagrees about the hierarchy is drift like any other — and it
    // must be caught before an apply carries the wrong parent into the table.
    if ((account.parentCode ?? undefined) !== row.parentCode) {
      mismatches.push(
        `${row.code} parent: doc ${row.parentCode ?? 'none'} vs code ${account.parentCode ?? 'none'}`,
      );
    }
  }

  return mismatches;
}
