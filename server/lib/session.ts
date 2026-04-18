/** Session configuration shared between auth middleware and session routes. */
export const SESSION_COOKIE_NAME = 'cf_session';
export const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

/** JWT cookie prefix — distinguishes JWT sessions from KV session IDs */
export const JWT_COOKIE_PREFIX = 'jwt:';

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

/** Check if a cookie value is a JWT session (vs a KV session ID) */
export function isJwtSession(cookieValue: string): boolean {
  return cookieValue.startsWith(JWT_COOKIE_PREFIX);
}

/** Extract the raw JWT from a jwt:-prefixed cookie value */
export function extractJwtFromCookie(cookieValue: string): string {
  return cookieValue.slice(JWT_COOKIE_PREFIX.length);
}
