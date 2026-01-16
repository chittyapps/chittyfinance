/**
 * Forensic Service
 *
 * Comprehensive financial forensics service implementing methodologies from
 * the Financial Forensics Report Standards guide. Provides tools for:
 * - Transaction analysis and anomaly detection
 * - Flow of funds tracing
 * - Damage quantification
 * - Benford's Law analysis
 * - Red flag identification
 * - Evidence chain of custody
 * - Forensic report generation
 */

import { db } from "../db";
import {
  forensicInvestigations,
  forensicEvidence,
  forensicTransactionAnalysis,
  forensicAnomalies,
  forensicFlowOfFunds,
  forensicReports,
  transactions,
  type ForensicInvestigation,
  type InsertForensicInvestigation,
  type ForensicEvidence,
  type InsertForensicEvidence,
  type ForensicTransactionAnalysis,
  type InsertForensicTransactionAnalysis,
  type ForensicAnomaly,
  type InsertForensicAnomaly,
  type ForensicFlowOfFunds,
  type InsertForensicFlowOfFunds,
  type ForensicReport,
  type InsertForensicReport,
  type Transaction
} from "@shared/schema";
import { eq, and, between, desc, gte, lte, sql } from "drizzle-orm";
import crypto from "crypto";

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface TransactionAnalysisResult {
  transactionId: number;
  riskLevel: "high" | "medium" | "low";
  legitimacyAssessment: "proper" | "questionable" | "improper" | "unable_to_determine";
  redFlags: string[];
  score: number;
}

export interface AnomalyDetectionResult {
  anomalyType: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  affectedTransactions: number[];
  detectionMethod: string;
}

export interface BenfordAnalysisResult {
  digit: number;
  observed: number;
  expected: number;
  deviation: number;
  chiSquare: number;
  passed: boolean;
}

export interface DamageCalculation {
  method: "direct_loss" | "net_worth" | "expenditure" | "bank_deposits" | "comparative";
  totalDamage: number;
  breakdown: {
    category: string;
    amount: number;
    description: string;
  }[];
  confidenceLevel: "high" | "medium" | "low";
  assumptions: string[];
  limitations: string[];
}

export interface FlowOfFundsTrace {
  flowId: string;
  path: {
    step: number;
    account: string;
    entity: string;
    amount: number;
    date: Date;
    method: string;
  }[];
  totalAmount: number;
  ultimateBeneficiaries: string[];
  traceability: "fully_traced" | "partially_traced" | "untraced";
}

// ============================================================================
// Risk Analysis Constants
// ============================================================================

/**
 * Risk scoring thresholds and weights for transaction analysis.
 * These values are based on forensic accounting best practices.
 */
const RISK_THRESHOLDS = {
  /** Minimum dollar amount to flag round-dollar transactions (e.g., $100.00) */
  ROUND_DOLLAR_MIN_AMOUNT: 100,

  /** Dollar amount threshold for flagging unusually large transactions */
  LARGE_AMOUNT_THRESHOLD: 50000,

  /** Minimum description length to avoid vague description flag */
  MIN_DESCRIPTION_LENGTH: 10,
};

/**
 * Risk score weights for different red flag types.
 * Higher scores indicate more severe risk indicators.
 */
const RISK_SCORE_WEIGHTS = {
  /** Points added for round dollar amounts */
  ROUND_DOLLAR: 15,

  /** Points added for unusually large transactions */
  LARGE_AMOUNT: 25,

  /** Points added for weekend/holiday transactions */
  WEEKEND_TRANSACTION: 20,

  /** Points added for vague or missing descriptions */
  VAGUE_DESCRIPTION: 10,

  /** Points added for suspicious keywords in descriptions */
  SUSPICIOUS_KEYWORDS: 15,
};

/**
 * Total risk score thresholds for categorizing transaction risk levels.
 */
const RISK_LEVEL_THRESHOLDS = {
  /** Minimum score for high risk classification */
  HIGH_RISK: 50,

  /** Minimum score for medium risk classification */
  MEDIUM_RISK: 25,
  // Anything below MEDIUM_RISK is considered low risk
};

// ============================================================================
// Authorization Helper
// ============================================================================

export async function verifyInvestigationOwnership(
  investigationId: number,
  userId: number
): Promise<ForensicInvestigation | null> {
  const investigation = await getInvestigation(investigationId);
  if (!investigation) {
    return null;
  }
  if (investigation.userId !== userId) {
    return null;
  }
  return investigation;
}

// ============================================================================
// Investigation Management
// ============================================================================

export async function createInvestigation(
  data: InsertForensicInvestigation
): Promise<ForensicInvestigation> {
  const [investigation] = await db
    .insert(forensicInvestigations)
    .values(data)
    .returning();
  return investigation;
}

export async function getInvestigation(
  investigationId: number
): Promise<ForensicInvestigation | undefined> {
  const [investigation] = await db
    .select()
    .from(forensicInvestigations)
    .where(eq(forensicInvestigations.id, investigationId));
  return investigation;
}

export async function listInvestigations(
  userId: number
): Promise<ForensicInvestigation[]> {
  return await db
    .select()
    .from(forensicInvestigations)
    .where(eq(forensicInvestigations.userId, userId))
    .orderBy(desc(forensicInvestigations.createdAt));
}

export async function updateInvestigationStatus(
  investigationId: number,
  status: string
): Promise<ForensicInvestigation | undefined> {
  const [investigation] = await db
    .update(forensicInvestigations)
    .set({ status, updatedAt: new Date() })
    .where(eq(forensicInvestigations.id, investigationId))
    .returning();
  return investigation;
}

// ============================================================================
// Evidence Management
// ============================================================================

export async function addEvidence(
  data: InsertForensicEvidence
): Promise<ForensicEvidence> {
  const [evidence] = await db
    .insert(forensicEvidence)
    .values(data)
    .returning();
  return evidence;
}

export async function getEvidence(
  investigationId: number
): Promise<ForensicEvidence[]> {
  return await db
    .select()
    .from(forensicEvidence)
    .where(eq(forensicEvidence.investigationId, investigationId));
}

/**
 * Append a custody entry to an evidence item's chain of custody atomically.
 *
 * @param evidenceId - Identifier of the evidence record to update
 * @param custodyEntry - Details of the custody transfer including `transferredTo`, `transferredBy`, `timestamp`, `location`, and `purpose`
 * @returns The updated `ForensicEvidence` when the record exists and was updated, or `undefined` if no evidence with the given `evidenceId` was found
 */
export async function updateChainOfCustody(
  evidenceId: number,
  custodyEntry: {
    transferredTo: string;
    transferredBy: string;
    timestamp: Date;
    location: string;
    purpose: string;
  }
): Promise<ForensicEvidence | undefined> {
  // Check if evidence exists
  const [evidence] = await db
    .select()
    .from(forensicEvidence)
    .where(eq(forensicEvidence.id, evidenceId));

  if (!evidence) return undefined;

  // Use atomic JSONB append to prevent race conditions
  const [updated] = await db
    .update(forensicEvidence)
    .set({
      chainOfCustody: sql`COALESCE(${forensicEvidence.chainOfCustody}, '[]'::jsonb) || ${JSON.stringify([custodyEntry])}::jsonb`
    })
    .where(eq(forensicEvidence.id, evidenceId))
    .returning();

  return updated;
}

export function calculateFileHash(content: Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// ============================================================================
// Transaction Analysis
/**
 * Assess a single transaction for forensic red flags and assign a risk score and classification.
 *
 * @param investigationId - Identifier of the investigation to which the transaction belongs
 * @param transaction - The transaction record to evaluate
 * @returns A TransactionAnalysisResult containing `transactionId`, `riskLevel` (`"high" | "medium" | "low"`), `legitimacyAssessment` (`"proper" | "questionable" | "improper" | "unable_to_determine"`), an array of detected `redFlags`, and the numeric `score`
 */

export async function analyzeTransaction(
  investigationId: number,
  transaction: Transaction
): Promise<TransactionAnalysisResult> {
  const redFlags: string[] = [];
  let riskScore = 0;

  // Check for round dollar amounts
  if (Math.abs(transaction.amount) % 1 === 0 && Math.abs(transaction.amount) >= RISK_THRESHOLDS.ROUND_DOLLAR_MIN_AMOUNT) {
    redFlags.push("Round dollar amount");
    riskScore += RISK_SCORE_WEIGHTS.ROUND_DOLLAR;
  }

  // Check for unusual amounts (very large)
  if (Math.abs(transaction.amount) > RISK_THRESHOLDS.LARGE_AMOUNT_THRESHOLD) {
    redFlags.push("Unusually large amount");
    riskScore += RISK_SCORE_WEIGHTS.LARGE_AMOUNT;
  }

  // Check for weekend/holiday transactions (simplified)
  if (transaction.date) {
    const day = new Date(transaction.date).getDay();
    if (day === 0 || day === 6) {
      redFlags.push("Weekend transaction");
      riskScore += RISK_SCORE_WEIGHTS.WEEKEND_TRANSACTION;
    }
  }

  // Check for vague descriptions
  if (!transaction.description || transaction.description.length < RISK_THRESHOLDS.MIN_DESCRIPTION_LENGTH) {
    redFlags.push("Vague or missing description");
    riskScore += RISK_SCORE_WEIGHTS.VAGUE_DESCRIPTION;
  }

  // Check for suspicious keywords
  const suspiciousKeywords = ['cash', 'consulting', 'misc', 'various', 'expenses'];
  const description = (transaction.description || '').toLowerCase();
  if (suspiciousKeywords.some(keyword => description.includes(keyword))) {
    redFlags.push("Suspicious description keywords");
    riskScore += RISK_SCORE_WEIGHTS.SUSPICIOUS_KEYWORDS;
  }

  // Determine risk level
  let riskLevel: "high" | "medium" | "low";
  if (riskScore >= RISK_LEVEL_THRESHOLDS.HIGH_RISK) riskLevel = "high";
  else if (riskScore >= RISK_LEVEL_THRESHOLDS.MEDIUM_RISK) riskLevel = "medium";
  else riskLevel = "low";

  // Determine legitimacy assessment
  let legitimacyAssessment: "proper" | "questionable" | "improper" | "unable_to_determine";
  if (riskScore >= 60) legitimacyAssessment = "improper";
  else if (riskScore >= 40) legitimacyAssessment = "questionable";
  else if (riskScore < 20) legitimacyAssessment = "proper";
  else legitimacyAssessment = "unable_to_determine";

  return {
    transactionId: transaction.id,
    riskLevel,
    legitimacyAssessment,
    redFlags,
    score: riskScore
  };
}

/**
 * Runs risk analysis on every transaction for a user and returns the per-transaction results.
 *
 * Also persists a batched set of transaction analysis records linked to the investigation.
 *
 * @param investigationId - ID of the investigation to associate persisted analysis records with
 * @param userId - ID of the user whose transactions will be analyzed
 * @returns An array of TransactionAnalysisResult objects, one per analyzed transaction
 */
export async function analyzeAllTransactions(
  investigationId: number,
  userId: number
): Promise<TransactionAnalysisResult[]> {
  // Get all transactions for the user
  const userTransactions = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId));

  const results: TransactionAnalysisResult[] = [];
  const analysesToInsert = [];

  for (const transaction of userTransactions) {
    const analysis = await analyzeTransaction(investigationId, transaction);
    results.push(analysis);

    // Collect analysis for batch insert
    analysesToInsert.push({
      investigationId,
      transactionId: transaction.id,
      transactionDate: transaction.date,
      transactionAmount: transaction.amount,
      transactionDescription: transaction.description,
      riskLevel: analysis.riskLevel,
      legitimacyAssessment: analysis.legitimacyAssessment,
      redFlags: analysis.redFlags,
      analysisNotes: `Automated analysis score: ${analysis.score}`,
      analyzedBy: "Automated System",
      evidenceReferences: []
    });
  }

  // Batch insert all analyses
  if (analysesToInsert.length > 0) {
    await db.insert(forensicTransactionAnalysis).values(analysesToInsert);
  }

  return results;
}

// ============================================================================
// Anomaly Detection
// ============================================================================

export async function detectDuplicatePayments(
  investigationId: number,
  userId: number
): Promise<AnomalyDetectionResult[]> {
  const userTransactions = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId));

  const anomalies: AnomalyDetectionResult[] = [];
  const seen = new Map<string, number[]>();

  for (const transaction of userTransactions) {
    // Guard against missing dates - skip transactions without dates
    if (!transaction.date) continue;

    const key = `${transaction.amount}_${transaction.description || 'none'}_${transaction.date.toISOString().split('T')[0]}`;

    if (!seen.has(key)) {
      seen.set(key, [transaction.id]);
    } else {
      seen.get(key)!.push(transaction.id);
    }
  }

  for (const [key, transactionIds] of seen.entries()) {
    if (transactionIds.length > 1) {
      anomalies.push({
        anomalyType: "duplicate_payment",
        severity: "high",
        description: `${transactionIds.length} identical transactions detected`,
        affectedTransactions: transactionIds,
        detectionMethod: "automated"
      });

      // Store in database
      await db.insert(forensicAnomalies).values({
        investigationId,
        anomalyType: "duplicate_payment",
        severity: "high",
        description: `${transactionIds.length} duplicate transactions with same amount, date, and description`,
        detectionMethod: "automated",
        relatedTransactions: transactionIds,
        status: "pending"
      });
    }
  }

  return anomalies;
}

export async function detectUnusualTiming(
  investigationId: number,
  userId: number
): Promise<AnomalyDetectionResult[]> {
  const userTransactions = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId));

  const anomalies: AnomalyDetectionResult[] = [];

  for (const transaction of userTransactions) {
    if (!transaction.date) continue;

    const date = new Date(transaction.date);
    const day = date.getDay();
    const hour = date.getHours();

    // Weekend transactions
    if (day === 0 || day === 6) {
      anomalies.push({
        anomalyType: "unusual_timing",
        severity: "medium",
        description: `Transaction occurred on weekend (${date.toLocaleDateString()})`,
        affectedTransactions: [transaction.id],
        detectionMethod: "automated"
      });

      await db.insert(forensicAnomalies).values({
        investigationId,
        anomalyType: "unusual_timing",
        severity: "medium",
        description: `Weekend transaction on ${date.toLocaleDateString()}`,
        detectionMethod: "automated",
        relatedTransactions: [transaction.id],
        status: "pending"
      });
    }

    // After-hours transactions (before 6 AM or after 10 PM)
    if (hour < 6 || hour > 22) {
      anomalies.push({
        anomalyType: "unusual_timing",
        severity: "medium",
        description: `Transaction occurred outside business hours (${hour}:00)`,
        affectedTransactions: [transaction.id],
        detectionMethod: "automated"
      });
    }
  }

  return anomalies;
}

export async function detectRoundDollarAnomalies(
  investigationId: number,
  userId: number
): Promise<AnomalyDetectionResult[]> {
  const userTransactions = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId));

  const roundTransactions: number[] = [];

  for (const transaction of userTransactions) {
    if (Math.abs(transaction.amount) % 1 === 0 && Math.abs(transaction.amount) >= 100) {
      roundTransactions.push(transaction.id);
    }
  }

  const anomalies: AnomalyDetectionResult[] = [];

  // Guard against division by zero
  if (userTransactions.length === 0) {
    return anomalies;
  }

  // Calculate percentage of round amounts
  const roundPercentage = (roundTransactions.length / userTransactions.length) * 100;

  // If more than 30% are round amounts, flag as anomalous
  if (roundPercentage > 30) {
    anomalies.push({
      anomalyType: "round_dollar",
      severity: "medium",
      description: `${roundPercentage.toFixed(1)}% of transactions are round dollar amounts (expected: <20%)`,
      affectedTransactions: roundTransactions,
      detectionMethod: "automated"
    });

    await db.insert(forensicAnomalies).values({
      investigationId,
      anomalyType: "round_dollar",
      severity: "medium",
      description: `Excessive round dollar amounts: ${roundPercentage.toFixed(1)}%`,
      detectionMethod: "automated",
      relatedTransactions: roundTransactions,
      status: "pending"
    });
  }

  return anomalies;
}

// ============================================================================
// Benford's Law Analysis
// ============================================================================

export function analyzeBenfordsLaw(amounts: number[]): BenfordAnalysisResult[] {
  // Expected frequencies for first digit according to Benford's Law
  const expected = {
    1: 30.1, 2: 17.6, 3: 12.5, 4: 9.7, 5: 7.9,
    6: 6.7, 7: 5.8, 8: 5.1, 9: 4.6
  };

  // Count first digits
  const digitCounts: { [key: number]: number } = {
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0
  };

  amounts.forEach(amount => {
    const firstDigit = parseInt(Math.abs(amount).toString()[0]);
    if (firstDigit >= 1 && firstDigit <= 9) {
      digitCounts[firstDigit]++;
    }
  });

  const total = Object.values(digitCounts).reduce((a, b) => a + b, 0);
  const results: BenfordAnalysisResult[] = [];
  let totalChiSquare = 0;

  // Guard against division by zero
  if (total === 0) {
    // Return empty results if no valid amounts
    for (let digit = 1; digit <= 9; digit++) {
      results.push({
        digit,
        observed: 0,
        expected: expected[digit as keyof typeof expected],
        deviation: -expected[digit as keyof typeof expected],
        chiSquare: 0,
        passed: false
      });
    }
    return results;
  }

  for (let digit = 1; digit <= 9; digit++) {
    const observed = (digitCounts[digit] / total) * 100;
    const expectedFreq = expected[digit as keyof typeof expected];
    const deviation = observed - expectedFreq;

    // Chi-square calculation
    const chiSquare = Math.pow(digitCounts[digit] - (total * expectedFreq / 100), 2) / (total * expectedFreq / 100);
    totalChiSquare += chiSquare;

    // Consider significant if deviation > 2%
    const passed = Math.abs(deviation) <= 2;

    results.push({
      digit,
      observed: parseFloat(observed.toFixed(2)),
      expected: expectedFreq,
      deviation: parseFloat(deviation.toFixed(2)),
      chiSquare: parseFloat(chiSquare.toFixed(2)),
      passed
    });
  }

  return results;
}

export async function runBenfordsLawAnalysis(
  investigationId: number,
  userId: number
): Promise<BenfordAnalysisResult[]> {
  const userTransactions = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId));

  const amounts = userTransactions.map(t => Math.abs(t.amount));
  const results = analyzeBenfordsLaw(amounts);

  // Check if analysis failed (significant deviations)
  const failedDigits = results.filter(r => !r.passed);
  if (failedDigits.length >= 3) {
    await db.insert(forensicAnomalies).values({
      investigationId,
      anomalyType: "benford_violation",
      severity: "high",
      description: `Benford's Law analysis failed for ${failedDigits.length} digits, suggesting potential data manipulation`,
      detectionMethod: "automated",
      relatedTransactions: userTransactions.map(t => t.id),
      status: "pending"
    });
  }

  return results;
}

// ============================================================================
// Flow of Funds Analysis
// ============================================================================

export async function traceFlowOfFunds(
  investigationId: number,
  sourceTransactionId: number
): Promise<FlowOfFundsTrace> {
  // This is a simplified implementation
  // In a real system, this would trace through multiple accounts and transactions

  const flowId = crypto.randomUUID();

  const [transaction] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, sourceTransactionId));

  if (!transaction) {
    throw new Error("Source transaction not found");
  }

  // Build flow path (simplified - would be more complex in production)
  const path = [{
    step: 1,
    account: "Source Account",
    entity: transaction.title || "Unknown",
    amount: Math.abs(transaction.amount),
    date: transaction.date || new Date(),
    method: transaction.type === "expense" ? "payment" : "deposit"
  }];

  return {
    flowId,
    path,
    totalAmount: Math.abs(transaction.amount),
    ultimateBeneficiaries: [transaction.title || "Unknown"],
    traceability: "partially_traced"
  };
}

export async function createFlowOfFundsRecord(
  data: InsertForensicFlowOfFunds
): Promise<ForensicFlowOfFunds> {
  const [flow] = await db
    .insert(forensicFlowOfFunds)
    .values(data)
    .returning();
  return flow;
}

export async function getFlowOfFunds(
  investigationId: number
): Promise<ForensicFlowOfFunds[]> {
  return await db
    .select()
    .from(forensicFlowOfFunds)
    .where(eq(forensicFlowOfFunds.investigationId, investigationId));
}

// ============================================================================
// Damage Calculation Methods
/**
 * Compute the total direct loss based on a set of transactions identified as improper.
 *
 * When `improperTransactionIds` is empty, returns a DamageCalculation with `totalDamage` 0 and an empty breakdown.
 *
 * @param investigationId - Identifier of the investigation for which the calculation is performed
 * @param improperTransactionIds - Array of transaction IDs considered improper; amounts for these transactions are summed
 * @returns A DamageCalculation containing:
 *  - `method`: `"direct_loss"`,
 *  - `totalDamage`: sum of absolute amounts for the identified transactions,
 *  - `breakdown`: per-transaction entries with category, amount, and description,
 *  - `confidenceLevel`, `assumptions`, and `limitations` describing the calculation context
 */

export async function calculateDirectLoss(
  investigationId: number,
  improperTransactionIds: number[]
): Promise<DamageCalculation> {
  // Handle empty array case
  if (improperTransactionIds.length === 0) {
    return {
      method: "direct_loss",
      totalDamage: 0,
      breakdown: [],
      confidenceLevel: "high",
      assumptions: ["No improper transactions identified"],
      limitations: ["Does not include consequential damages", "Does not include interest"]
    };
  }

  const improperTransactions = await db
    .select()
    .from(transactions)
    .where(sql`${transactions.id} = ANY(${improperTransactionIds})`);

  let totalDamage = 0;
  const breakdown: { category: string; amount: number; description: string }[] = [];

  for (const transaction of improperTransactions) {
    const amount = Math.abs(parseFloat(String(transaction.amount)) || 0);
    totalDamage += amount;

    breakdown.push({
      category: transaction.type || "unknown",
      amount,
      description: transaction.description || transaction.title || "Improper transaction"
    });
  }

  return {
    method: "direct_loss",
    totalDamage,
    breakdown,
    confidenceLevel: "high",
    assumptions: ["All identified transactions are improper", "Amounts are accurate as recorded"],
    limitations: ["Does not include consequential damages", "Does not include interest"]
  };
}

export async function calculateNetWorthMethod(
  beginningNetWorth: number,
  endingNetWorth: number,
  personalExpenditures: number,
  legitimateIncome: number
): Promise<DamageCalculation> {
  const netWorthIncrease = endingNetWorth - beginningNetWorth;
  const unexplainedWealth = netWorthIncrease + personalExpenditures - legitimateIncome;

  return {
    method: "net_worth",
    totalDamage: unexplainedWealth,
    breakdown: [
      {
        category: "Net Worth Increase",
        amount: netWorthIncrease,
        description: "Increase in assets minus liabilities"
      },
      {
        category: "Personal Expenditures",
        amount: personalExpenditures,
        description: "Living expenses and purchases"
      },
      {
        category: "Legitimate Income",
        amount: -legitimateIncome,
        description: "Verified income from legitimate sources"
      }
    ],
    confidenceLevel: "medium",
    assumptions: [
      "All assets and liabilities have been identified",
      "Legitimate income has been fully documented",
      "No significant gifts or inheritances"
    ],
    limitations: [
      "Requires access to personal financial records",
      "May not capture cash transactions",
      "Estimates may be required for some values"
    ]
  };
}

export function calculatePreJudgmentInterest(
  lossAmount: number,
  lossDate: Date,
  interestRate: number
): number {
  const now = new Date();
  const daysDiff = (now.getTime() - lossDate.getTime()) / (1000 * 60 * 60 * 24);
  const years = daysDiff / 365.25;

  return lossAmount * interestRate * years;
}

// ============================================================================
// Report Generation
/**
 * Builds a formatted executive summary report for the specified investigation.
 *
 * @param investigationId - ID of the investigation to summarize
 * @returns A formatted executive summary string containing case details, key findings, estimated damages, primary concerns, and recommendations
 * @throws If no investigation with the given `investigationId` exists
 */

export async function generateExecutiveSummary(
  investigationId: number
): Promise<string> {
  const investigation = await getInvestigation(investigationId);
  if (!investigation) throw new Error("Investigation not found");

  const analyses = await db
    .select()
    .from(forensicTransactionAnalysis)
    .where(eq(forensicTransactionAnalysis.investigationId, investigationId));

  const anomalies = await db
    .select()
    .from(forensicAnomalies)
    .where(eq(forensicAnomalies.investigationId, investigationId));

  const improperCount = analyses.filter(a => a.legitimacyAssessment === "improper").length;
  const questionableCount = analyses.filter(a => a.legitimacyAssessment === "questionable").length;
  const highRiskCount = analyses.filter(a => a.riskLevel === "high").length;

  const totalImproper = analyses
    .filter(a => a.legitimacyAssessment === "improper")
    .reduce((sum, a) => sum + Math.abs(parseFloat(String(a.transactionAmount)) || 0), 0);

  let summary = `# Executive Summary: ${investigation.title}\n\n`;
  summary += `**Case Number:** ${investigation.caseNumber}\n`;
  summary += `**Investigation Period:** ${investigation.investigationPeriodStart?.toLocaleDateString()} to ${investigation.investigationPeriodEnd?.toLocaleDateString()}\n`;
  summary += `**Status:** ${investigation.status}\n\n`;

  summary += `## Key Findings\n\n`;
  summary += `- **Total Transactions Analyzed:** ${analyses.length}\n`;
  summary += `- **High Risk Transactions:** ${highRiskCount}\n`;
  summary += `- **Improper Transactions:** ${improperCount}\n`;
  summary += `- **Questionable Transactions:** ${questionableCount}\n`;
  summary += `- **Anomalies Detected:** ${anomalies.length}\n\n`;

  summary += `## Estimated Damages\n\n`;
  summary += `Based on direct loss calculation of identified improper transactions:\n`;
  summary += `**$${totalImproper.toFixed(2)}**\n\n`;

  summary += `## Primary Concerns\n\n`;
  if (anomalies.length > 0) {
    const critical = anomalies.filter(a => a.severity === "critical").length;
    const high = anomalies.filter(a => a.severity === "high").length;
    summary += `- ${critical} critical anomalies requiring immediate attention\n`;
    summary += `- ${high} high-severity anomalies\n`;
  }

  summary += `\n## Recommendations\n\n`;
  summary += `1. Conduct detailed investigation of all high-risk transactions\n`;
  summary += `2. Obtain supporting documentation for questionable transactions\n`;
  summary += `3. Interview relevant personnel\n`;
  summary += `4. Implement enhanced controls to prevent future occurrences\n`;

  return summary;
}

export async function createForensicReport(
  data: InsertForensicReport
): Promise<ForensicReport> {
  const [report] = await db
    .insert(forensicReports)
    .values(data)
    .returning();
  return report;
}

export async function getForensicReports(
  investigationId: number
): Promise<ForensicReport[]> {
  return await db
    .select()
    .from(forensicReports)
    .where(eq(forensicReports.investigationId, investigationId))
    .orderBy(desc(forensicReports.generatedAt));
}

// ============================================================================
// Comprehensive Analysis Runner
// ============================================================================

export async function runComprehensiveAnalysis(
  investigationId: number,
  userId: number
): Promise<{
  transactionAnalyses: TransactionAnalysisResult[];
  duplicatePayments: AnomalyDetectionResult[];
  unusualTiming: AnomalyDetectionResult[];
  roundDollars: AnomalyDetectionResult[];
  benfordsLaw: BenfordAnalysisResult[];
}> {
  // Run all analysis methods
  const [
    transactionAnalyses,
    duplicatePayments,
    unusualTiming,
    roundDollars,
    benfordsLaw
  ] = await Promise.all([
    analyzeAllTransactions(investigationId, userId),
    detectDuplicatePayments(investigationId, userId),
    detectUnusualTiming(investigationId, userId),
    detectRoundDollarAnomalies(investigationId, userId),
    runBenfordsLawAnalysis(investigationId, userId)
  ]);

  return {
    transactionAnalyses,
    duplicatePayments,
    unusualTiming,
    roundDollars,
    benfordsLaw
  };
}