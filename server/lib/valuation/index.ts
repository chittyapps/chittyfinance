import type { ValuationEstimate, ValuationProvider, AggregatedValuation } from './types';
import { zillowProvider } from './zillow';
import { redfinProvider } from './redfin';
import { houseCanaryProvider } from './housecanary';
import { attomProvider } from './attom';
import { countyProvider } from './county';

export type { ValuationEstimate, ValuationProvider, AggregatedValuation } from './types';

const ALL_PROVIDERS: ValuationProvider[] = [
  zillowProvider,
  redfinProvider,
  houseCanaryProvider,
  attomProvider,
  countyProvider,
];

export function getAvailableProviders(env: Record<string, string | undefined>): ValuationProvider[] {
  return ALL_PROVIDERS.filter((p) => p.isConfigured(env));
}

export async function fetchAllEstimates(
  address: string,
  env: Record<string, string | undefined>,
): Promise<ValuationEstimate[]> {
  const providers = getAvailableProviders(env);
  const results = await Promise.allSettled(
    providers.map((p) => p.fetchEstimate(address, env)),
  );
  return results
    .filter((r): r is PromiseFulfilledResult<ValuationEstimate | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((v): v is ValuationEstimate => v !== null);
}

export function aggregateValuations(
  estimates: Array<{ source: string; estimate: number; low: number; high: number; confidence: number }>,
): AggregatedValuation {
  if (estimates.length === 0) {
    return { weightedEstimate: 0, low: 0, high: 0, sources: 0, estimates: [] };
  }

  const totalWeight = estimates.reduce((sum, e) => sum + e.confidence, 0);
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
