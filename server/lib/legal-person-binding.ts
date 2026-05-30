/**
 * Legal Person ChittyID binding for Mercury accounts (Path B — interim).
 *
 * Per docs/contracts/mercury-multitenant.md, every Mercury account must bind
 * to exactly one Legal Person (`P-Legal` entity) recorded as
 * `legal_person_chittyid`. The dedicated column is deferred to Path A
 * (coordinated cutover required; drizzle-kit push is destructive per
 * CLAUDE.md "Schema Changes").
 *
 * Until Path A lands, the binding lives in `accounts.metadata->>'legal_person_chittyid'`.
 * This module is the single read/write surface so the eventual column add
 * is a one-line swap.
 *
 * @canon: chittycanon://gov/governance#core-types — ChittyID format
 *         VV-G-LLL-SSSS-T-YM-C-X where T ∈ {P, L, T, E, A}. For a
 *         Legal Person, T = P and subtype is "Legal".
 */
import type { Account } from '../../database/system.schema';

export const LEGAL_PERSON_METADATA_KEY = 'legal_person_chittyid' as const;

/**
 * ChittyID format check.
 *
 * Canonical shape: `VV-G-LLL-SSSS-T-YM-C-X` (8 dash-separated groups).
 * Group 5 (T) must be one of P / L / T / E / A. For a legal-person binding
 * we require T = P (Person). The Legal/Synthetic/Natural distinction is
 * encoded in a sibling subtype slot upstream and isn't directly visible in
 * the ID itself, so we accept any T=P ChittyID here and rely on
 * ChittyConnect / ChittyID to vouch for the L (Legal) subtype.
 */
const CHITTYID_RE = /^[A-Z0-9]{2}-[A-Z0-9]-[A-Z0-9]{3}-[A-Z0-9]{4}-([PLTEA])-[A-Z0-9]{2}-[A-Z0-9]-[A-Z0-9]$/;

export function isLegalPersonChittyId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = CHITTYID_RE.exec(value);
  if (!match) return false;
  return match[1] === 'P';
}

/**
 * Read the legal_person_chittyid binding from an account row.
 *
 * Returns null when the binding is absent. Callers MUST treat null as a
 * reconciliation flag rather than an error — the contract is partially
 * enforced until Path A lands.
 */
export function getLegalPersonChittyId(account: Pick<Account, 'metadata'> | null | undefined): string | null {
  if (!account) return null;
  const meta = account.metadata;
  if (!meta || typeof meta !== 'object') return null;
  const raw = (meta as Record<string, unknown>)[LEGAL_PERSON_METADATA_KEY];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/**
 * Produce a new metadata object with the legal_person_chittyid binding set.
 *
 * Pure — does not mutate the input. Throws on invalid ChittyID shape (this
 * is a write path; we want validation errors loud here). The runtime
 * reconciliation flag fires on the read side, where missingness is
 * expected during the Path A transition.
 */
export function setLegalPersonChittyId<M extends Record<string, unknown> | null | undefined>(
  metadata: M,
  chittyId: string,
): Record<string, unknown> {
  if (!isLegalPersonChittyId(chittyId)) {
    throw new Error(`Invalid Legal Person ChittyID: ${chittyId}`);
  }
  const base = metadata && typeof metadata === 'object' ? { ...(metadata as Record<string, unknown>) } : {};
  base[LEGAL_PERSON_METADATA_KEY] = chittyId;
  return base;
}

/**
 * Structured reconciliation flag emitted when a Mercury-sourced account is
 * read or written without a legal_person_chittyid binding.
 *
 * Per contract:
 *   "Reconciliation reports MUST flag this in their output until the gap closes."
 *
 * This is a value, not a thrown error. The webhook write path must NOT
 * reject the event; the legacy data flow predates the binding requirement
 * and the contract treats this as partial enforcement, not invalid input.
 */
export interface LegalPersonBindingFlag {
  code: 'missing_legal_person_chittyid';
  severity: 'reconciliation';
  source: 'mercury' | 'wave' | 'stripe' | 'unknown';
  tenantId: string;
  accountId?: string;
  externalId?: string | null;
  message: string;
}

export interface CheckBindingInput {
  source: 'mercury' | 'wave' | 'stripe' | 'unknown';
  tenantId: string;
  accountId?: string;
  externalId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Runtime check for the Mercury write path.
 *
 * Returns a flag object when the binding is missing for a source that
 * requires it (Mercury today; Wave/Stripe reserved for future bindings).
 * Returns null when the binding is present or the source does not require it.
 *
 * Callers SHOULD include the returned flag in their response payload and
 * the audit ledger so reconciliation reports can surface it.
 */
export function checkLegalPersonBinding(input: CheckBindingInput): LegalPersonBindingFlag | null {
  if (input.source !== 'mercury') return null;
  const meta = input.metadata;
  const raw = meta && typeof meta === 'object' ? (meta as Record<string, unknown>)[LEGAL_PERSON_METADATA_KEY] : undefined;
  if (typeof raw === 'string' && raw.length > 0 && isLegalPersonChittyId(raw)) {
    return null;
  }
  return {
    code: 'missing_legal_person_chittyid',
    severity: 'reconciliation',
    source: input.source,
    tenantId: input.tenantId,
    accountId: input.accountId,
    externalId: input.externalId ?? null,
    message:
      'Mercury account is missing legal_person_chittyid binding (Path B metadata). ' +
      'Reconciliation reports will flag this until the dedicated column lands (Path A).',
  };
}
