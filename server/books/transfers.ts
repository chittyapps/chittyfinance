// Transfer semantics — money moving between accounts the group controls.
//
// Per docs/CHART-OF-ACCOUNTS.md §5/§6: a movement is a P&L event only when the
// counterparty is outside the group. Every hop between two accounts the group
// controls is a transfer, whatever it is labelled. Booking such a hop as income
// or expense overstates both sides of the P&L and every 8825/Schedule E line
// derived from them.
//
// This module is pure — no DB, no network, no env. Everything here is
// unit-testable against real inputs.

/** The full `transactions.type` domain. The column is plain `text` with no CHECK
 *  constraint, so this is the only place the domain is defined. */
export const TRANSACTION_TYPES = ['income', 'expense', 'transfer'] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export function isTransactionType(value: unknown): value is TransactionType {
  return typeof value === 'string' && (TRANSACTION_TYPES as readonly string[]).includes(value);
}

/** True when a row must be kept out of every income/expense total and tax line. */
export function isTransferType(value: unknown): boolean {
  return value === 'transfer';
}

/** Clearing accounts a transfer leg is booked to (docs/CHART-OF-ACCOUNTS.md §6). */
export const TRANSFER_CLEARING_INTRA_ENTITY = '1900';
export const TRANSFER_CLEARING_INTERCOMPANY = '1910';

/** Payment Rail Holding — a transfer code, but deliberately outside the
 *  net-to-zero assertion (docs/CHART-OF-ACCOUNTS.md §6, "Why 1920 is excluded").
 *  Nothing on the ingest path writes it today; it is recognised here so that if
 *  a row ever carries it, it is not mistaken for a miscoded leg. */
export const RAIL_HOLDING_CODE = '1920';

/**
 * The two codes the net-to-zero assertion runs over — and deliberately NOT the
 * same list as `TRANSFER_CLEARING_CODES` in `database/chart-of-accounts.ts`,
 * which also carries 1920 Payment Rail Holding.
 *
 * The two constants answer different questions. The chart's list is "which
 * accounts carry `transfer` treatment", used to keep them off every P&L and
 * return line (§14). This list is "which accounts must net to zero per period"
 * (§6 step 5). 1920 holds a Venmo/Zelle/cash movement while the far side is
 * still unknown, so it may have no sibling leg and no counterparty inside the
 * group — asserting it nets to zero would fail on correct data.
 *
 * docs/CHART-OF-ACCOUNTS.md §6 documents this divergence by name and states the
 * two lists are not expected to be equal. Do not "fix" one to match the other.
 */
export const TRANSFER_CLEARING_CODES: readonly string[] = [
  TRANSFER_CLEARING_INTRA_ENTITY,
  TRANSFER_CLEARING_INTERCOMPANY,
];

export function isTransferClearingCode(code: string | null | undefined): boolean {
  return !!code && TRANSFER_CLEARING_CODES.includes(code);
}

/** Mercury's own label for a movement between two Mercury accounts. */
export const MERCURY_INTERNAL_TRANSFER_KIND = 'internalTransfer';

/**
 * Mercury sets `kind === 'internalTransfer'` on BOTH legs of a movement between
 * two accounts it can see. Verified against live data: the legs are separate
 * rows sharing `postedAt` to the microsecond, carrying opposite `amount`, with
 * `counterpartyNickname` naming the other account. `counterpartyNickname` is
 * populated only for internal movements — external activity never sets it.
 */
export function isMercuryInternalTransfer(kind: unknown): boolean {
  return kind === MERCURY_INTERNAL_TRANSFER_KIND;
}

/**
 * Choose 1900 (intra-entity) or 1910 (intercompany).
 *
 * 1910 is emitted only on a *positive* mismatch — we know the counterparty
 * account and it belongs to a different tenant. When the counterparty tenant is
 * unknown (the usual case on the webhook path, where Mercury gives us a nickname
 * string and not an account id we can resolve), the honest answer is 1900: the
 * doc's rule is "across entities; only if the counterparty account belongs to a
 * different tenant — otherwise 1900".
 */
export function selectTransferClearingCode(params: {
  tenantId: string;
  counterpartyTenantId?: string | null;
}): string {
  const { tenantId, counterpartyTenantId } = params;
  if (!counterpartyTenantId) return TRANSFER_CLEARING_INTRA_ENTITY;
  return counterpartyTenantId === tenantId
    ? TRANSFER_CLEARING_INTRA_ENTITY
    : TRANSFER_CLEARING_INTERCOMPANY;
}

/**
 * Canonical key both legs of one movement compute to the same value.
 *
 * The two legs have DIFFERENT Mercury transaction ids, so they cannot be paired
 * on id. They share `postedAt` to the microsecond and carry opposite amounts, so
 * the pair (|amount|, postedAt) identifies the movement symmetrically.
 *
 * Account identity is deliberately NOT part of the key: leg A sees its own
 * account id and the *nickname* of the counterparty, while leg B sees the
 * mirror. Those are different kinds of identifier, so no sorted pair of them
 * agrees across legs. The counterparty nickname is still recorded in metadata so
 * a later pass (once Mercury account ids are resolvable both ways) can tighten
 * the key. The residual collision risk is two unrelated internal movements of
 * identical magnitude at the identical microsecond.
 *
 * `postedAt` is used verbatim — parsing it through `Date` would truncate the
 * microseconds that make the key discriminating.
 */
export function transferGroupKey(params: {
  amount: number;
  postedAt: string;
}): string {
  const magnitude = Math.abs(params.amount).toFixed(2);
  return `${magnitude}|${params.postedAt.trim()}`;
}

/** A transfer with no usable `postedAt` cannot be paired. It is still a
 *  transfer — it is booked to clearing with no `transfer_group` and surfaces as
 *  an ungrouped leg, never as income or expense. */
export function canDeriveTransferGroup(postedAt: string | null | undefined): boolean {
  return typeof postedAt === 'string' && postedAt.trim().length > 0;
}

/** FNV-1a (32-bit, two rounds → 16 hex chars). Synchronous and dependency-free,
 *  so it runs identically in Workers and in tests. Not a security primitive —
 *  this is a grouping key, never an authorization token. */
function fnv1a(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Deterministic `metadata.transfer_group` — each leg computes it independently
 * from its own row, with no lookup of the sibling (which may not have arrived
 * yet when the webhook fires).
 */
export function transferGroupId(params: { amount: number; postedAt: string }): string {
  const key = transferGroupKey(params);
  const lo = fnv1a(key, 0x811c9dc5);
  const hi = fnv1a(key, 0x1000193);
  return `xfer_${hi.toString(16).padStart(8, '0')}${lo.toString(16).padStart(8, '0')}`;
}

export interface TransferClassification {
  type: 'transfer';
  suggestedCoaCode: string;
  /** Null when `postedAt` was absent — the leg cannot be paired, but it is
   *  still a transfer and is still kept off the P&L. */
  transferGroup: string | null;
  /** Merge into the row's `metadata` column. */
  metadata: Record<string, unknown>;
}

/**
 * Full classification for one leg of a Mercury internal transfer. Callers use
 * this INSTEAD of `findAccountCode()` — an internal movement must never be
 * offered an income or expense code, however its bank description reads.
 */
export function classifyMercuryInternalTransfer(params: {
  tenantId: string;
  amount: number;
  /** Null when the event carried no timestamp — the leg is then ungroupable,
   *  but still a transfer. */
  postedAt: string | null | undefined;
  kind: string;
  bankDescription?: string | null;
  counterpartyNickname?: string | null;
  counterpartyTenantId?: string | null;
}): TransferClassification {
  const transferGroup = canDeriveTransferGroup(params.postedAt)
    ? transferGroupId({ amount: params.amount, postedAt: params.postedAt as string })
    : null;
  const suggestedCoaCode = selectTransferClearingCode({
    tenantId: params.tenantId,
    counterpartyTenantId: params.counterpartyTenantId,
  });

  return {
    type: 'transfer',
    suggestedCoaCode,
    transferGroup,
    metadata: {
      ...(transferGroup ? { transfer_group: transferGroup } : {}),
      // The exact inputs the group id was hashed from. `transactions.date` is a
      // ms-truncated timestamp and the raw string is not otherwise kept, so
      // without these an unmatched group cannot be recomputed, audited or
      // repaired from stored data — the hash is one-way. Recorded verbatim, in
      // the same normalization `transferGroupKey` applies.
      ...(transferGroup
        ? {
            transfer_group_inputs: {
              amount_magnitude: Math.abs(params.amount).toFixed(2),
              posted_at: (params.postedAt as string).trim(),
              key: transferGroupKey({
                amount: params.amount,
                postedAt: params.postedAt as string,
              }),
            },
          }
        : {}),
      transfer_direction: params.amount >= 0 ? 'in' : 'out',
      mercury_kind: params.kind,
      bank_description: params.bankDescription ?? null,
      counterparty_nickname: params.counterpartyNickname ?? null,
    },
  };
}

// ── Clearing balance ──

export interface ClearingLegRow {
  id: string;
  amount: string | number;
  coaCode?: string | null;
  suggestedCoaCode?: string | null;
  date: Date | string;
  description?: string;
  metadata?: unknown;
}

export interface ClearingGroupBalance {
  transferGroup: string;
  legCount: number;
  net: number;
  rowIds: string[];
}

export interface ClearingBalanceResult {
  /** Rows considered — type='transfer' booked to 1900/1910 in the period. */
  legCount: number;
  groupCount: number;
  /** Sum of every clearing leg. Zero when each movement has both of its legs. */
  net: number;
  /** True only when at least one leg was found AND everything nets to zero.
   *  An empty period is `balanced: false` with `legCount: 0` so a vacuous pass
   *  is distinguishable from a real one. */
  balanced: boolean;
  /** Groups that do not net to zero — the missing-leg work queue. */
  unmatchedGroups: ClearingGroupBalance[];
  /** Every row belonging to an unmatched group. */
  unmatchedRows: ClearingLegRow[];
  /** Clearing-coded transfer rows carrying no `metadata.transfer_group`;
   *  they cannot be paired at all. */
  ungroupedRows: ClearingLegRow[];
  /**
   * Every `type='transfer'` row in scope, whatever account it currently sits on.
   * `legCount` counts only those on 1900/1910, so `transferRowCount > 0` with
   * `legCount === 0` is a real finding ("transfers exist but none is on a
   * clearing account") and not an empty period.
   */
  transferRowCount: number;
  /**
   * `type='transfer'` rows whose effective code is neither a clearing code
   * (1900/1910) nor the rail-holding account (1920, excluded from the assertion
   * by §6 on purpose).
   *
   * A transfer that has been reclassified onto an income or expense account is
   * still a leg of a real movement — it must not silently leave the check. These
   * rows are deliberately kept OUT of `net` and out of the group buckets, so the
   * movement they belonged to also surfaces as an unmatched group with a missing
   * leg. Two independent signals, and `unmatchedRows` then names the surviving
   * sibling so the pair can be found.
   */
  miscodedRows: ClearingLegRow[];
}

function toNumber(value: string | number): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readTransferGroup(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).transfer_group;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Effective clearing code for a row. The ingest path is trust level L1 — it may
 * write `suggested_coa_code` but never `coa_code` — so a freshly ingested
 * transfer has `coa_code = NULL`. Reading `coa_code` alone would find zero rows
 * and report "balanced" over an empty set.
 */
export function effectiveClearingCode(row: ClearingLegRow): string | null {
  return row.coaCode ?? row.suggestedCoaCode ?? null;
}

/** Rounded to cents — decimal(12,2) amounts arrive as strings and float
 *  addition otherwise leaves 1e-13 residue that reads as an imbalance. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Assert the 1900/1910 clearing accounts net to zero for a tenant and period.
 *
 * A non-zero balance means a missing leg — which is the point of a clearing
 * account rather than dropping the rows (docs/CHART-OF-ACCOUNTS.md §6, step 5).
 *
 * Pass the transfer rows for one tenant and one period; scoping is the caller's
 * job, and both report and storage callers already have a scoped row set.
 */
export function checkTransferClearingBalance(
  rows: Array<ClearingLegRow & { type?: string }>,
): ClearingBalanceResult {
  // Leg identity is the row's TYPE, not its account code. A `type='transfer'`
  // row that has been reclassified onto 5010 is still a leg of a real movement;
  // filtering on the code alone would drop it and leave the surviving sibling
  // looking like an empty, balanced period.
  const transferRows = rows.filter((row) => isTransferType(row.type));

  const legs: ClearingLegRow[] = [];
  const miscodedRows: ClearingLegRow[] = [];
  for (const row of transferRows) {
    const code = effectiveClearingCode(row);
    if (isTransferClearingCode(code)) {
      legs.push(row);
    } else if (code === RAIL_HOLDING_CODE) {
      // 1920 carries a movement whose far side is still unknown, so it has no
      // sibling to net against. §6 keeps it outside the assertion by name —
      // present, but neither a leg nor a fault.
      continue;
    } else {
      miscodedRows.push(row);
    }
  }

  const groups = new Map<string, { net: number; rows: ClearingLegRow[] }>();
  const ungroupedRows: ClearingLegRow[] = [];
  let net = 0;

  for (const row of legs) {
    const value = toNumber(row.amount);
    net += value;

    const group = readTransferGroup(row.metadata);
    if (!group) {
      ungroupedRows.push(row);
      continue;
    }

    const bucket = groups.get(group) ?? { net: 0, rows: [] };
    bucket.net += value;
    bucket.rows.push(row);
    groups.set(group, bucket);
  }

  const unmatchedGroups: ClearingGroupBalance[] = [];
  const unmatchedRows: ClearingLegRow[] = [];

  for (const [transferGroup, bucket] of groups) {
    const groupNet = round2(bucket.net);
    if (groupNet === 0 && bucket.rows.length % 2 === 0) continue;
    unmatchedGroups.push({
      transferGroup,
      legCount: bucket.rows.length,
      net: groupNet,
      rowIds: bucket.rows.map((row) => row.id),
    });
    unmatchedRows.push(...bucket.rows);
  }

  const roundedNet = round2(net);

  return {
    legCount: legs.length,
    groupCount: groups.size,
    net: roundedNet,
    balanced:
      legs.length > 0 &&
      roundedNet === 0 &&
      unmatchedGroups.length === 0 &&
      ungroupedRows.length === 0 &&
      miscodedRows.length === 0,
    unmatchedGroups,
    unmatchedRows,
    ungroupedRows,
    transferRowCount: transferRows.length,
    miscodedRows,
  };
}
