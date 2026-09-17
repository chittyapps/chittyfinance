// REI Chart of Accounts for ARIBIA LLC Property Portfolio
//
// AUTHORITY: docs/CHART-OF-ACCOUNTS.md defines this chart. This file is its
// machine-readable projection and must match it — enforced by
// server/__tests__/chart-of-accounts-doc-parity.test.ts. Change the document
// first, then this file.
//
// Accounts carry both IRS references: Form 8825 (partnership rental, what ARIBIA
// files) and Schedule E (Form 1040). The two forms do not share line numbers.

// Account code type for type safety
export type AccountCode = string;

export interface AccountDefinition {
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  subtype?: string;
  description: string;
  scheduleE?: string; // IRS Schedule E (Form 1040) Part I line
  form8825?: string; // IRS Form 8825 line (partnership rental)
  taxDeductible?: boolean;
}

/**
 * How an account behaves in reporting.
 *  - 'pl'       counts toward income/expense and a tax line
 *  - 'balance'  balance-sheet only; never a P&L or tax line
 *  - 'transfer' movement between accounts the group controls; excluded from P&L
 *  - 'control'  workflow//non-deductible holding; excluded from tax lines
 */
export type AccountTreatment = 'pl' | 'balance' | 'transfer' | 'control';

/** Clearing accounts. Both legs of an internal movement land here; they net to zero. */
export const TRANSFER_CLEARING_CODES = ['1900', '1910', '1920'] as const;

/**
 * Capitalized improvements. Typed 'expense' in the legacy chart, but a capital
 * addition is an asset recovered through depreciation (Form 4562), never a
 * deductible expense line. Treated as balance-sheet here so no report or tax line
 * picks them up. See docs/CHART-OF-ACCOUNTS.md §8.
 */
export const CAPITAL_IMPROVEMENT_CODES = ['7000', '7010', '7020', '7030', '7040'] as const;

/** Control accounts: never reported on a return line. */
export const CONTROL_CODES = ['9000', '9010', '9020', '9030', '9040'] as const;

// Standard REI Chart of Accounts
export const REI_CHART_OF_ACCOUNTS: AccountDefinition[] = [
  // ============== ASSETS (1xxx) ==============
  // Cash & Bank Accounts (1000-1099)
  { code: '1000', name: 'Cash - Operating', type: 'asset', subtype: 'cash', description: 'Primary operating bank account' },
  { code: '1010', name: 'Cash - Security Deposits', type: 'asset', subtype: 'cash', description: 'Tenant security deposit escrow' },
  { code: '1020', name: 'Cash - Reserve Fund', type: 'asset', subtype: 'cash', description: 'Capital reserves for repairs' },
  { code: '1050', name: 'Petty Cash', type: 'asset', subtype: 'cash', description: 'Petty cash on hand' },

  // Clearing & Holding (1900-1999) — see docs/CHART-OF-ACCOUNTS.md §6
  { code: '1900', name: 'Transfer Clearing - Intra-Entity', type: 'asset', subtype: 'clearing', description: 'Both legs of a movement between two accounts of the same entity; nets to zero' },
  { code: '1910', name: 'Transfer Clearing - Intercompany', type: 'asset', subtype: 'clearing', description: 'Both legs of a movement between entities; nets to zero' },
  { code: '1920', name: 'Payment Rail Holding', type: 'asset', subtype: 'clearing', description: 'Venmo/Zelle/cash in flight until the far side is known' },

  // Receivables (1100-1199)
  { code: '1130', name: 'Due from Affiliate', type: 'asset', subtype: 'receivable', description: 'Standing inter-entity receivable; mirrors the affiliate\'s 2540' },
  { code: '1100', name: 'Accounts Receivable - Rent', type: 'asset', subtype: 'receivable', description: 'Outstanding rent due from tenants' },
  { code: '1110', name: 'Accounts Receivable - Other', type: 'asset', subtype: 'receivable', description: 'Other amounts due' },

  // Fixed Assets - Real Property (1500-1599)
  { code: '1500', name: 'Land', type: 'asset', subtype: 'fixed', description: 'Land value (not depreciable)' },
  { code: '1510', name: 'Buildings', type: 'asset', subtype: 'fixed', description: 'Building cost basis for depreciation' },
  { code: '1515', name: 'Accumulated Depreciation - Buildings', type: 'asset', subtype: 'contra', description: 'Accumulated depreciation on buildings' },
  { code: '1520', name: 'Land Improvements', type: 'asset', subtype: 'fixed', description: 'Landscaping, parking, fencing' },
  { code: '1525', name: 'Accumulated Depreciation - Improvements', type: 'asset', subtype: 'contra', description: 'Accumulated depreciation on improvements' },

  // Fixed Assets - Equipment & Furnishings (1600-1699)
  { code: '1600', name: 'Appliances', type: 'asset', subtype: 'fixed', description: 'Refrigerators, washers, dryers, etc.' },
  { code: '1605', name: 'Accumulated Depreciation - Appliances', type: 'asset', subtype: 'contra', description: 'Accumulated depreciation on appliances' },
  { code: '1610', name: 'Furniture & Fixtures', type: 'asset', subtype: 'fixed', description: 'Furnishings provided to tenants' },
  { code: '1615', name: 'Accumulated Depreciation - Furniture', type: 'asset', subtype: 'contra', description: 'Accumulated depreciation on furniture' },
  { code: '1620', name: 'HVAC Equipment', type: 'asset', subtype: 'fixed', description: 'Heating and cooling systems' },
  { code: '1625', name: 'Accumulated Depreciation - HVAC', type: 'asset', subtype: 'contra', description: 'Accumulated depreciation on HVAC' },

  // ============== LIABILITIES (2xxx) ==============
  // Current Liabilities (2000-2099)
  { code: '2000', name: 'Accounts Payable', type: 'liability', subtype: 'current', description: 'Bills owed to vendors' },
  { code: '2010', name: 'Security Deposits Held', type: 'liability', subtype: 'current', description: 'Tenant security deposits liability' },
  { code: '2020', name: 'Prepaid Rent', type: 'liability', subtype: 'current', description: 'Rent received in advance' },
  { code: '2030', name: 'Accrued Expenses', type: 'liability', subtype: 'current', description: 'Expenses incurred but not yet paid' },
  { code: '2040', name: 'Credit Card Payable', type: 'liability', subtype: 'current', description: 'Credit card balances' },

  // Long-Term Liabilities (2500-2599)
  { code: '2045', name: 'Buy-Now-Pay-Later Payable', type: 'liability', subtype: 'payable', description: 'Affirm, Afterpay and similar financed purchases' },
  { code: '2540', name: 'Due to Affiliate', type: 'liability', subtype: 'payable', description: 'Standing inter-entity payable; mirrors the affiliate\'s 1130' },
  { code: '2500', name: 'Mortgage Payable - Primary', type: 'liability', subtype: 'long-term', description: 'Primary mortgage balance' },
  { code: '2510', name: 'Mortgage Payable - Secondary', type: 'liability', subtype: 'long-term', description: 'Second mortgage/HELOC balance' },
  { code: '2520', name: 'Notes Payable', type: 'liability', subtype: 'long-term', description: 'Other loan balances' },
  { code: '2530', name: 'Owner Loan Payable', type: 'liability', subtype: 'long-term', description: 'Loans from owners to entity' },

  // ============== EQUITY (3xxx) ==============
  { code: '3000', name: 'Owner Capital', type: 'equity', description: 'Owner capital contributions' },
  { code: '3010', name: 'Owner Draws', type: 'equity', description: 'Owner withdrawals/distributions' },
  { code: '3020', name: 'Retained Earnings', type: 'equity', description: 'Accumulated profits/losses' },
  { code: '3030', name: 'Current Year Earnings', type: 'equity', description: 'Net income for current year' },

  // ============== INCOME (4xxx) ==============
  // Rental Income (4000-4099)
  { code: '4000', name: 'Rental Income - Long-Term', type: 'income', description: 'Base rent received on unfurnished, year-length leases', scheduleE: 'Line 3', form8825: 'Line 2a', taxDeductible: false },
  { code: '4005', name: 'Rental Income - Mid-Term Furnished', type: 'income', description: 'Furnished stays of 30+ days; passive rental income', scheduleE: 'Line 3', form8825: 'Line 2a', taxDeductible: false },
  { code: '4008', name: 'Rental Income - All-Inclusive', type: 'income', description: 'Rent with utilities bundled', scheduleE: 'Line 3', form8825: 'Line 2a', taxDeductible: false },
  { code: '4010', name: 'Late Fees', type: 'income', description: 'Late payment fees collected', scheduleE: 'Line 3', form8825: 'Line 2b', taxDeductible: false },
  { code: '4020', name: 'Pet Fees', type: 'income', description: 'Pet rent and deposits (non-refundable)', scheduleE: 'Line 3', form8825: 'Line 2b', taxDeductible: false },
  { code: '4030', name: 'Parking Income', type: 'income', description: 'Parking space rental', scheduleE: 'Line 3', form8825: 'Line 2b', taxDeductible: false },
  { code: '4040', name: 'Utility Reimbursement', type: 'income', description: 'Tenant utility payments', scheduleE: 'Line 3', form8825: 'Line 2b', taxDeductible: false },
  { code: '4050', name: 'Application Fees', type: 'income', description: 'Tenant application fees', scheduleE: 'Line 3', form8825: 'Line 2b', taxDeductible: false },
  { code: '4060', name: 'Laundry Income', type: 'income', description: 'Coin laundry revenue', scheduleE: 'Line 3', form8825: 'Line 2b', taxDeductible: false },

  // Other Income (4100-4199)
  { code: '4100', name: 'Interest Income', type: 'income', description: 'Bank interest, security deposit interest', taxDeductible: false },
  { code: '4110', name: 'Forfeited Deposits', type: 'income', description: 'Security deposits retained; income only on forfeiture, otherwise a 2010 liability', scheduleE: 'Line 3', form8825: 'Line 2b', taxDeductible: false },
  { code: '4120', name: 'Other Income', type: 'income', description: 'Miscellaneous income', scheduleE: 'Line 3', form8825: 'Line 2b', taxDeductible: false },

  // Non-rental business income — Form 1065 page 1, NOT Form 8825
  { code: '4070', name: 'Management Income', type: 'income', description: 'Fees earned managing property for others; 1065 page 1 gross receipts', taxDeductible: false },
  { code: '4080', name: 'Other Business Income', type: 'income', description: 'Amazon KDP and other non-rental revenue; 1065 page 1', taxDeductible: false },

  // ============== EXPENSES (5xxx-7xxx) ==============
  // Property Operating Expenses (5000-5499)
  { code: '5000', name: 'Advertising', type: 'expense', description: 'Listing fees, marketing', scheduleE: 'Line 5', form8825: 'Line 3', taxDeductible: true },
  { code: '5010', name: 'Auto & Travel', type: 'expense', description: 'Mileage, travel to properties', scheduleE: 'Line 6', form8825: 'Line 4', taxDeductible: true },
  { code: '5015', name: 'Contract Labor (1099)', type: 'expense', description: 'Non-employee labor; 1099-NEC source. Form 8825 line 13 Wages and salaries', scheduleE: 'Line 19', form8825: 'Line 13', taxDeductible: true },
  { code: '5025', name: 'Furnishings & Decor', type: 'expense', description: 'Furnishings below the capitalization threshold; above it capitalize to 1610', scheduleE: 'Line 19', form8825: 'Line 17', taxDeductible: true },
  { code: '5020', name: 'Cleaning & Maintenance', type: 'expense', description: 'Routine cleaning, janitorial', scheduleE: 'Line 7', form8825: 'Line 5', taxDeductible: true },
  { code: '5030', name: 'Commissions', type: 'expense', description: 'Leasing commissions paid', scheduleE: 'Line 7', form8825: 'Line 6', taxDeductible: true },
  { code: '5040', name: 'Insurance', type: 'expense', description: 'Property insurance premiums', scheduleE: 'Line 9', form8825: 'Line 7', taxDeductible: true },
  { code: '5050', name: 'Legal & Professional Fees', type: 'expense', description: 'Attorney, CPA, property manager', scheduleE: 'Line 10', form8825: 'Line 9', taxDeductible: true },
  { code: '5055', name: 'Litigation - Arias', type: 'expense', description: 'Litigation costs segregated from ordinary legal fees for the recovery waterfall', scheduleE: 'Line 10', form8825: 'Line 9', taxDeductible: true },
  { code: '5060', name: 'Management Fees', type: 'expense', description: 'Property management fees', scheduleE: 'Line 11', form8825: 'Line 17', taxDeductible: true },
  { code: '5070', name: 'Repairs', type: 'expense', description: 'Non-capital repairs and maintenance', scheduleE: 'Line 14', form8825: 'Line 11', taxDeductible: true },
  { code: '5080', name: 'Supplies', type: 'expense', description: 'Office and maintenance supplies', scheduleE: 'Line 15', form8825: 'Line 17', taxDeductible: true },
  { code: '5090', name: 'Property Taxes', type: 'expense', description: 'Real estate taxes', scheduleE: 'Line 16', form8825: 'Line 10', taxDeductible: true },

  // Utilities (5100-5199)
  { code: '5100', name: 'Utilities - Electric', type: 'expense', description: 'Electricity (landlord paid)', scheduleE: 'Line 17', form8825: 'Line 12', taxDeductible: true },
  { code: '5110', name: 'Utilities - Gas', type: 'expense', description: 'Gas (landlord paid)', scheduleE: 'Line 17', form8825: 'Line 12', taxDeductible: true },
  { code: '5120', name: 'Utilities - Water/Sewer', type: 'expense', description: 'Water and sewer', scheduleE: 'Line 17', form8825: 'Line 12', taxDeductible: true },
  { code: '5130', name: 'Utilities - Trash', type: 'expense', description: 'Garbage collection', scheduleE: 'Line 17', form8825: 'Line 12', taxDeductible: true },
  { code: '5140', name: 'Utilities - Internet/Cable', type: 'expense', description: 'Internet and cable (if provided)', scheduleE: 'Line 17', form8825: 'Line 12', taxDeductible: true },

  // HOA & Association Fees (5200-5299)
  { code: '5200', name: 'HOA Dues', type: 'expense', description: 'Homeowner association fees', scheduleE: 'Line 19', form8825: 'Line 17', taxDeductible: true },
  { code: '5210', name: 'Condo Fees', type: 'expense', description: 'Condo association fees', scheduleE: 'Line 19', form8825: 'Line 17', taxDeductible: true },
  { code: '5220', name: 'Special Assessments', type: 'expense', description: 'HOA special assessments', scheduleE: 'Line 19', form8825: 'Line 17', taxDeductible: true },

  // Financial Expenses (5300-5399)
  { code: '5300', name: 'Mortgage Interest', type: 'expense', description: 'Mortgage interest expense', scheduleE: 'Line 12', form8825: 'Line 8', taxDeductible: true },
  { code: '5310', name: 'Other Interest', type: 'expense', description: 'Other loan interest', scheduleE: 'Line 13', form8825: 'Line 8', taxDeductible: true },
  { code: '5320', name: 'Bank Charges', type: 'expense', description: 'Bank fees, NSF fees, wire fees', scheduleE: 'Line 19', form8825: 'Line 17', taxDeductible: true },
  { code: '5330', name: 'Credit Card Fees', type: 'expense', description: 'Merchant processing fees', scheduleE: 'Line 19', form8825: 'Line 17', taxDeductible: true },

  // Depreciation (5400-5499)
  { code: '5400', name: 'Depreciation - Building', type: 'expense', description: '27.5 year residential depreciation', scheduleE: 'Line 18', form8825: 'Line 14', taxDeductible: true },
  { code: '5410', name: 'Depreciation - Improvements', type: 'expense', description: 'Depreciation on improvements', scheduleE: 'Line 18', form8825: 'Line 14', taxDeductible: true },
  { code: '5420', name: 'Depreciation - Appliances', type: 'expense', description: '5-7 year depreciation', scheduleE: 'Line 18', form8825: 'Line 14', taxDeductible: true },
  { code: '5430', name: 'Depreciation - Furniture', type: 'expense', description: '5-7 year depreciation', scheduleE: 'Line 18', form8825: 'Line 14', taxDeductible: true },

  // Administrative Expenses (6000-6099)
  { code: '6000', name: 'Office Expenses', type: 'expense', description: 'Office supplies, postage', scheduleE: 'Line 19', form8825: 'Line 17', taxDeductible: true },
  { code: '6010', name: 'Software Subscriptions', type: 'expense', description: 'Property management software, accounting', scheduleE: 'Line 19', form8825: 'Line 17', taxDeductible: true },
  { code: '6050', name: 'AI & Compute', type: 'expense', description: 'Model APIs and compute (Anthropic, OpenAI and similar)', scheduleE: 'Line 19', form8825: 'Line 17', taxDeductible: true },
  { code: '6020', name: 'Phone & Communication', type: 'expense', description: 'Business phone, answering service', scheduleE: 'Line 19', form8825: 'Line 17', taxDeductible: true },
  { code: '6030', name: 'Education & Training', type: 'expense', description: 'Real estate courses, seminars', scheduleE: 'Line 19', form8825: 'Line 17', taxDeductible: true },
  { code: '6040', name: 'Licenses & Permits', type: 'expense', description: 'Business licenses, rental permits', scheduleE: 'Line 19', form8825: 'Line 17', taxDeductible: true },

  // Capital Expenditures (7000-7099) - Not directly expensed, added to asset basis
  { code: '7000', name: 'Capital Improvements - Building', type: 'expense', subtype: 'capital', description: 'Major improvements (capitalize, depreciate)', taxDeductible: false },
  { code: '7010', name: 'Capital Improvements - HVAC', type: 'expense', subtype: 'capital', description: 'HVAC replacement (capitalize)', taxDeductible: false },
  { code: '7020', name: 'Capital Improvements - Roof', type: 'expense', subtype: 'capital', description: 'Roof replacement (capitalize)', taxDeductible: false },
  { code: '7030', name: 'Capital Improvements - Appliances', type: 'expense', subtype: 'capital', description: 'New appliances (capitalize)', taxDeductible: false },
  { code: '7040', name: 'Capital Improvements - Other', type: 'expense', subtype: 'capital', description: 'Other capital improvements', taxDeductible: false },

  // Non-Deductible / Suspense (9000-9999)
  { code: '9040', name: 'Data Quality Hold', type: 'expense', subtype: 'suspense', description: 'Source data is broken (bad payee, epoch date); not a pending human decision', taxDeductible: false },
  { code: '9000', name: 'Owner Personal Expense', type: 'expense', subtype: 'non-deductible', description: 'Personal expenses paid from business (not deductible)', taxDeductible: false },
  { code: '9010', name: 'Suspense / Unclassified', type: 'expense', subtype: 'suspense', description: 'Transactions pending classification', taxDeductible: false },
  { code: '9020', name: 'Ask My Accountant', type: 'expense', subtype: 'suspense', description: 'Needs CPA review', taxDeductible: false },
  { code: '9030', name: 'Reconciliation Adjustments', type: 'expense', subtype: 'suspense', description: 'Auto-balance / reconciling items to investigate', taxDeductible: false },
];

// TurboTenant category mapping to proper COA codes
export const TURBOTENANT_CATEGORY_MAP: Record<string, string> = {
  // Income mappings
  'Rent': '4000',
  'Late Fee': '4010',
  'Pet Fee': '4020',
  'Parking': '4030',
  'Application Fee': '4050',
  'Interest Revenue': '4100',
  'Security Deposit Interest': '4100',

  // Expense mappings
  'Advertising': '5000',
  'Auto and Travel': '5010',
  'Auto': '5010',
  'Travel': '5010',
  'Uber': '5010',
  'Lyft': '5010',
  'Cleaning and Maintenance': '5020',
  'Cleaning': '5020',
  'Maintenance': '5020',
  'Insurance': '5040',
  'Legal and Professional Fees': '5050',
  'Legal': '5050',
  'Professional Fees': '5050',
  'Management Fees': '5060',
  'Repairs': '5070',
  'Supplies': '5080',
  'Home Depot': '5080', // Could be repairs or supplies - default to supplies
  'Ace Hardware': '5080',
  'Taxes': '5090',
  'Property Tax': '5090',

  // Utilities
  'Utilities': '5100',
  'Electric': '5100',
  'Gas': '5110',
  'Water': '5120',
  'Sewer': '5120',
  'Trash': '5130',
  'Internet': '5140',
  'Cable': '5140',

  // HOA
  'HOA': '5200',
  'HOA Dues': '5200',
  'Condo Fee': '5210',
  'Commodore HOA': '5210',
  'PropertyHill': '5200', // HOA payment service

  // Financial
  'Mortgage Interest': '5300',
  'Mr Cooper': '5300', // Mortgage servicer
  'SoFi': '5300', // Could be mortgage or personal loan
  'Interest': '5310',
  'Bank Fees': '5320',
  'NSF Fee': '5320',
  'Overdraft Fee': '5320',
  'Wire Fee': '5320',

  // Software/Admin
  'QuickBooks': '6010',
  'Canva': '6010',
  'TurboTenant': '6010',
  'REI Accounting': '6010',
  'Software': '6010',

  // Owner transactions
  'Owner Funds': '3010', // Owner draws (equity)
  'Owner Draw': '3010',
  'Owner Contribution': '3000',
  'Owner Capital': '3000',

  // Suspense
  'Auto Balance': '9030',
  'Reconciliation': '9030',
  'Unclassified': '9010',
  'Other': '9010',
};

// Property mapping interface - loaded from database or config at runtime
export interface PropertyMapping {
  code: string;
  name: string;
  tenantSlug: string;
  address: string;
  tenantId?: string; // UUID from database
}

// Default property mappings for offline/standalone use
// In production, these should be loaded from the properties table in the database
// See: database/seeds/it-can-be-llc.ts for the canonical property definitions
export const DEFAULT_PROPERTY_MAPPINGS: PropertyMapping[] = [
  // TurboTenant property codes from historical ledger exports
  { code: '01', name: 'Lakeside Loft', tenantSlug: 'nicholas-bianchi', address: '541 W Addison St, Unit 3S, Chicago, IL' },
  { code: '02', name: 'Cozy Castle', tenantSlug: 'nicholas-bianchi', address: '550 W Surf St, Unit 504, Chicago, IL' },
  { code: '03', name: 'City Studio', tenantSlug: 'aribia-city-studio', address: '550 W Surf St, Unit C211, Chicago, IL' },
  { code: '04', name: 'Morada Mami', tenantSlug: 'aribia-llc', address: 'Carrera 76 A # 53-215, Medellin, Colombia' },
  { code: '05', name: 'Villa Vista', tenantSlug: 'aribia-apt-arlene', address: '4343 N Clarendon, Unit 1610, Chicago, IL' },
];

// Build lookup map from property array
export function buildPropertyMap(properties: PropertyMapping[]): Record<string, PropertyMapping> {
  const map: Record<string, PropertyMapping> = {};
  for (const prop of properties) {
    map[prop.code] = prop;
  }
  return map;
}

// Helper to find COA code from description
export function findAccountCode(description: string, category?: string): string {
  const descLower = description.toLowerCase();
  const catLower = (category || '').toLowerCase();

  // Check category first
  for (const [key, code] of Object.entries(TURBOTENANT_CATEGORY_MAP)) {
    if (catLower === key.toLowerCase()) {
      return code;
    }
  }

  // Check description for keywords
  for (const [key, code] of Object.entries(TURBOTENANT_CATEGORY_MAP)) {
    if (descLower.includes(key.toLowerCase())) {
      return code;
    }
  }

  // Default to suspense if not found
  return '9010';
}

// Get account definition by code
export function getAccountByCode(code: string): AccountDefinition | undefined {
  return REI_CHART_OF_ACCOUNTS.find(a => a.code === code);
}

// Validate if expense is deductible
export function isDeductible(code: string): boolean {
  const account = getAccountByCode(code);
  return account?.taxDeductible ?? false;
}

// Get Schedule E line for code
export function getScheduleELine(code: string): string | undefined {
  const account = getAccountByCode(code);
  return account?.scheduleE;
}

/**
 * Form 8825 line for a code. ARIBIA files as a partnership, so rental activity is
 * reported here rather than directly on Schedule E. Lines differ between the forms:
 * 8825 has Wages (13) but no Supplies or Management Fees line; Schedule E is the
 * reverse. 8825 lines 15-16 are reserved; line 17 (Other) needs Schedule A (Form 8825),
 * which is why 'Other' expenses stay separate accounts.
 */
export function getForm8825Line(code: string): string | undefined {
  return getAccountByCode(code)?.form8825;
}

/** How this account behaves in reporting. See docs/CHART-OF-ACCOUNTS.md §1 and §6. */
export function getAccountTreatment(code: string): AccountTreatment | undefined {
  const account = getAccountByCode(code);
  if (!account) return undefined;
  if ((TRANSFER_CLEARING_CODES as readonly string[]).includes(code)) return 'transfer';
  if ((CONTROL_CODES as readonly string[]).includes(code)) return 'control';
  if ((CAPITAL_IMPROVEMENT_CODES as readonly string[]).includes(code)) return 'balance';
  return account.type === 'income' || account.type === 'expense' ? 'pl' : 'balance';
}

/**
 * Does this account belong on a profit and loss statement or a tax line?
 * Clearing, control and balance-sheet accounts do not: booking a transfer or a
 * card payment to an expense line is the largest error class in the imported data.
 */
export function isProfitAndLossAccount(code: string): boolean {
  return getAccountTreatment(code) === 'pl';
}
