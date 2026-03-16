import * as jose from "jose";

const issuer = process.env.CHITTY_CONNECT_ISSUER || "https://connect.chitty.cc";
const audience = process.env.CHITTY_CONNECT_AUDIENCE || "finance";
const jwksUri = process.env.CHITTY_CONNECT_JWKS_URL || `${issuer}/.well-known/jwks.json`;

const JWKS = jose.createRemoteJWKSet(new URL(jwksUri));

export async function verifyChittyToken(token: string): Promise<jose.JWTPayload & { sub?: string }> {
  const { payload } = await jose.jwtVerify(token, JWKS, {
    issuer,
    audience,
    algorithms: ["RS256"],
  });
  return payload;
}

export function getServiceAuthHeader() {
  const token = process.env.CHITTY_CONNECT_SERVICE_TOKEN || process.env.CHITTYCONNECT_API_TOKEN;
  if (!token) throw new Error('Missing CHITTY_CONNECT_SERVICE_TOKEN');
  return { Authorization: `Bearer ${token}` } as const;
}
