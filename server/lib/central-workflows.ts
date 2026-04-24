/**
 * ChittyFinance scope projector — thin adapter over @chittyos/schema/scope-projector.
 *
 * Preserves the existing call signature (tenantId as top-level field)
 * while delegating to the shared fractal scope library.
 *
 * @canon: chittycanon://gov/governance#core-types
 */

import {
  createScopeProjector,
  type ScopeCharacterization,
  type ScopeEnv,
  type ScopeStatus,
  SCOPE_TYPES,
} from '@chittyos/schema/scope-projector';

// Re-export shared types for downstream convenience
export { SCOPE_TYPES, type ScopeStatus, type ScopeCharacterization, type ScopeEnv };

export interface ScopeProjection {
  externalId: string;
  tenantId: string;
  scopeType: string;
  characterization?: ScopeCharacterization;
  title: string;
  summary?: string | null;
  localStatus: string;
  statusReason?: string;
  metadata?: Record<string, unknown>;
}

const financeProjector = createScopeProjector('finance.chitty.cc', {
  characterization: 'Project',
});

/**
 * Fire-and-forget scope projection — drop-in compatible with existing callers.
 * Injects tenantId into metadata (the shared library doesn't assume multi-tenancy).
 */
export function scopeLog(
  c: { executionCtx: { waitUntil(p: Promise<unknown>): void } },
  projection: ScopeProjection,
  env: ScopeEnv,
): void {
  financeProjector(c, env, {
    externalId: projection.externalId,
    scopeType: projection.scopeType,
    characterization: projection.characterization,
    title: projection.title,
    summary: projection.summary,
    localStatus: projection.localStatus,
    statusReason: projection.statusReason,
    metadata: {
      tenantId: projection.tenantId,
      ...(projection.metadata ?? {}),
    },
  });
}
