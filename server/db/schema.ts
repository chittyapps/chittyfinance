export * from '../../database/system.schema';

// Re-export forensic tables from shared schema (integer-ID based, legacy)
export {
  forensicInvestigations,
  forensicEvidence,
  forensicTransactionAnalysis,
  forensicAnomalies,
  forensicFlowOfFunds,
  forensicReports,
  insertForensicInvestigationSchema,
  insertForensicEvidenceSchema,
  insertForensicTransactionAnalysisSchema,
  insertForensicAnomalySchema,
  insertForensicFlowOfFundsSchema,
  insertForensicReportSchema,
} from '../../shared/schema';

export type {
  ForensicInvestigation,
  InsertForensicInvestigation,
  ForensicEvidence,
  InsertForensicEvidence,
  ForensicTransactionAnalysis,
  InsertForensicTransactionAnalysis,
  ForensicAnomaly,
  InsertForensicAnomaly,
  ForensicFlowOfFunds,
  InsertForensicFlowOfFunds,
  ForensicReport,
  InsertForensicReport,
} from '../../shared/schema';
