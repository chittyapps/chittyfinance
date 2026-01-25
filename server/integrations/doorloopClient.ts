// server/integrations/doorloopClient.ts

const BASE = "https://app.doorloop.com/api";

// Generic fetch helper
export async function dlFetch(path: string, apiKey: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `bearer ${apiKey}`,
      accept: "application/json",
    },
  });

  const text = await res.text();
  const trimmed = text.trim();

  // Error responses
  if (!res.ok) {
    throw new Error(`DoorLoop error ${res.status}: ${trimmed}`);
  }

  // If HTML is returned instead of JSON
  if (trimmed.startsWith("<")) {
    // Payments endpoint frequently returns HTML for non-premium accounts
    if (path.startsWith("/payments")) {
      return { data: [], html: trimmed };
    }
    throw new Error("DoorLoop returned HTML instead of JSON.");
  }

  // Parse JSON content
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(`Invalid JSON from DoorLoop: ${trimmed.slice(0, 200)}`);
  }
}

// -----------------------------
// API Wrapper Methods
// -----------------------------

export async function listProperties(apiKey: string) {
  return dlFetch("/properties?limit=200&offset=0", apiKey);
}

export async function listLeases(apiKey: string) {
  return dlFetch("/leases?limit=200&offset=0", apiKey);
}

export async function listPayments(apiKey: string) {
  // Payments endpoint: HTML fallback is handled by dlFetch
  return dlFetch("/payments?limit=200&offset=0", apiKey);
}
