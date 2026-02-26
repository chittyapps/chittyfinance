import type { ValuationProvider, ValuationEstimate } from './types';

export const attomProvider: ValuationProvider = {
  name: 'attom',

  isConfigured(env) {
    return Boolean(env.ATTOM_API_KEY);
  },

  async fetchEstimate(address, env): Promise<ValuationEstimate | null> {
    const apiKey = env.ATTOM_API_KEY;
    if (!apiKey) return null;

    try {
      const encoded = encodeURIComponent(address);
      const res = await fetch(
        `https://api.gateway.attomdata.com/propertyapi/v1.0.0/attomavm/detail?address=${encoded}`,
        { headers: { apikey: apiKey, Accept: 'application/json' } },
      );
      if (!res.ok) {
        console.warn(`[valuation:attom] HTTP ${res.status} for "${address}"`);
        return null;
      }
      const data = await res.json() as any;
      const avm = data?.property?.[0]?.avm;
      if (!avm) return null;

      return {
        source: 'attom',
        estimate: avm.amount?.value || 0,
        low: avm.amount?.low || 0,
        high: avm.amount?.high || 0,
        confidence: (avm.amount?.scr || 70) / 100,
        details: { fips: data?.property?.[0]?.identifier?.fips, apn: data?.property?.[0]?.identifier?.apn },
        fetchedAt: new Date(),
      };
    } catch (err) {
      console.warn(`[valuation:attom] Failed for "${address}":`, (err as Error).message);
      return null;
    }
  },
};
