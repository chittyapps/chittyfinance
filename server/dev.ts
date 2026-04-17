/**
 * Local dev server — Hono API on @hono/node-server.
 *
 * Replaces the legacy Express entry (server/index.ts).
 * Serves the same Hono app that runs on CF Workers, with process.env
 * mapped to Hono Bindings and in-memory KV/R2 stubs.
 *
 * Vite dev server runs separately (`vite dev`) and proxies /api → here.
 * Or run this standalone for API-only development.
 */
import { serve } from '@hono/node-server';
import { config } from 'dotenv';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { getMimeType } from 'hono/utils/mime';
import { Hono } from 'hono';
import { createApp } from './app';
import type { Env } from './env';

config();

const PORT = parseInt(process.env.PORT || '5001', 10);

// ── Stub KV (in-memory, dev only) ──
const kvStore = new Map<string, { value: string; expiry?: number }>();
const stubKV = {
  get: async (key: string) => {
    const entry = kvStore.get(key);
    if (!entry) return null;
    if (entry.expiry && Date.now() > entry.expiry) { kvStore.delete(key); return null; }
    return entry.value;
  },
  put: async (key: string, value: string, opts?: { expirationTtl?: number }) => {
    kvStore.set(key, { value, expiry: opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : undefined });
  },
  delete: async (key: string) => { kvStore.delete(key); },
  list: async () => ({ keys: [...kvStore.keys()].map((name) => ({ name })), list_complete: true, cacheStatus: null }),
  getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null }),
} as unknown as KVNamespace;

// ── Stub R2 (dev only) ──
const stubR2 = { get: async () => null, put: async () => null, delete: async () => {}, list: async () => ({ objects: [], truncated: false }), head: async () => null } as unknown as R2Bucket;

// ── ASSETS: serve dist/public in production, 404 stub in dev ──
const isProduction = process.env.NODE_ENV === 'production';
const publicDir = isProduction ? resolve(import.meta.dirname ?? '.', 'public') : '';
let indexHtml: string | null = null;
if (isProduction && publicDir) {
  try { indexHtml = readFileSync(resolve(publicDir, 'index.html'), 'utf-8'); } catch {}
}

// In production, ASSETS.fetch serves files from dist/public/ with SPA fallback
const stubAssets = {
  fetch: isProduction
    ? async (req: Request) => {
        const url = new URL(req.url);
        const filePath = resolve(publicDir, url.pathname.replace(/^\//, ''));
        // Prevent path traversal — resolved path must stay inside publicDir
        if (!filePath.startsWith(publicDir + '/') && filePath !== publicDir) {
          return new Response('Forbidden', { status: 403 });
        }
        try {
          if (statSync(filePath).isFile()) {
            const body = readFileSync(filePath);
            const mime = getMimeType(filePath) || 'application/octet-stream';
            return new Response(body, { headers: { 'content-type': mime } });
          }
        } catch {}
        // SPA fallback: return index.html only for GET requests
        if (req.method === 'GET' && indexHtml) {
          return new Response(indexHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } });
        }
        return new Response('Not found', { status: 404 });
      }
    : async () => new Response('Not found', { status: 404 }),
} as unknown as Fetcher;

function buildEnv(): Env {
  const e = process.env;
  return {
    DATABASE_URL: e.DATABASE_URL || '',
    CHITTY_AUTH_SERVICE_TOKEN: e.CHITTY_AUTH_SERVICE_TOKEN || '',
    CHITTY_AUTH_JWKS_URL: e.CHITTY_AUTH_JWKS_URL,
    CHITTYCONNECT_API_BASE: e.CHITTYCONNECT_API_BASE,
    OPENAI_API_KEY: e.OPENAI_API_KEY,
    STRIPE_SECRET_KEY: e.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: e.STRIPE_WEBHOOK_SECRET,
    WAVE_CLIENT_ID: e.WAVE_CLIENT_ID,
    WAVE_CLIENT_SECRET: e.WAVE_CLIENT_SECRET,
    OAUTH_STATE_SECRET: e.OAUTH_STATE_SECRET,
    GITHUB_TOKEN: e.GITHUB_TOKEN,
    MERCURY_WEBHOOK_SECRET: e.MERCURY_WEBHOOK_SECRET,
    CHITTYAGENT_API_BASE: e.CHITTYAGENT_API_BASE,
    CHITTYAGENT_API_TOKEN: e.CHITTYAGENT_API_TOKEN,
    CHITTY_LEDGER_BASE: e.CHITTY_LEDGER_BASE,
    CHITTYOS_CORE_DATABASE_URL: e.CHITTYOS_CORE_DATABASE_URL,
    AI_GATEWAY_ENDPOINT: e.AI_GATEWAY_ENDPOINT,
    CHITTYCONNECT_API_TOKEN: e.CHITTYCONNECT_API_TOKEN,
    ZILLOW_API_KEY: e.ZILLOW_API_KEY,
    REDFIN_API_KEY: e.REDFIN_API_KEY,
    HOUSECANARY_API_KEY: e.HOUSECANARY_API_KEY,
    ATTOM_API_KEY: e.ATTOM_API_KEY,
    GOOGLE_CLIENT_ID: e.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: e.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: e.GOOGLE_REDIRECT_URI,
    TWILIO_ACCOUNT_SID: e.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: e.TWILIO_AUTH_TOKEN,
    TWILIO_PHONE_NUMBER: e.TWILIO_PHONE_NUMBER,
    SENDGRID_API_KEY: e.SENDGRID_API_KEY,
    SENDGRID_FROM_EMAIL: e.SENDGRID_FROM_EMAIL,
    CHITTYAUTH_CLIENT_ID: e.CHITTYAUTH_CLIENT_ID,
    CHITTYAUTH_CLIENT_SECRET: e.CHITTYAUTH_CLIENT_SECRET,
    MODE: e.MODE || 'system',
    NODE_ENV: e.NODE_ENV || 'development',
    APP_VERSION: '2.0.0',
    PUBLIC_APP_BASE_URL: e.PUBLIC_APP_BASE_URL || `http://localhost:${PORT}`,
    FINANCE_KV: stubKV,
    FINANCE_R2: stubR2,
    ASSETS: stubAssets,
  };
}

const app = createApp();
const env = buildEnv();

// Wrap to inject env bindings (CF Workers does this automatically)
const devApp = new Hono();
devApp.use('*', async (c, next) => {
  for (const [key, value] of Object.entries(env)) {
    (c.env as any)[key] = value;
  }
  await next();
});

devApp.route('/', app);

console.log(`\n  ChittyFinance Dev Server (Hono)`);
console.log(`  Mode: ${env.MODE}`);
console.log(`  DB: ${env.DATABASE_URL ? 'configured' : 'NOT SET'}`);
console.log(`  Port: ${PORT}`);
console.log(`  http://localhost:${PORT}\n`);

serve({ fetch: devApp.fetch, port: PORT, hostname: '0.0.0.0' });
