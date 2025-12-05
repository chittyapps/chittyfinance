import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real, varchar, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User model - keep the existing structure
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("user"),
  avatar: text("avatar"),

  // Store Replit Auth information in JSON for now
  // This avoids altering the table structure
  replitAuthData: jsonb("replit_auth_data"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  displayName: true,
  email: true,
  role: true,
  avatar: true,
  replitAuthData: true,
});

// Service Integrations
export const integrations = pgTable("integrations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  serviceType: text("service_type").notNull(), // 'mercury_bank', 'wave_accounting', 'ms365', etc.
  name: text("name").notNull(),
  description: text("description"),
  connected: boolean("connected").default(false),
  credentials: jsonb("credentials"),
  lastSynced: timestamp("last_synced"),
});

export const insertIntegrationSchema = createInsertSchema(integrations).pick({
  userId: true,
  serviceType: true,
  name: true,
  description: true,
  connected: true,
  credentials: true,
  lastSynced: true,
});

// Financial Summary
export const financialSummaries = pgTable("financial_summaries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  cashOnHand: real("cash_on_hand").notNull(),
  monthlyRevenue: real("monthly_revenue").notNull(),
  monthlyExpenses: real("monthly_expenses").notNull(),
  outstandingInvoices: real("outstanding_invoices").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFinancialSummarySchema = createInsertSchema(financialSummaries).pick({
  userId: true,
  cashOnHand: true,
  monthlyRevenue: true,
  monthlyExpenses: true,
  outstandingInvoices: true,
});

// Transactions
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  amount: real("amount").notNull(),
  type: text("type").notNull(), // 'income' or 'expense'
  date: timestamp("date").defaultNow(),
});

export const insertTransactionSchema = createInsertSchema(transactions).pick({
  userId: true,
  title: true,
  description: true,
  amount: true,
  type: true,
  date: true,
});

// Financial Tasks
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date"),
  priority: text("priority"), // 'urgent', 'due_soon', 'upcoming'
  completed: boolean("completed").default(false),
});

export const insertTaskSchema = createInsertSchema(tasks).pick({
  userId: true,
  title: true,
  description: true,
  dueDate: true,
  priority: true,
  completed: true,
});

// AI Assistant Messages
export const aiMessages = pgTable("ai_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  role: text("role").notNull(), // 'system', 'user', 'assistant'
  timestamp: timestamp("timestamp").defaultNow(),
});

export const insertAiMessageSchema = createInsertSchema(aiMessages).pick({
  userId: true,
  content: true,
  role: true,
});

// Forensic Investigations
export const forensicInvestigations = pgTable("forensic_investigations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  caseNumber: text("case_number").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  allegations: text("allegations"),
  investigationPeriodStart: timestamp("investigation_period_start"),
  investigationPeriodEnd: timestamp("investigation_period_end"),
  status: text("status").notNull().default("open"), // 'open', 'in_progress', 'completed', 'closed'
  leadInvestigator: text("lead_investigator"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  metadata: jsonb("metadata"), // Additional case-specific data
});

export const insertForensicInvestigationSchema = createInsertSchema(forensicInvestigations).pick({
  userId: true,
  caseNumber: true,
  title: true,
  description: true,
  allegations: true,
  investigationPeriodStart: true,
  investigationPeriodEnd: true,
  status: true,
  leadInvestigator: true,
  metadata: true,
});

// Forensic Evidence
export const forensicEvidence = pgTable("forensic_evidence", {
  id: serial("id").primaryKey(),
  investigationId: integer("investigation_id").notNull().references(() => forensicInvestigations.id),
  evidenceNumber: text("evidence_number").notNull(),
  type: text("type").notNull(), // 'bank_statement', 'email', 'document', 'device', 'transaction_record', 'other'
  description: text("description").notNull(),
  source: text("source").notNull(),
  dateReceived: timestamp("date_received").defaultNow(),
  collectedBy: text("collected_by"),
  storageLocation: text("storage_location"),
  hashValue: text("hash_value"), // MD5/SHA-256 for integrity verification
  chainOfCustody: jsonb("chain_of_custody"), // Array of custody transfer records
  metadata: jsonb("metadata"), // Additional evidence-specific data
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertForensicEvidenceSchema = createInsertSchema(forensicEvidence).pick({
  investigationId: true,
  evidenceNumber: true,
  type: true,
  description: true,
  source: true,
  dateReceived: true,
  collectedBy: true,
  storageLocation: true,
  hashValue: true,
  chainOfCustody: true,
  metadata: true,
});

// Forensic Transaction Analysis
export const forensicTransactionAnalysis = pgTable("forensic_transaction_analysis", {
  id: serial("id").primaryKey(),
  investigationId: integer("investigation_id").notNull().references(() => forensicInvestigations.id),
  transactionId: integer("transaction_id").references(() => transactions.id),
  transactionDate: timestamp("transaction_date"),
  transactionAmount: real("transaction_amount"),
  transactionDescription: text("transaction_description"),
  riskLevel: text("risk_level").notNull(), // 'high', 'medium', 'low'
  legitimacyAssessment: text("legitimacy_assessment"), // 'proper', 'questionable', 'improper', 'unable_to_determine'
  redFlags: jsonb("red_flags"), // Array of identified red flags
  analysisNotes: text("analysis_notes"),
  analyzedBy: text("analyzed_by"),
  analyzedAt: timestamp("analyzed_at").defaultNow(),
  evidenceReferences: jsonb("evidence_references"), // Links to related evidence
});

export const insertForensicTransactionAnalysisSchema = createInsertSchema(forensicTransactionAnalysis).pick({
  investigationId: true,
  transactionId: true,
  transactionDate: true,
  transactionAmount: true,
  transactionDescription: true,
  riskLevel: true,
  legitimacyAssessment: true,
  redFlags: true,
  analysisNotes: true,
  analyzedBy: true,
  evidenceReferences: true,
});

// Forensic Anomalies
export const forensicAnomalies = pgTable("forensic_anomalies", {
  id: serial("id").primaryKey(),
  investigationId: integer("investigation_id").notNull().references(() => forensicInvestigations.id),
  anomalyType: text("anomaly_type").notNull(), // 'duplicate_payment', 'round_dollar', 'unusual_timing', 'benford_violation', 'other'
  severity: text("severity").notNull(), // 'critical', 'high', 'medium', 'low'
  description: text("description").notNull(),
  detectedAt: timestamp("detected_at").defaultNow(),
  detectionMethod: text("detection_method"), // 'automated', 'manual', 'ai_assisted'
  relatedTransactions: jsonb("related_transactions"), // Array of transaction IDs
  status: text("status").notNull().default("pending"), // 'pending', 'reviewed', 'dismissed', 'escalated'
  reviewNotes: text("review_notes"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
});

export const insertForensicAnomalySchema = createInsertSchema(forensicAnomalies).pick({
  investigationId: true,
  anomalyType: true,
  severity: true,
  description: true,
  detectionMethod: true,
  relatedTransactions: true,
  status: true,
  reviewNotes: true,
  reviewedBy: true,
});

// Forensic Flow of Funds
export const forensicFlowOfFunds = pgTable("forensic_flow_of_funds", {
  id: serial("id").primaryKey(),
  investigationId: integer("investigation_id").notNull().references(() => forensicInvestigations.id),
  flowName: text("flow_name").notNull(),
  sourceAccount: text("source_account").notNull(),
  destinationAccount: text("destination_account").notNull(),
  amount: real("amount").notNull(),
  transactionDate: timestamp("transaction_date"),
  transferMethod: text("transfer_method"), // 'wire', 'check', 'ach', 'cash', 'other'
  intermediaries: jsonb("intermediaries"), // Array of intermediate accounts/entities
  statedPurpose: text("stated_purpose"),
  actualPurpose: text("actual_purpose"),
  beneficiaries: jsonb("beneficiaries"), // Array of ultimate beneficiaries
  traceability: text("traceability"), // 'fully_traced', 'partially_traced', 'untraced'
  analysisNotes: text("analysis_notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertForensicFlowOfFundsSchema = createInsertSchema(forensicFlowOfFunds).pick({
  investigationId: true,
  flowName: true,
  sourceAccount: true,
  destinationAccount: true,
  amount: true,
  transactionDate: true,
  transferMethod: true,
  intermediaries: true,
  statedPurpose: true,
  actualPurpose: true,
  beneficiaries: true,
  traceability: true,
  analysisNotes: true,
});

// Forensic Reports
export const forensicReports = pgTable("forensic_reports", {
  id: serial("id").primaryKey(),
  investigationId: integer("investigation_id").notNull().references(() => forensicInvestigations.id),
  reportNumber: text("report_number").notNull().unique(),
  reportType: text("report_type").notNull(), // 'executive_summary', 'detailed_analysis', 'damage_calculation', 'final_report'
  title: text("title").notNull(),
  methodology: text("methodology"),
  findings: text("findings"),
  damageCalculations: jsonb("damage_calculations"), // Structured damage calculation data
  attributionAnalysis: text("attribution_analysis"),
  conclusions: text("conclusions"),
  limitations: text("limitations"),
  generatedBy: text("generated_by"),
  generatedAt: timestamp("generated_at").defaultNow(),
  peerReviewedBy: text("peer_reviewed_by"),
  peerReviewedAt: timestamp("peer_reviewed_at"),
  status: text("status").notNull().default("draft"), // 'draft', 'peer_review', 'finalized'
  fileUrl: text("file_url"), // Link to generated PDF/document
});

export const insertForensicReportSchema = createInsertSchema(forensicReports).pick({
  investigationId: true,
  reportNumber: true,
  reportType: true,
  title: true,
  methodology: true,
  findings: true,
  damageCalculations: true,
  attributionAnalysis: true,
  conclusions: true,
  limitations: true,
  generatedBy: true,
  peerReviewedBy: true,
  status: true,
  fileUrl: true,
});

// Type definitions
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Integration = typeof integrations.$inferSelect;
export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;

export type FinancialSummary = typeof financialSummaries.$inferSelect;
export type InsertFinancialSummary = z.infer<typeof insertFinancialSummarySchema>;

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

export type AiMessage = typeof aiMessages.$inferSelect;
export type InsertAiMessage = z.infer<typeof insertAiMessageSchema>;

export type ForensicInvestigation = typeof forensicInvestigations.$inferSelect;
export type InsertForensicInvestigation = z.infer<typeof insertForensicInvestigationSchema>;

export type ForensicEvidence = typeof forensicEvidence.$inferSelect;
export type InsertForensicEvidence = z.infer<typeof insertForensicEvidenceSchema>;

export type ForensicTransactionAnalysis = typeof forensicTransactionAnalysis.$inferSelect;
export type InsertForensicTransactionAnalysis = z.infer<typeof insertForensicTransactionAnalysisSchema>;

export type ForensicAnomaly = typeof forensicAnomalies.$inferSelect;
export type InsertForensicAnomaly = z.infer<typeof insertForensicAnomalySchema>;

export type ForensicFlowOfFunds = typeof forensicFlowOfFunds.$inferSelect;
export type InsertForensicFlowOfFunds = z.infer<typeof insertForensicFlowOfFundsSchema>;

export type ForensicReport = typeof forensicReports.$inferSelect;
export type InsertForensicReport = z.infer<typeof insertForensicReportSchema>;
