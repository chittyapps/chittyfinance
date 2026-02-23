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
  },
});

