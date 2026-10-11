import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const mercuryRoutes = new Hono<HonoEnv>();

function connectHeaders(env: { CHITTYCONNECT_API_BASE?: string; CHITTY_AUTH_SERVICE_TOKEN: string }) {
  const token = env.CHITTY_AUTH_SERVICE_TOKEN;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Mercury staging MUST NOT route into ChittyConnect production. Removing the
 * staging var alone is insufficient because the legacy default is production.
 * Fail closed before reading any provider records or touching Finance storage.
 */
export function mercuryConnectBase(env: { CHITTYCONNECT_API_BASE?: string; NODE_ENV?: string }): string | null {
  const configured = env.CHITTYCONNECT_API_BASE?.trim();
  if (env.NODE_ENV === 'staging') {
    if (!configured) return null;
    try {
      const url = new URL(configured);
      if (url.protocol !== 'https:' || url.hostname === 'connect.chitty.cc' ||
          !url.hostname.includes('staging')) return null;
    } catch { return null; }
    return configured;
  }
  return configured || 'https://connect.chitty.cc/api';
}

// GET /api/mercury/accounts — list Mercury accounts via ChittyConnect
mercuryRoutes.get('/api/mercury/accounts', async (c) => {
  const tenantId = c.get('tenantId');
  const base = mercuryConnectBase(c.env);
  if (!base) return c.json({ error: 'MERCURY_STAGING_PROVIDER_ISOLATION_REQUIRED' }, 503);
  const headers = connectHeaders(c.env);

  const qs = new URLSearchParams();
  if (tenantId) qs.set('tenant', tenantId);

  const res = await fetch(`${base}/mercury/accounts?${qs}`, { headers });
  if (!res.ok) {
    return c.json({ error: `ChittyConnect error: ${res.status}` }, 502);
  }

  const accounts = await res.json();
  return c.json(accounts);
});

// POST /api/mercury/select-accounts — select which Mercury accounts to sync
mercuryRoutes.post('/api/mercury/select-accounts', async (c) => {
  if (!mercuryConnectBase(c.env)) {
    return c.json({ error: 'MERCURY_STAGING_PROVIDER_ISOLATION_REQUIRED' }, 503);
  }
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const body = await c.req.json();

  const { accountIds } = body;
  if (!Array.isArray(accountIds) || accountIds.length === 0) {
    return c.json({ error: 'accountIds must be a non-empty array' }, 400);
  }

  // Find or create mercury integration
  const integrations = await storage.getIntegrations(tenantId);
  let merc = integrations.find((i) => i.serviceType === 'mercury_bank');

  if (!merc) {
    merc = await storage.createIntegration({
      tenantId,
      serviceType: 'mercury_bank',
      name: 'Mercury Bank',
      connected: true,
      credentials: { selectedAccountIds: accountIds },
      lastSynced: new Date(),
    });
  } else {
    merc = await storage.updateIntegration(merc.id, {
      credentials: { ...(merc.credentials as Record<string, unknown> || {}), selectedAccountIds: accountIds },
      lastSynced: new Date(),
    });
  }

  return c.json(merc);
});
