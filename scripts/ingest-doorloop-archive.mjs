#!/usr/bin/env node
/**
 * Ingest DoorLoop archive data into ChittyFinance database
 * - SYSTEM mode: Neon/Postgres using minimal system.schema tables
 * - STANDALONE fallback: local SQLite (./chittyfinance.db) using standalone.schema tables
 */

// Note: not importing dotenv to avoid workspace resolution issues

import fs from 'fs';
import { execSync } from 'node:child_process';

// Note: WebSocket for Neon will be configured lazily if system backend is used

const MODE = (process.env.MODE || 'system').toLowerCase();
const DATABASE_URL = process.env.DATABASE_URL;

console.log('💾 DOORLOOP DATA INGESTION');
console.log('='.repeat(80));
console.log(`Requested Mode: ${MODE}`);

// Decide backend
let backend = 'system';
if (MODE === 'system' && !DATABASE_URL) {
  console.warn('⚠️  DATABASE_URL not set for system mode — falling back to standalone SQLite');
  backend = 'standalone';
} else if (MODE === 'standalone') {
  backend = 'standalone';
}

let pool = null;
let sqlite = null; // marker for standalone backend

if (backend === 'system') {
  console.log(`Database: ${DATABASE_URL.substring(0, 60)}...`);
  const { Pool } = await import('@neondatabase/serverless');
  const ws = (await import('ws')).default;
  globalThis.WebSocket = ws;
  pool = new Pool({ connectionString: DATABASE_URL });
  console.log('🟦 Using Neon/Postgres (system.schema)');
} else {
  sqlite = { dbPath: './chittyfinance.db' };
  // Ensure minimal standalone tables exist to receive data via sqlite3 CLI
  const schemaSQL = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  name TEXT,
  type TEXT,
  balance REAL
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY,
  account_id INTEGER,
  amount REAL,
  description TEXT,
  occurred_at TEXT
);
`;
  execSync(`sqlite3 -batch ${sqlite.dbPath} <<'SQL'\n${schemaSQL}\nSQL`);
  console.log('🟩 Using SQLite ./chittyfinance.db (standalone.schema)');
}

// Load archived data (local files)
const hasFile = (p) => fs.existsSync(p);
const primaryArchivePath = hasFile('doorloop-complete-archive-2025-12-09.json')
  ? 'doorloop-complete-archive-2025-12-09.json'
  : 'doorloop-final-archive-2025-12-09.json';
const finalArchive = JSON.parse(fs.readFileSync(primaryArchivePath, 'utf8'));
const communications = hasFile('doorloop-communications-2025-12-09.json')
  ? JSON.parse(fs.readFileSync('doorloop-communications-2025-12-09.json', 'utf8'))
  : { data: {} };
const reports = hasFile('doorloop-reports-2025-12-09.json')
  ? JSON.parse(fs.readFileSync('doorloop-reports-2025-12-09.json', 'utf8'))
  : { data: {} };

function pickData(obj, keyA, keyB) {
  const d = obj?.data || {};
  const v = d[keyA] !== undefined ? d[keyA] : d[keyB];
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object' && Array.isArray(v.data)) return v.data;
  return [];
}

// SYSTEM: tenants/accounts/transactions per database/system.schema.ts
async function findOrCreateTenant(name, type = 'property') {
  if (backend === 'standalone') {
    // Standalone schema has no tenants table. Return null.
    return null;
  }

  const result = await pool.query(
    'SELECT id FROM tenants WHERE name = $1',
    [name]
  );

  if (result.rows.length > 0) return result.rows[0].id;

  const insertResult = await pool.query(
    `INSERT INTO tenants (name, type)
     VALUES ($1, $2)
     RETURNING id`,
    [name, type]
  );

  console.log(`   ✅ Created tenant: ${name}`);
  return insertResult.rows[0].id;
}

async function findOrCreateAccount(tenantId, name, type) {
  if (backend === 'standalone') {
    const q = (s) => execSync(`sqlite3 -batch -noheader -cmd ".timeout 2000" ${sqlite.dbPath} ${JSON.stringify(s)}`, { encoding: 'utf8' }).trim();
    const run = (s) => execSync(`sqlite3 -batch ${sqlite.dbPath} <<'SQL'\n${s}\nSQL`);
    const esc = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
    const row = q(`SELECT id FROM accounts WHERE name = ${esc(name)} LIMIT 1;`);
    if (row) return parseInt(row.split('|')[0] || row, 10);
    run(`INSERT INTO accounts (name, type, balance) VALUES (${esc(name)}, ${esc(type)}, 0);`);
    const id = q('SELECT last_insert_rowid();');
    console.log(`   ✅ Created account (SQLite): ${name}`);
    return parseInt(id, 10);
  }

  const result = await pool.query(
    'SELECT id FROM accounts WHERE tenant_id = $1 AND name = $2',
    [tenantId, name]
  );
  if (result.rows.length > 0) return result.rows[0].id;

  const insertResult = await pool.query(
    `INSERT INTO accounts (tenant_id, name, type, balance)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [tenantId, name, type, '0.00']
  );
  console.log(`   ✅ Created account: ${name}`);
  return insertResult.rows[0].id;
}

async function ingestLeaseCharges() {
  console.log('\n💰 INGESTING LEASE CHARGES...');
  console.log('-'.repeat(80));

  const charges = pickData(finalArchive, 'lease_charges', 'lease-charges');
  console.log(`Found ${charges.length} charges to process`);

  let imported = 0;
  let skipped = 0;

  // Map DoorLoop property IDs to tenant names
  const propertyMap = {
    '66d7aad23cf0357c2a3c9430': 'City Studio',
    '675925395b874464a179e308': 'Cozy Castle',
  };

  for (const charge of charges) {
    try {
      // Find property from lease data
      const leases = pickData(finalArchive, 'leases', 'leases');
      const lease = leases.find(l => l.id === (charge.lease || charge.leaseId));
      const propertyId = lease?.property;
      const propertyName = propertyMap[propertyId] || 'Unknown Property';

      // Find or create tenant (noop in standalone)
      const tenantId = await findOrCreateTenant(propertyName, 'property');

      // Find or create account
      const accountId = await findOrCreateAccount(
        tenantId,
        `${propertyName} Rent Account`,
        'asset'
      );

      // Create transaction if not already imported (system)
      const transactionDate = charge.date || charge.createdAt;
      const description = `[CHARGE] ${charge.lines?.[0]?.memo || 'Rent charge'}`;
      const amount = (charge.totalAmount || 0) * -1; // charges as negative

      if (backend === 'standalone') {
        const run = (s) => execSync(`sqlite3 -batch ${sqlite.dbPath} <<'SQL'\n${s}\nSQL`);
        const q = (s) => execSync(`sqlite3 -batch -noheader -csv ${sqlite.dbPath} ${JSON.stringify(s)}`, { encoding: 'utf8' }).trim();
        const esc = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
        const exists = q(`SELECT COUNT(1) FROM transactions WHERE account_id=${accountId} AND amount=${amount} AND occurred_at=${esc(transactionDate)} AND description=${esc(description)};`);
        if (parseInt(exists || '0', 10) > 0) {
          skipped++;
        } else {
          run(`INSERT INTO transactions (account_id, amount, description, occurred_at)
                VALUES (${accountId}, ${amount}, ${esc(description)}, ${esc(transactionDate)});`);
        }
      } else {
        // Check duplicate by amount+date+account as external_id is unavailable in schema
        const dup = await pool.query(
          `SELECT id FROM transactions
             WHERE tenant_id = $1 AND account_id = $2 AND amount = $3 AND occurred_at = $4 AND description = $5`,
          [tenantId, accountId, amount.toFixed(2), transactionDate, description]
        );
        if (dup.rows.length > 0) {
          skipped++;
          continue;
        }
        await pool.query(
          `INSERT INTO transactions (tenant_id, account_id, amount, description, occurred_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [tenantId, accountId, amount.toFixed(2), description, transactionDate]
        );
      }

      imported++;
    } catch (error) {
      console.error(`   ❌ Error processing charge ${charge.id}:`, error.message);
    }
  }

  console.log(`\n✅ Imported: ${imported} charges`);
  console.log(`⏭️  Skipped: ${skipped} (already exist)`);
}

async function ingestLeasePayments() {
  console.log('\n💵 INGESTING LEASE PAYMENTS...');
  console.log('-'.repeat(80));

  const payments = pickData(finalArchive, 'lease_payments', 'lease-payments');
  console.log(`Found ${payments.length} payments to process`);

  let imported = 0;
  let skipped = 0;

  const propertyMap = {
    '66d7aad23cf0357c2a3c9430': 'City Studio',
    '675925395b874464a179e308': 'Cozy Castle',
  };

  for (const payment of payments) {
    try {
      // Find property from lease data
      const leases = pickData(finalArchive, 'leases', 'leases');
      const lease = leases.find(l => l.id === (payment.lease || payment.leaseId));
      const propertyId = lease?.property;
      const propertyName = propertyMap[propertyId] || 'Unknown Property';

      // Find or create tenant (noop in standalone)
      const tenantId = await findOrCreateTenant(propertyName, 'property');

      // Find or create account
      const accountId = await findOrCreateAccount(
        tenantId,
        `${propertyName} Rent Account`,
        'asset'
      );

      // Create transaction
      const transactionDate = payment.date || payment.createdAt;
      const description = `[PAYMENT] ${payment.memo || `Payment - ${payment.paymentMethod || 'EPAY'}`}`;
      // Prefer amountReceived, fallback to amount or amountAppliedToCharges
      const amount = (payment.amountReceived ?? payment.amount ?? payment.amountAppliedToCharges ?? 0);

      if (amount > 0) {
        if (backend === 'standalone') {
          const run = (s) => execSync(`sqlite3 -batch ${sqlite.dbPath} <<'SQL'\n${s}\nSQL`);
          const q = (s) => execSync(`sqlite3 -batch -noheader -csv ${sqlite.dbPath} ${JSON.stringify(s)}`, { encoding: 'utf8' }).trim();
          const esc = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
          const exists = q(`SELECT COUNT(1) FROM transactions WHERE account_id=${accountId} AND amount=${amount} AND occurred_at=${esc(transactionDate)} AND description=${esc(description)};`);
          if (parseInt(exists || '0', 10) > 0) {
            skipped++;
          } else {
            run(`INSERT INTO transactions (account_id, amount, description, occurred_at)
                  VALUES (${accountId}, ${amount}, ${esc(description)}, ${esc(transactionDate)});`);
          }
        } else {
          const dup = await pool.query(
            `SELECT id FROM transactions
               WHERE tenant_id = $1 AND account_id = $2 AND amount = $3 AND occurred_at = $4 AND description = $5`,
            [tenantId, accountId, amount.toFixed(2), transactionDate, description]
          );
          if (dup.rows.length > 0) {
            skipped++;
            continue;
          }
          await pool.query(
            `INSERT INTO transactions (tenant_id, account_id, amount, description, occurred_at)
             VALUES ($1, $2, $3, $4, $5)`,
            [tenantId, accountId, amount.toFixed(2), description, transactionDate]
          );
        }

        imported++;
      }
    } catch (error) {
      console.error(`   ❌ Error processing payment ${payment.id}:`, error.message);
    }
  }

  console.log(`\n✅ Imported: ${imported} payments`);
  console.log(`⏭️  Skipped: ${skipped} (already exist)`);
}

// Expenses import skipped — not present in current DB schema

// Properties import skipped — table not defined in system schema

// Integrations record skipped — table not defined in system schema

async function generateSummary() {
  console.log('\n📊 DATABASE SUMMARY...');
  console.log('='.repeat(80));

  if (backend === 'standalone') {
    const q = (s) => execSync(`sqlite3 -batch -noheader -csv ${sqlite.dbPath} ${JSON.stringify(s)}`, { encoding: 'utf8' }).trim();
    const accounts = q('SELECT COUNT(*) FROM accounts;');
    const transactions = q('SELECT COUNT(*) FROM transactions;');
    console.log(`Accounts: ${accounts}`);
    console.log(`Transactions: ${transactions}`);
    console.log('\nRecent Transactions:');
    const recentCsv = q(`SELECT occurred_at, amount, description FROM transactions ORDER BY occurred_at DESC LIMIT 10;`);
    if (recentCsv) {
      recentCsv.split('\n').forEach((line) => {
        const [occurred_at, amount, description] = line.split(',');
        const date = occurred_at ? new Date(occurred_at).toLocaleDateString() : 'N/A';
        console.log(`  ${date} | $${amount} | ${String(description || '').slice(0, 40)}`);
      });
    }
  } else {
    const accounts = await pool.query('SELECT COUNT(*) FROM accounts');
    const transactions = await pool.query('SELECT COUNT(*) FROM transactions');
    console.log(`Accounts: ${accounts.rows[0].count}`);
    console.log(`Transactions: ${transactions.rows[0].count}`);
    console.log('\nRecent Transactions:');
    const recent = await pool.query(
      `SELECT
         t.occurred_at as transaction_date,
         t.amount,
         t.description
       FROM transactions t
       ORDER BY t.occurred_at DESC
       LIMIT 10`
    );
    recent.rows.forEach((row) => {
      const date = row.transaction_date ? new Date(row.transaction_date).toLocaleDateString() : 'N/A';
      console.log(`  ${date} | $${row.amount} | ${String(row.description).slice(0, 40)}`);
    });
  }
}

async function main() {
  try {
    await ingestLeaseCharges();
    await ingestLeasePayments();
    await generateSummary();

    console.log('\n' + '='.repeat(80));
    console.log('✅ DOORLOOP DATA INGESTION COMPLETE');
    console.log('='.repeat(80));
  } catch (error) {
    console.error('\n❌ INGESTION FAILED:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (pool) await pool.end();
    // sqlite CLI has no handle to close
  }
}

main();
