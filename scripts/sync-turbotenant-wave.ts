/**
 * TurboTenant → Wave Accounting Sync
 *
 * Syncs categorized TurboTenant transactions to Wave as the system of record.
 *
 * Usage:
 *   npx ts-node scripts/sync-turbotenant-wave.ts <turbotenant-csv> [options]
 *
 * Options:
 *   --dry-run     Preview transactions without creating them in Wave
 *   --mapping     Path to Wave account mapping JSON file
 *   --verbose     Show detailed output
 *
 * Required Environment:
 *   WAVE_ACCESS_TOKEN  - OAuth access token (get via /api/integrations/wave/authorize)
 *   WAVE_BUSINESS_ID   - Wave business ID for ARIBIA LLC
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  WaveAPIClient,
  WaveAccount,
  WaveMoneyTransactionInput,
  WaveAccountType,
  createWaveClient,
} from '../server/lib/wave-api';
import {
  REI_CHART_OF_ACCOUNTS,
  AccountCode,
  DEFAULT_PROPERTY_MAPPINGS,
  PropertyMapping,
} from '../database/chart-of-accounts';

// ============================================================================
// Types
// ============================================================================

interface TurboTenantTransaction {
  date: string;
  description: string;
  amount: number; // Positive for income, negative for expenses
  category: string;
  propertyCode?: string;
  propertyName?: string;
  tenantName?: string;
  reference?: string;
}

interface WaveAccountMapping {
  reiAccountCode: AccountCode;
  waveAccountId: string;
  waveAccountName: string;
}

interface SyncConfig {
  waveBusinessId: string;
  waveAnchorAccountId: string; // Bank account for deposits/withdrawals
  accountMappings: WaveAccountMapping[];
  propertyMappings: PropertyMapping[];
}

interface SyncResult {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: Array<{
    transaction: TurboTenantTransaction;
    error: string;
  }>;
}

// ============================================================================
// TurboTenant CSV Parsing
// ============================================================================

function parseTurboTenantCSV(csvPath: string): TurboTenantTransaction[] {
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  if (lines.length < 2) {
    throw new Error('CSV file is empty or has no data rows');
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const transactions: TurboTenantTransaction[] = [];

  // Find column indices
  const dateIdx = headers.findIndex(h => h.includes('date'));
  const descIdx = headers.findIndex(h => h.includes('description') || h.includes('memo'));
  const amountIdx = headers.findIndex(h => h.includes('amount') || h.includes('total'));
  const categoryIdx = headers.findIndex(h => h.includes('category') || h.includes('type'));

  if (dateIdx === -1 || amountIdx === -1) {
    throw new Error('CSV must have date and amount columns');
  }

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < Math.max(dateIdx, amountIdx) + 1) continue;

    const amountStr = values[amountIdx].replace(/[$,"]/g, '');
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) continue;

    const transaction: TurboTenantTransaction = {
      date: formatDate(values[dateIdx]),
      description: descIdx >= 0 ? values[descIdx] : '',
      amount,
      category: categoryIdx >= 0 ? values[categoryIdx] : 'Uncategorized',
    };

    // Extract property info from description
    const propertyMatch = extractPropertyFromDescription(transaction.description);
    if (propertyMatch) {
      transaction.propertyCode = propertyMatch.code;
      transaction.propertyName = propertyMatch.name;
    }

    transactions.push(transaction);
  }

  return transactions;
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());

  return values;
}

function formatDate(dateStr: string): string {
  // Convert various date formats to YYYY-MM-DD
  const cleaned = dateStr.replace(/"/g, '').trim();

  // Try MM/DD/YYYY
  const mdyMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, month, day, year] = mdyMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Try YYYY-MM-DD (already correct)
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }

  // Try to parse with Date
  const date = new Date(cleaned);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  return cleaned;
}

function extractPropertyFromDescription(description: string): { code: string; name: string } | null {
  // Look for property patterns like "01 -" or "City Studio" in description
  const codeMatch = description.match(/^(\d{2})\s*-/);
  if (codeMatch) {
    const code = codeMatch[1];
    const property = DEFAULT_PROPERTY_MAPPINGS.find(p => p.code === code);
    if (property) {
      return { code, name: property.name };
    }
  }

  // Look for property names
  for (const property of DEFAULT_PROPERTY_MAPPINGS) {
    if (description.toLowerCase().includes(property.name.toLowerCase())) {
      return { code: property.code, name: property.name };
    }
  }

  return null;
}

// ============================================================================
// REI → Wave Account Mapping
// ============================================================================

function categorizeTransaction(transaction: TurboTenantTransaction): AccountCode {
  const desc = transaction.description.toLowerCase();
  const category = transaction.category.toLowerCase();
  const amount = transaction.amount;

  // Income (positive amounts typically)
  if (amount > 0 || category.includes('income') || category.includes('rent')) {
    if (desc.includes('rent') || category.includes('rent')) return '4100';
    if (desc.includes('late fee')) return '4200';
    if (desc.includes('pet') && (desc.includes('fee') || desc.includes('deposit'))) return '4210';
    if (desc.includes('parking')) return '4220';
    if (desc.includes('utility') || desc.includes('utilities')) return '4230';
    if (desc.includes('cleaning') || desc.includes('move-out')) return '4240';
    if (desc.includes('application')) return '4250';
    if (desc.includes('security deposit')) return '2100'; // Liability, not income
    return '4900'; // Other rental income
  }

  // Expenses (negative amounts)
  if (desc.includes('mortgage') || desc.includes('loan')) return '5100';
  if (desc.includes('insurance')) return '5200';
  if (desc.includes('property tax') || desc.includes('real estate tax')) return '5300';
  if (desc.includes('hoa') || desc.includes('condo fee') || desc.includes('assessment')) return '5400';
  if (desc.includes('management') || desc.includes('property manager')) return '5500';
  if (desc.includes('repair') || desc.includes('maintenance') || desc.includes('fix')) return '5600';
  if (desc.includes('plumbing')) return '5610';
  if (desc.includes('electric') || desc.includes('electrical')) return '5620';
  if (desc.includes('hvac') || desc.includes('heating') || desc.includes('cooling')) return '5630';
  if (desc.includes('appliance')) return '5640';
  if (desc.includes('landscaping') || desc.includes('lawn') || desc.includes('snow')) return '5650';
  if (desc.includes('pest') || desc.includes('exterminator')) return '5660';
  if (desc.includes('cleaning') || desc.includes('janitorial')) return '5670';
  if (desc.includes('utility') || desc.includes('utilities')) {
    if (desc.includes('water') || desc.includes('sewer')) return '5710';
    if (desc.includes('gas')) return '5720';
    if (desc.includes('electric')) return '5730';
    if (desc.includes('trash') || desc.includes('garbage')) return '5740';
    if (desc.includes('internet') || desc.includes('cable')) return '5750';
    return '5700';
  }
  if (desc.includes('advertising') || desc.includes('marketing') || desc.includes('listing')) return '5800';
  if (desc.includes('legal') || desc.includes('attorney') || desc.includes('lawyer')) return '5810';
  if (desc.includes('accounting') || desc.includes('bookkeeping') || desc.includes('cpa')) return '5820';
  if (desc.includes('license') || desc.includes('permit')) return '5830';
  if (desc.includes('travel') || desc.includes('mileage')) return '5840';
  if (desc.includes('office') || desc.includes('supplies')) return '5850';
  if (desc.includes('bank') || desc.includes('fee') || desc.includes('nsf')) return '5860';
  if (desc.includes('depreciation')) return '6100';

  // Capital expenditures
  if (desc.includes('improvement') || desc.includes('renovation') || desc.includes('remodel')) return '7100';
  if (desc.includes('roof')) return '7110';
  if (desc.includes('appliance') && amount < -500) return '7120'; // Large appliance = CapEx
  if (desc.includes('flooring') || desc.includes('carpet') || desc.includes('tile')) return '7130';
  if (desc.includes('window') || desc.includes('door')) return '7140';

  // Default to suspense if unclear
  return '9000';
}

async function buildWaveAccountMapping(
  waveClient: WaveAPIClient,
  businessId: string
): Promise<Map<AccountCode, string>> {
  console.log('Fetching Wave accounts...');

  const [incomeAccounts, expenseAccounts, assetAccounts, liabilityAccounts] = await Promise.all([
    waveClient.getAccounts(businessId, ['INCOME']),
    waveClient.getAccounts(businessId, ['EXPENSE']),
    waveClient.getAccounts(businessId, ['ASSET']),
    waveClient.getAccounts(businessId, ['LIABILITY']),
  ]);

  const allAccounts = [...incomeAccounts, ...expenseAccounts, ...assetAccounts, ...liabilityAccounts];
  const mapping = new Map<AccountCode, string>();

  // Map REI accounts to Wave accounts by name matching
  for (const [code, reiAccount] of Object.entries(REI_CHART_OF_ACCOUNTS)) {
    const waveAccount = findMatchingWaveAccount(reiAccount.name, allAccounts);
    if (waveAccount) {
      mapping.set(code as AccountCode, waveAccount.id);
    }
  }

  console.log(`Mapped ${mapping.size} of ${Object.keys(REI_CHART_OF_ACCOUNTS).length} REI accounts to Wave`);

  return mapping;
}

function findMatchingWaveAccount(reiName: string, waveAccounts: WaveAccount[]): WaveAccount | undefined {
  const normalizedREI = reiName.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Exact match first
  for (const account of waveAccounts) {
    const normalizedWave = account.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalizedWave === normalizedREI) {
      return account;
    }
  }

  // Partial match
  for (const account of waveAccounts) {
    const normalizedWave = account.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalizedWave.includes(normalizedREI) || normalizedREI.includes(normalizedWave)) {
      return account;
    }
  }

  return undefined;
}

// ============================================================================
// Wave Transaction Creation
// ============================================================================

function convertToWaveTransaction(
  transaction: TurboTenantTransaction,
  config: {
    businessId: string;
    anchorAccountId: string;
    categoryAccountId: string;
  }
): WaveMoneyTransactionInput {
  const isIncome = transaction.amount > 0;
  const absAmount = Math.abs(transaction.amount);

  // Build description with property info
  let description = transaction.description;
  if (transaction.propertyName) {
    description = `[${transaction.propertyName}] ${description}`;
  }

  // Generate unique external ID for idempotency
  const externalId = `tt-${transaction.date}-${Math.abs(transaction.amount).toFixed(2)}-${hashString(transaction.description)}`;

  return {
    businessId: config.businessId,
    externalId,
    date: transaction.date,
    description,
    anchor: {
      accountId: config.anchorAccountId,
      amount: absAmount,
      direction: isIncome ? 'DEPOSIT' : 'WITHDRAWAL',
    },
    lineItems: [{
      accountId: config.categoryAccountId,
      amount: absAmount,
      balance: isIncome ? 'INCREASE' : 'INCREASE', // Income increases income account, expense increases expense account
    }],
  };
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}

// ============================================================================
// Main Sync Function
// ============================================================================

async function syncTurboTenantToWave(
  csvPath: string,
  options: {
    dryRun?: boolean;
    verbose?: boolean;
    mappingPath?: string;
  } = {}
): Promise<SyncResult> {
  const result: SyncResult = {
    total: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  // Validate environment
  const accessToken = process.env.WAVE_ACCESS_TOKEN;
  const businessId = process.env.WAVE_BUSINESS_ID;
  const anchorAccountId = process.env.WAVE_ANCHOR_ACCOUNT_ID;

  if (!accessToken) {
    throw new Error('WAVE_ACCESS_TOKEN environment variable required. Get token via OAuth flow.');
  }
  if (!businessId) {
    throw new Error('WAVE_BUSINESS_ID environment variable required.');
  }
  if (!anchorAccountId) {
    throw new Error('WAVE_ANCHOR_ACCOUNT_ID environment variable required (your bank account in Wave).');
  }

  // Parse transactions
  console.log(`\nParsing TurboTenant CSV: ${csvPath}`);
  const transactions = parseTurboTenantCSV(csvPath);
  result.total = transactions.length;
  console.log(`Found ${transactions.length} transactions`);

  // Initialize Wave client
  const waveClient = createWaveClient({
    clientId: '',
    clientSecret: '',
    redirectUri: '',
  });
  waveClient.setAccessToken(accessToken);

  // Build account mapping
  const accountMapping = await buildWaveAccountMapping(waveClient, businessId);

  // Load custom mapping if provided
  if (options.mappingPath && fs.existsSync(options.mappingPath)) {
    const customMapping = JSON.parse(fs.readFileSync(options.mappingPath, 'utf-8'));
    for (const m of customMapping) {
      accountMapping.set(m.reiAccountCode, m.waveAccountId);
    }
    console.log(`Loaded ${customMapping.length} custom account mappings`);
  }

  // Get suspense account for unmapped categories
  let suspenseAccountId = accountMapping.get('9000');
  if (!suspenseAccountId) {
    // Try to find or create a suspense account
    const expenseAccounts = await waveClient.getAccounts(businessId, ['EXPENSE']);
    const suspense = expenseAccounts.find(a =>
      a.name.toLowerCase().includes('suspense') ||
      a.name.toLowerCase().includes('uncategorized')
    );
    suspenseAccountId = suspense?.id;
  }

  if (!suspenseAccountId) {
    console.warn('Warning: No suspense account found. Unmapped transactions will fail.');
  }

  // Process transactions
  console.log(`\n${options.dryRun ? '[DRY RUN] ' : ''}Processing transactions...`);

  for (const transaction of transactions) {
    // Categorize transaction
    const categoryCode = categorizeTransaction(transaction);
    let categoryAccountId = accountMapping.get(categoryCode);

    if (!categoryAccountId) {
      if (suspenseAccountId) {
        categoryAccountId = suspenseAccountId;
        if (options.verbose) {
          console.log(`  Unmapped category ${categoryCode}, using suspense account`);
        }
      } else {
        result.skipped++;
        result.errors.push({
          transaction,
          error: `No Wave account mapping for category ${categoryCode}`,
        });
        continue;
      }
    }

    const waveInput = convertToWaveTransaction(transaction, {
      businessId,
      anchorAccountId,
      categoryAccountId,
    });

    if (options.verbose || options.dryRun) {
      console.log(`\n  ${transaction.date} | ${transaction.description.substring(0, 40)}`);
      console.log(`    Amount: $${transaction.amount.toFixed(2)} → Category: ${categoryCode}`);
      if (options.dryRun) {
        console.log(`    [Would create] externalId: ${waveInput.externalId}`);
      }
    }

    if (options.dryRun) {
      result.succeeded++;
      continue;
    }

    // Create transaction in Wave
    try {
      const createResult = await waveClient.createMoneyTransaction(waveInput);

      if (createResult.didSucceed) {
        result.succeeded++;
        if (options.verbose) {
          console.log(`    ✓ Created: ${createResult.transaction?.id}`);
        }
      } else {
        result.failed++;
        const errorMsg = createResult.inputErrors.map(e => e.message).join(', ');
        result.errors.push({ transaction, error: errorMsg });
        if (options.verbose) {
          console.log(`    ✗ Failed: ${errorMsg}`);
        }
      }

      // Rate limit protection
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      result.failed++;
      result.errors.push({
        transaction,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return result;
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
TurboTenant → Wave Accounting Sync

Usage:
  npx ts-node scripts/sync-turbotenant-wave.ts <turbotenant-csv> [options]

Options:
  --dry-run     Preview transactions without creating them in Wave
  --mapping     Path to Wave account mapping JSON file
  --verbose     Show detailed output
  --help        Show this help message

Required Environment Variables:
  WAVE_ACCESS_TOKEN      OAuth access token from Wave
  WAVE_BUSINESS_ID       Wave business ID for ARIBIA LLC
  WAVE_ANCHOR_ACCOUNT_ID Wave account ID for your bank account

Example:
  # Dry run to preview
  WAVE_ACCESS_TOKEN=xxx WAVE_BUSINESS_ID=xxx WAVE_ANCHOR_ACCOUNT_ID=xxx \\
    npx ts-node scripts/sync-turbotenant-wave.ts data/turbotenant-ledger.csv --dry-run --verbose

  # Actual sync
  WAVE_ACCESS_TOKEN=xxx WAVE_BUSINESS_ID=xxx WAVE_ANCHOR_ACCOUNT_ID=xxx \\
    npx ts-node scripts/sync-turbotenant-wave.ts data/turbotenant-ledger.csv
`);
    process.exit(0);
  }

  // Parse arguments
  const csvPath = args.find(a => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');
  const mappingIdx = args.indexOf('--mapping');
  const mappingPath = mappingIdx >= 0 ? args[mappingIdx + 1] : undefined;

  if (!csvPath) {
    console.error('Error: CSV file path required');
    process.exit(1);
  }

  if (!fs.existsSync(csvPath)) {
    console.error(`Error: File not found: ${csvPath}`);
    process.exit(1);
  }

  try {
    console.log('='.repeat(60));
    console.log('TurboTenant → Wave Accounting Sync');
    console.log('='.repeat(60));

    const result = await syncTurboTenantToWave(csvPath, {
      dryRun,
      verbose,
      mappingPath,
    });

    console.log('\n' + '='.repeat(60));
    console.log('Sync Results');
    console.log('='.repeat(60));
    console.log(`Total transactions:  ${result.total}`);
    console.log(`Succeeded:           ${result.succeeded}`);
    console.log(`Failed:              ${result.failed}`);
    console.log(`Skipped:             ${result.skipped}`);

    if (result.errors.length > 0) {
      console.log('\nErrors:');
      for (const err of result.errors.slice(0, 10)) {
        console.log(`  - ${err.transaction.date} ${err.transaction.description.substring(0, 30)}: ${err.error}`);
      }
      if (result.errors.length > 10) {
        console.log(`  ... and ${result.errors.length - 10} more errors`);
      }
    }

    if (dryRun) {
      console.log('\n[DRY RUN] No transactions were created. Remove --dry-run to sync.');
    }

    process.exit(result.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('\nFatal error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
