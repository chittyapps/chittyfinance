import type { ValuationProvider, ValuationEstimate } from './types';

export const redfinProvider: ValuationProvider = {
  name: 'redfin',

  isConfigured(env) {
    return Boolean(env.REDFIN_API_KEY);
  },

  async fetchEstimate(address, env): Promise<ValuationEstimate | null> {
    const apiKey = env.REDFIN_API_KEY;
    if (!apiKey) return null;

    try {
      const encoded = encodeURIComponent(address);
      const res = await fetch(
        `https://redfin-com.p.rapidapi.com/properties/auto-complete?location=${encoded}`,
        { headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': 'redfin-com.p.rapidapi.com' } },
      );
      if (!res.ok) return null;
      const data = await res.json() as any;
      const prop = data?.payload?.sections?.[0]?.rows?.[0];
      if (!prop) return null;

      return {
        source: 'redfin',
        estimate: prop.price || 0,
        low: (prop.price || 0) * 0.95,
        high: (prop.price || 0) * 1.05,
        confidence: 0.85,
        details: { url: prop.url, type: prop.type },
        fetchedAt: new Date(),
      };
    } catch {
      return null;
    }
  },
};
