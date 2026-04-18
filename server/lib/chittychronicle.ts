/**
 * ChittyChronicle fire-and-forget audit logger.
 *
 * Posts classification/COA events to chronicle.chitty.cc for immutable audit.
 * Workers-native — takes `env` not `process.env`. Never blocks the caller;
 * errors are logged and swallowed (chronicle.chitty.cc API returns 404 for
 * now — routes not yet deployed; this client is ready when they are).
 */

const CHRONICLE_BASE = 'https://chronicle.chitty.cc';
const TIMEOUT_MS = 3000;

export interface ChronicleEvent {
  eventType: string; // 'classification.classify', 'classification.reconcile', 'coa.create', etc.
  entityId: string; // transaction or COA account ID
  entityType: string; // 'transaction', 'chart_of_accounts'
  action: string; // 'classify', 'reconcile', 'create', 'update', 'unreconcile'
  actor?: {
    id: string;
    type: 'user' | 'agent' | 'system';
  };
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Post an event to ChittyChronicle. Fire-and-forget — never throws,
 * never blocks. Returns true if the post succeeded (2xx), false otherwise.
 */
export async function logToChronicle(
  env: { CHITTY_AUTH_SERVICE_TOKEN?: string },
  event: ChronicleEvent,
): Promise<boolean> {
  try {
    const body = {
      ...event,
      source: 'chittyfinance',
      timestamp: new Date().toISOString(),
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (env.CHITTY_AUTH_SERVICE_TOKEN) {
      headers['Authorization'] = `Bearer ${env.CHITTY_AUTH_SERVICE_TOKEN}`;
    }

    const response = await fetch(`${CHRONICLE_BASE}/api/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      // Expected 404 until Chronicle deploys its event ingestion routes
      if (response.status !== 404) {
        console.warn(`[chittychronicle] POST /api/events returned ${response.status}`);
      }
      return false;
    }

    return true;
  } catch (err) {
    console.warn('[chittychronicle] logToChronicle failed:', (err as Error).message);
    return false;
  }
}

/**
 * Convenience: log a classification event (classify, reconcile, unreconcile).
 */
export function logClassificationEvent(
  env: { CHITTY_AUTH_SERVICE_TOKEN?: string },
  params: {
    transactionId: string;
    tenantId: string;
    action: string; // classify, reclassify, reconcile, unreconcile, suggest
    coaCode: string;
    actorId: string;
    actorType: 'user' | 'agent' | 'system';
    previousCoaCode?: string | null;
    confidence?: string | null;
  },
): Promise<boolean> {
  return logToChronicle(env, {
    eventType: `classification.${params.action}`,
    entityId: params.transactionId,
    entityType: 'transaction',
    action: params.action,
    actor: { id: params.actorId, type: params.actorType },
    before: params.previousCoaCode ? { coaCode: params.previousCoaCode } : undefined,
    after: { coaCode: params.coaCode, confidence: params.confidence },
    metadata: { tenantId: params.tenantId },
  });
}

/**
 * Convenience: log a COA mutation event (create, update, deactivate).
 */
export function logCoaEvent(
  env: { CHITTY_AUTH_SERVICE_TOKEN?: string },
  params: {
    accountId: string;
    tenantId: string;
    action: 'create' | 'update' | 'deactivate' | 'activate';
    code: string;
    actorId: string;
    changes?: Record<string, unknown>;
  },
): Promise<boolean> {
  return logToChronicle(env, {
    eventType: `coa.${params.action}`,
    entityId: params.accountId,
    entityType: 'chart_of_accounts',
    action: params.action,
    actor: { id: params.actorId, type: 'user' },
    after: { code: params.code, changes: params.changes },
    metadata: { tenantId: params.tenantId },
  });
}
