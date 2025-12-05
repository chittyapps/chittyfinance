// Use global fetch (Node 18+). No runtime dependency required.

type ListAccountsParams = {
  userId?: number;
  tenantId?: string | undefined;
};

type SummaryParams = {
  userId?: number;
  tenantId?: string | undefined;
  accountIds: string[];
};

export type MercuryAccount = {
  id: string;
  name: string;
  last4?: string;
  type?: string;
  currency?: string;
};

export type MercuryTransaction = {
  id: string;
  amount: number;
  description?: string;
  type: 'income' | 'expense';
  date: string;
};

export type MercurySummary = {
  cashOnHand?: number;
  transactions?: MercuryTransaction[];
};

function getBase() {
  return process.env.CHITTYCONNECT_API_BASE || 'https://connect.chitty.cc/api';
}

function getAuthHeader(): Record<string, string> {
  const token = process.env.CHITTYCONNECT_API_TOKEN || process.env.CHITTY_AUTH_SERVICE_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {} as Record<string, string>;
}

export async function listMercuryAccounts({ userId, tenantId }: ListAccountsParams): Promise<MercuryAccount[]> {
  const qs = new URLSearchParams();
  if (userId) qs.set('userId', String(userId));
  if (tenantId) qs.set('tenant', String(tenantId));
  const url = `${getBase()}/mercury/accounts?${qs.toString()}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...getAuthHeader() };
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`ChittyConnect list accounts failed: ${res.status}`);
  return (await res.json()) as MercuryAccount[];
}

export async function getMercurySummary({ userId, tenantId, accountIds }: SummaryParams): Promise<MercurySummary> {
  const url = `${getBase()}/mercury/summary`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...getAuthHeader() };
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ userId, tenant: tenantId, accountIds }),
  });
  if (!res.ok) throw new Error(`ChittyConnect summary failed: ${res.status}`);
  return (await res.json()) as MercurySummary;
}

export async function refreshMercuryTokens({ userId, tenantId }: { userId?: number; tenantId?: string }) {
  const url = `${getBase()}/mercury/refresh`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...getAuthHeader() };
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ userId, tenant: tenantId }),
  });
  // Consider 200-299 a success; 404/501 means endpoint not implemented — ignore silently
  if (res.ok) return true;
  if (res.status === 404 || res.status === 501) return false;
  throw new Error(`ChittyConnect refresh failed: ${res.status}`);
}
