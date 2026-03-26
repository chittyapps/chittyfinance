/**
 * Secure OAuth State Token Generation and Validation
 *
 * Protects against:
 * - CSRF attacks (random nonce)
 * - Replay attacks (timestamp expiration)
 * - Tampering (HMAC signature, timing-safe comparison)
 *
 * Legacy Node.js version — used only in standalone dev mode.
 * Production uses oauth-state-edge.ts (Web Crypto API).
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const STATE_TOKEN_SECRET = process.env.OAUTH_STATE_SECRET;
const STATE_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface OAuthStateData {
  userId: number | string;
  nonce: string;
  timestamp: number;
}

/**
 * Generate secure OAuth state token
 */
export function generateOAuthState(userId: number | string): string {
  if (!STATE_TOKEN_SECRET) {
    throw new Error('OAUTH_STATE_SECRET is required for OAuth flows');
  }
  const data: OAuthStateData = {
    userId,
    nonce: randomBytes(16).toString('hex'),
    timestamp: Date.now(),
  };

  const payload = Buffer.from(JSON.stringify(data)).toString('base64');
  const signature = createHmac('sha256', STATE_TOKEN_SECRET)
    .update(payload)
    .digest('hex');

  return `${payload}.${signature}`;
}

/**
 * Validate and parse OAuth state token
 */
export function validateOAuthState(state: string): OAuthStateData | null {
  if (!STATE_TOKEN_SECRET) {
    console.error('OAUTH_STATE_SECRET is required for OAuth validation');
    return null;
  }
  try {
    const [payload, signature] = state.split('.');

    if (!payload || !signature) {
      console.error('OAuth state: Invalid format (missing payload or signature)');
      return null;
    }

    // Verify signature
    const expectedSignature = createHmac('sha256', STATE_TOKEN_SECRET)
      .update(payload)
      .digest('hex');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      console.error('OAuth state: Invalid signature (possible tampering)');
      return null;
    }

    // Parse data
    const data: OAuthStateData = JSON.parse(Buffer.from(payload, 'base64').toString());

    // Check timestamp (prevent replay attacks)
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
