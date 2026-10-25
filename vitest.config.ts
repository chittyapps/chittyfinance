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
    // ALLOWLIST the directories that hold tests, rather than globbing the world and
    // denying what leaks in. `'**/*.test.{ts,tsx}'` with `exclude: ['node_modules/**']` was
    // a denylist with one hole patched, and it had two more:
    //
    //   1. 'node_modules/**' matches ONLY the top level. A git worktree another session
    //      parked under .claude/worktrees has symlinked node_modules children pointing at
    //      the root install, so 1,369 third-party test files (pg-protocol, stripe-js, ...)
    //      were collected and several FAILED.
    //   2. That worktree is a full checkout of THIS repo, so its own 48 test files came in
    //      too — 628 duplicate tests of our own suite. Those PASS, so they inflate the
    //      count silently instead of reddening it, which is the worse of the two.
    //
    // Measured in the primary checkout, where the stray worktree actually is:
    //   include '**/*' + exclude 'node_modules/**'                 -> 5,642 tests, 1 failed
    //   include '**/*' + exclude '**/node_modules/**'              -> 1,394 tests, passed
    //   include '**/*' + exclude '**/node_modules/**', '.claude/**'->   766 tests, passed
    //   include server/ + client/ (this)                           ->   766 tests, passed
    //
    // The last two agree, and the allowlist is the one that stays correct: it cannot be
    // defeated by the NEXT nested checkout, vendored package or tool directory, whereas
    // every denylist entry is a hole someone already fell into. A test added outside these
    // directories will not run — that is the intended trade, and it fails visibly (the
    // file is simply never reported) rather than by polluting the suite.
    //
    // CI never saw any of this: it checks out clean, so no nested tree exists there. The
    // trap is local only, which is why it survived — and a local suite that is red for
    // unrelated reasons, or green while running a stale checkout's copy of itself, is how
    // a suite stops meaning anything.
    include: ['server/**/*.test.{ts,tsx}', 'client/**/*.test.{ts,tsx}'],
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
