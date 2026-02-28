import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('openai-client', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns null when OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_GATEWAY_ENDPOINT;
    const { openaiClient } = await import('../lib/openai-client');
    expect(openaiClient).toBeNull();
  });

  it('creates client when OPENAI_API_KEY is set', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key';
    delete process.env.AI_GATEWAY_ENDPOINT;
    const { openaiClient } = await import('../lib/openai-client');
    expect(openaiClient).not.toBeNull();
  });

  it('uses default baseURL when AI_GATEWAY_ENDPOINT is not set', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key';
    delete process.env.AI_GATEWAY_ENDPOINT;
    const { openaiClient, isGatewayEnabled } = await import('../lib/openai-client');
    expect(isGatewayEnabled).toBe(false);
    // Default baseURL contains openai.com
    expect((openaiClient as any)?.baseURL).toContain('openai.com');
  });

  it('routes through AI Gateway when AI_GATEWAY_ENDPOINT is set', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key';
    process.env.AI_GATEWAY_ENDPOINT = 'https://gateway.ai.cloudflare.com/v1/acct123/finance-gw/openai';
    const { openaiClient, isGatewayEnabled } = await import('../lib/openai-client');
    expect(isGatewayEnabled).toBe(true);
    expect((openaiClient as any)?.baseURL).toBe(
      'https://gateway.ai.cloudflare.com/v1/acct123/finance-gw/openai'
    );
  });

  it('reports isGatewayEnabled correctly', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key';
    process.env.AI_GATEWAY_ENDPOINT = 'https://gateway.ai.cloudflare.com/v1/acct/gw/openai';
    const mod = await import('../lib/openai-client');
    expect(mod.isGatewayEnabled).toBe(true);
  });
});
