import { describe, it, expect } from 'vitest';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../../database/system.schema';
import { SystemStorage } from '../storage/system';
import { isTransactionExternalIdViolation } from '../books/webhooks';
// ── Idempotency collision (transactions_tenant_external_idx) ─────────────────────────
//
// The read-then-insert dedup in the Wave handler is a CHECK, not a guarantee: two
// concurrent deliveries of the same event — which a retry produces by design — can both
// read "no duplicate" and both insert. Before the partial unique index existed that
// silently wrote a second transaction into the books. With it, the loser raises 23505.
//
// These tests pin both halves of the handling, and the second is the one that matters:
// a broad `catch` would turn a genuine write failure into a 202 the sender never retries,
// which loses the transaction silently. That is strictly worse than the 500 it replaces.

describe('isTransactionExternalIdViolation', () => {
  it('matches a 23505 naming this index', () => {
    expect(isTransactionExternalIdViolation({ code: '23505', constraint: 'transactions_tenant_external_idx' })).toBe(true);
  });

  it('matches a 23505 that carries the index only in the message', () => {
    expect(isTransactionExternalIdViolation({
      code: '23505',
      message: 'duplicate key value violates unique constraint "transactions_tenant_external_idx"',
    })).toBe(true);
  });

  it('does NOT match a unique violation on a different constraint', () => {
    // Absorbing this would report an unrelated collision as "already ingested".
    expect(isTransactionExternalIdViolation({ code: '23505', constraint: 'accounts_external_idx' })).toBe(false);
  });

  it('does NOT match an index whose name merely begins with this one', () => {
    // A bare-substring match would absorb a DIFFERENT collision here and answer 202,
    // which Wave does not retry -- that transaction would be lost, not deduplicated.
    expect(isTransactionExternalIdViolation({
      code: '23505', constraint: 'transactions_tenant_external_idx_v2',
    })).toBe(false);
    expect(isTransactionExternalIdViolation({
      code: '23505',
      message: 'duplicate key value violates unique constraint "transactions_tenant_external_idx_v2"',
    })).toBe(false);
  });

  it('matches through a wrapped error that carries the driver error as its cause', () => {
    // drizzle-orm's DrizzleQueryError shape. If an upgrade starts wrapping, a
    // top-level-only check would return false on every real collision.
    const wrapped = new Error('Failed query: insert into "transactions" ...') as Error & { cause?: unknown };
    wrapped.cause = { code: '23505', constraint: 'transactions_tenant_external_idx' };
    expect(isTransactionExternalIdViolation(wrapped)).toBe(true);
  });

  it('does not loop forever on a cyclic cause chain', () => {
    const a = { code: '42P01' } as { code: string; cause?: unknown };
    a.cause = a;
    expect(isTransactionExternalIdViolation(a)).toBe(false);
  });

  it('does NOT match a non-unique-violation error, whatever its message says', () => {
    expect(isTransactionExternalIdViolation({ code: '42P01', message: 'relation "transactions_tenant_external_idx" does not exist' })).toBe(false);
    expect(isTransactionExternalIdViolation(new Error('transactions_tenant_external_idx'))).toBe(false);
    expect(isTransactionExternalIdViolation(null)).toBe(false);
    expect(isTransactionExternalIdViolation('23505')).toBe(false);
  });
});

/**
 * The predicate above is only as good as the error shape it is fed, and every fixture in
 * it is hand-written. That is the reviewer's strongest objection: if the object that
 * actually reaches `catch` is not shaped like those fixtures, all four tests pass and the
 * absorption still never fires in production.
 *
 * `drizzle-orm` ships `DrizzleQueryError`, which carries the driver error on `.cause`.
 * Whether the installed version throws it is not a detail — if it does, a top-level-only
 * check sees `code: undefined`, returns false on every real collision, and the handler
 * 500s exactly as it did before this change, with CI green.
 *
 * So this drives a `NeonDbError`-shaped throw through the REAL drizzle neon-http layer and
 * the REAL `SystemStorage.createTransaction`, then asserts the predicate matches whatever
 * comes out the other side. Nothing about the wrapping is assumed: if a future upgrade
 * starts wrapping, this test keeps passing (the `.cause` walk covers it) while the
 * shape assertion below records that the shape changed.
 *
 * Real drizzle compilation over a throwing transport. No `vi.mock`.
 */
describe('the error shape that actually reaches the handler', () => {
  function throwingDb() {
    const err = Object.assign(new Error('duplicate key value violates unique constraint "transactions_tenant_external_idx"'), {
      name: 'NeonDbError',
      code: '23505',
      constraint: 'transactions_tenant_external_idx',
      severity: 'ERROR',
      table: 'transactions',
    });
    const client = Object.assign(
      async () => {
        throw err;
      },
      { transaction: async () => { throw err; } },
    );
    return drizzle(client as never, { schema });
  }

  it('is matched by the predicate after a real createTransaction insert', async () => {
    const storage = new SystemStorage(throwingDb());
    let caught: unknown;
    try {
      await storage.createTransaction({
        tenantId: '22222222-2222-4222-8222-222222222222',
        accountId: '33333333-3333-4333-8333-333333333333',
        amount: '-12.34',
        type: 'expense',
        description: 'wave ingest race',
        date: new Date('2026-10-21T00:00:00Z'),
        externalId: 'wave-evt-1',
      } as never);
    } catch (e) {
      caught = e;
    }
    expect(caught, 'the insert must have thrown').toBeDefined();
    // The assertion that matters: the handler's catch can recognise it.
    expect(isTransactionExternalIdViolation(caught)).toBe(true);
  });

  it('is wrapped by drizzle, so the driver code is reachable only through .cause', async () => {
    const storage = new SystemStorage(throwingDb());
    let caught: (Error & { code?: unknown; cause?: unknown }) | undefined;
    try {
      await storage.createTransaction({
        tenantId: '22222222-2222-4222-8222-222222222222',
        accountId: '33333333-3333-4333-8333-333333333333',
        amount: '-12.34',
        type: 'expense',
        description: 'wave ingest race',
        date: new Date('2026-10-21T00:00:00Z'),
        externalId: 'wave-evt-1',
      } as never);
    } catch (e) {
      caught = e as Error & { code?: unknown; cause?: unknown };
    }
    // Measured, and the reason the `.cause` walk exists: drizzle DOES wrap. The thrown
    // object is `DrizzleQueryError`, and `code`/`constraint` are NOT on it -- they are on
    // `.cause`. The wrapping is inherited from `pg-core/session.js`; `neon-http/session.js`
    // has none of its own, which is why reading that file alone suggests the opposite.
    //
    // These two assertions are the ones that would have caught the no-op: a predicate
    // reading only the top level returns false here on every real collision.
    expect(caught?.constructor?.name).toBe('DrizzleQueryError');
    expect(caught?.code).toBeUndefined();
    expect((caught?.cause as { code?: unknown; constraint?: unknown })?.code).toBe('23505');
    expect((caught?.cause as { constraint?: unknown })?.constraint).toBe('transactions_tenant_external_idx');
  });
});
