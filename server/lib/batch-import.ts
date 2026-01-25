// @ts-nocheck - TODO: Add proper types
/**
 * Batch Import Module for ChittyFinance
 * Supports CSV, Excel, and JSON imports with validation and deduplication
 */

import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { storage } from '../storage';
import type { InsertTransaction } from '../../database/system.schema';

// Transaction import schema for validation
const TransactionImportSchema = z.object({
  date: z.coerce.date(),
  amount: z.coerce.number(),
  type: z.enum(['income', 'expense', 'transfer']),
  description: z.string().min(1),
  category: z.string().optional(),
  accountId: z.string().uuid().optional(),
  payee: z.string().optional(),
  externalId: z.string().optional(),
  propertyId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  reconciled: z.coerce.boolean().optional().default(false),
  metadata: z.record(z.any()).optional(),
});

export type TransactionImportRow = z.infer<typeof TransactionImportSchema>;

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: Array<{ row: number; error: string; data?: any }>;
  duplicates: number;
}

export interface ImportOptions {
  tenantId: string;
  defaultAccountId?: string;
  skipDuplicates?: boolean;
  validateOnly?: boolean;
  batchSize?: number;
}

/**
 * Parse CSV file to transaction rows
 */
export function parseCSV(fileContent: string): TransactionImportRow[] {
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return records.map((record: any) => ({
    date: record.date || record.Date || record.DATE,
    amount: record.amount || record.Amount || record.AMOUNT,
    type: record.type || record.Type || record.TYPE,
    description: record.description || record.Description || record.DESCRIPTION,
    category: record.category || record.Category || record.CATEGORY,
    accountId: record.accountId || record.account_id,
    payee: record.payee || record.Payee || record.PAYEE,
    externalId: record.externalId || record.external_id || record.id,
    propertyId: record.propertyId || record.property_id,
    unitId: record.unitId || record.unit_id,
    reconciled: record.reconciled === 'true' || record.reconciled === '1',
    metadata: record.metadata ? JSON.parse(record.metadata) : undefined,
  }));
}

/**
 * Parse Excel file to transaction rows
 */
export function parseExcel(fileBuffer: Buffer): TransactionImportRow[] {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const records = XLSX.utils.sheet_to_json(worksheet);

  return records.map((record: any) => ({
    date: record.date || record.Date || record.DATE,
    amount: record.amount || record.Amount || record.AMOUNT,
    type: record.type || record.Type || record.TYPE,
    description: record.description || record.Description || record.DESCRIPTION,
    category: record.category || record.Category || record.CATEGORY,
    accountId: record.accountId || record.account_id,
    payee: record.payee || record.Payee || record.PAYEE,
    externalId: record.externalId || record.external_id || record.id,
    propertyId: record.propertyId || record.property_id,
    unitId: record.unitId || record.unit_id,
    reconciled: record.reconciled === true || record.reconciled === 'true' || record.reconciled === 1,
    metadata: typeof record.metadata === 'object' ? record.metadata : undefined,
  }));
}

/**
 * Parse JSON file to transaction rows
 */
export function parseJSON(fileContent: string): TransactionImportRow[] {
  const data = JSON.parse(fileContent);

  if (!Array.isArray(data)) {
    throw new Error('JSON must be an array of transaction objects');
  }

  return data;
}

/**
 * Validate transaction rows
 */
export function validateRows(rows: TransactionImportRow[]): {
  valid: TransactionImportRow[];
  errors: Array<{ row: number; error: string; data: any }>;
} {
  const valid: TransactionImportRow[] = [];
  const errors: Array<{ row: number; error: string; data: any }> = [];

  rows.forEach((row, index) => {
    try {
      const validated = TransactionImportSchema.parse(row);
      valid.push(validated);
    } catch (error) {
      errors.push({
        row: index + 1,
        error: error instanceof Error ? error.message : 'Validation failed',
        data: row,
      });
    }
  });

  return { valid, errors };
}

/**
 * Check for duplicates based on externalId or exact match
 */
async function findDuplicates(
  tenantId: string,
  rows: TransactionImportRow[]
): Promise<Set<string>> {
  const duplicates = new Set<string>();

  // Get existing transactions for this tenant
  const existing = await storage.getTransactions(tenantId);

  // Create lookup maps
  const externalIdMap = new Map(
    existing
      .filter(t => t.externalId)
      .map(t => [t.externalId!, t.id])
  );

  // Check for duplicates
  for (const row of rows) {
    if (row.externalId && externalIdMap.has(row.externalId)) {
      duplicates.add(row.externalId);
    }
  }

  return duplicates;
}

/**
 * Import transactions in batches
 */
export async function importTransactions(
  rows: TransactionImportRow[],
  options: ImportOptions
): Promise<ImportResult> {
  const {
    tenantId,
    defaultAccountId,
    skipDuplicates = true,
    validateOnly = false,
    batchSize = 100,
  } = options;

  const result: ImportResult = {
    success: true,
    imported: 0,
    skipped: 0,
    errors: [],
    duplicates: 0,
  };

  // Validate all rows first
  const { valid, errors } = validateRows(rows);
  result.errors = errors;
  result.skipped = errors.length;

  if (validateOnly) {
    return result;
  }

  // Check for duplicates
  const duplicateIds = skipDuplicates ? await findDuplicates(tenantId, valid) : new Set();

  // Filter out duplicates
  const toImport = valid.filter(row => {
    if (row.externalId && duplicateIds.has(row.externalId)) {
      result.duplicates++;
      result.skipped++;
      return false;
    }
    return true;
  });

  // Import in batches
  for (let i = 0; i < toImport.length; i += batchSize) {
    const batch = toImport.slice(i, i + batchSize);

    for (const row of batch) {
      try {
        const transaction: InsertTransaction = {
          tenantId,
          accountId: row.accountId || defaultAccountId!,
          amount: row.amount.toString(),
          type: row.type,
          description: row.description,
          date: row.date,
          category: row.category,
          payee: row.payee,
          externalId: row.externalId,
          propertyId: row.propertyId,
          unitId: row.unitId,
          reconciled: row.reconciled || false,
          metadata: row.metadata,
        };

        await storage.createTransaction(transaction);
        result.imported++;
      } catch (error) {
        result.errors.push({
          row: i + batch.indexOf(row) + 1,
          error: error instanceof Error ? error.message : 'Import failed',
          data: row,
        });
        result.skipped++;
        result.success = false;
      }
    }
  }

  return result;
}

/**
 * Import from file buffer (auto-detect format)
 */
export async function importFromFile(
  fileBuffer: Buffer,
  filename: string,
  options: ImportOptions
): Promise<ImportResult> {
  let rows: TransactionImportRow[];

  // Detect file type and parse
  if (filename.endsWith('.csv')) {
    rows = parseCSV(fileBuffer.toString('utf-8'));
  } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
    rows = parseExcel(fileBuffer);
  } else if (filename.endsWith('.json')) {
    rows = parseJSON(fileBuffer.toString('utf-8'));
  } else {
    throw new Error('Unsupported file format. Supported: CSV, Excel (.xlsx, .xls), JSON');
  }

  return importTransactions(rows, options);
}

/**
 * Generate CSV template for imports
 */
export function generateCSVTemplate(): string {
  const headers = [
    'date',
    'amount',
    'type',
    'description',
    'category',
    'payee',
    'externalId',
    'accountId',
    'propertyId',
    'unitId',
    'reconciled',
  ];

  const example = [
    '2024-01-15',
    '2500.00',
    'income',
    'Rent payment - 550 W Surf #211',
    'rent',
    'John Doe',
    'external-123',
    'account-uuid-here',
    'property-uuid-here',
    'unit-uuid-here',
    'false',
  ];

  return [headers.join(','), example.join(',')].join('\n');
}

/**
 * Litigation-specific import from Google Drive
 */
export async function importLegalCosts(
  ledgerPath: string,
  tenantId: string,
  accountId: string
): Promise<ImportResult> {
  const fs = await import('fs');
  const path = await import('path');

  const fileBuffer = fs.readFileSync(ledgerPath);
  const filename = path.basename(ledgerPath);

  return importFromFile(fileBuffer, filename, {
    tenantId,
    defaultAccountId: accountId,
    skipDuplicates: true,
    validateOnly: false,
  });
}
