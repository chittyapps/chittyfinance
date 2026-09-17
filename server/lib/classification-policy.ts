import { z } from 'zod';

/**
 * Who may do what on the classification trust path.
 *
 * AGENTS.md: L2 `coa_code` writes and reconciled-row mutations are limited to
 * `tenant_users.role` ∈ {owner, admin, manager}; COA edits (L4) to
 * {owner, admin}. The default role is `viewer` (database/system.schema.ts),
 * so anything not listed here is denied.
 */
export const L2_ROLES: ReadonlySet<string> = new Set(['owner', 'admin', 'manager']);
export const L4_ROLES: ReadonlySet<string> = new Set(['owner', 'admin']);

/** May this role write `coa_code`, reconcile, or unreconcile? */
export function hasClassificationAuthority(role: string | null | undefined): boolean {
  return typeof role === 'string' && L2_ROLES.has(role);
}

/** May this role add/edit/retire Chart of Accounts entries? */
export function hasCoaAuthority(role: string | null | undefined): boolean {
  return typeof role === 'string' && L4_ROLES.has(role);
}

/**
 * `classification_confidence` is decimal(4,3), so the API accepts a number or
 * a numeric string in [0, 1] and normalises it to 3 decimal places. Anything
 * else is a 400 rather than a database error.
 */
export const confidenceSchema = z
  .union([z.number(), z.string().trim().regex(/^\d+(\.\d+)?$/, 'confidence must be a number between 0 and 1')])
  .transform((value) => Number(value))
  .refine((n) => Number.isFinite(n) && n >= 0 && n <= 1, {
    message: 'confidence must be between 0 and 1',
  })
  .transform((n) => n.toFixed(3));
