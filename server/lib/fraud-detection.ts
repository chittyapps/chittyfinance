/**
 * Fraud Detection and Anomaly Detection for ChittyFinance
 * Detects suspicious patterns, anomalies, and potential fraud
 */

import { logSuspiciousActivity } from './chittychronicle-logging';
import { openaiClient as openai } from './openai-client';

export interface FraudAlert {
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  description: string;
  transactionId?: string;
  recommendedAction: string;
  confidence: number; // 0-1
  detectedAt: Date;
  metadata?: Record<string, any>;
}

export interface TransactionPattern {
  avgAmount: number;
  stdDevAmount: number;
  frequencyPerDay: number;
  commonCategories: string[];
  commonPayees: string[];
  usualTimeOfDay: number[]; // hours
}

/**
 * Analyze transaction for fraud indicators
 */
export async function analyzeTransaction(
  transaction: {
    id: string;
    amount: number;
    description: string;
    type: string;
    date: Date;
    payee?: string;
    category?: string;
    metadata?: Record<string, any>;
  },
  tenantPattern: TransactionPattern
): Promise<FraudAlert[]> {
  const alerts: FraudAlert[] = [];

  // 1. Amount anomaly detection (Z-score)
  const zScore = Math.abs((transaction.amount - tenantPattern.avgAmount) / tenantPattern.stdDevAmount);
  if (zScore > 3) {
    alerts.push({
      severity: zScore > 5 ? 'critical' : 'high',
      type: 'amount_anomaly',
      description: `Transaction amount ($${transaction.amount}) is ${zScore.toFixed(1)}σ from average`,
      transactionId: transaction.id,
      recommendedAction: 'Verify transaction authenticity',
      confidence: Math.min(0.5 + (zScore - 3) * 0.1, 0.95),
      detectedAt: new Date(),
      metadata: { zScore, avgAmount: tenantPattern.avgAmount },
    });
  }

  // 2. Rapid succession detection (velocity check)
  const alerts2 = await checkVelocity(transaction);
  alerts.push(...alerts2);

  // 3. Unusual payee detection
  if (transaction.payee && !tenantPattern.commonPayees.includes(transaction.payee)) {
    const suspiciousPayees = /wire transfer|cash|atm|bitcoin|crypto|offshore/i;
    if (suspiciousPayees.test(transaction.payee)) {
      alerts.push({
        severity: 'medium',
        type: 'suspicious_payee',
        description: `Unusual payee: ${transaction.payee}`,
        transactionId: transaction.id,
        recommendedAction: 'Verify payee legitimacy',
        confidence: 0.6,
        detectedAt: new Date(),
      });
    }
  }

  // 4. Round number detection (common in fraud)
  if (Math.abs(transaction.amount) >= 1000 && Math.abs(transaction.amount) % 100 === 0) {
    alerts.push({
      severity: 'low',
      type: 'round_number',
      description: `Suspiciously round amount: $${transaction.amount}`,
      transactionId: transaction.id,
      recommendedAction: 'Normal for some transactions, monitor if pattern emerges',
      confidence: 0.3,
      detectedAt: new Date(),
    });
  }

  // 5. Time anomaly (unusual time of day)
  const hour = transaction.date.getHours();
  if (!tenantPattern.usualTimeOfDay.includes(hour)) {
    // Transactions between 1 AM - 5 AM are more suspicious
    if (hour >= 1 && hour <= 5) {
      alerts.push({
        severity: 'medium',
        type: 'time_anomaly',
        description: `Transaction at unusual hour: ${hour}:00`,
        transactionId: transaction.id,
        recommendedAction: 'Verify transaction was authorized',
        confidence: 0.5,
        detectedAt: new Date(),
        metadata: { hour },
      });
    }
  }

  // 6. Duplicate detection (exact match within 24 hours)
  // This would query database for similar transactions
  // Implementation pending

  // 7. ML-based anomaly detection using OpenAI
  if (openai) {
    try {
      const mlAlert = await detectWithML(transaction, tenantPattern);
      if (mlAlert) {
        alerts.push(mlAlert);
      }
    } catch (error) {
      console.error('ML fraud detection error:', error);
    }
  }

  // Log critical alerts to ChittyChronicle
  for (const alert of alerts) {
    if (alert.severity === 'high' || alert.severity === 'critical') {
      await logSuspiciousActivity(
        transaction.id,
        'transaction',
        alert.type,
        {
          description: alert.description,
          severity: alert.severity,
          confidence: alert.confidence,
        }
      );
    }
  }

  return alerts;
}

/**
 * Check for rapid succession of transactions (velocity check)
 */
async function checkVelocity(transaction: {
  id: string;
  amount: number;
  date: Date;
}): Promise<FraudAlert[]> {
  // This would query recent transactions (last hour)
  // and check if there are >10 transactions or >$10k total
  // Implementation pending - requires database query

  return [];
}

/**
 * ML-based anomaly detection using OpenAI
 */
async function detectWithML(
  transaction: {
    amount: number;
    description: string;
    payee?: string;
  },
  pattern: TransactionPattern
): Promise<FraudAlert | null> {
  try {
    const completion = await openai!.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a fraud detection specialist. Analyze transactions for suspicious patterns. Consider:
- Unusual descriptions or language
- Suspicious payees (offshore, crypto, etc.)
- Patterns indicative of money laundering
- Unusual transaction structures

Respond in JSON:
{
  "suspicious": true/false,
  "severity": "low/medium/high/critical",
  "type": "fraud_type",
  "description": "explanation",
  "confidence": 0.0-1.0
}`,
        },
        {
          role: 'user',
          content: `Analyze this transaction:
Amount: $${transaction.amount}
Description: ${transaction.description}
${transaction.payee ? `Payee: ${transaction.payee}` : ''}

Normal pattern for this account:
- Average: $${pattern.avgAmount.toFixed(2)}
- Common categories: ${pattern.commonCategories.join(', ')}
- Common payees: ${pattern.commonPayees.slice(0, 5).join(', ')}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 150,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(completion.choices[0].message.content || '{}');

    if (result.suspicious) {
      return {
        severity: result.severity || 'medium',
        type: result.type || 'ml_anomaly',
        description: result.description || 'ML detected suspicious pattern',
        recommendedAction: 'Review transaction details and verify authenticity',
        confidence: result.confidence || 0.5,
        detectedAt: new Date(),
        metadata: { mlDetection: true },
      };
    }
  } catch (error) {
    console.error('ML fraud detection error:', error);
  }

  return null;
}

/**
 * Calculate transaction pattern for a tenant
 */
export async function calculatePattern(tenantId: string): Promise<TransactionPattern> {
  // This would query last 90 days of transactions and calculate:
  // - Average amount
  // - Standard deviation
  // - Frequency per day
  // - Most common categories/payees
  // - Usual transaction times

  // Placeholder implementation
  return {
    avgAmount: 500,
    stdDevAmount: 200,
    frequencyPerDay: 3,
    commonCategories: ['rent_income', 'maintenance', 'utilities'],
    commonPayees: ['John Doe', 'ABC Property Management', 'City Utilities'],
    usualTimeOfDay: [9, 10, 11, 12, 13, 14, 15, 16, 17],
  };
}

/**
 * Detect structured layering (money laundering pattern)
 */
export async function detectLayering(
  transactions: Array<{
    id: string;
    amount: number;
    type: string;
    date: Date;
    category?: string;
  }>
): Promise<FraudAlert[]> {
  const alerts: FraudAlert[] = [];

  // Look for patterns like:
  // 1. Multiple small deposits followed by large withdrawal
  // 2. Rapid movement between accounts
  // 3. Round-tripping (money goes out and comes back)

  // Detect smurfing (many small transactions under reporting threshold)
  const smallTransactions = transactions.filter(t =>
    Math.abs(t.amount) < 10000 && Math.abs(t.amount) > 5000
  );

  if (smallTransactions.length >= 5) {
    const totalAmount = smallTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

    alerts.push({
      severity: 'high',
      type: 'potential_smurfing',
      description: `${smallTransactions.length} transactions totaling $${totalAmount.toFixed(2)} may indicate structuring`,
      recommendedAction: 'File SAR if pattern continues, investigate source of funds',
      confidence: 0.7,
      detectedAt: new Date(),
      metadata: {
        transactionCount: smallTransactions.length,
        totalAmount,
      },
    });
  }

  return alerts;
}

/**
 * Detect duplicate/duplicate-like transactions
 */
export async function detectDuplicates(
  tenantId: string,
  transaction: {
    amount: number;
    description: string;
    date: Date;
  },
  lookbackHours: number = 24
): Promise<FraudAlert[]> {
  // This would query database for similar transactions within time window
  // Implementation pending

  return [];
}

/**
 * Monitor for account takeover indicators
 */
export async function detectAccountTakeover(
  tenantId: string,
  activity: {
    ipAddress?: string;
    userAgent?: string;
    location?: string;
  }
): Promise<FraudAlert[]> {
  const alerts: FraudAlert[] = [];

  // Check for:
  // 1. Multiple failed login attempts
  // 2. Login from unusual location
  // 3. Sudden change in transaction patterns
  // 4. Changes to account settings from unusual IP

  // Implementation pending - requires user activity tracking

  return alerts;
}

/**
 * Generate fraud report for a tenant
 */
export async function generateFraudReport(
  tenantId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  totalAlerts: number;
  criticalAlerts: number;
  highAlerts: number;
  alerts: FraudAlert[];
  recommendations: string[];
}> {
  // This would:
  // 1. Fetch all transactions in date range
  // 2. Run fraud detection on each
  // 3. Aggregate results
  // 4. Generate recommendations

  return {
    totalAlerts: 0,
    criticalAlerts: 0,
    highAlerts: 0,
    alerts: [],
    recommendations: [],
  };
}

/**
 * Real-time monitoring middleware
 */
export async function fraudMonitoringMiddleware(req: any, res: any, next: any) {
  // Monitor POST /transactions for suspicious patterns
  if (req.method === 'POST' && req.path.includes('/transactions')) {
    try {
      const pattern = await calculatePattern(req.tenantId);
      const alerts = await analyzeTransaction(req.body, pattern);

      // Block critical alerts
      if (alerts.some(a => a.severity === 'critical')) {
        return res.status(403).json({
          error: 'Transaction blocked by fraud detection',
          alerts: alerts.filter(a => a.severity === 'critical'),
        });
      }

      // Attach warnings to request
      if (alerts.length > 0) {
        req.fraudAlerts = alerts;
      }
    } catch (error) {
      console.error('Fraud monitoring error:', error);
      // Don't block on monitoring errors
    }
  }

  next();
}
