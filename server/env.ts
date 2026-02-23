export interface Env {
  DATABASE_URL: string;
  CHITTY_AUTH_SERVICE_TOKEN: string;
  CHITTY_AUTH_JWKS_URL?: string;
  CHITTYCONNECT_API_BASE?: string;
  OPENAI_API_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  WAVE_CLIENT_ID?: string;
  WAVE_CLIENT_SECRET?: string;
  OAUTH_STATE_SECRET?: string;
  GITHUB_TOKEN?: string;
  MERCURY_WEBHOOK_SECRET?: string;
  MODE?: string;
  NODE_ENV?: string;
  APP_VERSION?: string;
  PUBLIC_APP_BASE_URL?: string;
  FINANCE_KV: KVNamespace;
  FINANCE_R2: R2Bucket;
  ASSETS: Fetcher;
  // CF_AGENT: DurableObjectNamespace; // Disabled — DO being rebuilt
}

import type { SystemStorage } from './storage/system';

export interface Variables {
  tenantId: string;
  userId: string;
  storage: SystemStorage;
}

export type HonoEnv = {
  Bindings: Env;
  Variables: Variables;
};
