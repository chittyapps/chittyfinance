import type { ValuationProvider, ValuationEstimate } from './types';

export const countyProvider: ValuationProvider = {
  name: 'county',

  isConfigured() {
    return true; // Always available for Cook County properties
  },

  async fetchEstimate(address): Promise<ValuationEstimate | null> {
    try {
      const encoded = encodeURIComponent(address);
      const res = await fetch(
        `https://datacatalog.cookcountyil.gov/resource/uzyt-m557.json?$where=property_address%20like%20%27%25${encoded}%25%27&$limit=1`,
      );
      if (!res.ok) return null;
      const data = await res.json() as any[];
      if (!data?.[0]) return null;

      const assessed = parseFloat(data[0].certified_total || '0');
      const marketEstimate = assessed * 10;

      return {
        source: 'county',
        estimate: marketEstimate,
        low: marketEstimate * 0.9,
        high: marketEstimate * 1.1,
        confidence: 0.7,
        details: { pin: data[0].pin, assessedValue: assessed, taxYear: data[0].tax_year },
        fetchedAt: new Date(),
      };
    } catch {
      return null;
    }
  },
};
