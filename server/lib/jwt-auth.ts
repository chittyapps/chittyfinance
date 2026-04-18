/**
 * ChittyAuth JWT verification.
 *
 * Verifies ES256 JWTs issued by ChittyAuth (auth.chitty.cc) using JWKS.
 * Module-level JWKS cache shared across requests within the same Worker isolate.
 *
 * @canon: chittycanon://core/services/chittyauth
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from '../env';

export interface ChittyAuthClaims {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  jti?: string;
  lvl?: number;
  tenant?: string;
  roles?: string[];
  email?: string;
}

// Module-level JWKS cache — shared across requests within the same Worker isolate.
// Recreated only when the JWKS URL changes (shouldn't happen in practice).
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let _jwksUrl: string | null = null;

function getJwks(url: string) {
  if (_jwks && _jwksUrl === url) return _jwks;
  _jwks = createRemoteJWKSet(new URL(url));
  _jwksUrl = url;
  return _jwks;
}

/**
 * Verify a ChittyAuth-issued JWT. Returns claims on success, null on failure.
 * Handles expired tokens, bad signatures, wrong issuer/audience gracefully.
 */
export async function verifyChittyAuthJWT(
  token: string,
  env: Env,
): Promise<ChittyAuthClaims | null> {
  const jwksUrl = env.CHITTY_AUTH_JWKS_URL ?? 'https://auth.chitty.cc/.well-known/jwks.json';
  const issuer = env.CHITTY_AUTH_ISSUER ?? 'https://auth.chitty.cc';
  const audience = env.CHITTY_AUTH_AUDIENCE ?? 'finance';

  try {
    const { payload } = await jwtVerify(token, getJwks(jwksUrl), {
      issuer,
      audience,
      algorithms: ['ES256'],
    });
    return payload as unknown as ChittyAuthClaims;
  } catch (err) {
    // Expected: expired/invalid tokens (JWTExpired, JWTClaimValidationFailed, JWSSignatureVerificationFailed)
    // Unexpected: network errors, JWKS fetch failures, malformed responses
    const isExpectedJoseError = err instanceof Error && (
      err.name === 'JWTExpired' ||
      err.name === 'JWTClaimValidationFailed' ||
      err.name === 'JWSSignatureVerificationFailed' ||
      err.name === 'JWTInvalid'
    );
    if (!isExpectedJoseError) {
      console.error('[jwt-auth] Unexpected verification failure:', err);
    }
    return null;
  }
}
