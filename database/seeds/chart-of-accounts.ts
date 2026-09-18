// Seed the global Chart of Accounts (tenant_id IS NULL) from REI_CHART_OF_ACCOUNTS.
//
// docs/CHART-OF-ACCOUNTS.md is authoritative; database/chart-of-accounts.ts is its
// machine-readable projection; this seed carries that projection into the
// chart_of_accounts table. It never holds a second copy of the chart.
//
// Dry run by default — it prints the delta and writes nothing. Writing requires an
// explicit --apply and is an operator-approved step:
//
//   DATABASE_URL=... npx tsx database/seeds/chart-of-accounts.ts            # dry run
//   DATABASE_URL=... npx tsx database/seeds/chart-of-accounts.ts --apply    # writes
//
// Only global rows are read and written. Tenant-specific overrides of the same code
// (tenant_id NOT NULL) are never selected, updated or deleted.

import { and, eq, isNull } from 'drizzle-orm';
import { createDb } from '../../server/db/connection';
import { chartOfAccounts } from '../system.schema';
import { REI_CHART_OF_ACCOUNTS, TURBOTENANT_CATEGORY_MAP } from '../chart-of-accounts';

/** The projected shape of one global account, limited to columns the table has. */
export interface SeedAccountRow {
  code: string;
  name: string;
  type: string;
  subtype: string | null;
  description: string | null;
  /**
   * IRS Schedule E (Form 1040) Part I line. The Form 8825 line the projection also
   * carries has no column on chart_of_accounts and is deliberately not persisted —
   * it resolves at read time through getForm8825Line(). See docs/CHART-OF-ACCOUNTS.md §13.
   */
  scheduleELine: string | null;
  taxDeductible: boolean;
  parentCode: string | null;
  metadata: { keywords: string[] };
}

/** An existing global row, as read back from chart_of_accounts. */
export interface ExistingAccountRow extends SeedAccountRow {
  id: string;
}

export interface SeedPlan {
  /** Codes present in the projection and absent from the table. */
  inserts: SeedAccountRow[];
  /** Codes present in both whose persisted fields differ, with the fields that differ. */
  updates: Array<{
    id: string;
    row: SeedAccountRow;
    changedFields: string[];
  }>;
  /** Codes present in both and identical on every persisted field. */
  unchanged: string[];
  /**
   * Codes held by more than one global row. The composite unique index is
   * (tenant_id, code) and NULL != NULL in Postgres, so global uniqueness is not
   * enforced by the database. Duplicates are reported, never silently picked from.
   */
  duplicateCodes: string[];
  /** Global codes in the table that the projection no longer defines. Reported, never deleted. */
  extraneous: string[];
}

/** Fields compared to decide whether an existing row needs an update. */
const PERSISTED_FIELDS = [
  'name',
  'type',
  'subtype',
  'description',
  'scheduleELine',
  'taxDeductible',
  'parentCode',
  'metadata',
] as const;

/**
 * Parent code for hierarchical grouping: '5110' -> '5100', '5015' -> '5000'.
 *
 * A code that is itself the head of its hundred-range ('5100', '1900') has no parent
 * in the chart — the naive floor(code/100)*100 yields the code itself, which would
 * write a self-referential parent_code. Only x000 was previously excluded.
 */
export function deriveParentCode(code: string): string | null {
  if (!/^\d{4}$/.test(code)) return null;
  const parentCode = (Math.floor(parseInt(code, 10) / 100) * 100).toString().padStart(4, '0');
  if (parentCode === code) return null;
  if (!REI_CHART_OF_ACCOUNTS.some((a) => a.code === parentCode)) return null;
  return parentCode;
}

/** Keywords that map to a code in TURBOTENANT_CATEGORY_MAP, sorted for stable comparison. */
export function getKeywordsForCode(code: string): string[] {
  return Object.entries(TURBOTENANT_CATEGORY_MAP)
    .filter(([, c]) => c === code)
    .map(([keyword]) => keyword)
    .sort();
}

/** Project REI_CHART_OF_ACCOUNTS into the rows the table should hold. */
export function projectSeedRows(): SeedAccountRow[] {
  return REI_CHART_OF_ACCOUNTS.map((acct) => ({
    code: acct.code,
    name: acct.name,
    type: acct.type,
    subtype: acct.subtype ?? null,
    description: acct.description ?? null,
    scheduleELine: acct.scheduleE ?? null,
    taxDeductible: acct.taxDeductible ?? false,
    parentCode: deriveParentCode(acct.code),
    metadata: { keywords: getKeywordsForCode(acct.code) },
  }));
}

/** Order-insensitive keyword comparison; Object.entries order is not a difference. */
function sameKeywords(a: SeedAccountRow['metadata'], b: SeedAccountRow['metadata']): boolean {
  const left = [...(a?.keywords ?? [])].sort();
  const right = [...(b?.keywords ?? [])].sort();
  return left.length === right.length && left.every((v, i) => v === right[i]);
}

function changedFields(existing: SeedAccountRow, desired: SeedAccountRow): string[] {
  return PERSISTED_FIELDS.filter((field) =>
    field === 'metadata'
      ? !sameKeywords(existing.metadata, desired.metadata)
      : existing[field] !== desired[field],
  );
}

/**
 * Pure delta between what the projection defines and what the table holds.
 * No database access — this is the logic the dry run reports and the apply executes.
 */
export function computeSeedPlan(
  desired: SeedAccountRow[],
  existing: ExistingAccountRow[],
): SeedPlan {
  const byCode = new Map<string, ExistingAccountRow[]>();
  for (const row of existing) {
    const rows = byCode.get(row.code) ?? [];
    rows.push(row);
    byCode.set(row.code, rows);
  }

  const plan: SeedPlan = {
    inserts: [],
    updates: [],
    unchanged: [],
    duplicateCodes: [],
    extraneous: [],
  };

  for (const row of desired) {
    const matches = byCode.get(row.code) ?? [];
    if (matches.length === 0) {
      plan.inserts.push(row);
      continue;
    }
    if (matches.length > 1) {
      // Ambiguous: do not guess which duplicate is canonical.
      plan.duplicateCodes.push(row.code);
      continue;
    }
    const fields = changedFields(matches[0], row);
    if (fields.length === 0) plan.unchanged.push(row.code);
    else plan.updates.push({ id: matches[0].id, row, changedFields: fields });
  }

  const desiredCodes = new Set(desired.map((r) => r.code));
  plan.extraneous = [...byCode.keys()].filter((c) => !desiredCodes.has(c)).sort();
  plan.duplicateCodes.sort();

  return plan;
}

/** Human-readable rendering of a plan, used by both the dry run and the apply. */
export function formatSeedPlan(plan: SeedPlan): string {
  const lines: string[] = [];
  lines.push(
    `  ${plan.inserts.length} insert, ${plan.updates.length} update, ` +
      `${plan.unchanged.length} unchanged`,
  );
  for (const row of plan.inserts) lines.push(`  + ${row.code} ${row.name}`);
  for (const u of plan.updates) {
    lines.push(`  ~ ${u.row.code} ${u.row.name} (${u.changedFields.join(', ')})`);
  }
  if (plan.duplicateCodes.length) {
    lines.push(
      `  ! ${plan.duplicateCodes.length} code(s) have more than one global row and were ` +
        `skipped: ${plan.duplicateCodes.join(', ')}`,
    );
  }
  if (plan.extraneous.length) {
    lines.push(
      `  ? ${plan.extraneous.length} global code(s) in the table are not in the chart ` +
        `(left alone): ${plan.extraneous.join(', ')}`,
    );
  }
  return lines.join('\n');
}

const MODIFIED_BY = 'seed:chart-of-accounts';

/** Read the global rows (tenant_id IS NULL) of chart_of_accounts. */
async function readGlobalRows(db: ReturnType<typeof createDb>): Promise<ExistingAccountRow[]> {
  const rows = await db
    .select({
      id: chartOfAccounts.id,
      code: chartOfAccounts.code,
      name: chartOfAccounts.name,
      type: chartOfAccounts.type,
      subtype: chartOfAccounts.subtype,
      description: chartOfAccounts.description,
      scheduleELine: chartOfAccounts.scheduleELine,
      taxDeductible: chartOfAccounts.taxDeductible,
      parentCode: chartOfAccounts.parentCode,
      metadata: chartOfAccounts.metadata,
    })
    .from(chartOfAccounts)
    .where(isNull(chartOfAccounts.tenantId));

  return rows.map((r) => ({
    ...r,
    metadata: (r.metadata as { keywords?: string[] } | null)?.keywords
      ? { keywords: (r.metadata as { keywords: string[] }).keywords }
      : { keywords: [] },
  }));
}

export interface SeedOptions {
  /** Write the plan. Without it the seed reports the delta and changes nothing. */
  apply?: boolean;
  databaseUrl?: string;
}

/**
 * Compute the delta against the live global chart and, with apply, write it.
 * Returns the plan either way so a caller can report it.
 */
export async function seedChartOfAccounts(options: SeedOptions = {}): Promise<SeedPlan> {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required to seed the chart of accounts');

  const db = createDb(databaseUrl);
  const plan = computeSeedPlan(projectSeedRows(), await readGlobalRows(db));

  console.log(options.apply ? 'Applying chart of accounts:' : 'Chart of accounts (dry run):');
  console.log(formatSeedPlan(plan));

  if (!options.apply) {
    console.log('  Dry run — nothing written. Re-run with --apply to write.');
    return plan;
  }

  for (const row of plan.inserts) {
    await db.insert(chartOfAccounts).values({
      tenantId: null,
      ...row,
      isActive: true,
      modifiedBy: MODIFIED_BY,
    });
  }

  for (const update of plan.updates) {
    // Scoped by id AND tenant_id IS NULL: a tenant override can never be reached.
    await db
      .update(chartOfAccounts)
      .set({ ...update.row, modifiedBy: MODIFIED_BY, updatedAt: new Date() })
      .where(and(eq(chartOfAccounts.id, update.id), isNull(chartOfAccounts.tenantId)));
  }

  console.log(`  Wrote ${plan.inserts.length} insert(s) and ${plan.updates.length} update(s).`);
  return plan;
}

// Run directly if executed as a script.
if (import.meta.url.endsWith(process.argv[1]?.replace(/^file:\/\//, '') || '\0')) {
  seedChartOfAccounts({ apply: process.argv.includes('--apply') })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Seed failed:', e);
      process.exit(1);
    });
}
