const BASE = process.env.DOORLOOP_BASE_URL || "https://api.doorloop.com/v1";

function auth() {
  const key = process.env.DOORLOOP_API_KEY;
  if (!key) {
    throw new Error("DOORLOOP_API_KEY not set");
  }
  return {
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  };
}

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`, auth() as any);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DoorLoop GET ${path} → ${res.status} ${text}`);
  }
  return res.json();
}

export const DoorLoop = {
  properties() {
    return get("/properties");
  },
  leases() {
    return get("/leases");
  },
  payments() {
    return get("/payments");
  },
  ledger(leaseId: string) {
    return get(`/leases/${leaseId}/ledger`);
  },
};
