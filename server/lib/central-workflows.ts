/**
 * Central workflow/progress projector.
 *
 * Mirrors local workflow lifecycle events into the central, claimable
 * context/progress system when configured. This is intentionally
 * fire-and-forget so local app flows remain authoritative and responsive.
 */

interface CentralWorkflowEnv {
  CHITTY_CONTEXT_BASE?: string;
  CHITTY_CONTEXT_TOKEN?: string;
  CHITTY_AUTH_SERVICE_TOKEN?: string;
}

export interface CentralWorkflowProjection {
  aggregateId: string;
  tenantId: string;
  workflowType: string;
  title: string;
  status: string;
  description?: string | null;
  claimable?: boolean;
  lane?: 'approvals' | 'exceptions' | 'delegation' | 'close' | 'progress';
  progressState?: 'queued' | 'ready' | 'active' | 'blocked' | 'completed';
  parentRef?: string;
  metadata?: Record<string, unknown>;
}

function resolveContextBase(env: CentralWorkflowEnv): string {
  return (env.CHITTY_CONTEXT_BASE || 'https://context.chitty.cc').replace(/\/$/, '');
}

function defaultClaimable(status: string): boolean {
  return ['requested', 'approved', 'in_progress', 'ready', 'open', 'blocked'].includes(status);
}

function defaultProgressState(status: string): CentralWorkflowProjection['progressState'] {
  switch (status) {
    case 'requested':
      return 'ready';
    case 'approved':
    case 'in_progress':
      return 'active';
    case 'completed':
      return 'completed';
    case 'rejected':
      return 'blocked';
    default:
      return 'queued';
  }
}

export async function postCentralWorkflowProjection(
  projection: CentralWorkflowProjection,
  env: CentralWorkflowEnv,
): Promise<void> {
  const token = env.CHITTY_CONTEXT_TOKEN || env.CHITTY_AUTH_SERVICE_TOKEN;
  if (!token) return;

  const now = new Date().toISOString();
  const base = resolveContextBase(env);
  const body = {
    event_type: 'workflow.projected',
    source_system: 'chittyfinance',
    idempotency_key: `workflow:${projection.aggregateId}:${projection.status}`,
    occurred_at: now,
    actor_chitty_id: 'service:finance.chitty.cc',
    payload: {
      aggregateType: 'workflow',
      aggregateId: projection.aggregateId,
      tenantId: projection.tenantId,
      title: projection.title,
      description: projection.description ?? null,
      workflowType: projection.workflowType,
      status: projection.status,
      claimable: projection.claimable ?? defaultClaimable(projection.status),
      lane: projection.lane ?? 'progress',
      progressState: projection.progressState ?? defaultProgressState(projection.status),
      parentRef: projection.parentRef ?? `tenant:${projection.tenantId}`,
      fractalKey: `${projection.tenantId}:${projection.workflowType}:${projection.aggregateId}`,
      metadata: projection.metadata ?? {},
    },
  };

  try {
    const res = await fetch(`${base}/v1/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Source-Service': 'finance.chitty.cc',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.warn(`[central-workflows] POST /v1/events returned ${res.status}`);
    }
  } catch (err) {
    console.warn('[central-workflows] projection failed:', err);
  }
}

export function centralWorkflowLog(
  c: { executionCtx: { waitUntil(p: Promise<unknown>): void } },
  projection: CentralWorkflowProjection,
  env: CentralWorkflowEnv,
): void {
  const promise = postCentralWorkflowProjection(projection, env);
  try {
    c.executionCtx.waitUntil(promise);
  } catch {
    // Test environment / non-Workers runtime.
  }
}
