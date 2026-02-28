/**
 * ChittyLedger client for immutable audit trail entries.
 * 100% Cloudflare Workers compatible — no Node.js APIs, no process.env.
 * All calls are fire-and-forget via waitUntil().
 */

// ── Types ──

export interface LedgerEntry {
  entityType: 'transaction' | 'evidence' | 'custody' | 'audit';
  entityId?: string;
  action: string;
  actor?: string;
  actorType?: 'user' | 'service' | 'system';
  metadata?: Record<string, any>;
  status?: 'pending' | 'confirmed' | 'rejected';
}

export interface LedgerResponse {
  id: string;
  sequenceNumber: string;
  hash: string;
}

interface LedgerEnv {
  CHITTY_LEDGER_BASE?: string;
  CHITTY_AUTH_SERVICE_TOKEN?: string;
  CHITTYCONNECT_API_TOKEN?: string;
}

// ── Resolution ──

let _cached: { url: string; expires: number } | null = null;

export async function resolveLedgerBase(env: LedgerEnv): Promise<string> {
  if (env.CHITTY_LEDGER_BASE) return env.CHITTY_LEDGER_BASE.replace(/\/$/, '');

  if (_cached && _cached.expires > Date.now()) return _cached.url;

  try {
    const res = await fetch('https://registry.chitty.cc/services/ledger', {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = (await res.json()) as Record<string, any>;
      const url = (data?.url || data?.base || data?.endpoint || '').replace(/\/$/, '');
      if (url) {
        _cached = { url, expires: Date.now() + 60_000 };
        return url;
      }
    }
  } catch {
    // Registry unavailable — fall through to hardcoded default
  }

  return 'https://ledger.chitty.cc';
}

// ── Core ──

export async function postLedgerEntry(
  entry: LedgerEntry,
  env: LedgerEnv,
): Promise<LedgerResponse | null> {
  try {
    const base = await resolveLedgerBase(env);
    const token = env.CHITTY_AUTH_SERVICE_TOKEN || env.CHITTYCONNECT_API_TOKEN;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Source-Service': 'finance.chitty.cc',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${base}/api/entries`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...entry,
        actor: entry.actor ?? 'service:finance.chitty.cc',
        actorType: entry.actorType ?? 'service',
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.error(`[ledger-client] POST /api/entries failed: ${res.status} ${res.statusText}`);
      return null;
    }

    return (await res.json()) as LedgerResponse;
  } catch (err) {
    console.error('[ledger-client] postLedgerEntry error:', err);
    return null;
  }
}

// ── Fire-and-forget wrapper for waitUntil() ──

export async function logToLedger(entry: LedgerEntry, env: LedgerEnv): Promise<void> {
  await postLedgerEntry(entry, env);
}

/**
 * Safe wrapper: calls executionCtx.waitUntil() in CF Workers,
 * no-ops gracefully in test environments where executionCtx throws.
 */
export function ledgerLog(c: { executionCtx: { waitUntil(p: Promise<unknown>): void } }, entry: LedgerEntry, env: LedgerEnv): void {
  const promise = logToLedger(entry, env);
  try {
    c.executionCtx.waitUntil(promise);
  } catch {
    // executionCtx unavailable (test environment) — promise runs detached
  }
}
