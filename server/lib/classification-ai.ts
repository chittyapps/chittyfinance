/**
 * AI-assisted COA classification.
 *
 * Uses GPT-4o with structured JSON output to suggest COA codes for
 * transactions that keyword matching can't confidently classify.
 *
 * Design notes:
 *   - Instantiates OpenAI client per-request from c.env (Workers-safe)
 *   - Never writes authoritative coa_code — only suggested_coa_code (L1)
 *   - Bounded confidence range [0, 1] returned by the model
 *   - Always falls back to keyword match if the API call fails
 *   - Batch size is capped to keep prompt under context limits and latency sane
 */

import OpenAI from 'openai';
import { findAccountCode } from '../../database/chart-of-accounts';

export interface ClassifiableTransaction {
  id: string;
  description: string;
  amount: string;
  category?: string | null;
  date: Date | string;
}

export interface CoaOption {
  code: string;
  name: string;
  type: string;
  description?: string | null;
}

export interface AiSuggestion {
  transactionId: string;
  coaCode: string;
  confidence: number;
  reason: string;
  source: 'ai' | 'keyword';
}

const MAX_BATCH = 25;
const MODEL = 'gpt-4o-mini'; // cheaper per-tx classification; gpt-4o available via override

/**
 * Build a compact COA reference for the system prompt. We include the code,
 * name, and type — descriptions are too noisy for batch calls.
 */
function buildCoaReference(coa: CoaOption[]): string {
  return coa
    .map((a) => `${a.code}=${a.name} (${a.type})`)
    .join('\n');
}

/**
 * Classify a batch of transactions via GPT-4o with structured output.
 * Always returns exactly one suggestion per input transaction.
 * Falls back to keyword matching on any error.
 */
export async function classifyBatchWithAI(
  transactions: ClassifiableTransaction[],
  coa: CoaOption[],
  apiKey: string,
  opts?: { gatewayUrl?: string; model?: string },
): Promise<AiSuggestion[]> {
  if (transactions.length === 0) return [];
  if (transactions.length > MAX_BATCH) {
    throw new Error(`Batch size ${transactions.length} exceeds max ${MAX_BATCH}`);
  }

  // Fallback path if no API key or OpenAI unavailable
  if (!apiKey) {
    return transactions.map((tx) => keywordFallback(tx));
  }

  const client = new OpenAI({
    apiKey,
    ...(opts?.gatewayUrl ? { baseURL: opts.gatewayUrl } : {}),
  });

  const coaReference = buildCoaReference(coa);
  const txPayload = transactions.map((tx) => ({
    id: tx.id,
    description: tx.description.slice(0, 200), // truncate noise
    amount: tx.amount,
    category: tx.category ?? null,
  }));

  const system = [
    'You are a real-estate accounting classifier.',
    'For each transaction, pick the best COA code from the list.',
    'Rules:',
    '- Code must be one from the reference list (exact match).',
    '- Use 9010 (Suspense) only when no other code fits.',
    '- Confidence is 0.0-1.0 — only >=0.7 if you are sure.',
    '- Reason is one short phrase (<=12 words).',
    'Respond with JSON: { "suggestions": [{ "id": string, "code": string, "confidence": number, "reason": string }] }',
    '',
    'COA reference:',
    coaReference,
  ].join('\n');

  try {
    const response = await client.chat.completions.create({
      model: opts?.model ?? MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify({ transactions: txPayload }) },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return transactions.map((tx) => keywordFallback(tx));

    const parsed = JSON.parse(content) as {
      suggestions?: Array<{ id?: string; code?: string; confidence?: number; reason?: string }>;
    };

    const validCodes = new Set(coa.map((a) => a.code));
    const suggestionMap = new Map<string, AiSuggestion>();

    for (const s of parsed.suggestions ?? []) {
      if (!s.id || !s.code) continue;
      // Reject codes not in the reference list — safer to fall back than trust a hallucination
      if (!validCodes.has(s.code)) continue;
      const confidence = typeof s.confidence === 'number' ? Math.max(0, Math.min(1, s.confidence)) : 0.5;
      suggestionMap.set(s.id, {
        transactionId: s.id,
        coaCode: s.code,
        confidence,
        reason: (s.reason ?? 'AI classification').slice(0, 120),
        source: 'ai',
      });
    }

    // Fill gaps with keyword fallback for any transaction the model skipped or hallucinated for
    return transactions.map((tx) => suggestionMap.get(tx.id) ?? keywordFallback(tx));
  } catch (err) {
    console.error('[classification-ai] OpenAI call failed, falling back to keyword match:', err);
    return transactions.map((tx) => keywordFallback(tx));
  }
}

function keywordFallback(tx: ClassifiableTransaction): AiSuggestion {
  const code = findAccountCode(tx.description, tx.category ?? undefined);
  return {
    transactionId: tx.id,
    coaCode: code,
    confidence: code === '9010' ? 0.1 : 0.7,
    reason: 'Keyword match from description',
    source: 'keyword',
  };
}
