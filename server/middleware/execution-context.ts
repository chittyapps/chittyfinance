import type { Context, MiddlewareHandler } from 'hono';
import type { HonoEnv } from '../env';

export type ExecutionIntent = 'read' | 'suggest' | 'preview' | 'execute';

export interface FinanceExecutionContext {
  actor: {
    userId: string;
    authMethod: 'service' | 'chittyauth' | 'session';
  };
  source: {
    service: string;
    claimed: true;
    channel?: string;
    workspace?: string;
    session?: string;
  };
  scope: {
    tenantId: string;
  };
  capability: string;
  intent: ExecutionIntent;
  trace: {
    requestId: string;
    traceparent?: string;
  };
}

const MAX_BAGGAGE_BYTES = 8192;
const MAX_PROVENANCE_VALUE = 128;
const TRACEPARENT_RE = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;
const PRINTABLE_RE = /^[\x20-\x7E]+$/;

function sanitizeValue(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_PROVENANCE_VALUE || !PRINTABLE_RE.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function sanitizeTraceparent(value?: string | null): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  return TRACEPARENT_RE.test(normalized) ? normalized : undefined;
}

function parseBaggage(raw?: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!raw || new TextEncoder().encode(raw).byteLength > MAX_BAGGAGE_BYTES) return result;

  for (const member of raw.split(',')) {
    const pair = member.trim().split(';', 1)[0];
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;

    const key = pair.slice(0, separator).trim();
    const encodedValue = pair.slice(separator + 1).trim();
    if (!key || !encodedValue) continue;

    let decoded = encodedValue;
    try {
      decoded = decodeURIComponent(encodedValue);
    } catch {
      continue;
    }

    const safe = sanitizeValue(decoded);
    if (safe) result.set(key, safe);
  }

  return result;
}

function normalizePath(pathname: string): string {
  return pathname
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:id');
}

function hasPathSegment(pathname: string, segment: string): boolean {
  return pathname.split('/').filter(Boolean).includes(segment);
}

export function inferExecutionIntent(method: string, pathname: string): ExecutionIntent {
  const upper = method.toUpperCase();
  if (upper === 'GET' || upper === 'HEAD' || upper === 'OPTIONS') return 'read';
  if (hasPathSegment(pathname, 'preview')) return 'preview';
  if (hasPathSegment(pathname, 'suggest') || hasPathSegment(pathname, 'advice')) return 'suggest';
  return 'execute';
}

function defaultCapability(method: string, pathname: string): string {
  return `finance.http.${method.toLowerCase()}:${normalizePath(pathname)}`;
}

/**
 * Build channel-neutral execution provenance after actor + tenant authorization.
 *
 * Source/channel/workspace/session values are caller claims used for provenance only.
 * Authorization never depends on them.
 */
export const executionContextMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const baggage = parseBaggage(c.req.header('baggage'));
  const sourceService =
    sanitizeValue(c.req.header('x-source-service')) ??
    baggage.get('chitty.source') ??
    'finance.chitty.cc';
  const pathname = c.req.path;
  const traceparent = sanitizeTraceparent(c.req.header('traceparent'));

  const context: FinanceExecutionContext = {
    actor: {
      userId: c.get('userId'),
      authMethod: c.get('authMethod'),
    },
    source: {
      service: sourceService,
      claimed: true,
      channel: baggage.get('chitty.channel') || undefined,
      workspace: baggage.get('chitty.workspace') || undefined,
      session: baggage.get('chitty.session') || undefined,
    },
    scope: {
      tenantId: c.get('tenantId'),
    },
    capability: defaultCapability(c.req.method, pathname),
    intent: inferExecutionIntent(c.req.method, pathname),
    trace: {
      requestId: crypto.randomUUID(),
      traceparent,
    },
  };

  c.set('executionContext', context);
  await next();
};

export function setExecutionOperation(
  c: Context<HonoEnv>,
  capability: string,
  intent: ExecutionIntent,
): FinanceExecutionContext {
  const current = c.get('executionContext');
  const updated = { ...current, capability: sanitizeValue(capability) ?? 'finance.unknown', intent };
  c.set('executionContext', updated);
  return updated;
}
