import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import {
  ClassificationError,
  StorageValidationError,
  SystemStorage,
} from '../storage/system';
import { errorHandler } from '../middleware/error';
import { classifyBatchWithAI, type CoaOption } from '../lib/classification-ai';
import { HEADER_CODES, REI_CHART_OF_ACCOUNTS } from '../../database/chart-of-accounts';

/**
 * A header account holds no transaction.
 *
 * This is the COA 3200 failure inverted, and it is why the guard cannot live in a route.
 * 3200 was a code no account ever had, reaching 1,199 live rows because nothing checked
 * that a code existed. A header is the opposite: it *does* exist, so `getAccountByCode()`
 * returns it, every existence check in the ingest path passes, and a header would be
 * posted to silently. The chart gained ten of them the moment the hierarchy was defined.
 *
 * Every path that assigns a chart code to a transaction funnels through one of two
 * storage methods — `createTransaction`/`updateTransaction` for ingest, and
 * `classifyTransaction` for the trust path (single classify, bulk accept, batch-suggest
 * and the AI suggester all call it). Both are asserted here.
 *
 * No DB module is mocked. The database given to SystemStorage throws on contact, which
 * is the assertion: the guard must reject before anything is read or written. A test
 * that stubbed a working DB would pass even if the guard ran after the insert.
 */
const HEADER = '5190'; // Utilities — a header with five posting children
const POSTING = '5100'; // Utilities - Electric, one of them

/** A database that fails loudly if the guard lets execution reach it. */
function unreachableDb() {
  const boom = () => {
    throw new Error('the guard let the write reach the database');
  };
  return new Proxy({} as any, { get: () => boom });
}

function storage() {
  return new SystemStorage(unreachableDb());
}

const txRow = (over: Record<string, unknown>) =>
  ({
    tenantId: 't1',
    accountId: 'a1',
    amount: '10.00',
    type: 'expense',
    description: 'ComEd',
    date: new Date('2024-06-01'),
    ...over,
  }) as any;

describe('the chart itself', () => {
  it('holds every header code it declares, and each has children', () => {
    for (const code of HEADER_CODES) {
      const account = REI_CHART_OF_ACCOUNTS.find((a) => a.code === code);
      expect(account, `${code} is declared a header but is not in the chart`).toBeDefined();
      expect(account?.subtype).toBe('header');
      expect(REI_CHART_OF_ACCOUNTS.some((a) => a.parentCode === code)).toBe(true);
    }
  });
});

describe('createTransaction refuses a header account', () => {
  it('rejects one on coa_code, before reaching the database', async () => {
    await expect(storage().createTransaction(txRow({ coaCode: HEADER }))).rejects.toThrow(
      StorageValidationError,
    );
  });

  it('rejects one on suggested_coa_code too — an L1 write is still a write', async () => {
    // The ingest path is L1: it writes suggested_coa_code and never coa_code. Guarding
    // only coa_code would leave every importer able to park rows on a header.
    await expect(
      storage().createTransaction(txRow({ suggestedCoaCode: HEADER })),
    ).rejects.toThrow(StorageValidationError);
  });

  it('names the column and the account in the message', async () => {
    const err = await storage()
      .createTransaction(txRow({ suggestedCoaCode: HEADER }))
      .catch((e) => e);
    expect(err).toBeInstanceOf(StorageValidationError);
    expect(err.code).toBe('header_not_postable');
    expect(err.message).toContain('suggested_coa_code');
    expect(err.message).toContain('Utilities');
    expect(err.message).toContain('children');
  });

  it('lets a posting account through to the database', async () => {
    // Reaching the (unreachable) db is the pass condition: the guard did not fire.
    await expect(storage().createTransaction(txRow({ coaCode: POSTING }))).rejects.toThrow(
      'the guard let the write reach the database',
    );
  });

  it('lets a row carrying no code at all through', async () => {
    await expect(storage().createTransaction(txRow({}))).rejects.toThrow(
      'the guard let the write reach the database',
    );
  });
});

describe('updateTransaction refuses a header account', () => {
  it('rejects a header arriving on a partial update', async () => {
    // updateTransaction takes Partial<insert>, so coa_code can be set here without ever
    // passing through createTransaction.
    await expect(
      storage().updateTransaction('tx1', 't1', { coaCode: HEADER } as any),
    ).rejects.toThrow(StorageValidationError);
  });

  it('lets an unrelated field through', async () => {
    await expect(
      storage().updateTransaction('tx1', 't1', { description: 'ComEd' } as any),
    ).rejects.toThrow('the guard let the write reach the database');
  });
});

describe('classifyTransaction refuses a header account', () => {
  const opts = { actorId: 'u1', actorType: 'user' as const, trustLevel: 'L3' };

  it('rejects an authoritative classification to a header', async () => {
    const err = await storage()
      .classifyTransaction('tx1', 't1', HEADER, opts)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ClassificationError);
    expect(err.code).toBe('header_not_postable');
    expect(err.message).toContain('Utilities');
  });

  it('rejects a suggestion to a header — this is the bulk-accept and AI path', async () => {
    const err = await storage()
      .classifyTransaction('tx1', 't1', HEADER, { ...opts, trustLevel: 'L1', isSuggestion: true })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ClassificationError);
    expect(err.code).toBe('header_not_postable');
  });

  it('rejects every header in the chart, not just the one under test', async () => {
    for (const code of HEADER_CODES) {
      const err = await storage()
        .classifyTransaction('tx1', 't1', code, opts)
        .catch((e) => e);
      expect(err, `${code} was not refused`).toBeInstanceOf(ClassificationError);
      expect((err as ClassificationError).code).toBe('header_not_postable');
    }
  });

  it('lets a posting account through to the database', async () => {
    await expect(storage().classifyTransaction('tx1', 't1', POSTING, opts)).rejects.toThrow(
      'the guard let the write reach the database',
    );
  });
});

describe('the HTTP surface', () => {
  it('maps a storage rejection to 400 with a stable error code', async () => {
    const app = new Hono();
    app.onError(errorHandler);
    app.post('/t', async () => {
      await storage().createTransaction(txRow({ coaCode: HEADER }));
      return new Response('unreachable');
    });
    const res = await app.request('/t', { method: 'POST' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'header_not_postable' });
  });
});

describe('the AI suggester never sees a header', () => {
  const coa: CoaOption[] = [
    { code: POSTING, name: 'Utilities - Electric', type: 'expense' },
    { code: HEADER, name: 'Utilities', type: 'expense' },
    { code: '9010', name: 'Suspense / Unclassified', type: 'expense' },
  ];

  it('drops headers from the reference list before the model is asked', async () => {
    // With no API key the function takes its keyword-fallback path and never calls
    // OpenAI, which is what makes this runnable in CI. The filter is upstream of both
    // branches, so what is asserted is the outcome: no suggestion names a header.
    const suggestions = await classifyBatchWithAI(
      [{ id: 'tx1', description: 'ComEd electric bill', amount: '-80.00', category: 'Electric' }],
      coa,
      '',
    );
    expect(suggestions).toHaveLength(1);
    expect(HEADER_CODES).not.toContain(suggestions[0].coaCode as never);
    expect(suggestions[0].coaCode).toBe(POSTING);
  });
});
