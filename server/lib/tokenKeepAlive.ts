import { storage } from '../storage';
import { refreshMercuryTokens } from './chittyConnect';

function minutesToMs(m: number) { return Math.max(1, Math.floor(m)) * 60_000; }

export function startChittyConnectKeepAlive() {
  const base = process.env.CHITTYCONNECT_API_BASE || process.env.CHITTY_CONNECT_URL;
  const hasAuth = !!(process.env.CHITTYCONNECT_API_TOKEN || process.env.CHITTY_AUTH_SERVICE_TOKEN);
  if (!base || !hasAuth) {
    return undefined;
  }

  const intervalMin = Number(process.env.CHITTYCONNECT_KEEPALIVE_MINUTES || 50);

  const tick = async () => {
    try {
      const mercs = await storage.listIntegrationsByService('mercury_bank');
      const seen = new Set<string>();
      for (const integ of mercs) {
        const creds: any = integ.credentials || {};
        const tenantId: string | undefined = creds.tenantId;
        const selected: string[] | undefined = creds.selectedAccountIds;
        if (!selected || selected.length === 0) continue;
        const key = `${integ.userId}:${tenantId || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          await refreshMercuryTokens({ userId: integ.userId, tenantId });
        } catch (e) {
          console.warn('KeepAlive refresh error:', (e as Error).message);
        }
      }
    } catch (e) {
      console.warn('KeepAlive tick error:', (e as Error).message);
    }
  };

  // initial attempt shortly after boot
  setTimeout(() => { void tick(); }, 5_000);
  // schedule periodic keep-alive
  const timer = setInterval(() => { void tick(); }, minutesToMs(intervalMin));
  return timer;
}

