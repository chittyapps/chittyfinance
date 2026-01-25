/**
 * Google Drive Litigation Ingestion for ChittyFinance
 * Automatically ingests financial documents from Google Drive legal cases
 */

import fs from 'fs';
import path from 'path';
import { importLegalCosts } from './batch-import';
import { logToChronicle } from './chittychronicle-logging';

const LITIGATION_BASE = process.env.GOOGLE_DRIVE_LITIGATION_PATH ||
  '/Users/nb/Library/CloudStorage/GoogleDrive-nick@jeanarlene.com/Shared drives/ChittyOS-Data/VAULT/LITIGATION';

export interface CaseDirectory {
  caseName: string;
  caseNumber: string;
  path: string;
  financialRecords: string[];
  legalCosts: string[];
}

/**
 * Scan litigation directory for financial documents
 */
export async function scanLitigationDirectory(): Promise<CaseDirectory[]> {
  const cases: CaseDirectory[] = [];

  try {
    if (!fs.existsSync(LITIGATION_BASE)) {
      console.warn(`Litigation directory not found: ${LITIGATION_BASE}`);
      return cases;
    }

    const caseDirs = fs.readdirSync(LITIGATION_BASE, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const caseName of caseDirs) {
      const casePath = path.join(LITIGATION_BASE, caseName);

      // Look for CASE_* subdirectory
      const caseSubdirs = fs.readdirSync(casePath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory() && dirent.name.startsWith('CASE_'))
        .map(dirent => dirent.name);

      if (caseSubdirs.length === 0) continue;

      const caseNumber = caseSubdirs[0].replace('CASE_', '');
      const fullCasePath = path.join(casePath, caseSubdirs[0]);

      // Find financial records
      const financialPath = path.join(fullCasePath, 'C - Business Operations & Financial Records');
      const legalCostsPath = path.join(fullCasePath, 'J - Nicholas Personal Financial/Legal Costs');

      const financialRecords: string[] = [];
      const legalCosts: string[] = [];

      // Scan financial records
      if (fs.existsSync(financialPath)) {
        const files = fs.readdirSync(financialPath, { withFileTypes: true, recursive: true });
        files.forEach((file: any) => {
          if (!file.isDirectory() && /\.(xlsx|xls|csv|pdf)$/i.test(file.name)) {
            financialRecords.push(path.join(financialPath, file.name));
          }
        });
      }

      // Scan legal costs
      if (fs.existsSync(legalCostsPath)) {
        const files = fs.readdirSync(legalCostsPath);
        files.forEach(file => {
          if (/\.(pdf|xlsx|csv)$/i.test(file)) {
            legalCosts.push(path.join(legalCostsPath, file));
          }
        });
      }

      cases.push({
        caseName,
        caseNumber,
        path: fullCasePath,
        financialRecords,
        legalCosts,
      });
    }
  } catch (error) {
    console.error('Error scanning litigation directory:', error);
  }

  return cases;
}

/**
 * Ingest all legal costs from a case
 */
export async function ingestCaseLegalCosts(
  caseName: string,
  tenantId: string,
  accountId: string
): Promise<{
  success: boolean;
  imported: number;
  errors: Array<{ file: string; error: string }>;
}> {
  const cases = await scanLitigationDirectory();
  const targetCase = cases.find(c => c.caseName === caseName);

  if (!targetCase) {
    throw new Error(`Case not found: ${caseName}`);
  }

  let totalImported = 0;
  const errors: Array<{ file: string; error: string }> = [];

  for (const legalCostFile of targetCase.legalCosts) {
    try {
      const result = await importLegalCosts(legalCostFile, tenantId, accountId);
      totalImported += result.imported;

      // Log to ChittyChronicle
      await logToChronicle({
        eventType: 'litigation_import',
        entityId: tenantId,
        entityType: 'tenant',
        action: 'legal_costs_imported',
        metadata: {
          caseName,
          caseNumber: targetCase.caseNumber,
          file: path.basename(legalCostFile),
          imported: result.imported,
          skipped: result.skipped,
        },
      });
    } catch (error) {
      errors.push({
        file: path.basename(legalCostFile),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return {
    success: errors.length === 0,
    imported: totalImported,
    errors,
  };
}

/**
 * Watch litigation directory for changes
 */
export function watchLitigationDirectory(
  callback: (event: 'added' | 'modified' | 'deleted', filePath: string) => void
): void {
  // This would use fs.watch or chokidar to monitor the directory
  // For now, just log that watching is not implemented
  console.warn('Litigation directory watching not yet implemented');
}

/**
 * Generate litigation financial summary
 */
export async function generateLitigationSummary(caseName: string): Promise<{
  totalLegalCosts: number;
  totalFinancialEvidence: number;
  documentCount: number;
  categories: Record<string, number>;
}> {
  const cases = await scanLitigationDirectory();
  const targetCase = cases.find(c => c.caseName === caseName);

  if (!targetCase) {
    throw new Error(`Case not found: ${caseName}`);
  }

  // This would analyze all financial documents and generate summary
  // For now, return placeholder
  return {
    totalLegalCosts: 0,
    totalFinancialEvidence: 0,
    documentCount: targetCase.financialRecords.length + targetCase.legalCosts.length,
    categories: {},
  };
}
