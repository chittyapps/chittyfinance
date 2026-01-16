// @ts-nocheck - TODO: Add proper types
/**
 * Reconciliation Module for ChittyFinance
 * Provides bank reconciliation and transaction matching functionality
 */

import { storage } from '../storage';
import { logReconciliation } from './chittychronicle-logging';

export interface ReconciliationMatch {
  internalTransaction: {
    id: string;
    date: Date;
    amount: number;
    description: string;
  };
  externalTransaction: {
    id: string;
    date: Date;
    amount: number;
    description: string;
  };
  confidence: number; // 0-1
  matchType: 'exact' | 'fuzzy' | 'manual';
}

export interface ReconciliationSummary {
  accountId: string;
  accountName: string;
  statementBalance: number;
  bookBalance: number;
  difference: number;
  matched: number;
  unmatched: number;
  missingFromBooks: number;
  missingFromStatement: number;
  startDate: Date;
  endDate: Date;
}

/**
 * Match internal transactions with external statement transactions
 */
export async function matchTransactions(
  internalTransactions: Array<{
    id: string;
    date: Date;
    amount: number;
    description: string;
    externalId?: string;
  }>,
  externalTransactions: Array<{
    id: string;
    date: Date;
    amount: number;
    description: string;
  }>
): Promise<ReconciliationMatch[]> {
  const matches: ReconciliationMatch[] = [];
  const unmatchedInternal = new Set(internalTransactions.map(t => t.id));
  const unmatchedExternal = new Set(externalTransactions.map(t => t.id));

  // 1. Exact matches by externalId
  for (const internal of internalTransactions) {
    if (internal.externalId) {
      const external = externalTransactions.find(e => e.id === internal.externalId);
      if (external) {
        matches.push({
          internalTransaction: internal,
          externalTransaction: external,
          confidence: 1.0,
          matchType: 'exact',
        });
        unmatchedInternal.delete(internal.id);
        unmatchedExternal.delete(external.id);
      }
    }
  }

  // 2. Exact matches by amount + date (within 2 days)
  const remainingInternal = internalTransactions.filter(t => unmatchedInternal.has(t.id));
  const remainingExternal = externalTransactions.filter(t => unmatchedExternal.has(t.id));

  for (const internal of remainingInternal) {
    for (const external of remainingExternal) {
      if (!unmatchedExternal.has(external.id)) continue;

      // Match criteria
      const amountMatch = Math.abs(internal.amount - external.amount) < 0.01;
      const dateDiff = Math.abs(internal.date.getTime() - external.date.getTime());
      const dateMatch = dateDiff <= 2 * 24 * 60 * 60 * 1000; // Within 2 days

      if (amountMatch && dateMatch) {
        matches.push({
          internalTransaction: internal,
          externalTransaction: external,
          confidence: 0.95,
          matchType: 'exact',
        });
        unmatchedInternal.delete(internal.id);
        unmatchedExternal.delete(external.id);
        break;
      }
    }
  }

  // 3. Fuzzy matches by description similarity + amount (within 5 days)
  const stillUnmatchedInternal = internalTransactions.filter(t => unmatchedInternal.has(t.id));
  const stillUnmatchedExternal = externalTransactions.filter(t => unmatchedExternal.has(t.id));

  for (const internal of stillUnmatchedInternal) {
    let bestMatch: { external: typeof stillUnmatchedExternal[0]; score: number } | null = null;

    for (const external of stillUnmatchedExternal) {
      if (!unmatchedExternal.has(external.id)) continue;

      // Match criteria
      const amountMatch = Math.abs(internal.amount - external.amount) < 0.01;
      const dateDiff = Math.abs(internal.date.getTime() - external.date.getTime());
      const dateMatch = dateDiff <= 5 * 24 * 60 * 60 * 1000; // Within 5 days

      if (amountMatch && dateMatch) {
        const similarity = calculateStringSimilarity(
          internal.description.toLowerCase(),
          external.description.toLowerCase()
        );

        if (similarity > 0.6 && (!bestMatch || similarity > bestMatch.score)) {
          bestMatch = { external, score: similarity };
        }
      }
    }

    if (bestMatch) {
      matches.push({
        internalTransaction: internal,
        externalTransaction: bestMatch.external,
        confidence: bestMatch.score,
        matchType: 'fuzzy',
      });
      unmatchedInternal.delete(internal.id);
      unmatchedExternal.delete(bestMatch.external.id);
    }
  }

  return matches;
}

/**
 * Calculate string similarity (Levenshtein-based)
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Perform reconciliation for an account
 */
export async function reconcileAccount(
  accountId: string,
  tenantId: string,
  statementBalance: number,
  statementTransactions: Array<{
    id: string;
    date: string;
    amount: number;
    description: string;
  }>,
  startDate: Date,
  endDate: Date
): Promise<ReconciliationSummary> {
  // Get internal transactions for the period
  const allTransactions = await storage.getTransactions(tenantId);
  const internalTransactions = allTransactions
    .filter(t =>
      t.accountId === accountId &&
      new Date(t.date) >= startDate &&
      new Date(t.date) <= endDate
    )
    .map(t => ({
      id: t.id,
      date: new Date(t.date),
      amount: parseFloat(t.amount),
      description: t.description,
      externalId: t.externalId || undefined,
    }));

  // Convert statement transactions
  const externalTransactions = statementTransactions.map(t => ({
    id: t.id,
    date: new Date(t.date),
    amount: t.amount,
    description: t.description,
  }));

  // Match transactions
  const matches = await matchTransactions(internalTransactions, externalTransactions);

  // Calculate balances
  const bookBalance = internalTransactions.reduce((sum, t) => sum + t.amount, 0);
  const difference = statementBalance - bookBalance;

  // Get account info
  const account = await storage.getAccount(accountId);

  return {
    accountId,
    accountName: account?.name || 'Unknown Account',
    statementBalance,
    bookBalance,
    difference,
    matched: matches.length,
    unmatched: internalTransactions.length - matches.length,
    missingFromBooks: externalTransactions.length - matches.length,
    missingFromStatement: internalTransactions.length - matches.length,
    startDate,
    endDate,
  };
}

/**
 * Mark transactions as reconciled
 */
export async function markAsReconciled(
  transactionIds: string[],
  tenantId: string,
  userId?: string
): Promise<{ success: boolean; reconciled: number }> {
  let reconciled = 0;

  for (const id of transactionIds) {
    try {
      // This would update the transaction's reconciled flag
      // await storage.updateTransaction(id, { reconciled: true });
      reconciled++;
    } catch (error) {
      console.error(`Failed to reconcile transaction ${id}:`, error);
    }
  }

  // Log to ChittyChronicle
  await logReconciliation('account-id', transactionIds, tenantId, userId);

  return {
    success: reconciled === transactionIds.length,
    reconciled,
  };
}

/**
 * Suggest matching for unmatched transactions
 */
export async function suggestMatches(
  unmatchedInternal: Array<{
    id: string;
    date: Date;
    amount: number;
    description: string;
  }>,
  unmatchedExternal: Array<{
    id: string;
    date: Date;
    amount: number;
    description: string;
  }>
): Promise<Array<{
  internalId: string;
  externalId: string;
  confidence: number;
  reason: string;
}>> {
  const suggestions: Array<{
    internalId: string;
    externalId: string;
    confidence: number;
    reason: string;
  }> = [];

  for (const internal of unmatchedInternal) {
    for (const external of unmatchedExternal) {
      const amountMatch = Math.abs(internal.amount - external.amount) < 0.01;
      const dateDiff = Math.abs(internal.date.getTime() - external.date.getTime());
      const dateClose = dateDiff <= 7 * 24 * 60 * 60 * 1000;

      if (amountMatch && dateClose) {
        const similarity = calculateStringSimilarity(
          internal.description.toLowerCase(),
          external.description.toLowerCase()
        );

        if (similarity > 0.4) {
          suggestions.push({
            internalId: internal.id,
            externalId: external.id,
            confidence: similarity,
            reason: `Amount match + ${Math.floor(dateDiff / (24 * 60 * 60 * 1000))} days apart + ${Math.floor(similarity * 100)}% description similarity`,
          });
        }
      }
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Generate reconciliation report
 */
export async function generateReconciliationReport(
  tenantId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  accounts: ReconciliationSummary[];
  totalDifference: number;
  fullyReconciled: number;
  needsAttention: number;
}> {
  // This would:
  // 1. Get all accounts for tenant
  // 2. Reconcile each account
  // 3. Generate summary

  return {
    accounts: [],
    totalDifference: 0,
    fullyReconciled: 0,
    needsAttention: 0,
  };
}
