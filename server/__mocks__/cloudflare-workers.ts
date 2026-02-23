// Mock for cloudflare:workers — used in vitest (Node) environment
export class DurableObject {
  constructor(public ctx?: any, public env?: any) {}
  async fetch(_request: Request): Promise<Response> {
    return new Response('Not Implemented', { status: 501 });
  }
}
