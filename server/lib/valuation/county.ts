import type { ValuationProvider, ValuationEstimate } from './types';

// Cook County IL assessment records via Socrata Open Data API
// Assessment ratio: Cook County assesses at ~10% of market value
const COOK_COUNTY_ASSESSMENT_RATIO = 10;

export const countyProvider: ValuationProvider = {
  name: 'county',

  isConfigured() {
    // County assessor data is always available (no API key required)
    // Address filtering happens in fetchEstimate
    return true;
  },

  async fetchEstimate(address): Promise<ValuationEstimate | null> {
    // Only query for Illinois addresses (Cook County data source)
    const upperAddr = address.toUpperCase();
    if (!upperAddr.includes(', IL') && !upperAddr.includes(' IL ') && !upperAddr.includes(' ILLINOIS')) {
      return null;
    }

    try {
      // Escape single quotes for Socrata SoQL to prevent injection
      const sanitized = address.replace(/'/g, "''");
      const encoded = encodeURIComponent(sanitized);
      const res = await fetch(
        `https://datacatalog.cookcountyil.gov/resource/uzyt-m557.json?$where=property_address%20like%20%27%25${encoded}%25%27&$limit=1`,
      );
      if (!res.ok) {
        console.warn(`[valuation:county] HTTP ${res.status} for "${address}"`);
        return null;
      }
      const data = await res.json() as any[];
      if (!data?.[0]) return null;

      const assessed = parseFloat(data[0].certified_total || '0');
      const marketEstimate = assessed * COOK_COUNTY_ASSESSMENT_RATIO;

      return {
        source: 'county',
        estimate: marketEstimate,
        low: marketEstimate * 0.9,
        high: marketEstimate * 1.1,
        confidence: 0.7,
        details: { pin: data[0].pin, assessedValue: assessed, taxYear: data[0].tax_year },
        fetchedAt: new Date(),
      };
    } catch (err) {
      console.warn(`[valuation:county] Failed for "${address}":`, (err as Error).message);
      return null;
    }
  },
};
