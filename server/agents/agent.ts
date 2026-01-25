// Minimal Agent base to avoid external dependency in types.
class Agent {
  async onRequest(_request: Request): Promise<Response> {
    return new Response('Not Implemented', { status: 501 });
  }
}

export class ChittyAgent extends Agent {
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'GET' && path === '/agent') {
      return Response.json({
        name: 'ChittyFinance Agent',
        status: 'ok',
        provider: 'cloudflare-agents',
        time: Date.now(),
      });
    }

    if (request.method === 'POST' && path === '/agent') {
      try {
        const body = await request.json().catch(() => ({}));
        const query: string = body?.query ?? '';
        const context = body?.context ?? {};
        // Placeholder behavior – later wire model/tools here
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
