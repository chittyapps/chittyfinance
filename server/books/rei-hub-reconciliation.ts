import { findAccountCode } from '../../database/chart-of-accounts';

export interface ReiHubTableSnapshot {
  headers: string[];
  rows: string[][];
}

export interface ReiHubSnapshot {
  source?: string;
  sourceView?: string;
  scrapedAt?: string;
  snapshotSha256?: string;
  bookedTransactions: ReiHubTableSnapshot;
  chartOfAccounts?: ReiHubTableSnapshot;
}

export interface FinanceTransactionLike {
  id: string;
  date: string | Date;
  amount: string | number;
  description: string;
  payee?: string | null;
  propertyId?: string | null;
  coaCode?: string | null;
  suggestedCoaCode?: string | null;
  reconciled?: boolean;
  type?: string | null;
}

export interface FinancePropertyLike {
  id: string;
  name: string;
  address?: string | null;
}

export interface ReiHubSourceRow {
  rowIndex: number;
  date: string;
  amount: number;
  description: string;
  account: string;
  property: string;
  vendor: string;
  type: string;
  raw: Record<string, string>;
  proposedCoaCode: string;
}

export type RepairAction =
  | {
      kind: 'assign_property';
      transactionId: string;
      endpoint: string;
      method: 'PATCH';
      payload: { propertyId: string };
      reason: string;
    }
  | {
      kind: 'suggest_classification';
      transactionId: string;
      endpoint: '/api/classification/suggest';
      method: 'POST';
      payload: { transactionId: string; coaCode: string; confidence: number; reason: string };
      reason: string;
    }
  | {
      kind: 'review_reconciled';
      transactionId: string;
      endpoint: string;
      method: 'NONE';
      payload: Record<string, never>;
      reason: string;
    };

export interface ReiHubMatch {
  source: ReiHubSourceRow;
  transactionId: string;
  matchScore: number;
  finance: {
    date: string;
    amount: number;
    description: string;
    propertyId?: string | null;
    effectiveCoaCode?: string | null;
    reconciled: boolean;
  };
  discrepancies: string[];
  actions: RepairAction[];
}

export interface ReiHubReconciliationPlan {
  snapshotSha256?: string;
  sourceRows: number;
  parsedRows: number;
  matchedRows: number;
  unmatchedSourceRows: ReiHubSourceRow[];
  ambiguousSourceRows: Array<{ source: ReiHubSourceRow; candidateTransactionIds: string[] }>;
  matches: ReiHubMatch[];
  proposedActions: RepairAction[];
  qualityFlags: string[];
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*inactive[^)]*\)/gi, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCurrency(value: string): number | null {
  if (!value || !value.trim()) return null;
  const negative = /^\s*\(/.test(value) || /^\s*-/.test(value);
  const cleaned = value.replace(/[$,()]/g, '').trim();
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
}

function toIsoDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!slash) return null;
  const year = slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3]);
  const dt = new Date(Date.UTC(year, Number(slash[1]) - 1, Number(slash[2])));
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}

function valueByAliases(record: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    const value = record[alias];
    if (value !== undefined && value.trim()) return value.trim();
  }
  return '';
}

export function parseReiHubBookedTransactions(snapshot: ReiHubSnapshot): {
  rows: ReiHubSourceRow[];
  qualityFlags: string[];
} {
  const table = snapshot.bookedTransactions;
  const normalizedHeaders = table.headers.map(normalizeHeader);
  const rows: ReiHubSourceRow[] = [];
  const qualityFlags: string[] = [];

  for (let index = 0; index < table.rows.length; index++) {
    const cells = table.rows[index];
    const record: Record<string, string> = {};
    normalizedHeaders.forEach((header, i) => {
      if (header) record[header] = String(cells[i] ?? '').trim();
    });

    const dateRaw = valueByAliases(record, ['date', 'transaction date', 'booked date', 'posted date']);
    const description = valueByAliases(record, ['description', 'memo', 'transaction', 'details']);
    const account = valueByAliases(record, ['account', 'category', 'gl account']);
    const property = valueByAliases(record, ['property', 'rental property', 'scope']);
    const vendor = valueByAliases(record, ['vendor', 'payee', 'tenant']);
    const type = valueByAliases(record, ['type', 'transaction type']);

    const amountRaw = valueByAliases(record, ['amount', 'net amount']);
    const debitRaw = valueByAliases(record, ['debit']);
    const creditRaw = valueByAliases(record, ['credit']);

    const date = toIsoDate(dateRaw);
    let amount = parseCurrency(amountRaw);
    if (amount === null) {
      const debit = parseCurrency(debitRaw) ?? 0;
      const credit = parseCurrency(creditRaw) ?? 0;
      if (debit !== 0 || credit !== 0) amount = credit - Math.abs(debit);
    }

    if (!date || amount === null || !description) {
      qualityFlags.push(`row ${index + 1}: missing/invalid date, amount, or description`);
      continue;
    }

    if (date === '1970-01-01') {
      qualityFlags.push(`row ${index + 1}: epoch date 1970-01-01`);
    }

    if (normalizeText(vendor).includes('inactive')) {
      qualityFlags.push(`row ${index + 1}: inactive vendor/payee marker`);
    }

    rows.push({
      rowIndex: index + 1,
      date,
      amount,
      description,
      account,
      property,
      vendor,
      type,
      raw: record,
      proposedCoaCode: findAccountCode(description, account || undefined),
    });
  }

  return { rows, qualityFlags };
}

function textSimilarity(a: string, b: string): number {
  const aa = new Set(normalizeText(a).split(' ').filter(Boolean));
  const bb = new Set(normalizeText(b).split(' ').filter(Boolean));
  if (aa.size === 0 || bb.size === 0) return 0;
  let overlap = 0;
  for (const token of aa) if (bb.has(token)) overlap++;
  return overlap / Math.max(aa.size, bb.size);
}

function dateOnly(value: string | Date): string {
  return (value instanceof Date ? value : new Date(value)).toISOString().slice(0, 10);
}

function absoluteAmount(value: string | number): number {
  return Math.abs(Number(value));
}

function resolveProperty(sourceProperty: string, properties: FinancePropertyLike[]): FinancePropertyLike | null {
  const needle = normalizeText(sourceProperty);
  if (!needle) return null;

  const exact = properties.find((property) => {
    const name = normalizeText(property.name);
    const address = normalizeText(property.address || '');
    return needle === name || needle === address;
  });
  if (exact) return exact;

  const candidates = properties.filter((property) => {
    const name = normalizeText(property.name);
    const address = normalizeText(property.address || '');
    return (
      (name && (needle.includes(name) || name.includes(needle))) ||
      (address && (needle.includes(address) || address.includes(needle)))
    );
  });
  return candidates.length === 1 ? candidates[0] : null;
}

function effectiveCoa(tx: FinanceTransactionLike): string | null {
  return tx.coaCode || tx.suggestedCoaCode || null;
}

export function buildReiHubReconciliationPlan(
  snapshot: ReiHubSnapshot,
  transactions: FinanceTransactionLike[],
  properties: FinancePropertyLike[],
): ReiHubReconciliationPlan {
  const parsed = parseReiHubBookedTransactions(snapshot);
  const matches: ReiHubMatch[] = [];
  const unmatchedSourceRows: ReiHubSourceRow[] = [];
  const ambiguousSourceRows: Array<{ source: ReiHubSourceRow; candidateTransactionIds: string[] }> = [];
  const proposedActions: RepairAction[] = [];

  for (const source of parsed.rows) {
    const amount = Math.abs(source.amount);
    const candidates = transactions
      .filter((tx) => dateOnly(tx.date) === source.date)
      .filter((tx) => Math.abs(absoluteAmount(tx.amount) - amount) <= 0.01)
      .map((tx) => {
        const descriptionScore = textSimilarity(source.description, tx.description);
        const vendorScore = source.vendor && tx.payee ? textSimilarity(source.vendor, tx.payee) : 0;
        return {
          tx,
          score: Math.min(1, 0.72 + descriptionScore * 0.22 + vendorScore * 0.06),
        };
      })
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      unmatchedSourceRows.push(source);
      continue;
    }

    const best = candidates[0];
    const second = candidates[1];
    if (second && Math.abs(best.score - second.score) < 0.04) {
      ambiguousSourceRows.push({
        source,
        candidateTransactionIds: candidates.filter((candidate) => best.score - candidate.score < 0.04).map((candidate) => candidate.tx.id),
      });
      continue;
    }

    const tx = best.tx;
    const resolvedProperty = resolveProperty(source.property, properties);
    const discrepancies: string[] = [];
    const actions: RepairAction[] = [];

    if (resolvedProperty && tx.propertyId !== resolvedProperty.id) {
      discrepancies.push(tx.propertyId ? 'property_conflict' : 'property_missing');
      if (tx.reconciled) {
        actions.push({
          kind: 'review_reconciled',
          transactionId: tx.id,
          endpoint: `/api/transactions/${tx.id}`,
          method: 'NONE',
          payload: {},
          reason: `REI Hub indicates property "${source.property}" but transaction is reconciled`,
        });
      } else {
        actions.push({
          kind: 'assign_property',
          transactionId: tx.id,
          endpoint: `/api/transactions/${tx.id}`,
          method: 'PATCH',
          payload: { propertyId: resolvedProperty.id },
          reason: `REI Hub property "${source.property}" resolved to ${resolvedProperty.name}`,
        });
      }
    }

    const currentCoa = effectiveCoa(tx);
    if (source.proposedCoaCode && source.proposedCoaCode !== currentCoa) {
      discrepancies.push(currentCoa ? 'classification_conflict' : 'classification_missing');
      if (tx.reconciled) {
        actions.push({
          kind: 'review_reconciled',
          transactionId: tx.id,
          endpoint: '/api/classification/audit/' + tx.id,
          method: 'NONE',
          payload: {},
          reason: `REI Hub account "${source.account}" implies ${source.proposedCoaCode}, but transaction is reconciled`,
        });
      } else {
        actions.push({
          kind: 'suggest_classification',
          transactionId: tx.id,
          endpoint: '/api/classification/suggest',
          method: 'POST',
          payload: {
            transactionId: tx.id,
            coaCode: source.proposedCoaCode,
            confidence: source.account ? 0.8 : 0.65,
            reason: `REI Hub comparison: account="${source.account || 'unspecified'}", description="${source.description}"`,
          },
          reason: 'REI Hub comparison differs from the current effective COA',
        });
      }
    }

    const match: ReiHubMatch = {
      source,
      transactionId: tx.id,
      matchScore: Number(best.score.toFixed(3)),
      finance: {
        date: dateOnly(tx.date),
        amount: Number(tx.amount),
        description: tx.description,
        propertyId: tx.propertyId,
        effectiveCoaCode: currentCoa,
        reconciled: Boolean(tx.reconciled),
      },
      discrepancies,
      actions,
    };

    matches.push(match);
    proposedActions.push(...actions);
  }

  return {
    snapshotSha256: snapshot.snapshotSha256,
    sourceRows: snapshot.bookedTransactions.rows.length,
    parsedRows: parsed.rows.length,
    matchedRows: matches.length,
    unmatchedSourceRows,
    ambiguousSourceRows,
    matches,
    proposedActions,
    qualityFlags: parsed.qualityFlags,
  };
}
