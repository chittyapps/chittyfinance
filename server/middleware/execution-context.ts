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

function parseBaggage(raw?: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!raw) return result;

  for (const member of raw.split(',')) {
    const pair = member.trim().split(';', 1)[0];
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;

    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (!key || !value) continue;

    try {
      result.set(key, decodeURIComponent(value));
    } catch {
      result.set(key, value);
    }
  }

  return result;
}

function normalizePath(pathname: string): string {
  return pathname
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:id');
}

export function inferExecutionIntent(method: string, pathname: string): ExecutionIntent {
  const upper = method.toUpperCase();
  if (upper === 'GET' || upper === 'HEAD' || upper === 'OPTIONS') return 'read';
  if (pathname.includes('/preview')) return 'preview';
  if (pathname.includes('/suggest') || pathname.includes('/advice')) return 'suggest';
  return 'execute';
}

function defaultCapability(method: string, pathname: string): string {
  return `finance.http.${method.toLowerCase()}:${normalizePath(pathname)}`;
}

/**
 * Build channel-neutral execution provenance after actor + tenant authorization.
 *
 * Authorization never depends on source/channel/workspace/session metadata.
 * X-Source-Service and W3C baggage are provenance only.
 */
export const executionContextMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const baggage = parseBaggage(c.req.header('baggage'));
  const sourceService =
    c.req.header('x-source-service') ??
    baggage.get('chitty.source') ??
    'finance.chitty.cc';

  const context: FinanceExecutionContext = {
    actor: {
      userId: c.get('userId'),
      authMethod: c.get('authMethod'),
    },
    source: {
      service: sourceService,
      channel: baggage.get('chitty.channel') || undefined,
      workspace: baggage.get('chitty.workspace') || undefined,
      session: baggage.get('chitty.session') || undefined,
    },
    scope: {
      tenantId: c.get('tenantId'),
    },
    capability: defaultCapability(c.req.method, new URL(c.req.url).pathname),
    intent: inferExecutionIntent(c.req.method, new URL(c.req.url).pathname),
    trace: {
      requestId: crypto.randomUUID(),
      traceparent: c.req.header('traceparent') || undefined,
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
  const updated = { ...current, capability, intent };
  c.set('executionContext', updated);
  return updated;
}

export function executionAuditMetadata(c: { get(name: 'executionContext'): FinanceExecutionContext }) {
  const execution = c.get('executionContext');
  return execution ? { execution } : {};
}
