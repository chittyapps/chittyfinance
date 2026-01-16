import type { Request, Response, NextFunction } from "express"
import { verifyChittyToken } from "../lib/chitty-connect"

export async function chittyConnectAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = req.header("authorization") || ""
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
    if (!token) return res.status(401).json({ error: "missing_token" })
    const payload = await verifyChittyToken(token)
    ;(req as any).auth = payload
    next()
  } catch (e) {
    res.status(401).json({ error: "invalid_token" })
  }
}

// For service-to-service calls from the Worker
export function serviceAuth(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.CHITTY_CONNECT_SERVICE_TOKEN
  const auth = req.header("authorization") || ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
  if (!expected || token !== expected) return res.status(401).json({ error: "unauthorized_service" })
  next()
}

