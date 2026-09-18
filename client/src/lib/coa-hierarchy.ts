/**
 * Shaping the chart of accounts for a picker.
 *
 * A header account (`subtype === 'header'`) is a rollup: it exists so children can be
 * summed under it, and it holds no transaction of its own. The server refuses one with
 * `header_not_postable`, so offering a header in a classify picker can only ever produce
 * a 400 — the user picks "Utilities" and gets an error for a choice the UI showed them.
 *
 * What is a header is the row the server holds, never a list kept here. A hard-coded set
 * of header codes on the client would drift the moment the chart changed, and would drift
 * silently, which is the failure this module exists to avoid.
 */

export interface PickerAccount {
  id: string;
  code: string;
  name: string;
  subtype: string | null;
  parentCode: string | null;
}

export interface PickerGroup {
  /** Header code, or null for accounts that belong to no header. */
  headerCode: string | null;
  /** Label for the optgroup; null when the options are ungrouped. */
  label: string | null;
  options: PickerAccount[];
}

export function isHeader(account: Pick<PickerAccount, 'subtype'>): boolean {
  return account.subtype === 'header';
}

/** Every account that may actually carry a transaction, in chart order. */
export function postableAccounts<T extends PickerAccount>(coa: readonly T[]): T[] {
  return coa.filter((a) => !isHeader(a)).sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Postable accounts grouped under their header, headers themselves excluded.
 *
 * A child whose `parentCode` names no header in the chart is not dropped — it falls into
 * the ungrouped bucket rather than disappearing from the picker, because a picker that
 * silently omits an account is worse than one that shows it without its group.
 */
export function classifyPickerGroups<T extends PickerAccount>(coa: readonly T[]): PickerGroup[] {
  const headers = new Map(coa.filter(isHeader).map((a) => [a.code, a]));
  const grouped = new Map<string, T[]>();
  const ungrouped: T[] = [];

  for (const account of postableAccounts(coa)) {
    const parent = account.parentCode;
    if (parent && headers.has(parent)) {
      const bucket = grouped.get(parent);
      if (bucket) bucket.push(account);
      else grouped.set(parent, [account]);
    } else {
      ungrouped.push(account);
    }
  }

  const groups: PickerGroup[] = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([headerCode, options]) => {
      const header = headers.get(headerCode);
      return {
        headerCode,
        label: header ? `${header.code} — ${header.name}` : headerCode,
        options,
      };
    });

  if (ungrouped.length > 0) {
    groups.push({ headerCode: null, label: null, options: ungrouped });
  }

  return groups;
}
