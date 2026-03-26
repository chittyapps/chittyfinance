import { createApp } from './app';
import type { Env } from './env';
import { processLeaseExpirations } from './lib/lease-expiration';

const app = createApp();

export default {
  fetch: app.fetch,

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    // Daily cron: check lease expirations and send notifications
    ctx.waitUntil(
      processLeaseExpirations(env).then((stats) => {
        console.log('Lease expiration check complete:', JSON.stringify(stats));
      }).catch((err) => {
        console.error('Lease expiration check failed:', err);
      }),
    );
  },
} satisfies ExportedHandler<Env>;

// Re-export the Agent DO class so Wrangler can bind it
export { ChittyAgent } from './agents/agent';
