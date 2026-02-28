/**
 * ML-Based Transaction Categorization for ChittyFinance
 * Uses OpenAI to intelligently categorize transactions
 */

import { withRetry } from './error-handling';
import { openaiClient as openai } from './openai-client';

// Standard transaction categories
export const TRANSACTION_CATEGORIES = {
  income: [
    'salary',
    'rent_income',
    'investment_income',
    'business_revenue',
    'consulting_fees',
    'interest_income',
    'capital_gains',
    'other_income',
  ],
  expense: [
    'rent_expense',
    'mortgage',
    'utilities',
    'insurance',
    'property_tax',
    'hoa_fees',
    'maintenance',
    'repairs',
    'supplies',
    'professional_services',
    'legal_fees',
    'accounting_fees',
    'marketing',
    'office_expenses',
    'software_subscriptions',
    'travel',
    'meals',
    'entertainment',
    'payroll',
    'taxes',
    'other_expense',
  ],
  transfer: [
    'intercompany_transfer',
    'savings_transfer',
    'investment_transfer',
    'loan_payment',
    'loan_disbursement',
  ],
};

export interface CategorizationResult {
  category: string;
  confidence: number; // 0-1
  reasoning?: string;
  suggestedTags?: string[];
}

export interface CategorizationHistory {
  description: string;
  category: string;
  amount?: number;
  payee?: string;
}

/**
 * Categorize transaction using OpenAI with few-shot learning
 */
export async function categorizeTransaction(
  description: string,
  amount: number,
  type: 'income' | 'expense' | 'transfer',
  payee?: string,
  history?: CategorizationHistory[]
): Promise<CategorizationResult> {
  // Skip if no API key — fall back to rule-based categorization
  if (!openai) {
    return fallbackCategorization(description, type);
  }

  try {
    return await withRetry(async () => {
      const historyContext = history && history.length > 0
        ? `\n\nPrevious categorizations:\n${history.map(h =>
            `- "${h.description}" ${h.payee ? `from ${h.payee}` : ''} → ${h.category}`
          ).join('\n')}`
        : '';

      const completion = await openai!.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a financial transaction categorization assistant. Categorize transactions into one of these categories based on the description and context:

Income categories: ${TRANSACTION_CATEGORIES.income.join(', ')}
Expense categories: ${TRANSACTION_CATEGORIES.expense.join(', ')}
Transfer categories: ${TRANSACTION_CATEGORIES.transfer.join(', ')}

Respond in JSON format:
{
  "category": "category_name",
  "confidence": 0.95,
  "reasoning": "Brief explanation",
  "suggestedTags": ["tag1", "tag2"]
}`,
          },
          {
            role: 'user',
            content: `Categorize this transaction:
Type: ${type}
Amount: ${amount < 0 ? '-' : ''}$${Math.abs(amount).toFixed(2)}
Description: ${description}
${payee ? `Payee: ${payee}` : ''}${historyContext}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 200,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(completion.choices[0].message.content || '{}');

      return {
        category: result.category || 'other_expense',
        confidence: result.confidence || 0.5,
        reasoning: result.reasoning,
        suggestedTags: result.suggestedTags || [],
      };
    }, {
      maxRetries: 2,
      baseDelay: 1000,
    });
  } catch (error) {
    console.error('ML categorization error:', error);
    return fallbackCategorization(description, type);
  }
}

/**
 * Fallback rule-based categorization
 */
function fallbackCategorization(
  description: string,
  type: 'income' | 'expense' | 'transfer'
): CategorizationResult {
  const lowerDesc = description.toLowerCase();

  // Rent patterns
  if (lowerDesc.includes('rent')) {
    return {
      category: type === 'income' ? 'rent_income' : 'rent_expense',
      confidence: 0.8,
    };
  }

  // Utilities
  if (lowerDesc.match(/electric|gas|water|sewer|internet|cable|phone/)) {
    return { category: 'utilities', confidence: 0.85 };
  }

  // Legal/professional
  if (lowerDesc.match(/legal|attorney|lawyer|court/)) {
    return { category: 'legal_fees', confidence: 0.9 };
  }

  // Property maintenance
  if (lowerDesc.match(/repair|maintenance|plumb|electric|hvac|paint/)) {
    return { category: 'maintenance', confidence: 0.85 };
  }

  // Property tax
  if (lowerDesc.match(/property tax|real estate tax/)) {
    return { category: 'property_tax', confidence: 0.95 };
  }

  // HOA
  if (lowerDesc.match(/hoa|homeowner|condo fee/)) {
    return { category: 'hoa_fees', confidence: 0.9 };
  }

  // Mortgage
  if (lowerDesc.match(/mortgage|loan payment/)) {
    return { category: 'mortgage', confidence: 0.9 };
  }

  // Default categories
  const defaults = {
    income: 'other_income',
    expense: 'other_expense',
    transfer: 'intercompany_transfer',
  };

  return {
    category: defaults[type],
    confidence: 0.3,
  };
}

/**
 * Batch categorize multiple transactions
 */
export async function categorizeBatch(
  transactions: Array<{
    id: string;
    description: string;
    amount: number;
    type: 'income' | 'expense' | 'transfer';
    payee?: string;
  }>,
  history?: CategorizationHistory[]
): Promise<Map<string, CategorizationResult>> {
  const results = new Map<string, CategorizationResult>();

  // Process in batches to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < transactions.length; i += batchSize) {
    const batch = transactions.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(tx => categorizeTransaction(
        tx.description,
        tx.amount,
        tx.type,
        tx.payee,
        history
      ))
    );

    batch.forEach((tx, idx) => {
      results.set(tx.id, batchResults[idx]);
    });

    // Small delay between batches
    if (i + batchSize < transactions.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}

/**
 * Learn from user corrections to improve categorization
 */
export async function recordCategorization(
  description: string,
  amount: number,
  payee: string | undefined,
  category: string,
  userCorrected: boolean = false
): Promise<void> {
  // Store in database for learning (implement with actual DB storage)
  // This would be used to build the history context for future categorizations
  console.log('Recording categorization:', {
    description,
    amount,
    payee,
    category,
    userCorrected,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Get categorization history for a tenant
 */
export async function getCategorizationHistory(
  tenantId: string,
  limit: number = 50
): Promise<CategorizationHistory[]> {
  // This would query the database for historical categorizations
  // For now, return empty array
  return [];
}

/**
 * Auto-categorize uncategorized transactions
 */
export async function autoCategorizeTransactions(
  tenantId: string,
  transactionIds?: string[]
): Promise<{
  categorized: number;
  failed: number;
  results: Array<{ id: string; category: string; confidence: number }>;
}> {
  // This would:
  // 1. Fetch uncategorized transactions
  // 2. Get categorization history
  // 3. Categorize each transaction
  // 4. Update database
  // 5. Return results

  return {
    categorized: 0,
    failed: 0,
    results: [],
  };
}

/**
 * Suggest category renames/merges based on usage patterns
 */
export async function suggestCategoryOptimization(
  tenantId: string
): Promise<{
  merges: Array<{ from: string[]; to: string; reason: string }>;
  splits: Array<{ category: string; into: string[]; reason: string }>;
}> {
  // Analyze category usage and suggest optimizations
  return {
    merges: [],
    splits: [],
  };
}
