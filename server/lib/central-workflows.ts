/**
 * Fractal scope projector.
 *
 * Projects local workflow lifecycle events into the canonical `scopes`
 * table in ChittyOS-Core (Neon). Uses the fractal scope primitive from
 * migration 002_fractal_scopes.sql — self-similar via parent_scope_id,
 * lifecycle via scope_status enum, domain taxonomy via scope_type.
 *
 * Fire-and-forget via waitUntil so local app flows remain authoritative.
 * Fall-open: no CHITTYOS_CORE_DATABASE_URL = silent no-op.
 *
 * @canon: chittycanon://gov/governance#core-types
 */

import { neon } from '@neondatabase/serverless';

// -- Canonical scope_status enum (002_fractal_scopes.sql) -----------------
type ScopeStatus =
  | 'new'
  | 'active'
  | 'waiting'
  | 'escalated'
  | 'paused'
  | 'resolved'
  | 'closed'
  | 'archived';

// -- Canonical scope_characterization enum --------------------------------
type ScopeCharacterization =
  | 'Case'
  | 'Session'
  | 'Transaction'
  | 'Incident'
  | 'Project'
  | 'Engagement';

// -- Public interface for callers -----------------------------------------

export interface ScopeProjection {
  /** Local workflow ID — becomes external_id for upsert dedup */
  externalId: string;
  /** Tenant slug or ID — stored in metadata for filtering */
  tenantId: string;
  /** Free-text domain taxonomy (e.g. 'maintenance_request', 'expense_approval') */
  scopeType: string;
  /** Canonical characterization — workflows are typically 'Project' */
  characterization?: ScopeCharacterization;
  /** Display title */
  title: string;
  /** Optional summary/description */
  summary?: string | null;
  /** Local workflow status — mapped to canonical scope_status */
  localStatus: string;
  /** Optional status reason */
  statusReason?: string;
  /** Domain-specific state (stored in metadata JSONB) */
  metadata?: Record<string, unknown>;
}

interface ScopeEnv {
  CHITTYOS_CORE_DATABASE_URL?: string;
}

const SOURCE = 'finance.chitty.cc';
const CREATOR = 'service:finance.chitty.cc';

/**
 * Map local workflow status strings to the canonical scope_status enum.
 *
 * scope_status: new | active | waiting | escalated | paused | resolved | closed | archived
 */
function toScopeStatus(localStatus: string): ScopeStatus {
  switch (localStatus) {
    case 'requested':
      return 'new';
    case 'approved':
    case 'in_progress':
      return 'active';
    case 'completed':
      return 'resolved';
    case 'rejected':
      return 'closed';
    case 'blocked':
      return 'waiting';
    case 'cancelled':
      return 'closed';
    default:
      return 'new';
  }
}

/**
 * Upsert a scope row in chittyos-core's public.scopes table.
 *
 * Uses the unique index on (source, external_id) for idempotent upsert.
 * On conflict (same workflow projected again), updates status + metadata.
 * The DB trigger `trg_scopes_transitions` auto-logs state changes to
 * scope_events — no manual event inserts needed.
 */
export async function projectScope(
  projection: ScopeProjection,
  env: ScopeEnv,
): Promise<void> {
  if (!env.CHITTYOS_CORE_DATABASE_URL) return;

  const sql = neon(env.CHITTYOS_CORE_DATABASE_URL);
  const status = toScopeStatus(projection.localStatus);
  const characterization = projection.characterization ?? 'Project';
  const metadata = JSON.stringify({
    tenantId: projection.tenantId,
    scopeType: projection.scopeType,
    localStatus: projection.localStatus,
    ...(projection.metadata ?? {}),
  });

  try {
    await sql`
      INSERT INTO public.scopes (
        canon_type,
        characterization,
        scope_type,
        status,
        status_reason,
        creator_id,
        current_agent_id,
        title,
        summary,
        source,
        external_id,
        metadata
      ) VALUES (
        'E',
        ${characterization}::scope_characterization,
        ${projection.scopeType},
        ${status}::scope_status,
        ${projection.statusReason ?? null},
        ${CREATOR},
        ${CREATOR},
        ${projection.title},
        ${projection.summary ?? null},
        ${SOURCE},
        ${projection.externalId},
        ${metadata}::jsonb
      )
      ON CONFLICT (source, external_id)
        WHERE external_id IS NOT NULL AND deleted_at IS NULL
      DO UPDATE SET
        status = ${status}::scope_status,
        status_reason = ${projection.statusReason ?? null},
        current_agent_id = ${CREATOR},
        title = ${projection.title},
        summary = ${projection.summary ?? null},
        metadata = ${metadata}::jsonb
    `;
  } catch (err) {
    console.warn('[scope-projector] upsert failed:', err);
  }
}

/**
 * Fire-and-forget scope projection via executionCtx.waitUntil.
 * Drop-in replacement for the old centralWorkflowLog.
 */
export function scopeLog(
  c: { executionCtx: { waitUntil(p: Promise<unknown>): void } },
  projection: ScopeProjection,
  env: ScopeEnv,
): void {
  const promise = projectScope(projection, env);
  try {
    c.executionCtx.waitUntil(promise);
  } catch {
    // Test environment / non-Workers runtime — swallow.
  }
}
