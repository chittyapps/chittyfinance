/**
 * Produce the §7 gate package for a scoped chart-of-accounts apply.
 *
 * finance-operating-defaults §7 says a production financial write is operator-gated, and
 * that the gate is only meaningful if what is presented is complete: the COMPILED statement
 * (§2), the snapshot (§4), a rollback recipe covering every column touched including
 * updated_at, and the blast radius. Asking an operator to approve a described change is not
 * a gate — it is a request to trust a description.
 *
 * §2 exists because of this exact apply: the plan was correct and the hand-written SQL
 * omitted tax_deductible, so four rows still carry the wrong value. The lesson was to verify
 * the statement that will execute. So this script does not describe the statements — it
 * COMPILES them, through the same drizzle code path the Worker uses, against a client that
 * records the SQL instead of sending it. Nothing here touches a database and nothing here
 * needs a credential.
 *
 *   npx tsx scripts/coa-apply-gate-package.ts            # the four tax rows (default)
 *   npx tsx scripts/coa-apply-gate-package.ts 5015 6050  # an explicit code scope
 *
 * What it CANNOT produce is the snapshot itself: that is a read of production. It emits the
 * exact query to run instead, and the rollback is a template over that query's output,
 * because a rollback recipe written without the prior values is not a recipe.
 */
import { drizzle } from 'drizzle-orm/neon-http';
import {
  computeSeedPlan,
  projectSeedRows,
  seedChartOfAccounts,
  PERSISTED_FIELDS,
  type ExistingAccountRow,
  type SeedAccountRow,
} from '../database/seeds/chart-of-accounts';
import * as schema from '../database/system.schema';

/** The codes the 2026-09-18 hand-written apply left wrong. */
const DEFAULT_CODES = ['5015', '5025', '5055', '6050'];

const codes = process.argv.slice(2).filter((a) => /^\d{4}$/.test(a));
const scopeCodes = codes.length ? codes : DEFAULT_CODES;

interface Recorded {
  sql: string;
  params: unknown[];
}

/**
 * The production-shaped rows this package is compiled against.
 *
 * NOT a claim about production — but shaped to match what was observed of it, because a
 * fixture that differs from production only in the scoped column makes a scoped and an
 * unscoped apply emit identical SQL, and then the package cannot show what the scope is
 * holding back. An earlier revision did exactly that and reported "deferred: 0 inserts,
 * 0 updates", which understated the outstanding hierarchy work to zero.
 *
 * Three deviations from the projection, each matching an observation:
 *   - the ten header accounts are ABSENT (production holds 95 rows, no headers),
 *   - no row carries parent_code (production holds none),
 *   - tax_deductible is inverted on the scoped codes.
 *
 * §10 records all three as assumptions standing in for evidence; the snapshot resolves them.
 */
function assumedRows(): ExistingAccountRow[] {
  const projected = projectSeedRows();
  const headerCodes = new Set(
    projected.filter((r) => r.subtype === 'header').map((r) => r.code),
  );
  return projected
    .filter((row: SeedAccountRow) => !headerCodes.has(row.code))
    .map((row: SeedAccountRow, i: number) => ({
      ...row,
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      isActive: true,
      parentCode: null,
      taxDeductible: scopeCodes.includes(row.code) ? !row.taxDeductible : row.taxDeductible,
    }));
}

async function compileStatements(rows: ExistingAccountRow[]): Promise<Recorded[]> {
  const calls: Recorded[] = [];
  const client = async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    if (/^\s*select/i.test(sql)) {
      // Return the assumed rows positionally, in the order the compiled SELECT projects.
      const list = sql.slice(sql.search(/\bselect\b/i) + 6, sql.search(/\bfrom\b/i));
      const columns = [...list.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
      const map: Record<string, keyof ExistingAccountRow> = {
        id: 'id', code: 'code', name: 'name', type: 'type', subtype: 'subtype',
        description: 'description', schedule_e_line: 'scheduleELine',
        tax_deductible: 'taxDeductible', parent_code: 'parentCode', is_active: 'isActive',
      };
      return { rows: rows.map((r) => columns.map((c) => r[map[c]])), rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
  };
  // The seed logs "Applying chart of accounts: ... Wrote 0 insert(s) and 4 update(s)".
  // Nothing was written — the client records and discards. Leaving that line in a gate
  // package would be the single most misleading sentence in it.
  const realLog = console.log;
  console.log = () => {};
  try {
    await seedChartOfAccounts({
      apply: true,
      db: drizzle(client as never, { schema }),
      scope: { codes: scopeCodes },
      audit: async () => {},
    });
  } finally {
    console.log = realLog;
  }
  return calls;
}

function setColumns(sql: string): string[] {
  const clause = sql.split(/\bset\b/i)[1]?.split(/\bwhere\b/i)[0] ?? '';
  return [...clause.matchAll(/"([a-z_]+)" = /g)].map((m) => m[1]);
}

async function main(): Promise<void> {
  const rows = assumedRows();
  const plan = computeSeedPlan(projectSeedRows(), rows, { codes: scopeCodes });
  const calls = await compileStatements(rows);
  const updates = calls.filter((c) => /^\s*update/i.test(c.sql));
  const inserts = calls.filter((c) => /^\s*insert/i.test(c.sql));
  const codeList = scopeCodes.map((c) => `'${c}'`).join(', ');

  const out: string[] = [];
  const h = (t: string) => out.push('', `## ${t}`, '');

  out.push(
    `# Chart-of-accounts scoped apply — §7 gate package`,
    '',
    `Generated by \`scripts/coa-apply-gate-package.ts\` on ${new Date().toISOString()}.`,
    `Scope: \`{"codes": [${codeList}]}\`. Nothing in this run touched a database.`,
  );

  h('§2 — the compiled statements that will execute');
  out.push(
    `${updates.length} UPDATE, ${inserts.length} INSERT. Compiled by drizzle through the`,
    `same code path the Worker uses, not transcribed. Parameters are listed in bind order;`,
    `\`$n\` in the SQL is \`params[n-1]\`.`,
    '',
  );
  out.push(
    `Which bound values are real, stated per position so none of this is taken on trust:`,
    '',
    `- \`$1\` **tax_deductible — REAL.** Read off the authoritative projection; this is the`,
    `  value the apply will write.`,
    `- \`$2\` **updated_at — PLACEHOLDER.** Stamped at compile time here; the apply stamps`,
    `  its own \`new Date()\` at execution.`,
    `- \`$3\` **id — PLACEHOLDER.** A synthetic UUID from the assumed row set. The real id`,
    `  comes from the snapshot. The *shape* of the WHERE — id plus \`tenant_id IS NULL\` —`,
    `  is real compiled output.`,
    '',
  );
  updates.forEach((c, i) => {
    const code = plan.updates[i]?.row.code ?? '?';
    out.push(
      `**${i + 1}. code ${code} — SET ${setColumns(c.sql).join(', ')}**`,
      '```sql',
      c.sql,
      '```',
      `params: ${JSON.stringify(c.params)}`,
      `  → $1 = ${JSON.stringify(c.params[0])} (real) · $2 placeholder · $3 placeholder`,
      '',
    );
  });
  if (inserts.length === 0) {
    out.push(
      `**Zero INSERTs, and that is the point of the code scope.** The unscoped apply would`,
      `also insert the header accounts and set \`parent_code\` on their children — a`,
      `structural change riding inside a tax-semantics change, which §6 separates.`,
    );
  }

  h('§4 — the snapshot, to run BEFORE the apply');
  out.push(
    `Required: \`neon-http\` has no interactive transactions, so each statement above commits`,
    `independently and partial state is the default failure, not an edge case. There is no`,
    `transaction to abort — this snapshot is the only thing to go back to.`,
    '',
    `Reads every column the apply touches, plus \`updated_at\` (which the apply also writes)`,
    `and \`id\`:`,
    '',
    '```sql',
    `SELECT id, code, tax_deductible, updated_at`,
    `  FROM chart_of_accounts`,
    ` WHERE tenant_id IS NULL AND code IN (${codeList})`,
    ` ORDER BY code;`,
    '```',
    '',
    `Keep the output. The rollback below is a template over it and is unusable without it.`,
  );

  h('§7 — rollback recipe, and an unresolved tension with §3');
  out.push(
    `For each snapshot row, restoring **both** columns the apply wrote:`,
    '',
    '```sql',
    `UPDATE chart_of_accounts`,
    `   SET tax_deductible = <snapshot.tax_deductible>,`,
    `       updated_at     = '<snapshot.updated_at>'`,
    ` WHERE id = '<snapshot.id>' AND tenant_id IS NULL;`,
    '```',
    '',
    `\`updated_at\` is restored deliberately. A rollback that restores the value but not the`,
    `timestamp leaves the row looking recently and deliberately set, which corrupts the audit`,
    `trail as surely as the wrong value did.`,
    '',
    `**The tension, stated rather than papered over.** §3 forbids hand-written apply SQL for`,
    `the books, and permits a hand-written statement "only for reading and for the snapshot in`,
    `§4". This rollback is a write. It also cannot be expressed through the seed path, because`,
    `the seed converges toward the document and the prior values are the ones the document`,
    `rejects — re-running it would simply re-apply the change.`,
    '',
    `So the honest position is: **this change has no §3-compliant rollback.** What it has`,
    `instead is that the apply moves the rows toward the authoritative document and is`,
    `idempotent, so the recovery path is forward, not backward. The recipe above is the`,
    `break-glass, and using it means knowingly taking a §3 exception to restore values the`,
    `document does not sanction. That is an operator decision and it should be made knowing`,
    `which rule it suspends — not discovered afterwards.`,
  );

  h('§5 — reconcile AFTER, by digest, not by reading the list');
  out.push(
    `Eyeballing a list is how the original four-row drift survived: a human reading ninety-five`,
    `rows reliably confirms what they expect to see.`,
    '',
    '```sql',
    `SELECT md5(string_agg(code || ':' || tax_deductible::text, ',' ORDER BY code))`,
    `  FROM chart_of_accounts`,
    ` WHERE tenant_id IS NULL AND code IN (${codeList});`,
    '```',
    '',
    `Expected after a successful apply, from the authoritative projection:`,
    '',
    ...plan.updates.map(
      (u) => `- \`${u.row.code}\` → \`tax_deductible = ${u.row.taxDeductible}\``,
    ),
    '',
    `A mismatch localizes by bisecting the row set, not by re-reading it.`,
  );

  h('§7 — blast radius');
  out.push(
    `- **Rows written:** ${plan.updates.length} (${plan.updates.map((u) => u.row.code).join(', ')}), all \`tenant_id IS NULL\`.`,
    `- **Columns written:** \`tax_deductible\`, \`updated_at\`. Every statement's SET list was`,
    `  read off the compiled SQL above, not assumed.`,
    `- **Never written by this path:** \`is_active\` (an operational decision, not a chart`,
    `  definition), \`modified_by\` (a row last touched by a human L4 auditor keeps that`,
    `  attribution), \`metadata\`, and \`parent_code\` (held back by the scope).`,
    `- **Tenant overrides are unreachable:** every WHERE above carries \`tenant_id IS NULL\``,
    `  alongside the row id, so a tenant row sharing a code cannot be hit.`,
    `- **Downstream:** \`tax_deductible\` feeds Schedule E / Form 8825 line derivation. These`,
    `  four rows being wrong is a tax-figure defect, which is why §6 wants it shipped alone.`,
    `- **Deferred by the scope, still owed:** ${plan.deferred.inserts.length} insert(s) and`,
    `  ${plan.deferred.updates.length} update(s) — the hierarchy. Its own gate, not this one.`,
  );

  h('§10 — gaps in this package');
  out.push(
    `- **The snapshot has not been taken.** Every "current value" question is open until it is.`,
    `  This package therefore contains no claim about what production currently holds.`,
    `- **The compiled statements were produced against assumed rows** — the projection with`,
    `  the ten header accounts removed, every \`parent_code\` nulled, and`,
    `  \`tax_deductible\` inverted on the scoped codes, matching what was observed of`,
    `  production (95 rows, no headers, no parent_code, four wrong flags). The SQL *shape*,`,
    `  SET lists, and WHERE`,
    `  clauses are real drizzle output and do not depend on that assumption; the bound`,
    `  \`$n\` values for \`tax_deductible\` come from the authoritative projection and are what`,
    `  the apply will write. What the assumption cannot tell you is **which** of the four rows`,
    `  actually still differ — if a row already matches, the real apply emits no statement for`,
    `  it. Resolved by the snapshot.`,
    `- **Columns never read:** this package reads \`tax_deductible\` and \`updated_at\`. It does`,
    `  not verify \`parent_code\`, \`is_active\`, or \`modified_by\` on these rows.`,
    `- **The apply itself is blocked on a credential**, not on this package: \`/api/admin/*\``,
    `  sits behind \`serviceAuth\`, which needs the Worker's service token, whose resolution`,
    `  needs a Cloudflare Access service principal this session does not have. Routed to`,
    `  \`/chico\`; never resolved inline.`,
    `- **Whether the deployed bundle carries the scoped-apply code is unverified.** The 401`,
    `  fires before body validation, so no unauthenticated probe can see the schema.`,
  );

  console.log(out.join('\n'));
}

main().catch((e) => {
  console.error('gate package failed:', e);
  process.exit(1);
});
