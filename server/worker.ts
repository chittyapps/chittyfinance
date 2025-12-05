export interface Env {
  MODE?: string
  NODE_ENV?: string
  APP_VERSION?: string
  DATABASE_URL?: string
  CHITTYCONNECT_API_BASE?: string
  CHITTYCONNECT_API_TOKEN?: string
  CHITTY_AUTH_SERVICE_TOKEN?: string
  API_ORIGIN?: string
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  CF_AGENT: DurableObjectNamespace
}

function json(data: unknown, init: ResponseInit = {}): Response {
  const body = JSON.stringify(data);
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' }, ...init });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Cloudflare Agent entrypoint — forward to Durable Object agent
    if (path === '/agent' || path.startsWith('/agent/')) {
      const name = new URL(request.url).searchParams.get('id') || 'default';
      const id = env.CF_AGENT.idFromName(name);
      const stub = env.CF_AGENT.get(id);
      return stub.fetch(request);
    }

    if (path === '/health') {
      return json({ status: 'ok' });
    }

    if (path === '/api/v1/status') {
      const version = env.APP_VERSION || '1.0.0';
      const MODE = env.MODE || 'system';
      const nodeEnv = env.NODE_ENV || 'production';
      const dbConfigured = MODE === 'standalone' ? true : Boolean(env.DATABASE_URL);
      const chittyConfigured = Boolean((env.CHITTYCONNECT_API_BASE || '') && (env.CHITTYCONNECT_API_TOKEN || env.CHITTY_AUTH_SERVICE_TOKEN));
      return json({
        name: 'ChittyFinance',
        version,
        uptimeSec: Math.floor((Date.now() - performance.timeOrigin) / 1000),
        mode: MODE,
        nodeEnv,
        database: { configured: dbConfigured },
        chittyConnect: { configured: chittyConfigured },
        latencyMs: 0,
      });
    }

    if (path === '/api/v1/documentation') {
      const version = env.APP_VERSION || '1.0.0';
      return json({
        openapi: '3.0.3',
        info: { title: 'ChittyFinance API', version, description: 'ChittyFinance API for the ChittyOS ecosystem.' },
        servers: [{ url: 'https://finance.chitty.cc' }],
        paths: {
          '/health': { get: { summary: 'Health check', responses: { '200': { description: 'OK' } } } },
          '/api/v1/status': { get: { summary: 'Service status', responses: { '200': { description: 'Service status' } } } }
        }
      });
    }

    if (path === '/api/v1/metrics') {
      const MODE = env.MODE || 'system';
      const dbConfigured = MODE === 'standalone' ? 1 : (env.DATABASE_URL ? 1 : 0);
      const chittyConfigured = (env.CHITTYCONNECT_API_BASE && (env.CHITTYCONNECT_API_TOKEN || env.CHITTY_AUTH_SERVICE_TOKEN)) ? 1 : 0;
      const uptime = Math.floor((Date.now() - performance.timeOrigin) / 1000);
      const lines = [
        '# HELP service_uptime_seconds Process uptime in seconds',
        '# TYPE service_uptime_seconds gauge',
        `service_uptime_seconds ${uptime}`,
        '# HELP service_database_configured Database configured (1) or not (0)',
        '# TYPE service_database_configured gauge',
        `service_database_configured ${dbConfigured}`,
        '# HELP service_chittyconnect_configured ChittyConnect configured (1) or not (0)',
        '# TYPE service_chittyconnect_configured gauge',
        `service_chittyconnect_configured ${chittyConfigured}`,
        ''
      ];
      return new Response(lines.join('\n'), { status: 200, headers: { 'content-type': 'text/plain; version=0.0.4' } });
    }

    // API proxy (optional): if API_ORIGIN is set, forward /api/*
    if (path.startsWith('/api/') && env.API_ORIGIN) {
      const target = new URL(env.API_ORIGIN);
      const upstream = new URL(request.url);
      upstream.hostname = target.hostname;
      upstream.protocol = target.protocol;
      upstream.port = target.port;
      const init: RequestInit = {
        method: request.method,
        headers: request.headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.clone().arrayBuffer()
      };
      return fetch(upstream.toString(), init);
    }

    // Webhooks: Mercury -> forward to backend with service token
    if (path === '/webhooks/mercury' && request.method === 'POST') {
      const apiBase = env.API_ORIGIN || 'https://api.chitty.cc/finance';
      const svcToken = env.CHITTY_AUTH_SERVICE_TOKEN || env.CHITTYCONNECT_API_TOKEN;
      if (!svcToken) return new Response('missing service token', { status: 500 });
      const body = await request.text();
      // Optional HMAC verification (coordination with events API): ensure authenticity before forwarding
      const secret = (env as any).MERCURY_WEBHOOK_SECRET as string | undefined;
      const sig = request.headers.get('x-signature') || '';
      if (secret) {
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const mac = await crypto.subtle.sign('HMAC', key, enc.encode(body));
        const digest = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
        if (!sig || sig !== digest) {
          return new Response('invalid signature', { status: 401 });
        }
      }
      const resp = await fetch(`${apiBase}/integrations/mercury/webhook`, {
        method: 'POST',
        headers: {
          'content-type': request.headers.get('content-type') || 'application/json',
          'authorization': `Bearer ${svcToken}`,
        },
        body,
      });
      return new Response(await resp.text(), { status: resp.status, headers: resp.headers });
    }

    // Minimal redirect helpers to keep flows discoverable
    if (path === '/connect') {
      const target = env.CHITTYCONNECT_API_BASE?.replace(/\/?api\/?$/, '') || 'https://connect.chitty.cc';
      return Response.redirect(target, 302);
    }
    if (path === '/register') {
      return Response.redirect('https://get.chitty.cc', 302);
    }
    // Static assets (served by Workers Assets)
    const assetResp = await env.ASSETS.fetch(request);
    if (assetResp.status !== 404) return assetResp;
    // Fallback 404
    return new Response('Not Found', { status: 404 });
  }
}

// Re-export the Agent DO class so Wrangler can bind it
export { ChittyAgent } from './agents/agent';
