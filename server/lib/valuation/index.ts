import type { ValuationEstimate, ValuationProvider, AggregatedValuation } from './types';
import type { Env } from '../../env';
import { zillowProvider } from './zillow';
import { redfinProvider } from './redfin';
import { houseCanaryProvider } from './housecanary';
import { attomProvider } from './attom';
import { countyProvider } from './county';

export type { ValuationEstimate, ValuationProvider, AggregatedValuation } from './types';
export { VALUATION_SOURCES } from './types';
export type { ValuationSource } from './types';

const ALL_PROVIDERS: ValuationProvider[] = [
  zillowProvider,
  redfinProvider,
  houseCanaryProvider,
  attomProvider,
  countyProvider,
];

export function getAvailableProviders(env: Partial<Env>): ValuationProvider[] {
  return ALL_PROVIDERS.filter((p) => p.isConfigured(env));
}

export async function fetchAllEstimates(
  address: string,
  env: Partial<Env>,
): Promise<{ estimates: ValuationEstimate[]; errors: string[] }> {
  const providers = getAvailableProviders(env);
  const results = await Promise.allSettled(
    providers.map((p) => p.fetchEstimate(address, env)),
  );

  const estimates: ValuationEstimate[] = [];
  const errors: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      const msg = `[${providers[i].name}] ${result.reason?.message || result.reason}`;
      console.warn(`[valuation] Provider error: ${msg}`);
      errors.push(msg);
    } else if (result.value !== null) {
      estimates.push(result.value);
    }
  }

  return { estimates, errors };
}

export function aggregateValuations(
  estimates: Array<{ source: string; estimate: number; low: number; high: number; confidence: number; rentalEstimate?: number; details?: Record<string, unknown>; fetchedAt?: Date }>,
): AggregatedValuation {
  if (estimates.length === 0) {
    return { weightedEstimate: 0, low: 0, high: 0, sources: 0, estimates: [] };
  }

  const totalWeight = estimates.reduce((sum, e) => sum + e.confidence, 0);
  if (totalWeight === 0) {
    return { weightedEstimate: 0, low: 0, high: 0, sources: estimates.length, estimates: estimates as ValuationEstimate[] };
  }

  const weightedEstimate = estimates.reduce((sum, e) => sum + e.estimate * e.confidence, 0) / totalWeight;
  const weightedLow = estimates.reduce((sum, e) => sum + e.low * e.confidence, 0) / totalWeight;
  const weightedHigh = estimates.reduce((sum, e) => sum + e.high * e.confidence, 0) / totalWeight;

  return {
    weightedEstimate: Math.round(weightedEstimate),
    low: Math.round(weightedLow),
    high: Math.round(weightedHigh),
    sources: estimates.length,
    estimates: estimates as ValuationEstimate[],
  };
}
