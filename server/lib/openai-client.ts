/**
 * Centralized OpenAI client factory for ChittyFinance.
 *
 * When AI_GATEWAY_ENDPOINT is set, all OpenAI requests are proxied through
 * Cloudflare AI Gateway for unified observability, caching, and rate limiting.
 *
 * Gateway URL format:
 *   https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_name}/openai
 */

import OpenAI from 'openai';

const API_KEY = process.env.OPENAI_API_KEY;
const GATEWAY = process.env.AI_GATEWAY_ENDPOINT;

/**
 * Shared OpenAI client instance.
 * - Routes through CF AI Gateway when AI_GATEWAY_ENDPOINT is set.
 * - Returns null when OPENAI_API_KEY is missing (callers fall back to rule-based logic).
 */
export const openaiClient: OpenAI | null = API_KEY
  ? new OpenAI({
      apiKey: API_KEY,
      ...(GATEWAY ? { baseURL: GATEWAY } : {}),
    })
  : null;

/** True when requests are proxied through Cloudflare AI Gateway. */
export const isGatewayEnabled = Boolean(GATEWAY);
