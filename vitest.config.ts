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
    // Two separate leaks, both measured in the primary checkout on 2026-10-25 with a git
    // worktree another session had parked under .claude/worktrees:
    //
    //   1. 'node_modules/**' matches ONLY the top-level directory. The stray worktree's
    //      node_modules holds symlinked children pointing back at the root install, so
    //      1,369 third-party test files (pg-protocol, stripe-js, ...) were collected and
    //      several FAILED.
    //   2. The worktree is a full checkout of THIS repo, so its own 48 test files were
    //      collected too — 628 duplicate tests of our own suite. Excluding node_modules
    //      alone leaves these, and because they pass they inflate the count silently
    //      rather than reddening it, which is the worse failure of the two.
    //
    // Measured, in the primary checkout:
    //   ['dist/**', 'node_modules/**']                        -> 5,642 tests, 1 failed
    //   ['dist/**', '**/node_modules/**']                      -> 1,394 tests, all passed
    //   ['dist/**', '**/node_modules/**', '.claude/**']        ->   766 tests, all passed
    //
    // 766 is the real suite. CI never saw any of this: it checks out clean, so neither a
    // nested node_modules nor a nested worktree exists there. That is why it survived —
    // the trap is local only, and a local suite that is red for unrelated reasons, or
    // green while running a stale checkout's copy of itself, is how a suite stops meaning
    // anything.
    exclude: ['dist/**', '**/node_modules/**', '.claude/**'],
    env: {
      // Prevent real network calls to chitty.cc during test runs.
      // ledger-client skips registry.chitty.cc lookup when CHITTY_LEDGER_BASE is set.
      // discovery-client skips self-registration when CHITTY_ENV is 'test'.
      CHITTY_LEDGER_BASE: 'https://ledger.chitty.cc',
      CHITTY_ENV: 'test',
    },
  },
});
