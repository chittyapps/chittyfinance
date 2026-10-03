export interface Env {
  DATABASE_URL: string;
  CHITTY_AUTH_SERVICE_TOKEN: string;
  CHITTY_AUTH_JWKS_URL?: string;
  CHITTY_AUTH_ISSUER?: string;
  CHITTY_AUTH_AUDIENCE?: string;
  CHITTYCONNECT_API_BASE?: string;
  OPENAI_API_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  WAVE_CLIENT_ID?: string;
  WAVE_CLIENT_SECRET?: string;
  OAUTH_STATE_SECRET?: string;
  GITHUB_TOKEN?: string;
  MERCURY_WEBHOOK_SECRET?: string;
  /**
   * Mercury API tokens, one per entity, bound from the ACCOUNT-LEVEL Cloudflare
   * Secrets Store (store e914522471964c3c8cf1e601770edcc3) as `secrets_store_secrets`
   * in deploy/system-wrangler.jsonc. Binding name == secret name, matching
   * CHITTYOS/chittysecrets/wrangler.json. Optional because a Worker deployed before
   * the bindings land will not have them — the keepalive probe reports that as
   * `binding_missing` (indeterminate) rather than as a dead token.
   *
   * `.get()` the value at the call site and never log, return or persist it.
   */
  MERCURY_TOKEN_ARIBIA_LLC?: SecretsStoreSecret;
  MERCURY_TOKEN_ARIBIA_LLC_CITY_STUDIO?: SecretsStoreSecret;
  MERCURY_TOKEN_ARIBIA_LLC_APT_ARLENE?: SecretsStoreSecret;
  MERCURY_TOKEN_CHICAGO_FURNISHED_CONDOS?: SecretsStoreSecret;
  MERCURY_TOKEN_IT_CAN_BE_LLC?: SecretsStoreSecret;
  MERCURY_TOKEN_CHITTY_SERVICES?: SecretsStoreSecret;
  MERCURY_TOKEN_JEAN_ARLENE_VENTURING?: SecretsStoreSecret;
  CHITTYAGENT_API_BASE?: string;
  CHITTYAGENT_API_TOKEN?: string;
  CHITTY_LEDGER_BASE?: string;
  CHITTYOS_CORE_DATABASE_URL?: string;
  // ChittySchema — optional override of https://schema.chitty.cc for the
  // centralized schema validation service. Leave unset in production.
  CHITTYSCHEMA_URL?: string;
  AI_GATEWAY_ENDPOINT?: string; // CF AI Gateway proxy URL, e.g. https://gateway.ai.cloudflare.com/v1/{acct}/{gw}/openai
  CHITTYCONNECT_API_TOKEN?: string;
  // Valuation API keys (optional — each provider only fetched if key is set)
  ZILLOW_API_KEY?: string;
  REDFIN_API_KEY?: string;
  HOUSECANARY_API_KEY?: string;
  ATTOM_API_KEY?: string;
  // Google Workspace integration
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  // Twilio SMS
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_PHONE_NUMBER?: string;
  // SendGrid email (deprecated — replaced by Cloudflare Email Service binding)
  SENDGRID_API_KEY?: string;
  SENDGRID_FROM_EMAIL?: string;
  // ChittyID OAuth
  CHITTYAUTH_CLIENT_ID?: string;
  CHITTYAUTH_CLIENT_SECRET?: string;
  MODE?: string;
  NODE_ENV?: string;
  APP_VERSION?: string;
  PUBLIC_APP_BASE_URL?: string;
  FINANCE_KV: KVNamespace;
  FINANCE_R2: R2Bucket;
  ASSETS: Fetcher;
  EMAIL?: SendEmail;
  // CF_AGENT: DurableObjectNamespace; // Disabled — DO being rebuilt
}

import type { SystemStorage } from './storage/system';
import type { Database } from './db/connection';

export interface Variables {
  tenantId: string;
  userId: string;
  storage: SystemStorage;
  /**
   * The same drizzle handle SystemStorage was built on. Routes go through storage
   * (see CLAUDE.md "All DB access through server/storage/system.ts"); this exists for
   * the one caller that takes a `Database` rather than a storage method — the
   * chart-of-accounts seed, whose SeedOptions accepts `db`.
   */
  db: Database;
}

export type HonoEnv = {
  Bindings: Env;
  Variables: Variables;
};
