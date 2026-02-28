import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { createDb } from '../db/connection';
import { ledgerLog } from '../lib/ledger-client';
import {
  forensicInvestigations,
  forensicEvidence,
  forensicTransactionAnalysis,
  forensicAnomalies,
  forensicFlowOfFunds,
  forensicReports,
  insertForensicFlowOfFundsSchema,
  insertForensicReportSchema,
} from '../db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { z } from 'zod';

export const forensicRoutes = new Hono<HonoEnv>();

// ── Validation Schemas ──

const ALLOWED_STATUSES = ['open', 'in_progress', 'completed', 'closed'] as const;

const createInvestigationSchema = z.object({
  caseNumber: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  allegations: z.string().optional(),
  investigationPeriodStart: z.string().datetime().optional(),
  investigationPeriodEnd: z.string().datetime().optional(),
  status: z.enum(ALLOWED_STATUSES).optional(),
  leadInvestigator: z.string().optional(),
  metadata: z.any().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(ALLOWED_STATUSES),
});

const addEvidenceSchema = z.object({
  evidenceNumber: z.string().min(1),
  type: z.string().min(1),
  description: z.string().min(1),
  source: z.string().min(1),
  dateReceived: z.string().datetime().optional(),
  collectedBy: z.string().optional(),
  storageLocation: z.string().optional(),
  hashValue: z.string().optional(),
  chainOfCustody: z.any().optional(),
  metadata: z.any().optional(),
});

const custodyUpdateSchema = z.object({
  transferredTo: z.string().min(1),
  transferredBy: z.string().min(1),
  location: z.string().min(1),
  purpose: z.string().min(1),
});

// ── Risk Analysis Constants ──

const RISK_THRESHOLDS = {
  ROUND_DOLLAR_MIN_AMOUNT: 100,
  LARGE_AMOUNT_THRESHOLD: 50000,
  MIN_DESCRIPTION_LENGTH: 10,
};

const RISK_SCORE_WEIGHTS = {
  ROUND_DOLLAR: 15,
  LARGE_AMOUNT: 25,
  WEEKEND_TRANSACTION: 20,
  VAGUE_DESCRIPTION: 10,
  SUSPICIOUS_KEYWORDS: 15,
};

const RISK_LEVEL_THRESHOLDS = { HIGH_RISK: 50, MEDIUM_RISK: 25 };

const CHI_SQUARE_CRITICAL_95 = 15.507;

// ── Helper: get DB from env ──

function getDb(env: { DATABASE_URL: string }) {
  return createDb(env.DATABASE_URL);
}

// ── Helper: verify investigation ownership by userId ──

async function verifyOwnership(db: ReturnType<typeof createDb>, investigationId: number, userId: number) {
  const [row] = await db.select().from(forensicInvestigations)
    .where(eq(forensicInvestigations.id, investigationId));
  if (!row || row.userId !== userId) return null;
  return row;
}

// ── Helper: parse and verify investigation param ──

function parseInvestigationId(id: string): number | null {
  const n = parseInt(id, 10);
  return isNaN(n) ? null : n;
}

// ── Forensic transaction analysis helpers ──

interface TransactionRow {
  id: number;
  amount: number;
  description: string | null;
  date: Date | null;
  title?: string;
  type?: string;
}

function analyzeTransaction(tx: TransactionRow) {
  const redFlags: string[] = [];
  let score = 0;
  const absAmt = Math.abs(tx.amount);

  if (absAmt % 1 === 0 && absAmt >= RISK_THRESHOLDS.ROUND_DOLLAR_MIN_AMOUNT) {
    redFlags.push('Round dollar amount');
    score += RISK_SCORE_WEIGHTS.ROUND_DOLLAR;
  }
  if (absAmt > RISK_THRESHOLDS.LARGE_AMOUNT_THRESHOLD) {
    redFlags.push('Unusually large amount');
    score += RISK_SCORE_WEIGHTS.LARGE_AMOUNT;
  }
  if (tx.date) {
    const day = new Date(tx.date).getDay();
    if (day === 0 || day === 6) { redFlags.push('Weekend transaction'); score += RISK_SCORE_WEIGHTS.WEEKEND_TRANSACTION; }
  }
  if (!tx.description || tx.description.length < RISK_THRESHOLDS.MIN_DESCRIPTION_LENGTH) {
    redFlags.push('Vague or missing description');
    score += RISK_SCORE_WEIGHTS.VAGUE_DESCRIPTION;
  }
  const desc = (tx.description || '').toLowerCase();
  if (['cash', 'consulting', 'misc', 'various', 'expenses'].some(k => desc.includes(k))) {
    redFlags.push('Suspicious description keywords');
    score += RISK_SCORE_WEIGHTS.SUSPICIOUS_KEYWORDS;
  }

  const riskLevel = score >= RISK_LEVEL_THRESHOLDS.HIGH_RISK ? 'high' : score >= RISK_LEVEL_THRESHOLDS.MEDIUM_RISK ? 'medium' : 'low';
  const legitimacy = score >= 60 ? 'improper' : score >= 40 ? 'questionable' : score < 20 ? 'proper' : 'unable_to_determine';

  return { transactionId: tx.id, riskLevel, legitimacyAssessment: legitimacy, redFlags, score };
}

function analyzeBenfordsLaw(amounts: number[]) {
  const expected: Record<number, number> = { 1: 30.1, 2: 17.6, 3: 12.5, 4: 9.7, 5: 7.9, 6: 6.7, 7: 5.8, 8: 5.1, 9: 4.6 };
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };

  for (const a of amounts) {
    const d = parseInt(Math.abs(a).toString()[0]);
    if (d >= 1 && d <= 9) counts[d]++;
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const results: any[] = [];
  let totalChi = 0;

  for (let d = 1; d <= 9; d++) {
    const obs = total > 0 ? (counts[d] / total) * 100 : 0;
    const exp = expected[d];
    const expCount = total * exp / 100;
    const chi = total > 0 ? Math.pow(counts[d] - expCount, 2) / expCount : 0;
    totalChi += chi;
    results.push({
      digit: d,
      observed: parseFloat(obs.toFixed(2)),
      expected: exp,
      deviation: parseFloat((obs - exp).toFixed(2)),
      chiSquare: parseFloat(chi.toFixed(2)),
      passed: chi <= CHI_SQUARE_CRITICAL_95 / 9,
    });
  }

  if (results.length > 0) {
    results[0].totalChiSquare = parseFloat(totalChi.toFixed(2));
    results[0].overallPassed = totalChi <= CHI_SQUARE_CRITICAL_95;
    results[0].criticalValue = CHI_SQUARE_CRITICAL_95;
  }
  return results;
}

// ============================================================================
// INVESTIGATION ROUTES
// ============================================================================

// GET /api/forensics/investigations
forensicRoutes.get('/api/forensics/investigations', async (c) => {
  const db = getDb(c.env);
  const userId = parseInt(c.get('userId') || '0', 10);

  const rows = await db.select().from(forensicInvestigations)
    .where(eq(forensicInvestigations.userId, userId))
    .orderBy(desc(forensicInvestigations.createdAt));
  return c.json(rows);
});

// GET /api/forensics/investigations/:id
forensicRoutes.get('/api/forensics/investigations/:id', async (c) => {
  const id = parseInvestigationId(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid investigation ID' }, 400);

  const db = getDb(c.env);
  const userId = parseInt(c.get('userId') || '0', 10);
  const inv = await verifyOwnership(db, id, userId);
  if (!inv) return c.json({ error: 'Investigation not found or access denied' }, 404);

  return c.json(inv);
});

// POST /api/forensics/investigations
forensicRoutes.post('/api/forensics/investigations', async (c) => {
  const body = await c.req.json();
  const parsed = createInvestigationSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'Invalid investigation data', errors: parsed.error.errors }, 400);

  const db = getDb(c.env);
  const userId = parseInt(c.get('userId') || '0', 10);

  const values: any = { ...parsed.data, userId };
  if (values.investigationPeriodStart) values.investigationPeriodStart = new Date(values.investigationPeriodStart);
  if (values.investigationPeriodEnd) values.investigationPeriodEnd = new Date(values.investigationPeriodEnd);

  const [investigation] = await db.insert(forensicInvestigations)
    .values(values)
    .returning();
  ledgerLog(c, {
    entityType: 'evidence',
    entityId: String(investigation.id),
    action: 'investigation.created',
    metadata: { caseNumber: parsed.data.caseNumber, title: parsed.data.title, leadInvestigator: parsed.data.leadInvestigator },
  }, c.env);
  return c.json(investigation, 201);
});

// PATCH /api/forensics/investigations/:id/status
forensicRoutes.patch('/api/forensics/investigations/:id/status', async (c) => {
  const id = parseInvestigationId(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid investigation ID' }, 400);

  const body = await c.req.json();
  const parsed = updateStatusSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'Invalid status value', errors: parsed.error.errors }, 400);

  const db = getDb(c.env);
  const userId = parseInt(c.get('userId') || '0', 10);
  const existing = await verifyOwnership(db, id, userId);
  if (!existing) return c.json({ error: 'Investigation not found or access denied' }, 404);

  const [updated] = await db.update(forensicInvestigations)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(forensicInvestigations.id, id))
    .returning();
  ledgerLog(c, {
    entityType: 'evidence',
    entityId: String(id),
    action: 'investigation.status-changed',
    metadata: { previousStatus: existing.status, newStatus: parsed.data.status },
  }, c.env);
  return c.json(updated);
});

// ============================================================================
// EVIDENCE ROUTES
// ============================================================================

// POST /api/forensics/investigations/:id/evidence
forensicRoutes.post('/api/forensics/investigations/:id/evidence', async (c) => {
  const id = parseInvestigationId(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid investigation ID' }, 400);

  const body = await c.req.json();
  const parsed = addEvidenceSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'Invalid evidence data', errors: parsed.error.errors }, 400);

  const db = getDb(c.env);
  const userId = parseInt(c.get('userId') || '0', 10);
  const inv = await verifyOwnership(db, id, userId);
  if (!inv) return c.json({ error: 'Investigation not found or access denied' }, 404);

  const values: any = { ...parsed.data, investigationId: id };
  if (values.dateReceived) values.dateReceived = new Date(values.dateReceived);

  const [evidence] = await db.insert(forensicEvidence)
    .values(values)
    .returning();
  ledgerLog(c, {
    entityType: 'evidence',
    entityId: String(evidence.id),
    action: 'evidence.added',
    metadata: { investigationId: id, evidenceNumber: parsed.data.evidenceNumber, type: parsed.data.type, source: parsed.data.source },
  }, c.env);
  return c.json(evidence, 201);
});

// GET /api/forensics/investigations/:id/evidence
forensicRoutes.get('/api/forensics/investigations/:id/evidence', async (c) => {
  const id = parseInvestigationId(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid investigation ID' }, 400);

  const db = getDb(c.env);
  const userId = parseInt(c.get('userId') || '0', 10);
  const inv = await verifyOwnership(db, id, userId);
  if (!inv) return c.json({ error: 'Investigation not found or access denied' }, 404);

  const rows = await db.select().from(forensicEvidence)
    .where(eq(forensicEvidence.investigationId, id));
  return c.json(rows);
});

// POST /api/forensics/evidence/:id/custody
forensicRoutes.post('/api/forensics/evidence/:id/custody', async (c) => {
  const evidenceId = parseInt(c.req.param('id'), 10);
  if (isNaN(evidenceId)) return c.json({ error: 'Invalid evidence ID' }, 400);

  const body = await c.req.json();
  const parsed = custodyUpdateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'Invalid custody update data', errors: parsed.error.errors }, 400);

  const db = getDb(c.env);
  const userId = parseInt(c.get('userId') || '0', 10);

  const [evidenceRecord] = await db.select().from(forensicEvidence)
    .where(eq(forensicEvidence.id, evidenceId));
  if (!evidenceRecord) return c.json({ error: 'Evidence not found' }, 404);

  const inv = await verifyOwnership(db, evidenceRecord.investigationId, userId);
  if (!inv) return c.json({ error: 'Access denied to this investigation' }, 403);

  const custodyEntry = { ...parsed.data, timestamp: new Date() };
  const [updated] = await db.update(forensicEvidence)
    .set({
      chainOfCustody: sql`COALESCE(${forensicEvidence.chainOfCustody}, '[]'::jsonb) || ${JSON.stringify([custodyEntry])}::jsonb`,
    })
    .where(eq(forensicEvidence.id, evidenceId))
    .returning();

  ledgerLog(c, {
    entityType: 'custody',
    entityId: String(evidenceId),
    action: 'custody.transferred',
    metadata: { transferredTo: parsed.data.transferredTo, transferredBy: parsed.data.transferredBy, location: parsed.data.location },
  }, c.env);
  return c.json(updated);
});

// ============================================================================
// ANALYSIS ROUTES
// ============================================================================

// Helper: get transactions for a user (uses shared/schema transactions table with integer userId)
async function getUserTransactions(db: ReturnType<typeof createDb>, userId: number): Promise<TransactionRow[]> {
  // Import transactions from shared schema since forensic tables reference it
  const { transactions } = await import('../../shared/schema');
  return db.select().from(transactions).where(eq(transactions.userId, userId));
}

// POST /api/forensics/investigations/:id/analyze — comprehensive analysis
forensicRoutes.post('/api/forensics/investigations/:id/analyze', async (c) => {
  const id = parseInvestigationId(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid investigation ID' }, 400);

  const db = getDb(c.env);
  const userId = parseInt(c.get('userId') || '0', 10);
  const inv = await verifyOwnership(db, id, userId);
  if (!inv) return c.json({ error: 'Investigation not found or access denied' }, 404);

  const txns = await getUserTransactions(db, userId);
  const errors: { analysis: string; error: string }[] = [];

  // Transaction analysis
  let transactionAnalyses: ReturnType<typeof analyzeTransaction>[] = [];
  try {
    transactionAnalyses = txns.map(tx => analyzeTransaction(tx));
    if (transactionAnalyses.length > 0) {
      await db.insert(forensicTransactionAnalysis).values(
        transactionAnalyses.map(a => ({
          investigationId: id,
          transactionId: a.transactionId,
          riskLevel: a.riskLevel,
          legitimacyAssessment: a.legitimacyAssessment,
          redFlags: a.redFlags,
          analysisNotes: `Automated analysis score: ${a.score}`,
          analyzedBy: 'Automated System',
          evidenceReferences: [],
        })),
      );
    }
  } catch (e: any) { errors.push({ analysis: 'transactionAnalyses', error: e.message }); }

  // Duplicate payments
  let duplicatePayments: any[] = [];
  try {
    const seen = new Map<string, number[]>();
    for (const tx of txns) {
      if (!tx.date) continue;
      const key = `${tx.amount}_${tx.description || 'none'}_${new Date(tx.date).toISOString().split('T')[0]}`;
      if (!seen.has(key)) seen.set(key, [tx.id]); else seen.get(key)!.push(tx.id);
    }
    for (const [, ids] of seen) {
      if (ids.length > 1) {
        duplicatePayments.push({ anomalyType: 'duplicate_payment', severity: 'high', description: `${ids.length} identical transactions detected`, affectedTransactions: ids, detectionMethod: 'automated' });
        await db.insert(forensicAnomalies).values({ investigationId: id, anomalyType: 'duplicate_payment', severity: 'high', description: `${ids.length} duplicate transactions`, detectionMethod: 'automated', relatedTransactions: ids, status: 'pending' });
      }
    }
  } catch (e: any) { errors.push({ analysis: 'duplicatePayments', error: e.message }); }

  // Unusual timing
  let unusualTiming: any[] = [];
  try {
    for (const tx of txns) {
      if (!tx.date) continue;
      const d = new Date(tx.date);
      if (d.getDay() === 0 || d.getDay() === 6) {
        unusualTiming.push({ anomalyType: 'unusual_timing', severity: 'medium', description: `Weekend transaction on ${d.toLocaleDateString()}`, affectedTransactions: [tx.id], detectionMethod: 'automated' });
        await db.insert(forensicAnomalies).values({ investigationId: id, anomalyType: 'unusual_timing', severity: 'medium', description: `Weekend transaction on ${d.toLocaleDateString()}`, detectionMethod: 'automated', relatedTransactions: [tx.id], status: 'pending' });
      }
    }
  } catch (e: any) { errors.push({ analysis: 'unusualTiming', error: e.message }); }

  // Round dollar anomalies
  let roundDollars: any[] = [];
  try {
    const roundIds = txns.filter(tx => Math.abs(tx.amount) % 1 === 0 && Math.abs(tx.amount) >= 100).map(tx => tx.id);
    if (txns.length > 0) {
      const pct = (roundIds.length / txns.length) * 100;
      if (pct > 20) {
        roundDollars.push({ anomalyType: 'round_dollar', severity: 'medium', description: `${pct.toFixed(1)}% of transactions are round dollar amounts (expected: <20%)`, affectedTransactions: roundIds, detectionMethod: 'automated' });
        await db.insert(forensicAnomalies).values({ investigationId: id, anomalyType: 'round_dollar', severity: 'medium', description: `Excessive round dollar amounts: ${pct.toFixed(1)}%`, detectionMethod: 'automated', relatedTransactions: roundIds, status: 'pending' });
      }
    }
  } catch (e: any) { errors.push({ analysis: 'roundDollars', error: e.message }); }

  // Benford's law
  let benfordsLaw: any[] = [];
  try {
    benfordsLaw = analyzeBenfordsLaw(txns.map(tx => Math.abs(tx.amount)));
    if (benfordsLaw[0] && !benfordsLaw[0].overallPassed) {
      await db.insert(forensicAnomalies).values({ investigationId: id, anomalyType: 'benford_violation', severity: 'high', description: `Benford's Law analysis failed`, detectionMethod: 'automated', relatedTransactions: txns.map(tx => tx.id), status: 'pending' });
    }
  } catch (e: any) { errors.push({ analysis: 'benfordsLaw', error: e.message }); }

  ledgerLog(c, {
    entityType: 'audit',
    entityId: String(id),
    action: 'forensic.analysis-completed',
    metadata: { transactionCount: txns.length, duplicates: duplicatePayments.length, anomalies: unusualTiming.length + roundDollars.length, benfordsViolation: benfordsLaw[0]?.overallPassed === false },
  }, c.env);
  return c.json({
    transactionAnalyses, duplicatePayments, unusualTiming, roundDollars, benfordsLaw,
    ...(errors.length > 0 ? { errors } : {}),
  });
});

// POST /api/forensics/investigations/:id/analyze/duplicates
forensicRoutes.post('/api/forensics/investigations/:id/analyze/duplicates', async (c) => {
  const id = parseInvestigationId(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid investigation ID' }, 400);

  const db = getDb(c.env);
  const userId = parseInt(c.get('userId') || '0', 10);
  const txns = await getUserTransactions(db, userId);

  const anomalies: any[] = [];
  const seen = new Map<string, number[]>();
  for (const tx of txns) {
    if (!tx.date) continue;
    const key = `${tx.amount}_${tx.description || 'none'}_${new Date(tx.date).toISOString().split('T')[0]}`;
    if (!seen.has(key)) seen.set(key, [tx.id]); else seen.get(key)!.push(tx.id);
  }
  for (const [, ids] of seen) {
    if (ids.length > 1) {
      anomalies.push({ anomalyType: 'duplicate_payment', severity: 'high', description: `${ids.length} identical transactions detected`, affectedTransactions: ids, detectionMethod: 'automated' });
      await db.insert(forensicAnomalies).values({ investigationId: id, anomalyType: 'duplicate_payment', severity: 'high', description: `${ids.length} duplicate transactions`, detectionMethod: 'automated', relatedTransactions: ids, status: 'pending' });
    }
  }
  return c.json(anomalies);
});

// POST /api/forensics/investigations/:id/analyze/timing
forensicRoutes.post('/api/forensics/investigations/:id/analyze/timing', async (c) => {
  const id = parseInvestigationId(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid investigation ID' }, 400);

  const db = getDb(c.env);
  const userId = parseInt(c.get('userId') || '0', 10);
  const txns = await getUserTransactions(db, userId);

  const anomalies: any[] = [];
  for (const tx of txns) {
    if (!tx.date) continue;
    const d = new Date(tx.date);
    if (d.getDay() === 0 || d.getDay() === 6) {
      anomalies.push({ anomalyType: 'unusual_timing', severity: 'medium', description: `Transaction occurred on weekend (${d.toLocaleDateString()})`, affectedTransactions: [tx.id], detectionMethod: 'automated' });
      await db.insert(forensicAnomalies).values({ investigationId: id, anomalyType: 'unusual_timing', severity: 'medium', description: `Weekend transaction on ${d.toLocaleDateString()}`, detectionMethod: 'automated', relatedTransactions: [tx.id], status: 'pending' });
    }
    const h = d.getHours();
    if (h < 6 || h > 22) {
      anomalies.push({ anomalyType: 'unusual_timing', severity: 'medium', description: `Transaction occurred outside business hours (${h}:00)`, affectedTransactions: [tx.id], detectionMethod: 'automated' });
    }
  }
  return c.json(anomalies);
});

// POST /api/forensics/investigations/:id/analyze/round-dollars
forensicRoutes.post('/api/forensics/investigations/:id/analyze/round-dollars', async (c) => {
  const id = parseInvestigationId(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid investigation ID' }, 400);

  const db = getDb(c.env);
  const userId = parseInt(c.get('userId') || '0', 10);
  const txns = await getUserTransactions(db, userId);

  const roundIds = txns.filter(tx => Math.abs(tx.amount) % 1 === 0 && Math.abs(tx.amount) >= 100).map(tx => tx.id);
  const anomalies: any[] = [];

  if (txns.length > 0) {
    const pct = (roundIds.length / txns.length) * 100;
    if (pct > 20) {
      anomalies.push({ anomalyType: 'round_dollar', severity: 'medium', description: `${pct.toFixed(1)}% of transactions are round dollar amounts (expected: <20%)`, affectedTransactions: roundIds, detectionMethod: 'automated' });
      await db.insert(forensicAnomalies).values({ investigationId: id, anomalyType: 'round_dollar', severity: 'medium', description: `Excessive round dollar amounts: ${pct.toFixed(1)}%`, detectionMethod: 'automated', relatedTransactions: roundIds, status: 'pending' });
    }
  }
  return c.json(anomalies);
});

// POST /api/forensics/investigations/:id/analyze/benfords-law
forensicRoutes.post('/api/forensics/investigations/:id/analyze/benfords-law', async (c) => {
  const id = parseInvestigationId(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid investigation ID' }, 400);

  const db = getDb(c.env);
  const userId = parseInt(c.get('userId') || '0', 10);
  const txns = await getUserTransactions(db, userId);

  const results = analyzeBenfordsLaw(txns.map(tx => Math.abs(tx.amount)));
  if (results[0] && !results[0].overallPassed) {
    await db.insert(forensicAnomalies).values({ investigationId: id, anomalyType: 'benford_violation', severity: 'high', description: `Benford's Law analysis failed (χ²=${results[0].totalChiSquare})`, detectionMethod: 'automated', relatedTransactions: txns.map(tx => tx.id), status: 'pending' });
  }
  return c.json(results);
});

// ============================================================================
// FLOW OF FUNDS ROUTES
// ============================================================================

// POST /api/forensics/investigations/:id/trace-funds
forensicRoutes.post('/api/forensics/investigations/:id/trace-funds', async (c) => {
  const id = parseInvestigationId(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid investigation ID' }, 400);

  const body = await c.req.json();
  const transactionId = body.transactionId;
  if (!transactionId) return c.json({ error: 'Transaction ID is required' }, 400);

  const db = getDb(c.env);
  const { transactions } = await import('../../shared/schema');
  const [tx] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
  if (!tx) return c.json({ error: 'Source transaction not found' }, 404);

  return c.json({
    flowId: crypto.randomUUID(),
    path: [{
      step: 1,
      account: 'Source Account',
      entity: tx.title || 'Unknown',
      amount: Math.abs(tx.amount),
      date: tx.date || new Date(),
      method: tx.type === 'expense' ? 'payment' : 'deposit',
    }],
    totalAmount: Math.abs(tx.amount),
    ultimateBeneficiaries: [tx.title || 'Unknown'],
    traceability: 'partially_traced',
  });
});

// POST /api/forensics/investigations/:id/flow-of-funds
forensicRoutes.post('/api/forensics/investigations/:id/flow-of-funds', async (c) => {
  const id = parseInvestigationId(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid investigation ID' }, 400);

  const body = await c.req.json();
  const parsed = insertForensicFlowOfFundsSchema.safeParse({ ...body, investigationId: id });
  if (!parsed.success) return c.json({ error: 'Invalid flow of funds data', errors: parsed.error.errors }, 400);

  const db = getDb(c.env);
  const [flow] = await db.insert(forensicFlowOfFunds).values(parsed.data).returning();
  return c.json(flow, 201);
});

// GET /api/forensics/investigations/:id/flow-of-funds
forensicRoutes.get('/api/forensics/investigations/:id/flow-of-funds', async (c) => {
  const id = parseInvestigationId(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid investigation ID' }, 400);

  const db = getDb(c.env);
  const flows = await db.select().from(forensicFlowOfFunds)
    .where(eq(forensicFlowOfFunds.investigationId, id));
  return c.json(flows);
});

// ============================================================================
// DAMAGE CALCULATION ROUTES
// ============================================================================

// POST /api/forensics/investigations/:id/calculate-damages/direct-loss
forensicRoutes.post('/api/forensics/investigations/:id/calculate-damages/direct-loss', async (c) => {
  const id = parseInvestigationId(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid investigation ID' }, 400);

  const body = await c.req.json();
  const { improperTransactionIds } = body;
  if (!Array.isArray(improperTransactionIds)) return c.json({ error: 'improperTransactionIds array is required' }, 400);

  if (improperTransactionIds.length === 0) {
    return c.json({
      method: 'direct_loss', totalDamage: 0, breakdown: [], confidenceLevel: 'high',
      assumptions: ['No improper transactions identified'],
      limitations: ['Does not include consequential damages', 'Does not include interest'],
    });
  }

  const db = getDb(c.env);
  const { transactions } = await import('../../shared/schema');
  const rows = await db.select().from(transactions)
    .where(sql`${transactions.id} = ANY(${improperTransactionIds})`);

  let totalDamage = 0;
  const breakdown: { category: string; amount: number; description: string }[] = [];
  for (const tx of rows) {
    const amt = Math.abs(parseFloat(String(tx.amount)) || 0);
    totalDamage += amt;
    breakdown.push({ category: tx.type || 'unknown', amount: amt, description: tx.description || tx.title || 'Improper transaction' });
  }

  return c.json({
    method: 'direct_loss', totalDamage, breakdown, confidenceLevel: 'high',
    assumptions: ['All identified transactions are improper', 'Amounts are accurate as recorded'],
    limitations: ['Does not include consequential damages', 'Does not include interest'],
  });
});

// POST /api/forensics/investigations/:id/calculate-damages/net-worth
forensicRoutes.post('/api/forensics/investigations/:id/calculate-damages/net-worth', async (c) => {
  const body = await c.req.json();
  const { beginningNetWorth, endingNetWorth, personalExpenditures, legitimateIncome } = body;

  if (typeof beginningNetWorth !== 'number' || typeof endingNetWorth !== 'number' ||
      typeof personalExpenditures !== 'number' || typeof legitimateIncome !== 'number') {
    return c.json({ error: 'All net worth parameters are required' }, 400);
  }

  const netWorthIncrease = endingNetWorth - beginningNetWorth;
  const unexplainedWealth = netWorthIncrease + personalExpenditures - legitimateIncome;

  return c.json({
    method: 'net_worth', totalDamage: unexplainedWealth,
    breakdown: [
      { category: 'Net Worth Increase', amount: netWorthIncrease, description: 'Increase in assets minus liabilities' },
      { category: 'Personal Expenditures', amount: personalExpenditures, description: 'Living expenses and purchases' },
      { category: 'Legitimate Income', amount: -legitimateIncome, description: 'Verified income from legitimate sources' },
    ],
    confidenceLevel: 'medium',
    assumptions: ['All assets and liabilities have been identified', 'Legitimate income has been fully documented', 'No significant gifts or inheritances'],
    limitations: ['Requires access to personal financial records', 'May not capture cash transactions', 'Estimates may be required for some values'],
  });
});

// POST /api/forensics/calculate-interest
forensicRoutes.post('/api/forensics/calculate-interest', async (c) => {
  const body = await c.req.json();
  const { lossAmount, lossDate, interestRate } = body;

  if (typeof lossAmount !== 'number' || !lossDate || typeof interestRate !== 'number') {
    return c.json({ error: 'lossAmount, lossDate, and interestRate are required' }, 400);
  }

  const now = new Date();
  const daysDiff = (now.getTime() - new Date(lossDate).getTime()) / (1000 * 60 * 60 * 24);
  const years = daysDiff / 365.25;
  const interest = lossAmount * interestRate * years;

  return c.json({ interest, totalWithInterest: lossAmount + interest });
});

// ============================================================================
// REPORT ROUTES
// ============================================================================

// POST /api/forensics/investigations/:id/generate-summary
forensicRoutes.post('/api/forensics/investigations/:id/generate-summary', async (c) => {
  const id = parseInvestigationId(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid investigation ID' }, 400);

  const db = getDb(c.env);
  const userId = parseInt(c.get('userId') || '0', 10);
  const inv = await verifyOwnership(db, id, userId);
  if (!inv) return c.json({ error: 'Investigation not found or access denied' }, 404);

  const analyses = await db.select().from(forensicTransactionAnalysis)
    .where(eq(forensicTransactionAnalysis.investigationId, id));
  const anomalies = await db.select().from(forensicAnomalies)
    .where(eq(forensicAnomalies.investigationId, id));

  const improperCount = analyses.filter(a => a.legitimacyAssessment === 'improper').length;
  const questionableCount = analyses.filter(a => a.legitimacyAssessment === 'questionable').length;
  const highRiskCount = analyses.filter(a => a.riskLevel === 'high').length;
  const totalImproper = analyses
    .filter(a => a.legitimacyAssessment === 'improper')
    .reduce((sum, a) => sum + Math.abs(parseFloat(String(a.transactionAmount)) || 0), 0);

  let summary = `# Executive Summary: ${inv.title}\n\n`;
  summary += `**Case Number:** ${inv.caseNumber}\n`;
  summary += `**Investigation Period:** ${inv.investigationPeriodStart?.toLocaleDateString()} to ${inv.investigationPeriodEnd?.toLocaleDateString()}\n`;
  summary += `**Status:** ${inv.status}\n\n`;
  summary += `## Key Findings\n\n`;
  summary += `- **Total Transactions Analyzed:** ${analyses.length}\n`;
  summary += `- **High Risk Transactions:** ${highRiskCount}\n`;
  summary += `- **Improper Transactions:** ${improperCount}\n`;
  summary += `- **Questionable Transactions:** ${questionableCount}\n`;
  summary += `- **Anomalies Detected:** ${anomalies.length}\n\n`;
  summary += `## Estimated Damages\n\n$${totalImproper.toFixed(2)}\n\n`;
  summary += `## Recommendations\n\n`;
  summary += `1. Conduct detailed investigation of all high-risk transactions\n`;
  summary += `2. Obtain supporting documentation for questionable transactions\n`;
  summary += `3. Interview relevant personnel\n`;
  summary += `4. Implement enhanced controls to prevent future occurrences\n`;

  return c.json({ summary });
});

// POST /api/forensics/investigations/:id/reports
forensicRoutes.post('/api/forensics/investigations/:id/reports', async (c) => {
  const id = parseInvestigationId(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid investigation ID' }, 400);

  const body = await c.req.json();
  const parsed = insertForensicReportSchema.safeParse({ ...body, investigationId: id });
  if (!parsed.success) return c.json({ error: 'Invalid forensic report data', errors: parsed.error.errors }, 400);

  const db = getDb(c.env);
  const [report] = await db.insert(forensicReports).values(parsed.data).returning();
  return c.json(report, 201);
});

// GET /api/forensics/investigations/:id/reports
forensicRoutes.get('/api/forensics/investigations/:id/reports', async (c) => {
  const id = parseInvestigationId(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid investigation ID' }, 400);

  const db = getDb(c.env);
  const reports = await db.select().from(forensicReports)
    .where(eq(forensicReports.investigationId, id))
    .orderBy(desc(forensicReports.generatedAt));
  return c.json(reports);
});
