let cache = new Map<string, { url: string; expires: number }>();

function ttl(ms = 60_000) {
  return Date.now() + ms;
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`Registry request failed: ${res.status}`);
  return res.json();
}

export async function getServiceBase(name: 'evidence' | 'ledger' | 'chronicle' | 'logic'): Promise<string> {
  const key = `svc:${name}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.url;
  const base = process.env.CHITTY_REGISTRY_BASE || 'https://registry.chitty.cc';
  const data = await fetchJson(`${base.replace(/\/$/, '')}/services/${name}`);
  const url: string = data?.url || data?.base || data?.endpoint;
  if (!url) throw new Error(`Service base not found for ${name}`);
  cache.set(key, { url, expires: ttl() });
  return url;
}

export function clearRegistryCache() {
  cache.clear();
}

