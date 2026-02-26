import type { ValuationProvider, ValuationEstimate } from './types';

export const zillowProvider: ValuationProvider = {
  name: 'zillow',

  isConfigured(env) {
    return Boolean(env.ZILLOW_API_KEY);
  },

  async fetchEstimate(address, env): Promise<ValuationEstimate | null> {
    const apiKey = env.ZILLOW_API_KEY;
    if (!apiKey) return null;

    try {
      const encoded = encodeURIComponent(address);
      const res = await fetch(
        `https://zillow-com1.p.rapidapi.com/propertyExtendedSearch?location=${encoded}`,
        { headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': 'zillow-com1.p.rapidapi.com' } },
      );
      if (!res.ok) {
        console.warn(`[valuation:zillow] HTTP ${res.status} for "${address}"`);
        return null;
      }
      const data = await res.json() as any;
      const prop = data?.props?.[0];
      if (!prop?.zestimate) return null;

      return {
        source: 'zillow',
        estimate: prop.zestimate,
        low: prop.zestimateLowPercent ? prop.zestimate * (1 - prop.zestimateLowPercent / 100) : prop.zestimate * 0.94,
        high: prop.zestimateHighPercent ? prop.zestimate * (1 + prop.zestimateHighPercent / 100) : prop.zestimate * 1.06,
        rentalEstimate: prop.rentZestimate || undefined,
        confidence: 0.9,
        details: { zpid: prop.zpid, lastSoldPrice: prop.lastSoldPrice },
        fetchedAt: new Date(),
      };
    } catch (err) {
      console.warn(`[valuation:zillow] Failed for "${address}":`, (err as Error).message);
      return null;
    }
  },
};
