export interface CloudflareProxyEnv {
  CHITTYAGENT_API_BASE?: string;
  CHITTYAGENT_API_TOKEN?: string;
  CHITTY_AUTH_SERVICE_TOKEN?: string;
}

export interface CloudflareProxyRequest {
  operation: string;
  action: string;
  payload?: Record<string, unknown>;
  intent?: string;
  rollbackNotes?: string;
}

const ALLOWED_OPERATIONS = new Set(['workers', 'pages', 'r2', 'd1', 'kv', 'dns']);

function normalizeBase(base?: string): string {
  return (base || 'https://agent.chitty.cc').replace(/\/$/, '');
}

export function getCloudflareProxyCapabilities(env: CloudflareProxyEnv) {
  return {
    enabled: Boolean(env.CHITTYAGENT_API_TOKEN || env.CHITTY_AUTH_SERVICE_TOKEN),
    endpoint: `${normalizeBase(env.CHITTYAGENT_API_BASE)}/api/cloudflare`,
    operations: Array.from(ALLOWED_OPERATIONS),
    actions: ['query', 'configure', 'deploy'],
    checks: {
      hasBaseUrl: Boolean(normalizeBase(env.CHITTYAGENT_API_BASE)),
      hasAuthToken: Boolean(env.CHITTYAGENT_API_TOKEN || env.CHITTY_AUTH_SERVICE_TOKEN),
    },
  };
}

export async function invokeCloudflareProxy(
  env: CloudflareProxyEnv,
  request: CloudflareProxyRequest,
) {
  const token = env.CHITTYAGENT_API_TOKEN || env.CHITTY_AUTH_SERVICE_TOKEN;
  if (!token) {
    throw new Error('Cloudflare proxy token missing (CHITTYAGENT_API_TOKEN or CHITTY_AUTH_SERVICE_TOKEN).');
  }
  if (!request.operation || !ALLOWED_OPERATIONS.has(request.operation)) {
    throw new Error(`Unsupported operation "${request.operation}". Allowed: ${Array.from(ALLOWED_OPERATIONS).join(', ')}`);
  }
  if (!request.action) {
    throw new Error('action is required');
  }
  if (!request.intent) {
    throw new Error('intent is required for auditability');
  }
  if (!request.rollbackNotes) {
    throw new Error('rollbackNotes is required');
  }

  const endpoint = `${normalizeBase(env.CHITTYAGENT_API_BASE)}/api/cloudflare`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      operation: request.operation,
      action: request.action,
      payload: request.payload || {},
      intent: request.intent,
      rollbackNotes: request.rollbackNotes,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }

  return {
    ok: response.ok,
    status: response.status,
    data: body,
  };
}
