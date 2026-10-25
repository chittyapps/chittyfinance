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
// subtype, description, schedule_e_line, tax_deductible, parent_code. It deliberately
// does NOT write metadata, is_active or modified_by on existing rows — see §"What this
// seed does not write" below.
//
// An apply can be NARROWED to a set of fields and/or codes — see SeedScope. A scope only
// ever subtracts; it cannot write a row or a column the unscoped apply would not have
// written. The CLI above has no scope flags: the operator-facing scoped apply is
// POST /api/admin/seed/chart-of-accounts, where DATABASE_URL is a Worker secret rather
// than a shell variable.

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
 * `parent_code` IS written, and the one rule that governs it: it is READ OFF THE
 * DOCUMENT, never derived. docs/CHART-OF-ACCOUNTS.md §1.7 and §14 define the hierarchy
 * explicitly — ten header accounts and a written-down `parent_code` for 37 children —
 * and `chartParityMismatches()` fails the apply if the projection and the document
 * disagree about a single parent. That is what makes persisting it safe, and it needed
 * no DDL: the column has always existed.
 *
 * Do not reintroduce a derived parent. An earlier revision computed one arithmetically
 * (floor(code/100)*100) and pointed children at sibling POSTING accounts rather than
 * headers — 5055 Litigation at 5000 Advertising, the 90x0 suspense accounts at 9000
 * Owner Personal Expense, 2540 Due to Affiliate at 2500 Mortgage Payable. A dangling
 * parent is detectable; a valid-but-wrong one is indistinguishable from a deliberate
 * choice, and any rollup built on it would silently double-count. The field was pulled
 * for exactly that reason and comes back only because the document now says what the
 * parents are.
 *
 * A row the document gives no parent — every header, and every account outside the ten
 * groups — projects `parentCode: null` and is written as NULL. So an apply also CLEARS a
 * stray `parent_code` sitting on a live row, which is the intended effect, not a
 * side effect: the document is the only source of the hierarchy.
 *
 * What this seed does not write, and why:
 *
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
  /**
   * The code of this account's header, straight from docs/CHART-OF-ACCOUNTS.md §14.
   * NULL for a header and for any account the document places in no group. Never derived
   * from the code — see the note above this interface.
   */
  parentCode: string | null;
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
    changedFields: PersistedField[];
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
  /**
   * What a scope held back. Empty on an unscoped plan.
   *
   * This exists so a scoped apply cannot read as "the chart is now in sync". A plan that
   * writes four tax_deductible corrections while ten header accounts are still missing
   * must say so in the same artifact, or the next operator reads a clean summary and
   * believes the hierarchy landed.
   */
  deferred: {
    /** Inserts the scope excluded. A field scope always excludes every insert — see narrowScope(). */
    inserts: SeedAccountRow[];
    /** Updates no requested field touched. */
    updates: Array<{ id: string; row: SeedAccountRow; changedFields: PersistedField[] }>;
    /**
     * Updates the scope kept but trimmed: the fields that differ and were NOT written,
     * per code. An entry here means that row is still drifted after this apply.
     */
    fields: Array<{ code: string; applied: PersistedField[]; deferred: PersistedField[] }>;
    /**
     * Codes named in `scope.codes` that match nothing in the projection. Reported so a
     * typo'd code does not come back as a successful apply of zero rows.
     */
    unmatchedCodes: string[];
  };
  /** The scope this plan was computed under, or null when unscoped. */
  scope: { fields: PersistedField[] | null; codes: string[] | null } | null;
}

/** Fields compared to decide whether an existing row needs an update, and the exact SET list. */
export const PERSISTED_FIELDS = [
  'name',
  'type',
  'subtype',
  'description',
  'scheduleELine',
  'taxDeductible',
  'parentCode',
] as const;

/** One of the columns the authoritative document defines. */
export type PersistedField = (typeof PERSISTED_FIELDS)[number];

/**
 * Narrow what an apply is allowed to write.
 *
 * WHY THIS EXISTS
 *
 * The unscoped apply is all-or-nothing, and §3 (document authoritative) pulls against
 * §6 (never hand-write apply SQL) the moment the two pending changes have different
 * risk. Production currently needs four `tax_deductible` corrections on rows that already
 * exist — four UPDATEs, idempotent, no structural effect. The same unscoped apply would
 * also insert ten header accounts and set `parent_code` on 37 children, over a
 * connection with no interactive transactions, so a mid-apply failure leaves a
 * half-built hierarchy. Hand-writing the four UPDATEs instead is exactly what produced
 * the defect being corrected: §6 is not negotiable, so the seed has to be able to carry
 * a smaller change.
 *
 * A scope never widens anything. Every write it performs is a write the unscoped plan
 * would also have performed, on the same row, with the same value.
 */
export interface SeedScope {
  /**
   * Write only these columns. Omitted means every column in PERSISTED_FIELDS.
   *
   * A field scope narrower than PERSISTED_FIELDS **cannot insert**. An INSERT writes every
   * column by definition, so calling it a `taxDeductible`-only change would be false; the
   * inserts are reported under `deferred.inserts` instead. A code-only scope may insert.
   */
  fields?: readonly PersistedField[];
  /** Write only these account codes. Omitted means every code in the projection. */
  codes?: readonly string[];
}

/**
 * Validate a scope and resolve it to concrete lists. Refuses rather than silently
 * degrading, on the same reasoning as the route's `.strict()` guard: a request that meant
 * to write and names a field that does not exist must not come back reporting a
 * successful apply of nothing.
 */
export function normalizeScope(
  scope: SeedScope | undefined,
): { fields: PersistedField[] | null; codes: string[] | null } | null {
  if (!scope) return null;
  let fields: PersistedField[] | null = null;
  if (scope.fields !== undefined) {
    if (scope.fields.length === 0) {
      throw new Error('scope.fields is empty: every update would be a no-op. Omit it to write every field.');
    }
    const unknown = scope.fields.filter((f) => !PERSISTED_FIELDS.includes(f));
    if (unknown.length) {
      throw new Error(
        `scope.fields names ${unknown.length} field(s) the seed does not persist: ${unknown.join(', ')}. ` +
          `Persisted fields are: ${PERSISTED_FIELDS.join(', ')}.`,
      );
    }
    fields = [...new Set(scope.fields)];
  }
  let codes: string[] | null = null;
  if (scope.codes !== undefined) {
    if (scope.codes.length === 0) {
      throw new Error('scope.codes is empty: no row would be written. Omit it to write every code.');
    }
    codes = [...new Set(scope.codes)];
  }
  if (fields === null && codes === null) return null;
  return { fields, codes };
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
    parentCode: acct.parentCode ?? null,
  }));
}

function changedFields(existing: ExistingAccountRow, desired: SeedAccountRow): PersistedField[] {
  return PERSISTED_FIELDS.filter((field) => existing[field] !== desired[field]);
}

/**
 * Pure delta between what the projection defines and what the table holds.
 * No database access — this is the logic the dry run reports and the apply executes.
 */
export function computeSeedPlan(
  desired: SeedAccountRow[],
  existing: ExistingAccountRow[],
  scope?: SeedScope,
): SeedPlan {
  const byCode = new Map<string, ExistingAccountRow[]>();
  for (const row of existing) {
    const rows = byCode.get(row.code) ?? [];
    rows.push(row);
    byCode.set(row.code, rows);
  }

  const resolved = normalizeScope(scope);
  const codeScope = resolved?.codes ? new Set(resolved.codes) : null;
  // A field scope that does not cover every persisted field forbids inserts; `fields:
  // PERSISTED_FIELDS` spelled out in full is the unscoped field set and still inserts.
  //
  // Set COVERAGE, not array length. Length was a proxy for completeness that happens to
  // be right only because every persisted field is also an insert column. The two are
  // behaviourally IDENTICAL today and no test can tell them apart — swapping this back to
  // `size < PERSISTED_FIELDS.length` keeps the suite green, which is why this is a
  // readability-and-durability change rather than a bug fix. They diverge the moment
  // PERSISTED_FIELDS gains a column an INSERT does not write; the insert guard in
  // server/__tests__/chart-of-accounts-seed.test.ts ('inserts global rows: tenant_id
  // bound null...') loops PERSISTED_FIELDS and asserts every one is bound, so that
  // divergence fails a test there rather than silently flipping this branch.
  const fieldSet = resolved?.fields ? new Set<PersistedField>(resolved.fields) : null;
  const fieldScope =
    fieldSet && !PERSISTED_FIELDS.every((f) => fieldSet.has(f)) ? fieldSet : null;

  const plan: SeedPlan = {
    inserts: [],
    updates: [],
    unchanged: [],
    inactive: [],
    duplicateCodes: [],
    extraneous: [],
    deferred: { inserts: [], updates: [], fields: [], unmatchedCodes: [] },
    scope: resolved,
  };

  for (const row of desired) {
    const matches = byCode.get(row.code) ?? [];
    if (matches.length === 0) {
      // Out of code scope, or a field scope that cannot honestly describe an INSERT.
      if ((codeScope && !codeScope.has(row.code)) || fieldScope) plan.deferred.inserts.push(row);
      else plan.inserts.push(row);
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
      continue;
    }
    if (codeScope && !codeScope.has(row.code)) {
      plan.deferred.updates.push({ id: matches[0].id, row, changedFields: fields });
      continue;
    }
    const applied = fieldScope ? fields.filter((f) => fieldScope.has(f)) : fields;
    if (applied.length === 0) {
      plan.deferred.updates.push({ id: matches[0].id, row, changedFields: fields });
      continue;
    }
    if (applied.length < fields.length) {
      plan.deferred.fields.push({
        code: row.code,
        applied,
        deferred: fields.filter((f) => !applied.includes(f)),
      });
    }
    plan.updates.push({ id: matches[0].id, row, changedFields: applied });
  }

  if (codeScope) {
    const projected = new Set(desired.map((r) => r.code));
    plan.deferred.unmatchedCodes = [...codeScope].filter((c) => !projected.has(c)).sort();
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
  if (plan.scope) {
    lines.push(
      `  scope: fields=${plan.scope.fields ? plan.scope.fields.join('+') : 'all'} ` +
        `codes=${plan.scope.codes ? plan.scope.codes.join(',') : 'all'}`,
    );
    const d = plan.deferred;
    // Stated unconditionally under a scope, including at zero, so "the chart is in sync"
    // and "the scope wrote everything it was allowed to" never look alike.
    lines.push(
      `  DEFERRED by this scope: ${d.inserts.length} insert(s), ${d.updates.length} ` +
        `whole update(s), ${d.fields.length} partially-written row(s)`,
    );
    for (const row of d.inserts) lines.push(`    - insert ${row.code} ${row.name}`);
    for (const u of d.updates) {
      lines.push(`    - update ${u.row.code} (${u.changedFields.join(', ')})`);
    }
    for (const f of d.fields) {
      lines.push(`    - ${f.code} still drifted on: ${f.deferred.join(', ')}`);
    }
    if (d.unmatchedCodes.length) {
      lines.push(
        `  ! scope.codes names ${d.unmatchedCodes.length} code(s) the chart does not ` +
          `define: ${d.unmatchedCodes.join(', ')}`,
      );
    }
  }
  return lines.join('\n');
}

export const MODIFIED_BY = 'seed:chart-of-accounts';

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
      parentCode: chartOfAccounts.parentCode,
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
  /**
   * Narrow what the apply writes. Omitted means the whole chart, which is the behaviour
   * every existing caller gets. See SeedScope.
   */
  scope?: SeedScope;
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

  // normalizeScope() throws on an invalid scope, and it runs inside computeSeedPlan
  // before any read is used — so a bad scope fails the dry run too, not just the apply.
  const plan = computeSeedPlan(projectSeedRows(), await readGlobalRows(db), options.scope);

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
    // The SET list is exactly this update's changedFields plus updated_at. modified_by is
    // NOT set: a row last changed by a human L4 auditor keeps that attribution. is_active
    // is NOT set: activation state is not a chart definition.
    //
    // Built from changedFields rather than hardcoded to all seven columns, because under a
    // field scope a hardcoded list would write the columns the scope excluded — the scope
    // would narrow the plan and change nothing about the SQL. Drizzle builds an UPDATE's
    // SET list from the keys of .set(), so what is absent here is genuinely not in the
    // statement (unlike an INSERT, whose column list comes from the table definition).
    await db
      .update(chartOfAccounts)
      .set({
        ...(Object.fromEntries(
          update.changedFields.map((f) => [f, update.row[f]]),
        ) as Partial<SeedAccountRow>),
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
 * when argv[1] is present but cannot be resolved.
 *
 * The two unset/unresolvable cases are NOT the same thing, and the distinction is why the
 * throw below survives:
 *
 *   - A falsy `argv1` means the host has no entry script at all. That is a legitimate
 *     state — a Cloudflare Worker, or any `import` of this module — and the honest answer
 *     is "no, this module is not the entry point": return false. It used to throw, which
 *     made merely IMPORTING this module fatal inside the Worker, since the call below runs
 *     at module scope.
 *   - A non-empty `argv1` that does not resolve means a real Node CLI invocation pointed
 *     at a path that is not there. That is a bug in the invocation, and answering "false"
 *     would silently exit 0 having seeded nothing. Still throws.
 */
export function isMainModule(moduleUrl: string, argv1: string | undefined): boolean {
  if (!argv1) return false;
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argv1);
  } catch (err) {
    throw new Error(`Cannot resolve the entry script "${argv1}": ${(err as Error).message}`);
  }
}

// Run directly if executed as a script. `process.argv` is not guaranteed to be an array
// off-Node (workerd's `process` shim), so this reads through optional chaining rather
// than indexing it.
if (isMainModule(import.meta.url, process.argv?.[1])) {
  seedChartOfAccounts({ apply: process.argv.includes('--apply') })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Seed failed:', e);
      process.exit(1);
    });
}
