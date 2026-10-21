import { describe, it, expect } from 'vitest';
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

  it('does NOT match a non-unique-violation error, whatever its message says', () => {
    expect(isTransactionExternalIdViolation({ code: '42P01', message: 'relation "transactions_tenant_external_idx" does not exist' })).toBe(false);
    expect(isTransactionExternalIdViolation(new Error('transactions_tenant_external_idx'))).toBe(false);
    expect(isTransactionExternalIdViolation(null)).toBe(false);
    expect(isTransactionExternalIdViolation('23505')).toBe(false);
  });
});
