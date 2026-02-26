import type { ValuationProvider, ValuationEstimate } from './types';

export const houseCanaryProvider: ValuationProvider = {
  name: 'housecanary',

  isConfigured(env) {
    return Boolean(env.HOUSECANARY_API_KEY);
  },

  async fetchEstimate(address, env): Promise<ValuationEstimate | null> {
    const apiKey = env.HOUSECANARY_API_KEY;
    if (!apiKey) return null;

    try {
      const encoded = encodeURIComponent(address);
      const res = await fetch(
        `https://api.housecanary.com/v2/property/value?address=${encoded}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      if (!res.ok) return null;
      const data = await res.json() as any;
      const val = data?.property?.value;
      if (!val) return null;

      return {
        source: 'housecanary',
        estimate: val.value,
        low: val.low || val.value * 0.93,
        high: val.high || val.value * 1.07,
        rentalEstimate: data?.property?.rental_value?.value,
        confidence: 0.88,
        details: { forecast: data?.property?.value_forecast },
        fetchedAt: new Date(),
      };
    } catch {
      return null;
    }
  },
};
