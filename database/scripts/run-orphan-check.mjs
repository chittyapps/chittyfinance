#!/usr/bin/env node
/**
 * Run orphan check SQL query against the database
 * This should be run BEFORE applying schema changes with onDelete constraints
 * 
 * Prerequisites:
 * - npm install (to get dependencies)
 * - .env file with DATABASE_URL set
 * 
 * Usage:
 *   node database/scripts/run-orphan-check.mjs
 * 
 * Or manually run the SQL in check-orphaned-transactions.sql against your database
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in environment variables');
  console.error('Please set DATABASE_URL in your environment or .env file');
  console.error('\nAlternatively, run the SQL manually:');
  console.error('  psql $DATABASE_URL -f database/scripts/check-orphaned-transactions.sql');
  process.exit(1);
}

async function runOrphanCheck() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    console.log('🔍 Checking for orphaned transaction references...\n');
    
    const sqlPath = join(__dirname, 'check-orphaned-transactions.sql');
    const sql = readFileSync(sqlPath, 'utf-8');
    
    const result = await pool.query(sql);
    
    if (result.rows.length === 0) {
      console.log('✅ No orphaned references found!');
      console.log('   All transaction.propertyId and transaction.unitId references are valid.');
      console.log('   Safe to apply onDelete constraints.\n');
    } else {
      console.log('⚠️  Orphaned references found:\n');
      for (const row of result.rows) {
        console.log(`   ${row.issue_type}: ${row.count} transactions`);
        console.log(`   Transaction IDs: ${row.transaction_ids.slice(0, 5).join(', ')}${row.transaction_ids.length > 5 ? '...' : ''}\n`);
      }
      console.log('❌ Fix these orphaned references before applying onDelete constraints.\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error running orphan check:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runOrphanCheck();

