import { createApp } from './app';
import type { Env } from './env';

const app = createApp();

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;

// Re-export the Agent DO class so Wrangler can bind it
export { ChittyAgent } from './agents/agent';
