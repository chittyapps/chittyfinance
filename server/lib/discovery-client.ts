/**
 * ChittyDiscovery client — self-registration and heartbeat.
 * Fire-and-forget via waitUntil(), same pattern as ledger-client.
 */

interface DiscoveryEnv {
  CHITTY_AUTH_SERVICE_TOKEN?: string;
  CHITTYCONNECT_API_TOKEN?: string;
  CHITTYCONNECT_SERVICE_TOKEN?: string;
}

const DISCOVERY_BASE = 'https://discovery.chitty.cc';
const CHITTY_ID = 'did:chitty:REG-XE6835';

function getToken(env: DiscoveryEnv): string | undefined {
  return env.CHITTYCONNECT_SERVICE_TOKEN
    || env.CHITTY_AUTH_SERVICE_TOKEN
    || env.CHITTYCONNECT_API_TOKEN;
}

export async function registerWithDiscovery(env: DiscoveryEnv): Promise<boolean> {
  const token = getToken(env);
  if (!token) {
    console.warn('[discovery-client] No service token available — skipping registration');
    return false;
  }

  try {
    const res = await fetch(`${DISCOVERY_BASE}/api/v1/services`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        service_name: 'chittyfinance',
        service_type: 'worker',
        chitty_id: CHITTY_ID,
        endpoint: 'https://finance.chitty.cc',
        version: '2.0.0',
        health_check_url: 'https://finance.chitty.cc/health',
        discovery_method: 'self_register',
        metadata: {
          tier: 5,
          domain: 'application',
          description: 'Financial management platform for ChittyOS ecosystem',
          capabilities: [
            'multi-tenant-accounting',
            'tax-reporting',
            'inter-company-allocations',
            'transaction-export',
            'property-management',
            'valuation',
          ],
        },
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.error(`[discovery-client] Registration failed: ${res.status} ${res.statusText}`);
      return false;
    }

    console.log('[discovery-client] Registered with ChittyDiscovery');
    return true;
  } catch (err) {
    console.error('[discovery-client] Registration error:', err);
    return false;
  }
}

export async function sendHeartbeat(env: DiscoveryEnv): Promise<boolean> {
  const token = getToken(env);
  if (!token) return false;

  try {
    const res = await fetch(`${DISCOVERY_BASE}/api/v1/services/${CHITTY_ID}/heartbeat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(3000),
    });

    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fire-and-forget registration via waitUntil().
 */
export function discoveryRegister(
  ctx: { waitUntil(p: Promise<unknown>): void },
  env: DiscoveryEnv,
): void {
  try {
    ctx.waitUntil(registerWithDiscovery(env));
  } catch {
    // executionCtx unavailable (test environment)
  }
}

/**
 * Fire-and-forget heartbeat via waitUntil().
 */
export function discoveryHeartbeat(
  ctx: { waitUntil(p: Promise<unknown>): void },
  env: DiscoveryEnv,
): void {
  try {
    ctx.waitUntil(sendHeartbeat(env));
  } catch {
    // executionCtx unavailable (test environment)
  }
}
