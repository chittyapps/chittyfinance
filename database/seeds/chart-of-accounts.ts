// Seed script for Chart of Accounts global defaults
// Seeds REI_CHART_OF_ACCOUNTS as global entries (tenant_id = NULL)
// Run after schema push: npm run db:push:system && npx tsx database/seeds/chart-of-accounts.ts

import { db } from '../../server/db';
import * as schema from '../system.schema';
import { REI_CHART_OF_ACCOUNTS, TURBOTENANT_CATEGORY_MAP } from '../chart-of-accounts';

export async function seedChartOfAccounts() {
  console.log('Seeding global Chart of Accounts...');

  const values = REI_CHART_OF_ACCOUNTS.map((acct) => ({
    tenantId: null as unknown as undefined, // global account
    code: acct.code,
    name: acct.name,
    type: acct.type,
    subtype: acct.subtype ?? null,
    description: acct.description,
    scheduleELine: acct.scheduleE ?? null,
    taxDeductible: acct.taxDeductible ?? false,
    parentCode: deriveParentCode(acct.code),
    isActive: true,
    modifiedBy: 'seed:chart-of-accounts',
    metadata: {
      keywords: getKeywordsForCode(acct.code),
    },
  }));

  // Upsert: insert or skip on conflict (global code uniqueness)
  let inserted = 0;
  for (const val of values) {
    try {
      await db.insert(schema.chartOfAccounts).values(val);
      inserted++;
    } catch (e: any) {
      if (e.message?.includes('unique') || e.code === '23505') {
        // Already exists — skip
        continue;
      }
      throw e;
    }
  }

  console.log(`  ${inserted} accounts seeded (${values.length - inserted} already existed)`);
  console.log('Done.');
}

// Derive parent code from account code (e.g. '5110' -> '5100', '5020' -> '5000')
function deriveParentCode(code: string): string | null {
  if (code.length !== 4) return null;
  const num = parseInt(code, 10);
  // Top-level codes (x000) have no parent
  if (num % 1000 === 0) return null;
  // Sub-codes within a 100-range share a parent at the x00 level
  const parentNum = Math.floor(num / 100) * 100;
  const parentCode = parentNum.toString().padStart(4, '0');
  // Only set parent if the parent account exists in our COA
  const parentExists = REI_CHART_OF_ACCOUNTS.some((a) => a.code === parentCode);
  return parentExists ? parentCode : null;
}

// Reverse-map: for a given COA code, find all keywords from TURBOTENANT_CATEGORY_MAP
function getKeywordsForCode(code: string): string[] {
  return Object.entries(TURBOTENANT_CATEGORY_MAP)
    .filter(([_, c]) => c === code)
    .map(([keyword]) => keyword);
}

// Run directly if executed as script
if (import.meta.url.endsWith(process.argv[1]?.replace(/^file:\/\//, '') || '')) {
  seedChartOfAccounts()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Seed failed:', e);
      process.exit(1);
    });
}
