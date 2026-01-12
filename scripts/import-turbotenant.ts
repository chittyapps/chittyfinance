#!/usr/bin/env npx ts-node
/**
 * TurboTenant General Ledger Import Script
 *
 * Imports CSV exports from TurboTenant's REI Accounting module
 * and properly categorizes transactions according to the REI Chart of Accounts.
 *
 * Usage:
 *   npx ts-node scripts/import-turbotenant.ts <csv-file> [--dry-run] [--output <file>]
 *
 * Options:
 *   --dry-run    Preview changes without writing to database
 *   --output     Output corrected ledger to file (CSV or JSON)
 *   --analyze    Show categorization analysis and issues
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import {
  findAccountCode,
  getAccountByCode,
  ARIBIA_PROPERTY_MAP,
  TURBOTENANT_CATEGORY_MAP,
  REI_CHART_OF_ACCOUNTS,
  type AccountDefinition
} from '../database/chart-of-accounts';

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
function parseAmount(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[$,]/g, '').replace(/[()]/g, '-').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Extract property code from description or property field
function extractPropertyCode(row: TurboTenantRow): string | null {
  // Check Property field first
  if (row.Property) {
    for (const [code, info] of Object.entries(ARIBIA_PROPERTY_MAP)) {
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
    if (ARIBIA_PROPERTY_MAP[code]) {
      return code;
    }
  }

  // Check for property names in description
  for (const [code, info] of Object.entries(ARIBIA_PROPERTY_MAP)) {
    if (desc.toLowerCase().includes(info.name.toLowerCase())) {
      return code;
    }
  }

  // Check for addresses
  if (desc.includes('541 W Addison') || desc.includes('Addison')) return '01';
  if (desc.includes('Unit 504') || desc.includes('Cozy')) return '02';
  if (desc.includes('Unit 211') || desc.includes('City Studio') || desc.includes('C211')) return '03';
  if (desc.includes('Carrera 76') || desc.includes('Morada') || desc.includes('Colombia')) return '04';

  return null;
}

// Identify issues with the transaction
function identifyIssues(row: TurboTenantRow, accountCode: string): string[] {
  const issues: string[] = [];
  const account = getAccountByCode(accountCode);

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

  // Determine amount and type
  let amount = 0;
  let type: 'debit' | 'credit' = 'debit';

  if (row.Debit && parseAmount(row.Debit) !== 0) {
    amount = parseAmount(row.Debit);
    type = 'debit';
  } else if (row.Credit && parseAmount(row.Credit) !== 0) {
    amount = parseAmount(row.Credit);
    type = 'credit';
  } else if (row.Amount) {
    amount = parseAmount(row.Amount);
    type = amount >= 0 ? 'credit' : 'debit';
    amount = Math.abs(amount);
  }

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
  console.log(`   High Confidence:    ${analysis.highConfidence} (${(analysis.highConfidence / analysis.totalTransactions * 100).toFixed(1)}%)`);
  console.log(`   Medium Confidence:  ${analysis.mediumConfidence} (${(analysis.mediumConfidence / analysis.totalTransactions * 100).toFixed(1)}%)`);
  console.log(`   Low/Uncategorized:  ${analysis.lowConfidence} (${(analysis.lowConfidence / analysis.totalTransactions * 100).toFixed(1)}%)`);

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

// Export to CSV
function exportToCsv(transactions: CategorizedTransaction[], outputPath: string): void {
  const headers = [
    'Date', 'Description', 'Amount', 'Type',
    'Original Category', 'Suggested Account Code', 'Suggested Account Name',
    'Property', 'Schedule E Line', 'Tax Deductible', 'Confidence', 'Issues'
  ];

  const rows = transactions.map(tx => [
    tx.date.toISOString().split('T')[0],
    `"${tx.description.replace(/"/g, '""')}"`,
    tx.amount.toFixed(2),
    tx.type,
    `"${tx.originalCategory}"`,
    tx.suggestedAccountCode,
    `"${tx.suggestedAccountName}"`,
    tx.propertyName || '',
    tx.scheduleELine || '',
    tx.taxDeductible ? 'Yes' : 'No',
    tx.confidence,
    `"${tx.issues.join('; ')}"`,
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  fs.writeFileSync(outputPath, csv);
  console.log(`\n✅ Exported to ${outputPath}`);
}

// Main function
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
TurboTenant General Ledger Import Script

Usage:
  npx ts-node scripts/import-turbotenant.ts <csv-file> [options]

Options:
  --dry-run       Preview without database changes
  --output <file> Export corrected ledger to CSV
  --analyze       Show detailed analysis report
  --help          Show this help message

Example:
  npx ts-node scripts/import-turbotenant.ts ./ledger.csv --analyze --output ./corrected.csv
    `);
    return;
  }

  const csvFile = args[0];
  const dryRun = args.includes('--dry-run');
  const analyze = args.includes('--analyze');
  const outputIdx = args.indexOf('--output');
  const outputFile = outputIdx >= 0 ? args[outputIdx + 1] : null;

  // Read CSV file
  if (!fs.existsSync(csvFile)) {
    console.error(`Error: File not found: ${csvFile}`);
    process.exit(1);
  }

  console.log(`\n📂 Reading ${csvFile}...`);
  const csvContent = fs.readFileSync(csvFile, 'utf-8');

  // Parse CSV
  const records: TurboTenantRow[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`   Found ${records.length} transactions`);

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
  if (!dryRun) {
    console.log('\n💡 To import into ChittyFinance database, run:');
    console.log('   npm run db:import:turbotenant <csv-file>');
  }
}

main().catch(console.error);
