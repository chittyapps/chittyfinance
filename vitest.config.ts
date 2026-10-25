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
    // '**/node_modules/**', not 'node_modules/**'. The unanchored form only matches the
    // top-level directory, so a nested one — a git worktree parked under .claude/worktrees,
    // a vendored package, any checkout inside the repo — has its dependencies' own test
    // files collected and run. Measured 2026-10-25 in the primary checkout: one stray
    // worktree contributed 48 third-party test files and roughly 4,900 tests, several of
    // which FAIL, so `npm run test:run` went red for reasons that had nothing to do with
    // this repo and the real result was buried in the noise.
    //
    // CI was never affected (it checks out clean), which is why this survived: the trap is
    // local only, and a local red suite is exactly where someone stops trusting the suite.
    exclude: ['dist/**', '**/node_modules/**'],
    env: {
      // Prevent real network calls to chitty.cc during test runs.
      // ledger-client skips registry.chitty.cc lookup when CHITTY_LEDGER_BASE is set.
      // discovery-client skips self-registration when CHITTY_ENV is 'test'.
      CHITTY_LEDGER_BASE: 'https://ledger.chitty.cc',
      CHITTY_ENV: 'test',
    },
  },
});
