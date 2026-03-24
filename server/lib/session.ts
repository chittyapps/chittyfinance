/** Session configuration shared between auth middleware and session routes. */
export const SESSION_COOKIE_NAME = 'cf_session';
export const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

export interface SessionData {
  userId: string;
}

/** Safely parse session JSON from KV. Returns null on invalid data. */
export function parseSession(raw: string): SessionData | null {
  try {
    const data = JSON.parse(raw);
    if (typeof data?.userId === 'string') return data as SessionData;
    return null;
  } catch {
    return null;
  }
}
