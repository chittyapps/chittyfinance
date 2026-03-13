import { storage } from "../storage";

export interface ChargeDetails {
  id: string;
  merchantName: string;
  amount: number;
  date: Date;
  category: string;
  recurring: boolean;
  nextChargeDate?: Date;
  subscriptionId?: string;
  frequency: 'monthly' | 'quarterly' | 'annual' | 'irregular';
  occurrences: number;
}

export interface OptimizationRecommendation {
  chargeId: string;
  merchantName: string;
  currentAmount: number;
  suggestedAction: 'cancel' | 'downgrade' | 'consolidate' | 'negotiate';
  potentialSavings: number;
  reasoning: string;
  alternativeOptions?: string[];
}

/**
 * Detect recurring charges by analyzing the tenant's transaction history.
 * Groups expenses by payee, identifies repeat charges with similar amounts,
 * and classifies frequency (monthly/quarterly/annual/irregular).
 */
function detectRecurringFromTransactions(
  transactions: Array<{
    id: string | number;
    payee?: string | null;
    amount: string | number;
    type: string;
    category?: string | null;
    date: Date | string;
    description: string;
  }>,
): ChargeDetails[] {
  const expenses = transactions.filter(t => t.type === 'expense' && (t.payee || t.description));

  const byPayee = new Map<string, typeof expenses>();
  for (const tx of expenses) {
    const key = (tx.payee || tx.description).toLowerCase().trim();
    if (!byPayee.has(key)) byPayee.set(key, []);
    byPayee.get(key)!.push(tx);
  }

  const recurring: ChargeDetails[] = [];

  for (const [, group] of byPayee) {
    if (group.length < 2) continue;

    group.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const amounts = group.map(t => Math.abs(Number(t.amount)));
    const sorted = [...amounts].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const consistent = amounts.filter(a => Math.abs(a - median) / median < 0.1);
    if (consistent.length < 2) continue;

    const dates = group.map(t => new Date(t.date).getTime());
    const intervals: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      intervals.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
    }
    const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;

    let frequency: ChargeDetails['frequency'];
    if (avgInterval >= 25 && avgInterval <= 35) frequency = 'monthly';
    else if (avgInterval >= 80 && avgInterval <= 100) frequency = 'quarterly';
    else if (avgInterval >= 340 && avgInterval <= 390) frequency = 'annual';
    else if (avgInterval < 25) continue;
    else frequency = 'irregular';

    const latest = group[group.length - 1];
    const latestDate = new Date(latest.date);

    let nextChargeDate: Date | undefined;
    if (frequency === 'monthly') {
      nextChargeDate = new Date(latestDate);
      nextChargeDate.setMonth(nextChargeDate.getMonth() + 1);
    } else if (frequency === 'quarterly') {
      nextChargeDate = new Date(latestDate);
      nextChargeDate.setMonth(nextChargeDate.getMonth() + 3);
    } else if (frequency === 'annual') {
      nextChargeDate = new Date(latestDate);
      nextChargeDate.setFullYear(nextChargeDate.getFullYear() + 1);
    }

    recurring.push({
      id: String(latest.id),
      merchantName: latest.payee || latest.description,
      amount: median,
      date: latestDate,
      category: latest.category || 'Uncategorized',
      recurring: true,
      nextChargeDate,
      frequency,
      occurrences: group.length,
    });
  }

  recurring.sort((a, b) => b.amount - a.amount);
  return recurring;
}

/**
 * Get all recurring charges by analyzing the user/tenant's transaction history.
 */
export async function getRecurringCharges(userId: number | string): Promise<ChargeDetails[]> {
  // In standalone mode, storage.getTransactions expects a tenantId.
  // For legacy Express routes, userId serves as the scope identifier.
  let transactions: any[];
  try {
    transactions = await (storage as any).getTransactions(String(userId));
  } catch {
    // Fallback: try getting transactions via user-based method if available
    transactions = (storage as any).getTransactionsByUser
      ? await (storage as any).getTransactionsByUser(String(userId))
      : [];
  }
  return detectRecurringFromTransactions(transactions);
}

/**
 * Analyze detected recurring charges and provide optimization recommendations.
 */
export async function getChargeOptimizations(userId: number | string): Promise<OptimizationRecommendation[]> {
  const charges = await getRecurringCharges(userId);
  const recommendations: OptimizationRecommendation[] = [];
  const categoryGroups = new Map<string, ChargeDetails[]>();

  for (const charge of charges) {
    const cat = charge.category.toLowerCase();
    if (!categoryGroups.has(cat)) categoryGroups.set(cat, []);
    categoryGroups.get(cat)!.push(charge);
  }

  for (const charge of charges) {
    const cat = charge.category.toLowerCase();
    const sameCategory = categoryGroups.get(cat) || [];

    if (sameCategory.length > 1) {
      const totalInCategory = sameCategory.reduce((s, c) => s + c.amount, 0);
      recommendations.push({
        chargeId: charge.id,
        merchantName: charge.merchantName,
        currentAmount: charge.amount,
        suggestedAction: 'consolidate',
        potentialSavings: totalInCategory * 0.3,
        reasoning: `${sameCategory.length} recurring charges in "${charge.category}" totaling $${totalInCategory.toFixed(2)}/period. Consolidating could reduce overlap.`,
        alternativeOptions: sameCategory.filter(c => c.id !== charge.id).map(c => c.merchantName),
      });
      continue;
    }

    if (charge.frequency === 'monthly' && charge.amount > 100) {
      recommendations.push({
        chargeId: charge.id,
        merchantName: charge.merchantName,
        currentAmount: charge.amount,
        suggestedAction: 'negotiate',
        potentialSavings: charge.amount * 0.15,
        reasoning: `$${charge.amount.toFixed(2)}/mo is significant. Consider negotiating annual pricing or volume discounts.`,
        alternativeOptions: ['Annual prepayment', 'Volume discount'],
      });
    } else if (charge.amount > 30 && (cat.includes('software') || cat.includes('saas') || cat.includes('subscription'))) {
      recommendations.push({
        chargeId: charge.id,
        merchantName: charge.merchantName,
        currentAmount: charge.amount,
        suggestedAction: 'downgrade',
        potentialSavings: charge.amount * 0.3,
        reasoning: `Review if all features of ${charge.merchantName} are being used. A lower tier may suffice.`,
      });
    } else if (charge.frequency === 'irregular' && charge.occurrences <= 3) {
      recommendations.push({
        chargeId: charge.id,
        merchantName: charge.merchantName,
        currentAmount: charge.amount,
        suggestedAction: 'cancel',
        potentialSavings: charge.amount,
        reasoning: `Irregular charge with only ${charge.occurrences} occurrences. Review if this service is still needed.`,
      });
    }
  }

  recommendations.sort((a, b) => b.potentialSavings - a.potentialSavings);
  return recommendations;
}

/**
 * Flag a recurring charge for management action by updating its transaction metadata.
 */
export async function manageRecurringCharge(
  _userId: number | string,
  chargeId: string,
  action: 'cancel' | 'modify',
  _modifications?: { amount?: number },
): Promise<{ success: boolean; message: string }> {
  // The chargeId is a transaction ID — flag it in metadata
  try {
    if ((storage as any).updateTransaction) {
      await (storage as any).updateTransaction(chargeId, String(_userId), {
        metadata: { chargeAction: action, flaggedAt: new Date().toISOString() },
      });
      return { success: true, message: `Charge ${chargeId} flagged for ${action}.` };
    }
    return { success: true, message: `Charge ${chargeId} flagged for ${action} (metadata update not available in this storage mode).` };
  } catch (err: any) {
    return { success: false, message: `Failed to flag charge: ${err.message}` };
  }
}
