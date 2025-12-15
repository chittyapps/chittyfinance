/**
 * Cloudflare Worker entry point for ChittyFinance
 * This file adapts the Express app to run on Cloudflare Workers
 */

import type { Request as WorkerRequest, ExecutionContext } from '@cloudflare/workers-types';

// Note: The actual Express app will be imported from the bundled server
// This is a placeholder that will be replaced during build

export default {
  async fetch(request: WorkerRequest, env: any, ctx: ExecutionContext): Promise<Response> {
    try {
      // Set environment variables from Worker env
      process.env.DATABASE_URL = env.DATABASE_URL;
      process.env.OPENAI_API_KEY = env.OPENAI_API_KEY;
      process.env.CHITTYCONNECT_API_BASE = env.CHITTYCONNECT_API_BASE;
      process.env.CHITTY_AUTH_SERVICE_TOKEN = env.CHITTY_AUTH_SERVICE_TOKEN;
      process.env.NODE_ENV = 'production';
      process.env.MODE = 'system';

      // Import the Express app (dynamic import to ensure env vars are set first)
      const { default: app } = await import('./index.js');

      // Convert Workers Request to Node.js compatible request
      const url = new URL(request.url);
      const method = request.method;
      const headers = Object.fromEntries(request.headers);
      const body = method !== 'GET' && method !== 'HEAD' ? await request.text() : undefined;

      // Create a mock Node.js request/response for Express
      // Note: In production, you might want to use a more robust adapter
      return new Promise((resolve) => {
        const mockReq: any = {
          method,
          url: url.pathname + url.search,
          headers,
          body,
          on: () => {},
          once: () => {},
          emit: () => {},
        };

        const mockRes: any = {
          statusCode: 200,
          headers: {} as Record<string, string>,
          setHeader(name: string, value: string) {
            this.headers[name.toLowerCase()] = value;
          },
          getHeader(name: string) {
            return this.headers[name.toLowerCase()];
          },
          removeHeader(name: string) {
            delete this.headers[name.toLowerCase()];
          },
          writeHead(statusCode: number, headers?: Record<string, string>) {
            this.statusCode = statusCode;
            if (headers) {
              Object.entries(headers).forEach(([k, v]) => this.setHeader(k, v));
            }
          },
          end(data?: string) {
            resolve(
              new Response(data, {
                status: this.statusCode,
                headers: this.headers,
              })
            );
          },
          json(data: any) {
            this.setHeader('content-type', 'application/json');
            this.end(JSON.stringify(data));
          },
          status(code: number) {
            this.statusCode = code;
            return this;
          },
        };

        // Call Express app
        app(mockReq, mockRes);
      });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(
        JSON.stringify({
          error: 'Internal Server Error'
        }),
        {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }
      );
    }
  },
};
