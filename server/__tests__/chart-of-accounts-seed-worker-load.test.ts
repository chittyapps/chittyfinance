import { describe, it, expect, afterAll } from 'vitest';

/**
 * The Worker-load case, in its own file on purpose: vitest isolates the module graph per
 * file, so `process.argv` can be emptied BEFORE the seed module is first imported. In any
 * file that already imported it, the top-level `isMainModule(...)` call has run and the
 * mutation proves nothing.
 *
 * What this catches: the seed module is imported by server/routes/admin-seed.ts, which is
 * imported by server/app.ts, which is the Worker. In a Worker there is no entry script.
 * The previous isMainModule() threw on a falsy argv[1], and that call sits at module
 * scope — so merely loading the Worker threw, before any request was served.
 */
const ORIGINAL_ARGV = process.argv;

afterAll(() => {
  process.argv = ORIGINAL_ARGV;
});

describe('the seed module under a host with no entry script', () => {
  it('imports cleanly with process.argv[1] unset', async () => {
    process.argv = [ORIGINAL_ARGV[0]];
    expect(process.argv[1]).toBeUndefined();

    const seed = await import('../../database/seeds/chart-of-accounts');

    expect(typeof seed.seedChartOfAccounts).toBe('function');
    expect(seed.isMainModule(import.meta.url, process.argv[1])).toBe(false);
  });

  it('imports cleanly with no process.argv at all', async () => {
    // workerd's `process` shim is not Node's. Indexing an absent argv would throw before
    // isMainModule ever saw a value.
    process.argv = undefined as never;
    const seed = await import('../../database/seeds/chart-of-accounts');
    expect(typeof seed.seedChartOfAccounts).toBe('function');
  });
});
