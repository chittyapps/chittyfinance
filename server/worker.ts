import { createApp } from './app';
import type { Env } from './env';
import { processLeaseExpirations } from './lib/lease-expiration';
import { sendHeartbeat, registerWithDiscovery } from './lib/discovery-client';
import { keepaliveAndRecord } from './lib/mercury-token-keepalive';
// Bundled as text by the `Text` rule in wrangler.jsonc / deploy/system-wrangler.jsonc.
// This import lives here, in the Worker-only entry, and nowhere deeper: server/app.ts is
// also loaded by `tsx server/dev.ts` and by the esbuild step of `npm run build`, neither
// of which can load a `.md`. The admin seed route receives it through createApp().
import CHART_OF_ACCOUNTS_DOC from '../docs/CHART-OF-ACCOUNTS.md';

const app = createApp({ chartDocument: CHART_OF_ACCOUNTS_DOC });

export default {
  fetch: app.fetch,

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    // The two jobs on this cron are isolated from each other: processLeaseExpirations
    // throws outright when DATABASE_URL is unbound, and the Mercury keepalive must not
    // be skipped because of it (nor the reverse). allSettled, then report.
    const [lease, mercury] = await Promise.allSettled([
      processLeaseExpirations(env),
      // Mercury API tokens are deleted after 45 days with no call. One read-only
      // GET /api/v1/accounts per entity keeps them alive and inventories which survived.
      keepaliveAndRecord(env),
    ]);

    // Lease expiration processing
    if (lease.status === 'fulfilled') {
      const stats = lease.value;
      console.log('[cron:lease-expiration] complete:', JSON.stringify(stats));
      if (stats.errors.length > 0) {
        console.error(`[cron:lease-expiration] ${stats.errors.length} failures during processing`);
      }
    } else {
      console.error('[cron:lease-expiration] failed:', lease.reason instanceof Error ? lease.reason.message : String(lease.reason));
    }

    // Mercury token keepalive. keepaliveAndRecord already logs per-token outcomes and
    // resolves on every path, so a rejection here is a bug in that module, not a dead token.
    if (mercury.status === 'rejected') {
      console.error('[cron:mercury-keepalive] failed:', mercury.reason instanceof Error ? mercury.reason.message : String(mercury.reason));
    }

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
