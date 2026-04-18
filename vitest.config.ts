import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      'cloudflare:workers': new URL('./server/__mocks__/cloudflare-workers.ts', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['dist/**', 'node_modules/**'],
    env: {
      // Prevent real network calls to chitty.cc during test runs.
      // ledger-client skips registry.chitty.cc lookup when CHITTY_LEDGER_BASE is set.
      // discovery-client skips self-registration when CHITTY_ENV is 'test'.
      CHITTY_LEDGER_BASE: 'https://ledger.chitty.cc',
      CHITTY_ENV: 'test',
    },
  },
});

