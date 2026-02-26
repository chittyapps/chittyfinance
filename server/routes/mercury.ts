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

function connectBase(env: { CHITTYCONNECT_API_BASE?: string }) {
  return env.CHITTYCONNECT_API_BASE || 'https://connect.chitty.cc/api';
}

// GET /api/mercury/accounts — list Mercury accounts via ChittyConnect
mercuryRoutes.get('/api/mercury/accounts', async (c) => {
  const tenantId = c.get('tenantId');
  const base = connectBase(c.env);
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
