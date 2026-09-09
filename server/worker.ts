import { createApp } from './app';
import type { Env } from './env';
import { processLeaseExpirations } from './lib/lease-expiration';
import { sendHeartbeat, registerWithDiscovery } from './lib/discovery-client';
import { createDb } from './db/connection';
import { SystemStorage } from './storage/system';
import {
  DEFAULT_COMPTROLLER_BASE,
  INFRA_ACCOUNT_EXTERNAL_ID,
  fetchComptrollerMetrics,
  syncComptrollerCosts,
} from './lib/comptroller-sync';

// Daily ChittyComptroller cost bridge. Resolves the infra tenant from the seeded
// "ChittyOS Infrastructure" account (external_id = 'chittyos-infra') so no tenant
// header is needed in the cron context.
async function runComptrollerSync(env: Env): Promise<void> {
  if (!env.DATABASE_URL) {
    console.warn('[cron:comptroller] DATABASE_URL not configured — skipping');
    return;
  }
  const storage = new SystemStorage(createDb(env.DATABASE_URL));
  const account = await storage.lookupAccountByExternalId(INFRA_ACCOUNT_EXTERNAL_ID);
  if (!account) {
    console.warn(`[cron:comptroller] no account with external_id='${INFRA_ACCOUNT_EXTERNAL_ID}' — skipping`);
    return;
  }
  const base = env.COMPTROLLER_API_BASE || DEFAULT_COMPTROLLER_BASE;
  const metrics = await fetchComptrollerMetrics(base);
  const rows = await syncComptrollerCosts({
    storage,
    tenantId: account.tenantId,
    accountId: account.id,
    metrics,
  });
  console.log(`[cron:comptroller] synced ${rows.length} services:`, JSON.stringify(rows.map((r) => `${r.service}=${r.amount}`)));
}

const app = createApp();

export default {
  fetch: app.fetch,

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    // Lease expiration processing
    const stats = await processLeaseExpirations(env);
    console.log('[cron:lease-expiration] complete:', JSON.stringify(stats));
    if (stats.errors.length > 0) {
      console.error(`[cron:lease-expiration] ${stats.errors.length} failures during processing`);
    }

    // ChittyComptroller cost bridge — record today's per-service AI/infra cost
    ctx.waitUntil(
      runComptrollerSync(env).catch((err) => {
        console.error('[cron:comptroller] sync failed:', err instanceof Error ? err.message : String(err));
      }),
    );

    // Discovery heartbeat (keeps service marked active)
    ctx.waitUntil(sendHeartbeat(env).then((ok) => {
      if (!ok) console.warn('[cron:discovery] heartbeat failed');
    }));
  },

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
    const from = message.from;
    const to = message.to;
    const subject = message.headers.get('subject') || '(no subject)';
    const messageId = message.headers.get('message-id') || `${Date.now()}`;
    const size = message.rawSize;

    console.log(`[email:inbound] from=${from} to=${to} subject="${subject}" size=${size}`);

    // Store raw email in R2 for document ingestion pipeline
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedId = messageId.replace(/[<>]/g, '').replace(/[^a-zA-Z0-9@._-]/g, '_');
    const key = `inbound-email/${ts}_${sanitizedId}.eml`;

    const rawBytes = await new Response(message.raw).arrayBuffer();
    await env.FINANCE_R2.put(key, rawBytes, {
      customMetadata: {
        from,
        to,
        subject,
        messageId,
        receivedAt: new Date().toISOString(),
        sizeBytes: String(size),
      },
    });

    console.log(`[email:inbound] stored in R2: ${key} (${rawBytes.byteLength} bytes)`);

    // Index in KV for quick lookup
    const kv = env.FINANCE_KV;
    const indexEntry = JSON.stringify({
      key,
      from,
      to,
      subject,
      receivedAt: new Date().toISOString(),
      sizeBytes: rawBytes.byteLength,
    });
    await kv.put(`email:inbound:${ts}`, indexEntry, { expirationTtl: 86400 * 90 }); // 90 days
  },
} satisfies ExportedHandler<Env>;

// Re-export the Agent DO class so Wrangler can bind it
export { ChittyAgent } from './agents/agent';
