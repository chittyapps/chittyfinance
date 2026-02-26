export interface ValuationEstimate {
  source: string;
  estimate: number;
  low: number;
  high: number;
  rentalEstimate?: number;
  confidence: number; // 0-1
  details?: Record<string, unknown>;
  fetchedAt: Date;
}

export interface ValuationProvider {
  name: string;
  isConfigured(env: Record<string, string | undefined>): boolean;
  fetchEstimate(address: string, env: Record<string, string | undefined>): Promise<ValuationEstimate | null>;
}

export interface AggregatedValuation {
  weightedEstimate: number;
  low: number;
  high: number;
  sources: number;
  estimates: ValuationEstimate[];
}
