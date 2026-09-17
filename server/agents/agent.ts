import { DurableObject } from 'cloudflare:workers';

export class ChittyAgent extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'GET' && (path === '/agent' || path === '/')) {
      return Response.json({
        name: 'ChittyFinance Agent',
        status: 'ok',
        provider: 'cloudflare-agents',
        time: Date.now(),
      });
    }

    if (request.method === 'POST' && (path === '/agent' || path === '/')) {
      try {
        const body = await request.json().catch(() => ({}));
        const query: string = (body as any)?.query ?? '';
        const context = (body as any)?.context ?? {};
        const reply = query
          ? `Agent received: ${String(query).slice(0, 200)}`
          : 'Agent ready. Provide a "query" to interact.';
        return Response.json({ ok: true, reply, context });
      } catch (err: any) {
        return Response.json({ ok: false, error: err?.message || 'Agent error' }, { status: 500 });
      }
    }

    return new Response('Not Found', { status: 404 });
  }
}
