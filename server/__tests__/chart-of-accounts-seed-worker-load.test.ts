import { describe, it, expect, afterAll, vi } from 'vitest';

/**
 * Module load under a host with no entry script — the Worker case.
 *
 * Its own file on purpose: vitest isolates the module graph per file, so `process.argv`
 * can be emptied BEFORE the seed module is first imported. In a file that already
 * imported it, the top-level `isMainModule(...)` call has run and the mutation proves
 * nothing. `vi.resetModules()` between cases for the same reason — a second
 * `await import()` of an already-evaluated module returns the cache and re-runs nothing.
 * (This is module-cache control, not `vi.mock`: nothing is stubbed.)
 *
 * What this catches: the seed is imported by server/routes/admin-seed.ts → server/app.ts
 * → server/worker.ts. In a Worker there is no entry script. The previous isMainModule()
 * threw on a falsy argv[1] at module scope, so merely loading the Worker threw, before
 * any request was served.
 */
const ORIGINAL_ARGV = process.argv;

afterAll(() => {
  process.argv = ORIGINAL_ARGV;
});

const SEED = '../../database/seeds/chart-of-accounts';

describe('the seed module under a host with no entry script', () => {
  it('imports cleanly with process.argv[1] unset', async () => {
    vi.resetModules();
    process.argv = [ORIGINAL_ARGV[0]];
    expect(process.argv[1]).toBeUndefined();

    const seed = await import(SEED);

    expect(typeof seed.seedChartOfAccounts).toBe('function');
    expect(seed.isMainModule(import.meta.url, process.argv[1])).toBe(false);
  });

  it('imports cleanly with no process.argv at all', async () => {
    // workerd's `process` shim is not Node's. Indexing an absent argv would throw at the
    // call site, before isMainModule ever saw a value — hence `process.argv?.[1]`.
    vi.resetModules();
    process.argv = undefined as never;

    const seed = await import(SEED);

    expect(typeof seed.seedChartOfAccounts).toBe('function');
  });
});

describe('the Worker entry', () => {
  it('loads end to end, markdown import and all', async () => {
    // server/worker.ts is the only module that imports docs/CHART-OF-ACCOUNTS.md, via
    // wrangler's Text rule (vitest's `markdown-as-text` plugin stands in for it here).
    // Importing it exercises the whole Worker graph — the seed's module-scope
    // isMainModule call included — with no entry script present.
    vi.resetModules();
    process.argv = [ORIGINAL_ARGV[0]];

    const worker = (await import('../worker')).default;

    expect(typeof worker.fetch).toBe('function');
    expect(typeof worker.scheduled).toBe('function');
  });
});
