import { describe, it, expect } from 'vitest';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { transactions } from '../../database/system.schema';

/**
 * `transactions_tenant_external_idx` is the idempotency guarantee every external sync
 * (Mercury, Wave, any future provider) relies on: write the same provider record twice and
 * the second insert must be rejected by the database rather than by application logic that
 * may or may not run.
 *
 * Three properties have to hold together, and getting any one wrong fails differently:
 *
 *   - NOT unique   -> duplicates are accepted silently; the sync looks like it worked.
 *   - NOT partial  -> every manual transaction shares (tenant_id, NULL). Postgres permits
 *                     that, but SQLite/D1 treats NULLs as equal in a UNIQUE index, so the
 *                     second hand-entered row is rejected. The index becomes a bug the
 *                     moment the schema is ported, which is the direction startup-mode
 *                     points.
 *   - NOT per-tenant -> `external_id` is a PROVIDER's identifier, unique only inside that
 *                     provider's namespace. A global unique index makes one tenant's
 *                     provider id block another tenant's legitimate row.
 *
 * Asserted against the rendered DDL predicate, not merely "a where clause exists" — the
 * difference between `IS NOT NULL` and anything else is the whole point of the index.
 */
const INDEX_NAME = 'transactions_tenant_external_idx';

function indexes() {
  return getTableConfig(transactions).indexes.map((i) => {
    const c = (i as unknown as { config: Record<string, any> }).config;
    return {
      name: c.name as string,
      unique: Boolean(c.unique),
      columns: ((c.columns ?? []) as Array<{ name: string }>).map((x) => x.name),
      where: c.where ? new PgDialect().sqlToQuery(c.where).sql : null,
    };
  });
}

describe(INDEX_NAME, () => {
  const all = indexes();
  const idx = all.find((i) => i.name === INDEX_NAME);

  it('is declared on the transactions table', () => {
    // Non-vacuity for everything below: a typo'd name would otherwise make each
    // assertion skip on an undefined and the suite stay green.
    expect(
      idx,
      `no index named ${INDEX_NAME}; found: ${all.map((i) => i.name).join(', ')}`,
    ).toBeDefined();
  });

  it('is UNIQUE — the database rejects the duplicate, not the caller', () => {
    expect(idx!.unique).toBe(true);
  });

  it('covers (tenant_id, external_id) in that order', () => {
    // Order matters for lookups scoped by tenant, which is every lookup here.
    expect(idx!.columns).toEqual(['tenant_id', 'external_id']);
  });

  it('is PARTIAL on external_id IS NOT NULL', () => {
    expect(idx!.where, 'index has no predicate — manual NULL rows would collide').not.toBeNull();
    expect(idx!.where!.replace(/"/g, '')).toMatch(/external_id\s+is\s+not\s+null/i);
  });

  it('constrains only this pair, and leaves the existing indexes alone', () => {
    // A rename or an accidental widening of another index shows up here.
    const unique = all.filter((i) => i.unique).map((i) => i.name);
    expect(unique).toEqual([INDEX_NAME]);
    expect(all.map((i) => i.name)).toEqual(
      expect.arrayContaining([
        'transactions_tenant_idx',
        'transactions_account_idx',
        'transactions_date_idx',
        'transactions_property_idx',
        'transactions_coa_idx',
        'transactions_unclassified_idx',
        INDEX_NAME,
      ]),
    );
  });
});
