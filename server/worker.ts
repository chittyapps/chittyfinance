import { createApp } from './app';
import type { Env } from './env';
import { processLeaseExpirations } from './lib/lease-expiration';
import { sendHeartbeat, registerWithDiscovery } from './lib/discovery-client';

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

    // Discovery heartbeat (keeps service marked active)
    ctx.waitUntil(sendHeartbeat(env).then((ok) => {
      if (!ok) console.warn('[cron:discovery] heartbeat failed');
    }));
  },
} satisfies ExportedHandler<Env>;

// Re-export the Agent DO class so Wrangler can bind it
export { ChittyAgent } from './agents/agent';
