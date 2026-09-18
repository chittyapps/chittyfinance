// Seed the global Chart of Accounts (tenant_id IS NULL) from REI_CHART_OF_ACCOUNTS.
//
// docs/CHART-OF-ACCOUNTS.md is authoritative; database/chart-of-accounts.ts is its
// machine-readable projection; this seed carries that projection into the
// chart_of_accounts table. It never holds a second copy of the chart.
//
// Dry run by default — it prints the delta and writes nothing. Writing requires an
// explicit --apply and is an operator-approved step:
//
//   DATABASE_URL=... pnpm db:seed:coa               # dry run
//   DATABASE_URL=... pnpm db:seed:coa -- --apply    # writes (note the bare --)
//
// Only global rows are read and written. Tenant-specific overrides of the same code
// (tenant_id NOT NULL) are never selected, updated or deleted.
//
// The seed writes only what the authoritative document defines: code, name, type,
// subtype, description, schedule_e_line, tax_deductible. It deliberately does NOT write
// parent_code, metadata, is_active or modified_by on existing rows — see §"What this
// seed does not write" below.

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { createDb, type Database } from '../../server/db/connection';
import { chartOfAccounts } from '../system.schema';
import { REI_CHART_OF_ACCOUNTS } from '../chart-of-accounts';
import { chartParityMismatches } from '../chart-of-accounts-parity';
import { postLedgerEntry } from '../../server/lib/ledger-client';
import { logToChronicle } from '../../server/lib/chittychronicle';

/**
 * The projected shape of one global account, limited to the columns the authoritative
 * document defines.
 *
 * What this seed does not write, and why:
 *
 * - `parent_code`. NOT YET, but no longer for the original reason. It was removed because
 *   the document contained no notion of parent and the previous revision derived one
 *   arithmetically (floor(code/100)*100), which pointed children at sibling POSTING
 *   accounts rather than headers — 5055 Litigation at 5000 Advertising, the 90x0 suspense
 *   accounts at 9000 Owner Personal Expense, 2540 Due to Affiliate at 2500 Mortgage
 *   Payable. A dangling parent is detectable; a valid-but-wrong one is indistinguishable
 *   from a deliberate choice, and any future rollup would silently double-count.
 *
 *   docs/CHART-OF-ACCOUNTS.md §1.7 and §14 now define the hierarchy explicitly — ten
 *   header accounts and a written-down `parent_code` for 37 children, parity-tested
 *   against the projection by `chartParityMismatches()`. The condition that removed the
 *   field is therefore met, and restoring `parentCode` to PERSISTED_FIELDS (and to
 *   projectSeedRows) is the next change; it needs no DDL, the column already exists.
 *   Applying the seed before that lands inserts the ten headers and leaves every
 *   `parent_code` NULL, which is a coherent intermediate state, not a broken one.
 * - `metadata.keywords`. Derived from TURBOTENANT_CATEGORY_MAP, which every consumer
 *   already reads directly from the projection. Persisting a second copy buys a drift
 *   surface and nothing usable today — the same reasoning §13 gives for not persisting
 *   the Form 8825 line.
 * - `is_active`. Activation state is an operational decision, not a chart definition.
 *   Existing rows keep theirs; the plan reports any that are inactive.
 * - `modified_by` on an existing row. A row last touched by a human L4 auditor keeps
 *   that attribution; the seed's identity is recorded in the audit trail instead.
 */
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
}

/**
 * An existing global row, as read back from chart_of_accounts. `isActive` is read and
 * reported but never written: see SeedAccountRow.
 */
export interface ExistingAccountRow extends SeedAccountRow {
  id: string;
  isActive: boolean;
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
   * Existing global codes whose row is inactive. Reported so a dry run shows activation
   * state; the seed never changes it, in either direction.
   */
  inactive: string[];
  /**
   * Codes held by more than one global row. The composite unique index is
   * (tenant_id, code) and NULL != NULL in Postgres, so global uniqueness is not
   * enforced by the database. Duplicates are reported, never silently picked from.
   */
  duplicateCodes: string[];
  /** Global codes in the table that the projection no longer defines. Reported, never deleted. */
  extraneous: string[];
}

/** Fields compared to decide whether an existing row needs an update, and the exact SET list. */
export const PERSISTED_FIELDS = [
  'name',
  'type',
  'subtype',
  'description',
  'scheduleELine',
  'taxDeductible',
] as const;

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
  }));
}

function changedFields(existing: ExistingAccountRow, desired: SeedAccountRow): string[] {
  return PERSISTED_FIELDS.filter((field) => existing[field] !== desired[field]);
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
    inactive: [],
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
    if (fields.length === 0) {
      plan.unchanged.push(row.code);
    } else {
      plan.updates.push({ id: matches[0].id, row, changedFields: fields });
    }
  }

  const desiredCodes = new Set(desired.map((r) => r.code));
  plan.extraneous = [...byCode.keys()].filter((c) => !desiredCodes.has(c)).sort();
  plan.inactive = existing.filter((r) => !r.isActive).map((r) => r.code).sort();
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
  lines.push(
    plan.inactive.length
      ? `  = ${plan.inactive.length} existing global row(s) are inactive and stay that way: ` +
          `${plan.inactive.join(', ')}`
      : '  = every existing global row is active; the seed never changes is_active',
  );
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

/** One audit record for one written row. */
export interface SeedAuditEvent {
  action: 'create' | 'update';
  accountId: string;
  code: string;
  name: string;
  changedFields?: string[];
}

/**
 * The audit sink. Every other COA mutation path (server/routes/classification.ts) emits a
 * ChittyLedger entry and a ChittyChronicle event per mutated account; this seed is the
 * largest COA mutation in the chart's history, so it emits the same pair.
 *
 * Two differences from the request path, both forced by running as a CLI:
 *   - awaited rather than fire-and-forget (there is no executionCtx.waitUntil),
 *   - `actorType: 'system'` rather than the 'user' that logCoaEvent() hardcodes.
 * classification_audit is not an option: its transaction_id is NOT NULL and FK'd to
 * transactions, so it cannot hold a chart-definition event.
 */
export type SeedAuditSink = (event: SeedAuditEvent) => Promise<void>;

interface AuditEnv {
  CHITTY_LEDGER_BASE?: string;
  CHITTY_AUTH_SERVICE_TOKEN?: string;
  CHITTYCONNECT_API_TOKEN?: string;
  CHITTY_ENV?: string;
}

export function createDefaultAuditSink(env: AuditEnv): SeedAuditSink {
  return async (event) => {
    await postLedgerEntry(
      {
        entityType: 'audit',
        entityId: event.accountId,
        action: `coa.${event.action}`,
        actor: MODIFIED_BY,
        actorType: 'system',
        metadata: {
          tenantId: null,
          code: event.code,
          name: event.name,
          changedFields: event.changedFields,
          source: 'database/seeds/chart-of-accounts.ts',
        },
      },
      env,
    );
    await logToChronicle(env, {
      eventType: `coa.${event.action}`,
      entityId: event.accountId,
      entityType: 'chart_of_accounts',
      action: event.action,
      actor: { id: MODIFIED_BY, type: 'system' },
      after: { code: event.code, changedFields: event.changedFields },
      metadata: { tenantId: null, global: true },
    });
  };
}

/** Read the global rows (tenant_id IS NULL) of chart_of_accounts. */
async function readGlobalRows(db: Database): Promise<ExistingAccountRow[]> {
  return db
    .select({
      id: chartOfAccounts.id,
      code: chartOfAccounts.code,
      name: chartOfAccounts.name,
      type: chartOfAccounts.type,
      subtype: chartOfAccounts.subtype,
      description: chartOfAccounts.description,
      scheduleELine: chartOfAccounts.scheduleELine,
      taxDeductible: chartOfAccounts.taxDeductible,
      isActive: chartOfAccounts.isActive,
    })
    .from(chartOfAccounts)
    .where(isNull(chartOfAccounts.tenantId));
}

/** Path to the authoritative document, relative to this file. */
function readAuthoritativeDocument(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, '..', '..', 'docs', 'CHART-OF-ACCOUNTS.md'), 'utf8');
}

/**
 * Refuse to write a projection that no longer matches the authoritative document.
 * The doc-parity suite runs in CI; this runs in the working tree the apply is launched
 * from, which is not the same thing.
 */
export function assertDocumentParity(doc?: string): void {
  const mismatches = chartParityMismatches(doc ?? readAuthoritativeDocument());
  if (mismatches.length) {
    throw new Error(
      'Refusing to seed: docs/CHART-OF-ACCOUNTS.md and the projection disagree.\n  ' +
        mismatches.join('\n  '),
    );
  }
}

export interface SeedOptions {
  /** Write the plan. Without it the seed reports the delta and changes nothing. */
  apply?: boolean;
  databaseUrl?: string;
  /** Pre-built client, for tests that connect to a disposable branch themselves. */
  db?: Database;
  /** Audit sink override. Defaults to ChittyLedger + ChittyChronicle off process.env. */
  audit?: SeedAuditSink;
  /** The authoritative document text. Defaults to reading docs/CHART-OF-ACCOUNTS.md. */
  document?: string;
}

/**
 * Compute the delta against the live global chart and, with apply, write it.
 * Returns the plan either way so a caller can report it.
 */
export async function seedChartOfAccounts(options: SeedOptions = {}): Promise<SeedPlan> {
  let db = options.db;
  if (!db) {
    const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required to seed the chart of accounts');
    db = createDb(databaseUrl);
  }

  const plan = computeSeedPlan(projectSeedRows(), await readGlobalRows(db));

  console.log(options.apply ? 'Applying chart of accounts:' : 'Chart of accounts (dry run):');
  console.log(formatSeedPlan(plan));

  if (!options.apply) {
    console.log('  Dry run — nothing written. Re-run with --apply to write.');
    return plan;
  }

  // Nothing above this line writes. Nothing below it runs on a drifted working tree.
  assertDocumentParity(options.document);

  const audit = options.audit ?? createDefaultAuditSink(process.env as AuditEnv);

  for (const row of plan.inserts) {
    // neon-http has no interactive transactions: each insert commits on its own. See the
    // PR body for the retry hazard this creates and the pre-apply backup it requires.
    const [inserted] = await db
      .insert(chartOfAccounts)
      .values({ tenantId: null, ...row, isActive: true, modifiedBy: MODIFIED_BY })
      .returning({ id: chartOfAccounts.id });
    await audit({ action: 'create', accountId: inserted.id, code: row.code, name: row.name });
  }

  for (const update of plan.updates) {
    // The SET list is exactly PERSISTED_FIELDS plus updated_at. modified_by is NOT set:
    // a row last changed by a human L4 auditor keeps that attribution. is_active is NOT
    // set: activation state is not a chart definition.
    await db
      .update(chartOfAccounts)
      .set({
        name: update.row.name,
        type: update.row.type,
        subtype: update.row.subtype,
        description: update.row.description,
        scheduleELine: update.row.scheduleELine,
        taxDeductible: update.row.taxDeductible,
        updatedAt: new Date(),
      })
      // Scoped by id AND tenant_id IS NULL: a tenant override can never be reached.
      .where(and(eq(chartOfAccounts.id, update.id), isNull(chartOfAccounts.tenantId)));
    await audit({
      action: 'update',
      accountId: update.id,
      code: update.row.code,
      name: update.row.name,
      changedFields: update.changedFields,
    });
  }

  console.log(`  Wrote ${plan.inserts.length} insert(s) and ${plan.updates.length} update(s).`);
  return plan;
}

/**
 * True when this module is what node was asked to run. Compares real paths, so a relative
 * invocation or a symlinked checkout still matches, and fails loudly rather than exiting 0
 * when argv[1] cannot be resolved at all.
 */
export function isMainModule(moduleUrl: string, argv1: string | undefined): boolean {
  if (!argv1) {
    throw new Error('Cannot determine the entry script: process.argv[1] is not set');
  }
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argv1);
  } catch (err) {
    throw new Error(`Cannot resolve the entry script "${argv1}": ${(err as Error).message}`);
  }
}

// Run directly if executed as a script.
if (isMainModule(import.meta.url, process.argv[1])) {
  seedChartOfAccounts({ apply: process.argv.includes('--apply') })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Seed failed:', e);
      process.exit(1);
    });
}
