import { createApp } from './app';
import type { Env } from './env';

const app = createApp();

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;

// ChittyAgent DO export disabled — placeholder class doesn't extend DurableObject
// export { ChittyAgent } from './agents/agent';
