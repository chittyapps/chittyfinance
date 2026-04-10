/**
 * Tests for server/lib/chittyschema.ts
 *
 * Focus: validation result shape, fall-open behavior on errors,
 * unknown-table handling. Network is mocked — no calls to schema.chitty.cc.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateRow, listTables, checkHealth } from '../lib/chittyschema';

const env = { CHITTYSCHEMA_URL: 'https://test.schema' };

const originalFetch = global.fetch;

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  global.fetch = vi.fn(handler as any) as any;
}

beforeEach(() => {
  global.fetch = originalFetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('validateRow', () => {
  it('returns ok:true when service confirms valid', async () => {
    mockFetch(async () => new Response(JSON.stringify({ valid: true }), { status: 200 }));
    const result = await validateRow(env, 'FinancialTransactionsInsertSchema', { amount: '10.00' });
    expect(result.ok).toBe(true);
    expect(result.advisory).toBe(false);
    expect(result.errors).toBeUndefined();
  });

  it('returns ok:false with normalized errors on validation failure', async () => {
    mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            valid: false,
            errors: [{ path: 'amount', message: 'required', code: 'required' }],
          }),
          { status: 200 },
        ),
    );
    const result = await validateRow(env, 'FinancialTransactionsInsertSchema', {});
    expect(result.ok).toBe(false);
    expect(result.advisory).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0].path).toBe('amount');
  });

  it('normalizes string-array errors (unregistered table response)', async () => {
    mockFetch(
      async () =>
        new Response(
          JSON.stringify({ valid: false, errors: ['something broke'] }),
          { status: 200 },
        ),
    );
    const result = await validateRow(env, 'SomeTable', {});
    expect(result.ok).toBe(false);
    expect(result.errors![0].message).toBe('something broke');
  });

  it('returns advisory pass with availableTables when table is not registered', async () => {
    mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            valid: false,
            errors: ['Schema not found for table: chart_of_accounts'],
            availableTables: ['Foo', 'Bar'],
          }),
          { status: 200 },
        ),
    );
    const result = await validateRow(env, 'chart_of_accounts', {});
    expect(result.ok).toBe(true);
    expect(result.advisory).toBe(true);
    expect(result.availableTables).toEqual(['Foo', 'Bar']);
  });

  it('falls open (advisory pass) on 5xx', async () => {
    mockFetch(async () => new Response('boom', { status: 503 }));
    const result = await validateRow(env, 'Any', {});
    expect(result.ok).toBe(true);
    expect(result.advisory).toBe(true);
  });

  it('falls open on network error', async () => {
    mockFetch(async () => {
      throw new TypeError('fetch failed: ECONNREFUSED');
    });
    const result = await validateRow(env, 'Any', {});
    expect(result.ok).toBe(true);
    expect(result.advisory).toBe(true);
  });

  it('falls open on timeout', async () => {
    mockFetch(async () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    });
    const result = await validateRow(env, 'Any', {}, { timeoutMs: 10 });
    expect(result.ok).toBe(true);
    expect(result.advisory).toBe(true);
  });

  it('falls open when body is not valid JSON', async () => {
    mockFetch(async () => new Response('not-json-at-all', { status: 200 }));
    const result = await validateRow(env, 'Any', {});
    expect(result.ok).toBe(true);
    expect(result.advisory).toBe(true);
  });

  it('uses the default base URL when CHITTYSCHEMA_URL is not set', async () => {
    let capturedUrl = '';
    mockFetch(async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ valid: true }), { status: 200 });
    });
    await validateRow({}, 'X', {});
    expect(capturedUrl).toBe('https://schema.chitty.cc/api/validate');
  });
});

describe('listTables', () => {
  it('returns parsed tables array', async () => {
    mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            tables: [
              { name: 'identities', database: 'chittyos-core', owner: 'chittyid' },
            ],
          }),
          { status: 200 },
        ),
    );
    const tables = await listTables(env);
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('identities');
  });

  it('returns empty array on fetch error', async () => {
    mockFetch(async () => {
      throw new Error('network');
    });
    const tables = await listTables(env);
    expect(tables).toEqual([]);
  });

  it('returns empty array on non-ok status', async () => {
    mockFetch(async () => new Response('x', { status: 500 }));
    const tables = await listTables(env);
    expect(tables).toEqual([]);
  });
});

describe('checkHealth', () => {
  it('returns true on 2xx', async () => {
    mockFetch(async () => new Response('ok', { status: 200 }));
    expect(await checkHealth(env)).toBe(true);
  });

  it('returns false on non-ok status', async () => {
    mockFetch(async () => new Response('x', { status: 500 }));
    expect(await checkHealth(env)).toBe(false);
  });

  it('returns false on network error', async () => {
    mockFetch(async () => {
      throw new Error('network');
    });
    expect(await checkHealth(env)).toBe(false);
  });
});
