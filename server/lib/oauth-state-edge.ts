/**
 * Edge-compatible OAuth State Token Generation and Validation
 *
 * Uses Web Crypto API (crypto.subtle) instead of Node.js crypto module.
 * Protects against CSRF (random nonce), replay (timestamp), and tampering (HMAC).
 */

const STATE_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface OAuthStateData {
  userId: number | string;
  nonce: string;
  timestamp: number;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return toHex(sig);
}

export async function generateOAuthState(userId: number | string, secret: string): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = toHex(bytes.buffer);

  const data: OAuthStateData = { userId, nonce, timestamp: Date.now() };
  const payload = btoa(JSON.stringify(data));
  const signature = await hmacSign(payload, secret);

  return `${payload}.${signature}`;
}

export async function validateOAuthState(state: string, secret: string): Promise<OAuthStateData | null> {
  try {
    const [payload, signature] = state.split('.');
    if (!payload || !signature) return null;

    const expected = await hmacSign(payload, secret);
    if (signature !== expected) {
      console.error('OAuth state: Invalid signature');
      return null;
    }

    const data: OAuthStateData = JSON.parse(atob(payload));

    const age = Date.now() - data.timestamp;
    if (age > STATE_TOKEN_TTL_MS) {
      console.error(`OAuth state: Token expired (age: ${Math.round(age / 1000)}s)`);
      return null;
    }

    return data;
  } catch (error) {
    console.error('OAuth state validation error:', error);
    return null;
  }
}
