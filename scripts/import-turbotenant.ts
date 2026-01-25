#!/usr/bin/env npx ts-node
/**
 * TurboTenant General Ledger Analysis Tool
 *
 * Analyzes CSV exports from TurboTenant's REI Accounting module and suggests
 * proper categorization according to the REI Chart of Accounts (IRS Schedule E).
 *
 * This is an ANALYSIS tool - it does not import data into the database.
 * Review the output and use the corrected CSV to update your accounting system.
 *
 * Usage:
 *   npx ts-node scripts/import-turbotenant.ts <csv-file> [--analyze] [--output <file>]
 *
 * Options:
 *   --analyze    Show detailed categorization analysis and issues
 *   --output     Export corrected ledger to CSV file
 *   --help       Show usage information
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import {
  findAccountCode,
  getAccountByCode,
  DEFAULT_PROPERTY_MAPPINGS,
  buildPropertyMap,
  TURBOTENANT_CATEGORY_MAP,
  REI_CHART_OF_ACCOUNTS,
  type AccountDefinition,
  type PropertyMapping
} from '../database/chart-of-accounts';

// Build property lookup map from default mappings
// In production, this should be loaded from the database
const PROPERTY_MAP = buildPropertyMap(DEFAULT_PROPERTY_MAPPINGS);

interface TurboTenantRow {
  Date: string;
  Description: string;
  Account: string;
  Category?: string;
  Debit?: string;
  Credit?: string;
  Amount?: string;
  Property?: string;
  Unit?: string;
  Balance?: string;
  Notes?: string;
  [key: string]: string | undefined;
}

interface CategorizedTransaction {
  originalRow: TurboTenantRow;
  date: Date;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  originalCategory: string;
  suggestedAccountCode: string;
  suggestedAccountName: string;
  propertyCode: string | null;
  propertyName: string | null;
  tenantSlug: string | null;
  issues: string[];
  confidence: 'high' | 'medium' | 'low';
  scheduleELine: string | null;
  taxDeductible: boolean;
}

interface ImportAnalysis {
  totalTransactions: number;
  totalDebits: number;
  totalCredits: number;
  categorizedCount: number;
  uncategorizedCount: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  issuesByType: Record<string, number>;
  byProperty: Record<string, { count: number; totalIncome: number; totalExpense: number }>;
  byCategory: Record<string, { count: number; total: number }>;
  suspenseItems: CategorizedTransaction[];
  suggestedCorrections: Array<{ original: string; suggested: string; count: number }>;
}

// Parse amount from string (handles currency symbols, commas, negatives)
// Returns cents as integer to avoid floating point precision issues
function parseAmountCents(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[$,]/g, '').replace(/[()]/g, '-').trim();
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  // Convert to cents and round to avoid floating point errors
  return Math.round(num * 100);
}

// Convert cents to dollars for display
function centsToDollars(cents: number): number {
  return cents / 100;
}

// Sanitize string for CSV export to prevent CSV injection
// Prefixes dangerous characters with single quote
function sanitizeCsvValue(value: string): string {
  if (!value) return '';
  const dangerous = ['=', '+', '-', '@', '\t', '\r', '\n'];
  const trimmed = value.trim();
  if (dangerous.some(char => trimmed.startsWith(char))) {
    return `'${trimmed}`;
  }
  return trimmed;
}

// Validate CSV has required columns
function validateCsvStructure(records: TurboTenantRow[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (records.length === 0) {
    return { valid: true, errors: [] }; // Empty is valid, just no data
  }

  const firstRow = records[0];
  const requiredColumns = ['Date', 'Description'];
  const amountColumns = ['Amount', 'Debit', 'Credit'];

  for (const col of requiredColumns) {
    if (!(col in firstRow)) {
      errors.push(`Missing required column: ${col}`);
    }
  }

  // Need at least one amount column
  const hasAmountColumn = amountColumns.some(col => col in firstRow);
  if (!hasAmountColumn) {
    errors.push(`Missing amount column. Need one of: ${amountColumns.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

// Extract property code from description or property field
function extractPropertyCode(row: TurboTenantRow): string | null {
  // Check Property field first
  if (row.Property) {
    for (const [code, info] of Object.entries(PROPERTY_MAP)) {
      if (row.Property.toLowerCase().includes(info.name.toLowerCase())) {
        return code;
      }
    }
  }

  // Check description for property identifiers
  const desc = row.Description || '';

  // Pattern: "ARIBIA LLC - PROPERTY NAME (XX)"
  const match = desc.match(/\((\d{2})\)/);
  if (match) {
    const code = match[1];
    if (PROPERTY_MAP[code]) {
      return code;
    }
  }

  // Check for property names in description
  for (const [code, info] of Object.entries(PROPERTY_MAP)) {
    if (desc.toLowerCase().includes(info.name.toLowerCase())) {
      return code;
    }
  }

  // Check for addresses using property mappings
  for (const [code, info] of Object.entries(PROPERTY_MAP)) {
    // Extract key parts of address for matching
    const addrParts = info.address.toLowerCase().split(',')[0].split(' ');
    const streetNum = addrParts.find(p => /^\d+$/.test(p));
    const streetName = addrParts.find(p => /^[a-z]+$/i.test(p) && p.length > 2);

    if (streetNum && desc.includes(streetNum) && streetName && desc.toLowerCase().includes(streetName.toLowerCase())) {
      return code;
    }

    // Also check for unit numbers
    const unitMatch = info.address.match(/Unit\s+(\w+)/i);
    if (unitMatch && desc.includes(unitMatch[1])) {
      return code;
    }
  }

  return null;
}

// Identify issues with the transaction
function identifyIssues(row: TurboTenantRow, accountCode: string): string[] {
  const issues: string[] = [];

  // Check for suspense accounts
  if (accountCode.startsWith('9')) {
    issues.push('SUSPENSE: Needs proper categorization');
  }

  // Check for Auto Balance
  if (row.Account?.toLowerCase().includes('auto balance') ||
      row.Description?.toLowerCase().includes('auto balance')) {
    issues.push('RECONCILIATION: Auto-balance entry needs investigation');
  }

  // Check for NSF/overdraft
  if (row.Description?.toLowerCase().includes('nsf') ||
      row.Description?.toLowerCase().includes('overdraft')) {
    issues.push('BANK FEE: NSF/Overdraft should be reviewed');
  }

  // Check for potential capital vs expense misclassification
  const desc = (row.Description || '').toLowerCase();
  if ((desc.includes('hvac') || desc.includes('roof') || desc.includes('replace')) &&
      accountCode === '5070') {
    issues.push('REVIEW: May be capital improvement, not repair (5070 → 7000)');
  }

  // Check for missing property attribution
  if (!extractPropertyCode(row) && !accountCode.startsWith('3') && !accountCode.startsWith('9')) {
    issues.push('ATTRIBUTION: No property identified');
  }

  // Check for potential personal expenses
  if (desc.includes('uber') || desc.includes('lyft') || desc.includes('cash advance')) {
    issues.push('REVIEW: Verify business purpose (may be personal)');
  }

  // Check for owner funds classification
  if (row.Account?.toLowerCase().includes('owner') && !accountCode.startsWith('3')) {
    issues.push('OWNER: Should be equity account (3xxx), not expense');
  }

  return issues;
}

// Calculate confidence level
function calculateConfidence(row: TurboTenantRow, accountCode: string, issues: string[]): 'high' | 'medium' | 'low' {
  if (issues.length === 0 && !accountCode.startsWith('9')) {
    return 'high';
  }
  if (accountCode.startsWith('9') || issues.some(i => i.startsWith('SUSPENSE'))) {
    return 'low';
  }
  if (issues.length > 2) {
    return 'low';
  }
  return 'medium';
}

// Categorize a single transaction
function categorizeTransaction(row: TurboTenantRow): CategorizedTransaction {
  const description = row.Description || '';
  const originalCategory = row.Category || row.Account || '';

  // Determine amount (in cents) and type
  let amountCents = 0;
  let type: 'debit' | 'credit' = 'debit';

  if (row.Debit && parseAmountCents(row.Debit) !== 0) {
    amountCents = parseAmountCents(row.Debit);
    type = 'debit';
  } else if (row.Credit && parseAmountCents(row.Credit) !== 0) {
    amountCents = parseAmountCents(row.Credit);
    type = 'credit';
  } else if (row.Amount) {
    amountCents = parseAmountCents(row.Amount);
    type = amountCents >= 0 ? 'credit' : 'debit';
    amountCents = Math.abs(amountCents);
  }

  // Convert to dollars for storage (keeping cents internally for precision)
  const amount = centsToDollars(amountCents);

  // Find account code
  const accountCode = findAccountCode(description, originalCategory);
  const account = getAccountByCode(accountCode);

  // Extract property
  const propertyCode = extractPropertyCode(row);
  const propertyInfo = propertyCode ? ARIBIA_PROPERTY_MAP[propertyCode] : null;

  // Identify issues
  const issues = identifyIssues(row, accountCode);

  // Calculate confidence
  const confidence = calculateConfidence(row, accountCode, issues);

  // Parse date
  let date: Date;
  try {
    date = new Date(row.Date);
    if (isNaN(date.getTime())) {
      date = new Date();
      issues.push('DATE: Invalid date format');
    }
  } catch {
    date = new Date();
    issues.push('DATE: Could not parse date');
  }

  return {
    originalRow: row,
    date,
    description,
    amount,
    type,
    originalCategory,
    suggestedAccountCode: accountCode,
    suggestedAccountName: account?.name || 'Unknown',
    propertyCode,
    propertyName: propertyInfo?.name || null,
    tenantSlug: propertyInfo?.tenantSlug || null,
    issues,
    confidence,
    scheduleELine: account?.scheduleE || null,
    taxDeductible: account?.taxDeductible ?? false,
  };
}

// Analyze all transactions
function analyzeTransactions(transactions: CategorizedTransaction[]): ImportAnalysis {
  const analysis: ImportAnalysis = {
    totalTransactions: transactions.length,
    totalDebits: 0,
    totalCredits: 0,
    categorizedCount: 0,
    uncategorizedCount: 0,
    highConfidence: 0,
    mediumConfidence: 0,
    lowConfidence: 0,
    issuesByType: {},
    byProperty: {},
    byCategory: {},
    suspenseItems: [],
    suggestedCorrections: [],
  };

  const correctionCounts: Record<string, number> = {};

  for (const tx of transactions) {
    // Totals
    if (tx.type === 'debit') {
      analysis.totalDebits += tx.amount;
    } else {
      analysis.totalCredits += tx.amount;
    }

    // Categorization
    if (tx.suggestedAccountCode.startsWith('9')) {
      analysis.uncategorizedCount++;
      analysis.suspenseItems.push(tx);
    } else {
      analysis.categorizedCount++;
    }

    // Confidence
    switch (tx.confidence) {
      case 'high': analysis.highConfidence++; break;
      case 'medium': analysis.mediumConfidence++; break;
      case 'low': analysis.lowConfidence++; break;
    }

    // Issues
    for (const issue of tx.issues) {
      const issueType = issue.split(':')[0];
      analysis.issuesByType[issueType] = (analysis.issuesByType[issueType] || 0) + 1;
    }

    // By property
    const propKey = tx.propertyName || 'Unattributed';
    if (!analysis.byProperty[propKey]) {
      analysis.byProperty[propKey] = { count: 0, totalIncome: 0, totalExpense: 0 };
    }
    analysis.byProperty[propKey].count++;
    if (tx.type === 'credit' && tx.suggestedAccountCode.startsWith('4')) {
      analysis.byProperty[propKey].totalIncome += tx.amount;
    } else if (tx.type === 'debit') {
      analysis.byProperty[propKey].totalExpense += tx.amount;
    }

    // By category
    const catKey = tx.suggestedAccountName;
    if (!analysis.byCategory[catKey]) {
      analysis.byCategory[catKey] = { count: 0, total: 0 };
    }
    analysis.byCategory[catKey].count++;
    analysis.byCategory[catKey].total += tx.type === 'debit' ? -tx.amount : tx.amount;

    // Track corrections
    if (tx.originalCategory !== tx.suggestedAccountName) {
      const key = `${tx.originalCategory} → ${tx.suggestedAccountName}`;
      correctionCounts[key] = (correctionCounts[key] || 0) + 1;
    }
  }

  // Build suggested corrections
  analysis.suggestedCorrections = Object.entries(correctionCounts)
    .map(([key, count]) => {
      const [original, suggested] = key.split(' → ');
      return { original, suggested, count };
    })
    .sort((a, b) => b.count - a.count);

  return analysis;
}

// Format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

// Print analysis report
function printAnalysis(analysis: ImportAnalysis): void {
  console.log('\n' + '='.repeat(60));
  console.log('TURBOTENANT GENERAL LEDGER ANALYSIS');
  console.log('='.repeat(60));

  console.log('\n📊 SUMMARY');
  console.log(`   Total Transactions: ${analysis.totalTransactions}`);
  console.log(`   Total Debits:       ${formatCurrency(analysis.totalDebits)}`);
  console.log(`   Total Credits:      ${formatCurrency(analysis.totalCredits)}`);
  console.log(`   Net:                ${formatCurrency(analysis.totalCredits - analysis.totalDebits)}`);

  console.log('\n✅ CATEGORIZATION CONFIDENCE');
  const pct = (count: number) => analysis.totalTransactions > 0
    ? (count / analysis.totalTransactions * 100).toFixed(1)
    : '0.0';
  console.log(`   High Confidence:    ${analysis.highConfidence} (${pct(analysis.highConfidence)}%)`);
  console.log(`   Medium Confidence:  ${analysis.mediumConfidence} (${pct(analysis.mediumConfidence)}%)`);
  console.log(`   Low/Uncategorized:  ${analysis.lowConfidence} (${pct(analysis.lowConfidence)}%)`);

  console.log('\n🏠 BY PROPERTY');
  for (const [prop, data] of Object.entries(analysis.byProperty).sort((a, b) => b[1].count - a[1].count)) {
    console.log(`   ${prop}:`);
    console.log(`      Transactions: ${data.count}`);
    console.log(`      Income:       ${formatCurrency(data.totalIncome)}`);
    console.log(`      Expenses:     ${formatCurrency(data.totalExpense)}`);
    console.log(`      Net:          ${formatCurrency(data.totalIncome - data.totalExpense)}`);
  }

  console.log('\n⚠️  ISSUES FOUND');
  for (const [type, count] of Object.entries(analysis.issuesByType).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${type}: ${count} items`);
  }

  if (analysis.suspenseItems.length > 0) {
    console.log('\n🔍 ITEMS NEEDING REVIEW (Suspense)');
    for (const item of analysis.suspenseItems.slice(0, 10)) {
      console.log(`   ${item.date.toLocaleDateString()} | ${item.description.slice(0, 40)} | ${formatCurrency(item.amount)}`);
      for (const issue of item.issues) {
        console.log(`      → ${issue}`);
      }
    }
    if (analysis.suspenseItems.length > 10) {
      console.log(`   ... and ${analysis.suspenseItems.length - 10} more`);
    }
  }

  console.log('\n📝 SUGGESTED CATEGORY CORRECTIONS');
  for (const correction of analysis.suggestedCorrections.slice(0, 15)) {
    console.log(`   "${correction.original}" → "${correction.suggested}" (${correction.count} items)`);
  }

  console.log('\n' + '='.repeat(60));
}

// Export to CSV with injection protection
function exportToCsv(transactions: CategorizedTransaction[], outputPath: string): void {
  const headers = [
    'Date', 'Description', 'Amount', 'Type',
    'Original Category', 'Suggested Account Code', 'Suggested Account Name',
    'Property', 'Schedule E Line', 'Tax Deductible', 'Confidence', 'Issues'
  ];

  // Helper to escape and sanitize CSV field
  const csvField = (value: string): string => {
    const sanitized = sanitizeCsvValue(value);
    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n')) {
      return `"${sanitized.replace(/"/g, '""')}"`;
    }
    return sanitized;
  };

  const rows = transactions.map(tx => [
    tx.date.toISOString().split('T')[0],
    csvField(tx.description),
    tx.amount.toFixed(2),
    tx.type,
    csvField(tx.originalCategory),
    tx.suggestedAccountCode,
    csvField(tx.suggestedAccountName),
    tx.propertyName || '',
    tx.scheduleELine || '',
    tx.taxDeductible ? 'Yes' : 'No',
    tx.confidence,
    csvField(tx.issues.join('; ')),
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  fs.writeFileSync(outputPath, csv);
  console.log(`\n✅ Exported to ${outputPath}`);
}

// Parse command line arguments
function parseArgs(args: string[]): { csvFile: string | null; dryRun: boolean; analyze: boolean; outputFile: string | null; help: boolean } {
  const result = {
    csvFile: null as string | null,
    dryRun: false,
    analyze: false,
    outputFile: null as string | null,
    help: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--analyze') {
      result.analyze = true;
    } else if (arg === '--output' || arg === '-o') {
      i++;
      if (i < args.length && !args[i].startsWith('-')) {
        result.outputFile = args[i];
      }
    } else if (!arg.startsWith('-')) {
      // Positional argument (CSV file)
      if (!result.csvFile) {
        result.csvFile = arg;
      }
    }
    i++;
  }

  return result;
}

// Main function
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { csvFile, dryRun, analyze, outputFile, help } = parseArgs(args);

  if (help || !csvFile) {
    console.log(`
TurboTenant General Ledger Analysis Tool

Analyzes CSV exports from TurboTenant's REI Accounting module and suggests
proper categorization according to REI Chart of Accounts (IRS Schedule E).

Usage:
  npx ts-node scripts/import-turbotenant.ts <csv-file> [options]

Options:
  --analyze       Show detailed analysis report (default if no --output)
  --output <file> Export corrected ledger to CSV with suggested categories
  --help          Show this help message

Example:
  npx ts-node scripts/import-turbotenant.ts ./ledger.csv --analyze --output ./corrected.csv

Note: This is an analysis tool. Review the output and make corrections manually.
    `);
    if (!help && !csvFile) {
      console.error('\nError: CSV file path is required');
      process.exit(1);
    }
    return;
  }

  // Read CSV file
  if (!fs.existsSync(csvFile)) {
    console.error(`Error: File not found: ${csvFile}`);
    process.exit(1);
  }

  console.log(`\n📂 Reading ${csvFile}...`);
  const csvContent = fs.readFileSync(csvFile, 'utf-8');

  // Parse CSV
  let records: TurboTenantRow[];
  try {
    records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (error) {
    console.error(`Error parsing CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }

  console.log(`   Found ${records.length} transactions`);

  // Validate CSV structure
  const validation = validateCsvStructure(records);
  if (!validation.valid) {
    console.error('\n❌ CSV validation failed:');
    for (const err of validation.errors) {
      console.error(`   - ${err}`);
    }
    process.exit(1);
  }

  // Categorize all transactions
  console.log('\n🔄 Categorizing transactions...');
  const categorized = records.map(categorizeTransaction);

  // Analyze
  const analysis = analyzeTransactions(categorized);

  // Print analysis
  if (analyze || !outputFile) {
    printAnalysis(analysis);
  }

  // Export if requested
  if (outputFile) {
    exportToCsv(categorized, outputFile);
  }

  // Summary
  if (!dryRun && outputFile) {
    console.log('\n💡 Next steps:');
    console.log('   1. Review the corrected CSV for accuracy');
    console.log('   2. Make manual corrections to any low-confidence items');
    console.log('   3. Use the corrected data to update your accounting system');
  } else if (!dryRun) {
    console.log('\n💡 To export corrected ledger, run:');
    console.log(`   npx ts-node scripts/import-turbotenant.ts ${csvFile} --output corrected-ledger.csv`);
  }
}

main().catch(console.error);
