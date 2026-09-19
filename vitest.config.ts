import { defineConfig, type Plugin } from 'vitest/config'

/**
 * Import `.md` as a default-exported string, the same shape wrangler's
 * `rules: [{ type: "Text", globs: ["**\/*.md"] }]` produces in the Worker bundle and
 * `server/types/markdown.d.ts` declares to tsc.
 *
 * Mandatory, not a convenience: server/routes/admin-seed.ts imports
 * docs/CHART-OF-ACCOUNTS.md, and every test that touches `createApp()` pulls that
 * import transitively. Without this, vitest tries to parse 64KB of markdown as JS.
 */
function markdownAsText(): Plugin {
  return {
    name: 'markdown-as-text',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('.md')) return null;
      return { code: `export default ${JSON.stringify(code)};`, map: null };
    },
  };
}

export default defineConfig({
  plugins: [markdownAsText()],
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
