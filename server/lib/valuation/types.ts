import type { Env } from '../../env';

export const VALUATION_SOURCES = ['zillow', 'redfin', 'housecanary', 'attom', 'county', 'manual'] as const;
export type ValuationSource = (typeof VALUATION_SOURCES)[number];

export interface ValuationEstimate {
  source: ValuationSource;
  estimate: number;
  low: number;
  high: number;
  rentalEstimate?: number;
  confidence: number; // 0-1
  details?: Record<string, unknown>;
  fetchedAt: Date;
}

export interface ValuationProvider {
  name: ValuationSource;
  isConfigured(env: Partial<Env>): boolean;
  fetchEstimate(address: string, env: Partial<Env>): Promise<ValuationEstimate | null>;
}

export interface AggregatedValuation {
  weightedEstimate: number;
  low: number;
  high: number;
  sources: number;
  estimates: ValuationEstimate[];
  errors?: string[];
}
