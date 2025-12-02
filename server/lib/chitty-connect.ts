import jwt, { JwtPayload } from "jsonwebtoken"
import jwksClient from "jwks-rsa"

const issuer = process.env.CHITTY_CONNECT_ISSUER || "https://connect.chitty.cc"
const audience = process.env.CHITTY_CONNECT_AUDIENCE || "finance"
const jwksUri = process.env.CHITTY_CONNECT_JWKS_URL || `${issuer}/.well-known/jwks.json`

const client = jwksClient({ jwksUri })

function getKey(header: any, cb: any) {
  client.getSigningKey(header.kid, function (err, key) {
    if (err) return cb(err)
    const signingKey = (key as any).getPublicKey()
    cb(null, signingKey)
  })
}

export async function verifyChittyToken(token: string): Promise<JwtPayload & { sub?: string }> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        audience,
        issuer,
        algorithms: ["RS256"],
      },
      (err, decoded) => {
        if (err || !decoded) return reject(err)
        resolve(decoded as JwtPayload)
      }
    )
  })
}

export function getServiceAuthHeader() {
  const token = process.env.CHITTY_CONNECT_SERVICE_TOKEN || process.env.CHITTYCONNECT_API_TOKEN;
  if (!token) throw new Error('Missing CHITTY_CONNECT_SERVICE_TOKEN');
  return { Authorization: `Bearer ${token}` } as const;
}
