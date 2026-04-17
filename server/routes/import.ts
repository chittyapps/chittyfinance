import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { ledgerLog } from '../lib/ledger-client';
import { findAccountCode } from '../../database/chart-of-accounts';

export const importRoutes = new Hono<HonoEnv>();

interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  category: string;
  propertyCode?: string;
  tenantName?: string;
  reference?: string;
}

// ═══════════════════════════════════════════════════════════════
// HD Pro Job Name → Tenant Entity Normalization
// ═══════════════════════════════════════════════════════════════

/** Canonical entity keys matching tenant slugs or property names */
type EntityKey =
  | 'aribia-mgmt'
  | 'city-studio'
  | 'apt-arlene'
  | 'cozy-castle'    // 550 W Surf 504
  | 'lakeside-loft'  // 541 W Addison 3S
  | 'villa-vista'    // renovation project
  | 'personal-nick'  // personal/non-entity purchases
  | 'colombia'       // Alejandro Arias / Morada Mami
  | 'surf-504'       // alias for Cozy Castle
  | 'addison'        // alias for Lakeside Loft
  | 'chitty-consumables'
  | 'chitty-furnishings'
  | 'chitty-tools'
  | 'suspense';      // untagged or junk

/**
 * Map HD Pro "Job Name" values (case-insensitive) to canonical entity keys.
 * Handles typos, abbreviations, and concatenation errors from the Pro account.
 */
const HD_JOB_NAME_MAP: Record<string, EntityKey> = {
  // ARIBIA MGMT — general management entity
  'aribia mgmt': 'aribia-mgmt',

  // CITY STUDIO — 550 W Surf C211
  'city studio': 'city-studio',

  // APT ARLENE — 4343 N Clarendon 1610
  'apt arlene': 'apt-arlene',

  // COZY CASTLE — 550 W Surf 504 (includes all renovation variants)
  'cozy castle': 'cozy-castle',
  'cozy renovation': 'cozy-castle',
  'cozy reno': 'cozy-castle',
  'cozy castle reno': 'cozy-castle',
  'cozy renocozy renovation': 'cozy-castle',  // concatenation typo
  'cozy rrenovation': 'cozy-castle',           // double-r typo

  // LAKESIDE LOFT — 541 W Addison 3S
  'lakeside loft': 'lakeside-loft',
  'addison': 'lakeside-loft',  // store vicinity alias

  // VILLA VISTA — renovation project (no matching tenant yet)
  'villa vista remodel': 'villa-vista',
  'villa vista remo': 'villa-vista',
  'villa vista': 'villa-vista',

  // SURF 504 — alias for Cozy Castle
  'surf 504': 'cozy-castle',

  // Colombia / Arias
  'alejandro arias': 'colombia',

  // Chitty operational categories
  'chitty consumables': 'chitty-consumables',
  'chitty furnishings': 'chitty-furnishings',
  'chitty tools': 'chitty-tools',

  // Personal
  'personal': 'personal-nick',
  'nick': 'personal-nick',
};

/** Junk values that should always go to suspense */
const HD_JUNK_JOB_NAMES = new Set(['0', '00']);

/**
 * Normalize an HD Pro Job Name to a canonical entity key.
 * Returns 'suspense' for blank, junk, or unknown values.
 */
export function normalizeHDJobName(raw: string): EntityKey {
  const trimmed = raw.trim();
  if (!trimmed || HD_JUNK_JOB_NAMES.has(trimmed)) return 'suspense';
  const key = trimmed.toLowerCase();
  return HD_JOB_NAME_MAP[key] ?? 'suspense';
}

// ═══════════════════════════════════════════════════════════════
// HD Pro Department/Class → COA Code Classification
// ═══════════════════════════════════════════════════════════════

/**
 * Map HD Pro Department Name to COA code.
 * Falls back to Class, then Subclass, then SKU description keywords.
 */
const HD_DEPARTMENT_COA: Record<string, string> = {
  // Repairs & maintenance materials
  'hardware': '5070',
  'plumbing': '5070',
  'electrical': '5070',
  'building materials': '5070',
  'doors & windows': '5070',
  'millwork': '5070',
  'lumber': '5070',

  // Paint & finishing — repairs
  'paint': '5070',

  // Flooring & surfaces — repairs unless full reno (manual override)
  'wall&floor cover.': '5070',
  'flooring': '5070',

  // Cleaning & maintenance
  'cleaning': '5020',

  // Supplies
  'tools': '5080',
  'storage & organization': '5080',
  'outdoor living': '5080',
  'holiday': '5080',

  // Appliances — capital improvement
  'appliances': '7030',

  // HVAC
  'heating & cooling': '7010',

  // Kitchen & Bath — repairs unless full remodel
  'kitchen': '5070',
  'bath': '5070',

  // Garden / Landscaping
  'garden center': '5080',
  'garden': '5080',
  'nursery': '5080',
};

/** More specific class-level overrides */
const HD_CLASS_COA: Record<string, string> = {
  'light bulbs': '5080',
  'cleaning products': '5020',
  'janitorial': '5020',
  'trash bags': '5020',
  'pest control': '5020',
  'air filters': '5080',
  'smoke detectors': '5070',
  'door locks': '5070',
  'organization': '5080',
};

/**
 * Classify an HD Pro line item to a COA code using department hierarchy.
 */
export function classifyHDProItem(
  department: string,
  className: string,
  subclass: string,
  description: string,
): { code: string; confidence: number } {
  const deptLower = department.toLowerCase().trim();
  const classLower = className.toLowerCase().trim();

  // Check class-level overrides first (more specific)
  for (const [key, code] of Object.entries(HD_CLASS_COA)) {
    if (classLower.includes(key)) {
      return { code, confidence: 0.800 };
    }
  }

  // Department-level mapping
  const deptCode = HD_DEPARTMENT_COA[deptLower];
  if (deptCode) {
    return { code: deptCode, confidence: 0.750 };
  }

  // Fall back to keyword matching from existing findAccountCode
  const fallback = findAccountCode(description, department);
  if (fallback !== '9010') {
    return { code: fallback, confidence: 0.600 };
  }

  // Suspense
  return { code: '9010', confidence: 0.100 };
}

// ═══════════════════════════════════════════════════════════════
// HD Pro CSV Parser
// ═══════════════════════════════════════════════════════════════

interface HDProRow {
  date: string;
  storeNumber: string;
  transactionId: string;
  registerNumber: string;
  jobName: string;
  skuNumber: string;
  skuDescription: string;
  quantity: number;
  unitPrice: number;
  departmentName: string;
  className: string;
  subclassName: string;
  programDiscountAmount: number;
  otherDiscountAmount: number;
  extendedRetail: number;
  netUnitPrice: number;
  internetSku: string;
  purchaser: string;
  orderNumber: string;
  invoiceNumber: string;
}

/**
 * Parse HD Pro Purchase History CSV.
 * HD Pro CSVs have 6 metadata rows (company, phone, source, date range, export date, blank)
 * followed by the actual header + data rows. Encoding is latin-1.
 */
export function parseHDProCSV(csv: string): HDProRow[] {
  // Normalize line endings
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Find the header row (starts with "Date,Store Number,Transaction ID")
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    if (lines[i].startsWith('Date,Store Number,Transaction ID')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const dataLines = lines.slice(headerIdx + 1).filter((l) => l.trim().length > 0);
  const rows: HDProRow[] = [];

  for (const line of dataLines) {
    const fields = parseCSVLine(line);
    if (fields.length < 16) continue;

    const parseNum = (s: string) => {
      const cleaned = s.replace(/[$,]/g, '').trim();
      return cleaned ? parseFloat(cleaned) : 0;
    };

    rows.push({
      date: fields[0],
      storeNumber: fields[1],
      transactionId: fields[2],
      registerNumber: fields[3],
      jobName: fields[4],
      skuNumber: fields[5],
      skuDescription: fields[6],
      quantity: parseNum(fields[7]) || 1,
      unitPrice: parseNum(fields[8]),
      departmentName: fields[9] || '',
      className: fields[10] || '',
      subclassName: fields[11] || '',
      programDiscountAmount: parseNum(fields[12]),
      otherDiscountAmount: parseNum(fields[14]),
      extendedRetail: parseNum(fields[15]),
      netUnitPrice: parseNum(fields[16]),
      internetSku: fields[17] || '',
      purchaser: fields[18] || '',
      orderNumber: fields[19] || '',
      invoiceNumber: fields[20] || '',
    });
  }

  return rows;
}

/** SHA-256 dedup hash for HD Pro items (transaction_id + sku + date) */
async function hdproDeduplicationHash(transactionId: string, sku: string, date: string): Promise<string> {
  const key = `hdpro|${transactionId}|${sku}|${date}`;
  const data = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  const hex = Array.from(hashArray).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `hd-${hex.slice(0, 16)}`;
}

/** Parse a CSV line respecting quoted fields (RFC 4180) */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

export function parseTurboTenantCSV(csv: string): ParsedTransaction[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase());
  const rows: ParsedTransaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });

    rows.push({
      date: row.date || '',
      description: row.description || '',
      amount: parseFloat(row.amount || '0'),
      category: row.category || 'uncategorized',
      propertyCode: row.property_code || row.propertycode || undefined,
      tenantName: row.tenant_name || row.tenantname || undefined,
      reference: row.reference || undefined,
    });
  }

  return rows.filter((r) => r.date && !isNaN(r.amount));
}

/** SHA-256 based deduplication hash (async, Web Crypto API) */
export async function deduplicationHash(date: string, amount: number, description: string): Promise<string> {
  const key = `${date}|${amount}|${description}`;
  const data = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  const hex = Array.from(hashArray).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `tt-${hex.slice(0, 16)}`;
}

// POST /api/import/turbotenant — import TurboTenant CSV ledger
// Requires X-Account-ID header or ?accountId query param to specify the target account
importRoutes.post('/api/import/turbotenant', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  const accountId = c.req.header('X-Account-ID') || c.req.query('accountId');
  if (!accountId) {
    return c.json({ error: 'accountId is required (X-Account-ID header or ?accountId query param)' }, 400);
  }

  // Verify the account exists and belongs to this tenant
  const account = await storage.getAccount(accountId, tenantId);
  if (!account) {
    return c.json({ error: 'Account not found or does not belong to this tenant' }, 404);
  }

  const body = await c.req.text();
  const parsed = parseTurboTenantCSV(body);

  if (parsed.length === 0) {
    return c.json({ error: 'No valid transactions found in CSV' }, 400);
  }

  const properties = await storage.getProperties(tenantId);

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of parsed) {
    const externalId = await deduplicationHash(row.date, row.amount, row.description);

    // Check for duplicate via storage abstraction
    const existing = await storage.getTransactionByExternalId(externalId, tenantId);
    if (existing) {
      skipped++;
      continue;
    }

    // Match property by code or name pattern
    const matchedProperty = properties.find((p: any) =>
      (row.propertyCode && p.metadata?.code === row.propertyCode) ||
      row.description.toLowerCase().includes(p.name.toLowerCase()),
    );

    try {
      // L0 ingest: auto-suggest COA code via keyword matching
      const suggestedCode = findAccountCode(row.description, row.category);
      const isSuspense = suggestedCode === '9010';

      await storage.createTransaction({
        tenantId,
        accountId,
        amount: String(row.amount),
        type: row.amount >= 0 ? 'income' : 'expense',
        category: row.category,
        description: row.description,
        date: new Date(row.date),
        payee: row.tenantName || null,
        propertyId: matchedProperty?.id || null,
        externalId,
        suggestedCoaCode: suggestedCode,
        classificationConfidence: isSuspense ? '0.100' : '0.700',
        metadata: { source: 'turbotenant', reference: row.reference },
      });
      imported++;
    } catch (err) {
      errors.push(`Row ${row.date} ${row.description}: ${(err as Error).message}`);
    }
  }

  ledgerLog(c, {
    entityType: 'audit',
    action: 'import.turbotenant',
    metadata: { tenantId, accountId, parsed: parsed.length, imported, skipped, errorCount: errors.length },
  }, c.env);

  const status = imported > 0 ? 200 : 422;
  return c.json({ parsed: parsed.length, imported, skipped, errors }, status);
});

// POST /api/import/hdpro — import Home Depot Pro Purchase History CSV
// Requires X-Account-ID header or ?accountId query param
importRoutes.post('/api/import/hdpro', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  const accountId = c.req.header('X-Account-ID') || c.req.query('accountId');
  if (!accountId) {
    return c.json({ error: 'accountId is required (X-Account-ID header or ?accountId query param)' }, 400);
  }

  const account = await storage.getAccount(accountId, tenantId);
  if (!account) {
    return c.json({ error: 'Account not found or does not belong to this tenant' }, 404);
  }

  const body = await c.req.text();
  const parsed = parseHDProCSV(body);

  if (parsed.length === 0) {
    return c.json({ error: 'No valid HD Pro transactions found in CSV. Expected header row starting with "Date,Store Number,Transaction ID".' }, 400);
  }

  // Build entity→tenant mapping by loading all tenants the caller can see
  const allTenants = await storage.getTenants();
  const entityTenantMap: Record<EntityKey, string | null> = {
    'aribia-mgmt': null,
    'city-studio': null,
    'apt-arlene': null,
    'cozy-castle': null,
    'lakeside-loft': null,
    'villa-vista': null,
    'personal-nick': null,
    'colombia': null,
    'surf-504': null,
    'addison': null,
    'chitty-consumables': null,
    'chitty-furnishings': null,
    'chitty-tools': null,
    'suspense': null,
  };

  // Match entity keys to tenant IDs by name pattern
  for (const t of allTenants) {
    const name = t.name.toLowerCase();
    if (name.includes('mgmt') || name.includes('management')) entityTenantMap['aribia-mgmt'] = t.id;
    if (name.includes('city studio')) entityTenantMap['city-studio'] = t.id;
    if (name.includes('apt arlene') || name.includes('clarendon')) entityTenantMap['apt-arlene'] = t.id;
    // Cozy Castle / Lakeside Loft are properties, not tenants — they belong to their parent
  }

  // Load properties for entity→property matching
  const properties = await storage.getProperties(tenantId);

  const propertyMap: Record<string, { id: string; tenantId: string }> = {};
  for (const p of properties) {
    const pName = p.name.toLowerCase();
    if (pName.includes('city studio')) propertyMap['city-studio'] = { id: p.id, tenantId: p.tenantId };
    if (pName.includes('arlene') || pName.includes('clarendon')) propertyMap['apt-arlene'] = { id: p.id, tenantId: p.tenantId };
    if (pName.includes('cozy') || pName.includes('surf')) propertyMap['cozy-castle'] = { id: p.id, tenantId: p.tenantId };
    if (pName.includes('lakeside') || pName.includes('addison')) propertyMap['lakeside-loft'] = { id: p.id, tenantId: p.tenantId };
  }

  let imported = 0;
  let skipped = 0;
  let suspenseCount = 0;
  const errors: string[] = [];
  const jobNameStats: Record<string, { count: number; entity: string }> = {};

  for (const row of parsed) {
    // Skip zero-amount or return-only rows
    const amount = row.netUnitPrice || row.extendedRetail || row.unitPrice;
    if (!amount && amount !== 0) continue;

    const externalId = await hdproDeduplicationHash(row.transactionId, row.skuNumber, row.date);
    const existing = await storage.getTransactionByExternalId(externalId, tenantId);
    if (existing) {
      skipped++;
      continue;
    }

    const entityKey = normalizeHDJobName(row.jobName);
    const classification = classifyHDProItem(row.departmentName, row.className, row.subclassName, row.skuDescription);
    const isSuspense = entityKey === 'suspense' || classification.code === '9010';
    if (isSuspense) suspenseCount++;

    // Track job name stats for the response
    const rawJob = row.jobName.trim() || '(blank)';
    if (!jobNameStats[rawJob]) jobNameStats[rawJob] = { count: 0, entity: entityKey };
    jobNameStats[rawJob].count++;

    // Resolve property if applicable
    const prop = propertyMap[entityKey];

    try {
      await storage.createTransaction({
        tenantId,
        accountId,
        amount: String(Math.abs(amount)),
        type: amount >= 0 ? 'expense' : 'income',  // HD Pro purchases are expenses; negative = returns
        category: row.departmentName || 'home_depot',
        description: `HD Pro: ${row.skuDescription}`,
        date: new Date(row.date),
        payee: 'Home Depot',
        propertyId: prop?.id || null,
        externalId,
        suggestedCoaCode: classification.code,
        classificationConfidence: String(isSuspense ? 0.100 : classification.confidence),
        metadata: {
          source: 'hdpro',
          storeNumber: row.storeNumber,
          transactionId: row.transactionId,
          skuNumber: row.skuNumber,
          department: row.departmentName,
          class: row.className,
          subclass: row.subclassName,
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          discounts: row.programDiscountAmount + row.otherDiscountAmount,
          purchaser: row.purchaser,
          invoiceNumber: row.invoiceNumber,
          jobName: row.jobName,
          normalizedEntity: entityKey,
        },
      });
      imported++;
    } catch (err) {
      errors.push(`Row ${row.date} SKU ${row.skuNumber}: ${(err as Error).message}`);
    }
  }

  ledgerLog(c, {
    entityType: 'audit',
    action: 'import.hdpro',
    metadata: {
      tenantId,
      accountId,
      parsed: parsed.length,
      imported,
      skipped,
      suspenseCount,
      errorCount: errors.length,
    },
  }, c.env);

  return c.json({
    parsed: parsed.length,
    imported,
    skipped,
    suspenseCount,
    errors: errors.slice(0, 50),
    jobNameMapping: jobNameStats,
  }, imported > 0 ? 200 : 422);
});

// ═══════════════════════════════════════════════════════════════
// Amazon Business PO Number → Entity Normalization
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize an Amazon Business PO Number + Account Group to a canonical entity key.
 *
 * Amazon Business uses PO Number for 3 different things simultaneously:
 *   a) Property routing:  Surf 504, Addison 3S, ="211"
 *   b) Entity routing:    ARIBIA LLC - COZY CASTLE, ARIBIA LLC - MGMT
 *   c) Category tagging:  Furnishings and Decor, Cleaning / Maintenance
 *
 * Account Group adds a layer: Personal group + Surf 504 PO = personal spend at property.
 * Account User detects Arias personal purchases on the business card.
 */
function normalizeAmazonEntity(
  poNumber: string,
  accountGroup: string,
  accountUser: string,
): { entity: EntityKey; personalUse: boolean } {
  const po = poNumber.trim().toLowerCase();
  const group = accountGroup.trim().toLowerCase();
  const user = accountUser.trim().toLowerCase();

  // Arias personal spend detection — any purchase by Luisa/LuLu in personal categories
  const isArias = user.includes('arias') || user.includes('lulu');

  // Personal group items are personal regardless of PO
  if (group === 'personal') {
    return { entity: 'personal-nick', personalUse: true };
  }

  // Explicit personal tags
  if (po === 'personal' || po === 'nick' || po === 'personal purchase') {
    return { entity: 'personal-nick', personalUse: true };
  }

  // Uncle Steve — personal
  if (po === 'uncle steve') {
    return { entity: 'personal-nick', personalUse: true };
  }

  // Property routing by PO Number
  if (po === 'surf 504' || po.includes('cozy castle')) {
    return { entity: 'cozy-castle', personalUse: isArias };
  }
  if (po === 'surf 211' || po === '="211"' || po === '211') {
    return { entity: 'city-studio', personalUse: false };
  }
  if (po === 'addison 3s' || po.includes('lakeside loft')) {
    return { entity: 'lakeside-loft', personalUse: false };
  }
  if (po.includes('apt arlene') || po.includes('clarendon')) {
    return { entity: 'apt-arlene', personalUse: false };
  }
  if (po.includes('city studio')) {
    return { entity: 'city-studio', personalUse: false };
  }

  // Entity routing
  if (po.includes('aribia') && po.includes('mgmt')) {
    return { entity: 'aribia-mgmt', personalUse: false };
  }
  if (po === 'chitty services' || group === 'chitty services') {
    return { entity: 'aribia-mgmt', personalUse: false };
  }
  if (po === 'business' || po === 'aribia llc' || po === 'office expense') {
    return { entity: 'aribia-mgmt', personalUse: false };
  }

  // CHITTY SERVICES group — category PO Numbers (Furnishings, Cleaning, Tools, etc.)
  if (group === 'chitty services') {
    return { entity: 'aribia-mgmt', personalUse: false };
  }

  // Capital Expenditure
  if (po === 'capital expenditure') {
    return { entity: 'aribia-mgmt', personalUse: false };
  }

  // Blank PO under ARIBIA LLC — suspense
  if (!po || po === '(blank)') {
    // If Arias user, flag as personal
    if (isArias) return { entity: 'suspense', personalUse: true };
    return { entity: 'suspense', personalUse: false };
  }

  return { entity: 'suspense', personalUse: isArias };
}

// ═══════════════════════════════════════════════════════════════
// Amazon Category → COA Code Classification
// ═══════════════════════════════════════════════════════════════

/** Personal spend categories — COA 3200 (Owner Draws) */
const AMAZON_PERSONAL_CATEGORIES = new Set([
  'health and beauty', 'beauty', 'prestige beauty', 'grocery',
  'pet products', 'apparel', 'book', 'luggage', 'sports',
  'music', 'shoes', 'jewelry', 'baby product',
]);

/**
 * Amazon category → COA mapping.
 * NOT treated as authoritative — Amazon categories are unreliable.
 * These are L1 suggestions only; confidence is low.
 */
const AMAZON_CATEGORY_COA: Record<string, string> = {
  'home improvement': '5070',
  'kitchen': '5080',
  'home': '5080',
  'lighting': '5070',
  'lawn & patio': '5080',
  'furniture': '7030',
  'office product': '5080',
  'business, industrial, & scientific supplies basic': '5080',
};

/**
 * Classify an Amazon item. Amazon categories are NOT authoritative —
 * confidence is kept low to force L2 human review.
 */
function classifyAmazonItem(
  category: string,
  personalUse: boolean,
  poNumber: string,
): { code: string; confidence: number } {
  // Personal use → owner draws
  if (personalUse) {
    const catLower = category.toLowerCase();
    if (AMAZON_PERSONAL_CATEGORIES.has(catLower)) {
      return { code: '3200', confidence: 0.850 };
    }
    // Personal user but non-personal category — still likely personal, lower confidence
    return { code: '3200', confidence: 0.500 };
  }

  // CHITTY SERVICES PO-based category hints (more reliable than Amazon category)
  const poLower = poNumber.trim().toLowerCase();
  if (poLower === 'cleaning / maintenance supplie') return { code: '5020', confidence: 0.700 };
  if (poLower === 'furnishings and decor') return { code: '5080', confidence: 0.650 };
  if (poLower === 'tools / equipment') return { code: '5080', confidence: 0.650 };
  if (poLower === 'small appliances / electronics') return { code: '7030', confidence: 0.600 };
  if (poLower === 'capital expenditure') return { code: '7030', confidence: 0.700 };
  if (poLower === 'chitty furnishings') return { code: '5080', confidence: 0.650 };

  // Amazon category fallback (low confidence — not authoritative)
  const catLower = category.toLowerCase();
  const catCode = AMAZON_CATEGORY_COA[catLower];
  if (catCode) {
    return { code: catCode, confidence: 0.400 };
  }

  // Suspense
  return { code: '9010', confidence: 0.100 };
}

// ═══════════════════════════════════════════════════════════════
// Amazon Business CSV Parser
// ═══════════════════════════════════════════════════════════════

interface AmazonRow {
  orderDate: string;
  orderId: string;
  accountGroup: string;
  poNumber: string;
  orderStatus: string;
  accountUser: string;
  accountUserEmail: string;
  amazonCategory: string;
  asin: string;
  title: string;
  brand: string;
  itemQuantity: number;
  itemSubtotal: number;
  itemTax: number;
  itemNetTotal: number;
  itemPromotion: number;
  paymentDate: string;
  paymentAmount: number;
  sellerName: string;
  glCode: string;
  costCenter: string;
  department: string;
  projectCode: string;
  location: string;
}

/**
 * Parse Amazon Business order history CSV.
 * Filters to Closed orders with non-zero amounts (excludes cancellations, returns, zero-amount).
 */
export function parseAmazonCSV(csv: string): AmazonRow[] {
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return [];

  // Handle BOM
  const headerLine = lines[0].replace(/^\uFEFF/, '');
  const headers = parseCSVLine(headerLine).map((h) => h.toLowerCase().trim());

  const rows: AmazonRow[] = [];
  const parseNum = (s: string) => {
    const cleaned = (s || '').replace(/[$,="]/g, '').trim();
    return cleaned ? parseFloat(cleaned) : 0;
  };

  const col = (row: Record<string, string>, ...names: string[]): string => {
    for (const n of names) {
      const v = row[n];
      if (v !== undefined && v !== '') return v;
    }
    return '';
  };

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });

    const status = col(row, 'order status');
    const netTotal = parseNum(col(row, 'item net total'));

    // Skip cancelled, pending, and zero-amount items
    if (status !== 'Closed' || netTotal === 0) continue;

    rows.push({
      orderDate: col(row, 'order date'),
      orderId: col(row, 'order id'),
      accountGroup: col(row, 'account group'),
      poNumber: col(row, 'po number'),
      orderStatus: status,
      accountUser: col(row, 'account user'),
      accountUserEmail: col(row, 'account user email'),
      amazonCategory: col(row, 'amazon-internal product category'),
      asin: col(row, 'asin'),
      title: col(row, 'title'),
      brand: col(row, 'brand'),
      itemQuantity: parseNum(col(row, 'item quantity')) || 1,
      itemSubtotal: parseNum(col(row, 'item subtotal')),
      itemTax: parseNum(col(row, 'item tax')),
      itemNetTotal: netTotal,
      itemPromotion: parseNum(col(row, 'item promotion')),
      paymentDate: col(row, 'payment date'),
      paymentAmount: parseNum(col(row, 'payment amount')),
      sellerName: col(row, 'seller name'),
      glCode: col(row, 'gl code'),
      costCenter: col(row, 'cost center'),
      department: col(row, 'department'),
      projectCode: col(row, 'project code'),
      location: col(row, 'location'),
    });
  }

  return rows;
}

/** SHA-256 dedup hash for Amazon items (order_id + asin + date) */
async function amazonDeduplicationHash(orderId: string, asin: string, date: string): Promise<string> {
  const key = `amazon|${orderId}|${asin}|${date}`;
  const data = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  const hex = Array.from(hashArray).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `az-${hex.slice(0, 16)}`;
}

// POST /api/import/amazon — import Amazon Business order history CSV
// Requires X-Account-ID header or ?accountId query param
importRoutes.post('/api/import/amazon', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  const accountId = c.req.header('X-Account-ID') || c.req.query('accountId');
  if (!accountId) {
    return c.json({ error: 'accountId is required (X-Account-ID header or ?accountId query param)' }, 400);
  }

  const account = await storage.getAccount(accountId, tenantId);
  if (!account) {
    return c.json({ error: 'Account not found or does not belong to this tenant' }, 404);
  }

  const body = await c.req.text();
  const parsed = parseAmazonCSV(body);

  if (parsed.length === 0) {
    return c.json({ error: 'No valid Amazon transactions found in CSV. Expected Amazon Business order history export with "Order Date" header.' }, 400);
  }

  // Load properties for entity→property matching
  const properties = await storage.getProperties(tenantId);
  const propertyMap: Record<string, { id: string; tenantId: string }> = {};
  for (const p of properties) {
    const pName = p.name.toLowerCase();
    if (pName.includes('city studio')) propertyMap['city-studio'] = { id: p.id, tenantId: p.tenantId };
    if (pName.includes('arlene') || pName.includes('clarendon')) propertyMap['apt-arlene'] = { id: p.id, tenantId: p.tenantId };
    if (pName.includes('cozy') || pName.includes('surf')) propertyMap['cozy-castle'] = { id: p.id, tenantId: p.tenantId };
    if (pName.includes('lakeside') || pName.includes('addison')) propertyMap['lakeside-loft'] = { id: p.id, tenantId: p.tenantId };
  }

  let imported = 0;
  let skipped = 0;
  let suspenseCount = 0;
  let personalCount = 0;
  const errors: string[] = [];
  const entityStats: Record<string, { count: number; total: number; personal: number }> = {};
  const userStats: Record<string, { count: number; total: number; personalTotal: number }> = {};

  for (const row of parsed) {
    const externalId = await amazonDeduplicationHash(row.orderId, row.asin, row.orderDate);
    const existing = await storage.getTransactionByExternalId(externalId, tenantId);
    if (existing) {
      skipped++;
      continue;
    }

    const { entity, personalUse } = normalizeAmazonEntity(
      row.poNumber, row.accountGroup, row.accountUser,
    );
    const classification = classifyAmazonItem(
      row.amazonCategory, personalUse, row.poNumber,
    );

    const isSuspense = classification.code === '9010';
    if (isSuspense) suspenseCount++;
    if (personalUse) personalCount++;

    // Track stats
    if (!entityStats[entity]) entityStats[entity] = { count: 0, total: 0, personal: 0 };
    entityStats[entity].count++;
    entityStats[entity].total += row.itemNetTotal;
    if (personalUse) entityStats[entity].personal++;

    const userKey = row.accountUser || '(unknown)';
    if (!userStats[userKey]) userStats[userKey] = { count: 0, total: 0, personalTotal: 0 };
    userStats[userKey].count++;
    userStats[userKey].total += row.itemNetTotal;
    if (personalUse) userStats[userKey].personalTotal += row.itemNetTotal;

    const prop = propertyMap[entity];

    try {
      await storage.createTransaction({
        tenantId,
        accountId,
        amount: String(Math.abs(row.itemNetTotal)),
        type: row.itemNetTotal >= 0 ? 'expense' : 'income',
        category: row.amazonCategory || 'amazon',
        description: `Amazon: ${row.title.slice(0, 200)}`,
        date: new Date(row.orderDate),
        payee: row.sellerName || 'Amazon',
        propertyId: prop?.id || null,
        externalId,
        suggestedCoaCode: classification.code,
        classificationConfidence: String(classification.confidence),
        metadata: {
          source: 'amazon',
          orderId: row.orderId,
          asin: row.asin,
          brand: row.brand,
          amazonCategory: row.amazonCategory,
          accountGroup: row.accountGroup,
          poNumber: row.poNumber,
          accountUser: row.accountUser,
          accountUserEmail: row.accountUserEmail,
          itemQuantity: row.itemQuantity,
          itemSubtotal: row.itemSubtotal,
          itemTax: row.itemTax,
          itemPromotion: row.itemPromotion,
          normalizedEntity: entity,
          personalUse,
          // Preserve any structured fields if populated (future-proofing for restructured account)
          ...(row.glCode ? { glCode: row.glCode } : {}),
          ...(row.costCenter ? { costCenter: row.costCenter } : {}),
          ...(row.department ? { department: row.department } : {}),
          ...(row.projectCode ? { projectCode: row.projectCode } : {}),
        },
      });
      imported++;
    } catch (err) {
      errors.push(`Row ${row.orderDate} ASIN ${row.asin}: ${(err as Error).message}`);
    }
  }

  ledgerLog(c, {
    entityType: 'audit',
    action: 'import.amazon',
    metadata: {
      tenantId,
      accountId,
      parsed: parsed.length,
      imported,
      skipped,
      suspenseCount,
      personalCount,
      errorCount: errors.length,
    },
  }, c.env);

  return c.json({
    parsed: parsed.length,
    imported,
    skipped,
    suspenseCount,
    personalCount,
    errors: errors.slice(0, 50),
    entityMapping: entityStats,
    userBreakdown: userStats,
  }, imported > 0 ? 200 : 422);
});

// POST /api/import/wave-sync — sync Wave transactions
importRoutes.post('/api/import/wave-sync', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  if (!c.env.WAVE_CLIENT_ID || !c.env.WAVE_CLIENT_SECRET) {
    return c.json({ error: 'Wave integration is not configured on this server' }, 503);
  }

  const integrations = await storage.getIntegrations(tenantId);
  const waveIntegration = integrations.find((i: any) => i.serviceType === 'wavapps' && i.connected);

  if (!waveIntegration) {
    return c.json({ error: 'Wave integration not connected' }, 400);
  }

  const { WaveAPIClient } = await import('../lib/wave-api');
  const creds = waveIntegration.credentials as any;

  if (!creds?.access_token) {
    return c.json({ error: 'Wave credentials missing access token — re-authorize the integration' }, 400);
  }

  const client = new WaveAPIClient({
    clientId: c.env.WAVE_CLIENT_ID,
    clientSecret: c.env.WAVE_CLIENT_SECRET,
    redirectUri: '',
  });
  client.setAccessToken(creds.access_token);

  try {
    const businesses = await client.getBusinesses();
    if (businesses.length === 0) {
      return c.json({ error: 'No Wave businesses found' }, 400);
    }

    const business = businesses[0];
    const invoices = await client.getInvoices(business.id);

    return c.json({
      business: business.name,
      invoiceCount: invoices.length,
      message: 'Wave sync completed. Transaction import from invoices is pending full implementation.',
    });
  } catch (err) {
    return c.json({ error: `Wave sync failed: ${(err as Error).message}` }, 502);
  }
});
