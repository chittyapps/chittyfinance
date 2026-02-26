import { describe, it, expect } from 'vitest';

describe('valuation providers', () => {
  it('exports ValuationProvider interface and aggregateValuations', async () => {
    const mod = await import('../lib/valuation/index');
    expect(typeof mod.aggregateValuations).toBe('function');
    expect(typeof mod.getAvailableProviders).toBe('function');
  });

  it('aggregateValuations computes weighted average', async () => {
    const { aggregateValuations } = await import('../lib/valuation/index');
    const estimates = [
      { source: 'zillow', estimate: 350000, low: 330000, high: 370000, confidence: 0.9 },
      { source: 'redfin', estimate: 360000, low: 340000, high: 380000, confidence: 0.85 },
    ];
    const result = aggregateValuations(estimates);
    expect(result.weightedEstimate).toBeGreaterThan(350000);
    expect(result.weightedEstimate).toBeLessThan(360000);
    expect(result.sources).toBe(2);
  });

  it('aggregateValuations handles empty array', async () => {
    const { aggregateValuations } = await import('../lib/valuation/index');
    const result = aggregateValuations([]);
    expect(result.weightedEstimate).toBe(0);
    expect(result.sources).toBe(0);
  });

  it('aggregateValuations with single source returns that estimate', async () => {
    const { aggregateValuations } = await import('../lib/valuation/index');
    const result = aggregateValuations([
      { source: 'manual', estimate: 400000, low: 380000, high: 420000, confidence: 1.0 },
    ]);
    expect(result.weightedEstimate).toBe(400000);
    expect(result.low).toBe(380000);
    expect(result.high).toBe(420000);
    expect(result.sources).toBe(1);
  });

  it('getAvailableProviders filters by configured keys', async () => {
    const { getAvailableProviders } = await import('../lib/valuation/index');

    // No API keys set — only county should be available (always configured)
    const providers = getAvailableProviders({});
    expect(providers.length).toBe(1);
    expect(providers[0].name).toBe('county');

    // With Zillow key set
    const withZillow = getAvailableProviders({ ZILLOW_API_KEY: 'test-key' });
    expect(withZillow.length).toBe(2);
    expect(withZillow.map(p => p.name)).toContain('zillow');
    expect(withZillow.map(p => p.name)).toContain('county');
  });
});
