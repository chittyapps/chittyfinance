export interface Env {
  REGISTRY: KVNamespace
}

type RegistryRecord = {
  name: string
  description: string
  version: string
  endpoints: string[]
  schema: { version: string; entities: string[]; relationships?: unknown }
  security: { authentication: string; encryption: string }
  status: string
  certifiedAt?: string
}

function json(data: unknown, init: ResponseInit = {}): Response {
  const body = JSON.stringify(data)
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' }, ...init })
}

function bad(data: unknown, status = 400): Response {
  return json(data, { status })
}

function ok(): Response { return new Response('OK', { status: 200 }) }

// Registry is read-only; Register service populates entries.

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    if (path === '/health') return ok()
    if (path === '/openapi.json') {
      return json({
        openapi: '3.0.3',
        info: { title: 'ChittyRegistry', version: '1.0.0' },
        paths: {
          '/api/v1/status': { get: { summary: 'Service status' } },
          '/api/v1/services': { get: { summary: 'List services' } }
        }
      })
    }

    if (path === '/api/v1/requirements') {
      return json({
        requiredFields: ['name','description','version','endpoints','schema','security'],
        requiredEndpoints: ['/health','/api/v1/status'],
        schema: { version: 'string', entities: 'string[]' },
        security: { authentication: 'jwt|oauth2|apikey', encryption: 'https|tls' }
      })
    }

    // No registration endpoints here; use ChittyRegister service for writes.

    if (path === '/api/v1/status' && request.method === 'GET') {
      const service = url.searchParams.get('service')
      if (!service) return bad({ message: 'service required' }, 400)
      const data = await env.REGISTRY.get(`service:${service}`)
      if (!data) return bad({ error: 'Not found' }, 404)
      return json(JSON.parse(data) as RegistryRecord)
    }

    if (path === '/api/v1/services') {
      // KV List is paginated; for now, return names of service:* keys
      const list = await env.REGISTRY.list({ prefix: 'service:' })
      const names = list.keys.map(k => k.name.replace(/^service:/, ''))
      return json({ services: names })
    }

    return new Response('Not Found', { status: 404 })
  }
}
