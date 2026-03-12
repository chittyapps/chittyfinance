import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const chargeRoutes = new Hono<HonoEnv>();

interface RecurringCharge {
  id: string;
  merchantName: string;
  amount: number;
  date: string;
  category: string;
  recurring: boolean;
  nextChargeDate?: string;
  frequency: 'monthly' | 'quarterly' | 'annual' | 'irregular';
  occurrences: number;
}

interface OptimizationRecommendation {
  chargeId: string;
  merchantName: string;
  currentAmount: number;
  suggestedAction: 'cancel' | 'downgrade' | 'consolidate' | 'negotiate';
  potentialSavings: number;
  reasoning: string;
  alternativeOptions?: string[];
}

/**
 * Detect recurring charges by analyzing transaction history.
 * Groups expenses by payee, identifies repeat charges with similar amounts,
 * and estimates frequency + next charge date.
 */
function detectRecurringCharges(
  transactions: Array<{
    id: string;
    payee: string | null;
    amount: string;
    type: string;
    category: string | null;
    date: Date | string;
    description: string;
  }>,
): RecurringCharge[] {
  // Only look at expenses (recurring charges are outflows)
  const expenses = transactions.filter(
    (t) => t.type === 'expense' && t.payee,
  );

  // Group by normalized payee name
  const byPayee = new Map<string, typeof expenses>();
  for (const tx of expenses) {
    const key = (tx.payee || tx.description).toLowerCase().trim();
    if (!byPayee.has(key)) byPayee.set(key, []);
    byPayee.get(key)!.push(tx);
  }

  const recurring: RecurringCharge[] = [];

  for (const [, group] of byPayee) {
    if (group.length < 2) continue; // Need at least 2 occurrences

    // Sort by date ascending
    group.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    // Check if amounts are similar (within 10% tolerance for minor variations)
    const amounts = group.map((t) => Math.abs(parseFloat(t.amount)));
    const median = amounts.sort((a, b) => a - b)[Math.floor(amounts.length / 2)];
    const consistent = amounts.filter(
      (a) => Math.abs(a - median) / median < 0.1,
    );
    if (consistent.length < 2) continue; // Amounts too varied

    // Calculate average interval between charges (in days)
    const dates = group.map((t) => new Date(t.date).getTime());
    const intervals: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      intervals.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
    }
    const avgInterval =
      intervals.reduce((s, v) => s + v, 0) / intervals.length;

    // Classify frequency
    let frequency: RecurringCharge['frequency'];
    if (avgInterval >= 25 && avgInterval <= 35) frequency = 'monthly';
    else if (avgInterval >= 80 && avgInterval <= 100) frequency = 'quarterly';
    else if (avgInterval >= 340 && avgInterval <= 390) frequency = 'annual';
    else if (avgInterval < 25) continue; // Too frequent, likely not a subscription
    else frequency = 'irregular';

    // Use most recent transaction as the "current" charge
    const latest = group[group.length - 1];
    const latestDate = new Date(latest.date);

    // Estimate next charge date
    let nextChargeDate: string | undefined;
    if (frequency === 'monthly') {
      const next = new Date(latestDate);
      next.setMonth(next.getMonth() + 1);
      nextChargeDate = next.toISOString();
    } else if (frequency === 'quarterly') {
      const next = new Date(latestDate);
      next.setMonth(next.getMonth() + 3);
      nextChargeDate = next.toISOString();
    } else if (frequency === 'annual') {
      const next = new Date(latestDate);
      next.setFullYear(next.getFullYear() + 1);
      nextChargeDate = next.toISOString();
    }

    recurring.push({
      id: latest.id,
      merchantName: latest.payee || latest.description,
      amount: median,
      date: latestDate.toISOString(),
      category: latest.category || 'Uncategorized',
      recurring: true,
      nextChargeDate,
      frequency,
      occurrences: group.length,
    });
  }

  // Sort by amount descending (biggest charges first)
  recurring.sort((a, b) => b.amount - a.amount);
  return recurring;
}

/**
 * Generate optimization recommendations based on detected recurring charges.
 * Uses category, amount, and frequency to suggest actions.
 */
function analyzeOptimizations(
  charges: RecurringCharge[],
): OptimizationRecommendation[] {
  const recommendations: OptimizationRecommendation[] = [];
  const categoryGroups = new Map<string, RecurringCharge[]>();

  // Group charges by category for consolidation detection
  for (const charge of charges) {
    const cat = charge.category.toLowerCase();
    if (!categoryGroups.has(cat)) categoryGroups.set(cat, []);
    categoryGroups.get(cat)!.push(charge);
  }

  for (const charge of charges) {
    const cat = charge.category.toLowerCase();
    const sameCategory = categoryGroups.get(cat) || [];

    // Multiple charges in same category = consolidation opportunity
    if (sameCategory.length > 1) {
      const totalInCategory = sameCategory.reduce((s, c) => s + c.amount, 0);
      recommendations.push({
        chargeId: charge.id,
        merchantName: charge.merchantName,
        currentAmount: charge.amount,
        suggestedAction: 'consolidate',
        potentialSavings: totalInCategory * 0.3,
        reasoning: `${sameCategory.length} recurring charges in "${charge.category}" totaling $${totalInCategory.toFixed(2)}/period. Consolidating could reduce overlap.`,
        alternativeOptions: sameCategory
          .filter((c) => c.id !== charge.id)
          .map((c) => c.merchantName),
      });
      continue; // Don't double-recommend
    }

    // High-cost monthly charges: negotiate
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
    }
    // Medium-cost software: downgrade
    else if (
      charge.amount > 30 &&
      (cat.includes('software') ||
        cat.includes('saas') ||
        cat.includes('subscription'))
    ) {
      recommendations.push({
        chargeId: charge.id,
        merchantName: charge.merchantName,
        currentAmount: charge.amount,
        suggestedAction: 'downgrade',
        potentialSavings: charge.amount * 0.3,
        reasoning: `Review if all features of ${charge.merchantName} are being used. A lower tier may suffice.`,
      });
    }
    // Irregular charges: review for cancellation
    else if (charge.frequency === 'irregular' && charge.occurrences <= 3) {
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

  // Sort by potential savings descending
  recommendations.sort((a, b) => b.potentialSavings - a.potentialSavings);
  return recommendations;
}

// GET /api/charges/recurring — detect recurring charges from transaction history
chargeRoutes.get('/api/charges/recurring', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  const transactions = await storage.getTransactions(tenantId);
  const charges = detectRecurringCharges(transactions);

  return c.json(charges);
});

// GET /api/charges/optimizations — optimization recommendations
chargeRoutes.get('/api/charges/optimizations', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  const transactions = await storage.getTransactions(tenantId);
  const charges = detectRecurringCharges(transactions);

  return c.json(analyzeOptimizations(charges));
});

// POST /api/charges/manage — flag a charge for action (stored in metadata)
chargeRoutes.post('/api/charges/manage', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const body = await c.req.json();
  const { chargeId, action } = body;

  if (!chargeId || !action) {
    return c.json({ error: 'chargeId and action are required' }, 400);
  }

  if (!['cancel', 'downgrade', 'consolidate', 'negotiate'].includes(action)) {
    return c.json(
      { error: "action must be 'cancel', 'downgrade', 'consolidate', or 'negotiate'" },
      400,
    );
  }

  // Update the transaction's metadata to flag the management action
  const updated = await storage.updateTransaction(chargeId, tenantId, {
    metadata: { chargeAction: action, flaggedAt: new Date().toISOString() },
  });

  if (!updated) {
    return c.json({ error: 'Transaction not found' }, 404);
  }

  return c.json({
    success: true,
    message: `Charge ${chargeId} flagged for ${action}.`,
    chargeId,
    action,
  });
});
