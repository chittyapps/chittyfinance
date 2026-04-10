/**
 * Tests for AI-assisted COA classification (server/lib/classification-ai.ts)
 *
 * Focus: fallback paths, input validation, defensive parsing.
 * Real OpenAI calls are mocked — we do not exercise the network in unit tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyBatchWithAI } from '../lib/classification-ai';
import type { ClassifiableTransaction, CoaOption } from '../lib/classification-ai';

const COA: CoaOption[] = [
  { code: '4000', name: 'Rental Income', type: 'income' },
  { code: '5070', name: 'Repairs', type: 'expense' },
  { code: '5300', name: 'Mortgage Interest', type: 'expense' },
  { code: '9010', name: 'Suspense', type: 'expense' },
];

const TX_REPAIR: ClassifiableTransaction = {
  id: 'tx-1',
  description: 'Home Depot #1234 — plumbing supplies',
  amount: '-125.40',
  category: 'Repairs',
  date: '2026-01-15',
};

const TX_RENT: ClassifiableTransaction = {
  id: 'tx-2',
  description: 'Rent payment from tenant',
  amount: '1800.00',
  category: 'Rent',
  date: '2026-01-01',
};

const TX_WEIRD: ClassifiableTransaction = {
  id: 'tx-3',
  description: 'xyz unclear merchant',
  amount: '-42.00',
  category: null,
  date: '2026-01-10',
};

// Mock the OpenAI SDK at module level so any `new OpenAI(...)` inside the lib uses it
const mockCreate = vi.fn();
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } };
    constructor(_opts: any) {}
  },
}));

describe('classifyBatchWithAI', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('returns empty array for empty input', async () => {
    const result = await classifyBatchWithAI([], COA, 'fake-key');
    expect(result).toEqual([]);
  });

  it('falls back to keyword match when API key is missing', async () => {
    const result = await classifyBatchWithAI([TX_REPAIR, TX_RENT], COA, '');
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.source === 'keyword')).toBe(true);
    // Repairs keyword should hit 5070 with confidence 0.7
    const repair = result.find((r) => r.transactionId === 'tx-1')!;
    expect(repair.coaCode).toBe('5070');
    expect(repair.confidence).toBe(0.7);
  });

  it('falls back to keyword match on API error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API down'));
    const result = await classifyBatchWithAI([TX_REPAIR], COA, 'fake-key');
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('keyword');
    expect(result[0].coaCode).toBe('5070');
  });

  it('parses a valid AI response and clamps confidence', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestions: [
                { id: 'tx-1', code: '5070', confidence: 0.92, reason: 'Plumbing supplies at hardware store' },
                { id: 'tx-2', code: '4000', confidence: 1.5, reason: 'Rent inflow' }, // out-of-range, should clamp
              ],
            }),
          },
        },
      ],
    });

    const result = await classifyBatchWithAI([TX_REPAIR, TX_RENT], COA, 'fake-key');
    expect(result).toHaveLength(2);

    const repair = result.find((r) => r.transactionId === 'tx-1')!;
    expect(repair.source).toBe('ai');
    expect(repair.coaCode).toBe('5070');
    expect(repair.confidence).toBe(0.92);

    const rent = result.find((r) => r.transactionId === 'tx-2')!;
    expect(rent.source).toBe('ai');
    expect(rent.coaCode).toBe('4000');
    expect(rent.confidence).toBe(1); // clamped
  });

  it('rejects hallucinated COA codes and falls back to keyword', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestions: [
                { id: 'tx-1', code: '9999', confidence: 0.9, reason: 'Made-up code' }, // not in COA
              ],
            }),
          },
        },
      ],
    });

    const result = await classifyBatchWithAI([TX_REPAIR], COA, 'fake-key');
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('keyword'); // fell back
    expect(result[0].coaCode).toBe('5070'); // from keyword match
  });

  it('fills gaps when AI skips a transaction', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestions: [
                // Only classifies tx-1, skips tx-3
                { id: 'tx-1', code: '5070', confidence: 0.85, reason: 'Repairs' },
              ],
            }),
          },
        },
      ],
    });

    const result = await classifyBatchWithAI([TX_REPAIR, TX_WEIRD], COA, 'fake-key');
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.transactionId === 'tx-1')!.source).toBe('ai');
    // tx-3 fell back to keyword, which returns 9010 (suspense) for unknown descriptions
    const weird = result.find((r) => r.transactionId === 'tx-3')!;
    expect(weird.source).toBe('keyword');
    expect(weird.coaCode).toBe('9010');
    expect(weird.confidence).toBe(0.1);
  });

  it('handles malformed JSON from the model by falling back', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'not valid json {{{' } }],
    });

    const result = await classifyBatchWithAI([TX_REPAIR], COA, 'fake-key');
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('keyword');
  });

  it('handles missing choices/content by falling back', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [] });
    const result = await classifyBatchWithAI([TX_REPAIR], COA, 'fake-key');
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('keyword');
  });

  it('rejects batches larger than MAX_BATCH', async () => {
    const big = Array.from({ length: 30 }, (_, i) => ({
      ...TX_REPAIR,
      id: `tx-${i}`,
    }));
    await expect(classifyBatchWithAI(big, COA, 'fake-key')).rejects.toThrow(/exceeds max/);
  });
});
