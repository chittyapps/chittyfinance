import { describe, it, expect } from 'vitest';

describe('valuation providers', () => {
  it('exports ValuationProvider interface and aggregateValuations', async () => {
    const mod = await import('../lib/valuation/index');
    expect(typeof mod.aggregateValuations).toBe('function');
    expect(typeof mod.getAvailableProviders).toBe('function');
    expect(typeof mod.fetchAllEstimates).toBe('function');
  });

  it('aggregateValuations computes weighted average', async () => {
    const { aggregateValuations } = await import('../lib/valuation/index');
    const estimates = [
      { source: 'zillow' as const, estimate: 350000, low: 330000, high: 370000, confidence: 0.9 },
      { source: 'redfin' as const, estimate: 360000, low: 340000, high: 380000, confidence: 0.85 },
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
      { source: 'manual' as const, estimate: 400000, low: 380000, high: 420000, confidence: 1.0 },
    ]);
    expect(result.weightedEstimate).toBe(400000);
    expect(result.low).toBe(380000);
    expect(result.high).toBe(420000);
    expect(result.sources).toBe(1);
  });

  it('aggregateValuations guards against zero total weight', async () => {
    const { aggregateValuations } = await import('../lib/valuation/index');
    const result = aggregateValuations([
      { source: 'county' as const, estimate: 300000, low: 270000, high: 330000, confidence: 0 },
    ]);
    expect(result.weightedEstimate).toBe(0);
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

  it('exports VALUATION_SOURCES constant', async () => {
    const { VALUATION_SOURCES } = await import('../lib/valuation/index');
    expect(VALUATION_SOURCES).toContain('zillow');
    expect(VALUATION_SOURCES).toContain('redfin');
    expect(VALUATION_SOURCES).toContain('housecanary');
    expect(VALUATION_SOURCES).toContain('attom');
    expect(VALUATION_SOURCES).toContain('county');
    expect(VALUATION_SOURCES).toContain('manual');
  });

  it('county provider rejects non-Illinois addresses', async () => {
    const { countyProvider } = await import('../lib/valuation/county');
    const result = await countyProvider.fetchEstimate('123 Main St, New York, NY 10001', {});
    expect(result).toBeNull();
  });
});

describe('parseTurboTenantCSV', () => {
  it('parses basic CSV data', async () => {
    const { parseTurboTenantCSV } = await import('../routes/import');
    const csv = `date,description,amount,category
2024-01-15,Rent Payment,1200,rent
2024-01-20,Maintenance,-85,maintenance`;

    const result = parseTurboTenantCSV(csv);
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe('2024-01-15');
    expect(result[0].amount).toBe(1200);
    expect(result[0].category).toBe('rent');
    expect(result[1].amount).toBe(-85);
  });

  it('handles quoted fields with commas', async () => {
    const { parseTurboTenantCSV } = await import('../routes/import');
    const csv = `date,description,amount,category
2024-01-15,"Rent, Unit 5A",1200,rent
2024-01-20,"Repair: sink, faucet",-150,maintenance`;

    const result = parseTurboTenantCSV(csv);
    expect(result).toHaveLength(2);
    expect(result[0].description).toBe('Rent, Unit 5A');
    expect(result[1].description).toBe('Repair: sink, faucet');
  });

  it('handles quoted fields with escaped quotes', async () => {
    const { parseTurboTenantCSV } = await import('../routes/import');
    const csv = `date,description,amount,category
2024-01-15,"Payment for ""Studio""",1200,rent`;

    const result = parseTurboTenantCSV(csv);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('Payment for "Studio"');
  });

  it('skips rows with missing date or invalid amount', async () => {
    const { parseTurboTenantCSV } = await import('../routes/import');
    const csv = `date,description,amount,category
,No Date,100,rent
2024-01-15,Valid,200,rent
2024-01-20,Bad Amount,abc,rent`;

    const result = parseTurboTenantCSV(csv);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('Valid');
  });

  it('returns empty for single-line CSV', async () => {
    const { parseTurboTenantCSV } = await import('../routes/import');
    expect(parseTurboTenantCSV('date,description,amount')).toHaveLength(0);
    expect(parseTurboTenantCSV('')).toHaveLength(0);
  });
});

describe('deduplicationHash', () => {
  it('produces consistent SHA-256 based hash', async () => {
    const { deduplicationHash } = await import('../routes/import');
    const hash1 = await deduplicationHash('2024-01-15', 1200, 'Rent Payment');
    const hash2 = await deduplicationHash('2024-01-15', 1200, 'Rent Payment');
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^tt-[0-9a-f]{16}$/);
  });

  it('produces different hashes for different inputs', async () => {
    const { deduplicationHash } = await import('../routes/import');
    const hash1 = await deduplicationHash('2024-01-15', 1200, 'Rent');
    const hash2 = await deduplicationHash('2024-01-15', 1200, 'Maintenance');
    expect(hash1).not.toBe(hash2);
  });
});
