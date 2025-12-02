/**
 * Secure OAuth State Token Generation and Validation
 *
 * Protects against:
 * - CSRF attacks (random nonce)
 * - Replay attacks (timestamp expiration)
 * - Tampering (HMAC signature)
 */

import { createHmac, randomBytes } from 'crypto';

const STATE_TOKEN_SECRET = process.env.OAUTH_STATE_SECRET || 'default-secret-change-in-production';
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

    if (signature !== expectedSignature) {
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
