#!/usr/bin/env node

/**
 * System Operations Database Duplicate Checker
 * Queries Neon database to check for duplicates and inconsistencies
 */

import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '../.env') });

async function checkSystemOperationsDuplicates() {
  console.log('🔍 Checking Neon database for system_operations duplicates and inconsistencies...\n');
  
  const sql = neon(process.env.NEON_DATABASE_URL);
  
  if (!process.env.NEON_DATABASE_URL) {
    console.error('❌ NEON_DATABASE_URL environment variable not set');
    console.log('Please ensure your .env file contains the NEON_DATABASE_URL');
    return;
  }
  
  try {
    // Test connection
    await sql`SELECT 1 as test`;
    console.log('✅ Successfully connected to Neon database\n');
    
    // Check if system_operations table exists
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'system_operations'
      );
    `;
    
    if (!tableExists[0].exists) {
      console.log('❌ system_operations table does not exist');
      console.log('Creating table...\n');
      
      // Create the table
      await sql`
        CREATE TABLE IF NOT EXISTS system_operations (
          id SERIAL PRIMARY KEY,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          operation TEXT NOT NULL,
          system TEXT NOT NULL,
          status TEXT NOT NULL,
          details TEXT,
          user_email TEXT,
          environment TEXT DEFAULT 'development',
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `;
      
      // Create indexes
      await sql`CREATE INDEX IF NOT EXISTS idx_system_operations_timestamp ON system_operations(timestamp);`;
      await sql`CREATE INDEX IF NOT EXISTS idx_system_operations_operation ON system_operations(operation);`;
      await sql`CREATE INDEX IF NOT EXISTS idx_system_operations_system ON system_operations(system);`;
      await sql`CREATE INDEX IF NOT EXISTS idx_system_operations_status ON system_operations(status);`;
      
      console.log('✅ system_operations table created with indexes\n');
    } else {
      console.log('✅ system_operations table exists\n');
    }
    
    // Get total entries
    const totalCount = await sql`SELECT COUNT(*) as count FROM system_operations`;
    console.log(`📊 Total entries in system_operations: ${totalCount[0].count}\n`);
    
    if (totalCount[0].count === 0) {
      console.log('ℹ️  No entries found in system_operations table');
      console.log('This could mean:');
      console.log('  - Table is new and no operations have been logged yet');
      console.log('  - Operations are being logged to files only');
      console.log('  - Database logging is not yet configured');
      return;
    }
    
    // Check for exact duplicates (same operation + timestamp + system)
    console.log('🔍 Checking for exact duplicates...');
    const exactDuplicates = await sql`
      SELECT 
        operation, 
        timestamp, 
        system, 
        COUNT(*) as duplicate_count,
        ARRAY_AGG(id) as duplicate_ids
      FROM system_operations
      GROUP BY operation, timestamp, system
      HAVING COUNT(*) > 1
      ORDER BY duplicate_count DESC
    `;
    
    if (exactDuplicates.length > 0) {
      console.log(`❌ Found ${exactDuplicates.length} sets of exact duplicates:`);
      exactDuplicates.forEach(dup => {
        console.log(`   - ${dup.operation} (${dup.system}) at ${dup.timestamp}: ${dup.duplicate_count} copies`);
        console.log(`     IDs: ${dup.duplicate_ids.join(', ')}`);
      });
      console.log('');
    } else {
      console.log('✅ No exact duplicates found\n');
    }
    
    // Check for near duplicates (same operation + system, different timestamps)
    console.log('🔍 Checking for near duplicates (same operation/system)...');
    const nearDuplicates = await sql`
      SELECT 
        operation, 
        system, 
        COUNT(*) as count,
        MIN(timestamp) as first_occurrence,
        MAX(timestamp) as last_occurrence,
        ARRAY_AGG(DISTINCT status) as statuses
      FROM system_operations
      GROUP BY operation, system
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `;
    
    if (nearDuplicates.length > 0) {
      console.log(`⚠️  Found ${nearDuplicates.length} operations with multiple entries:`);
      nearDuplicates.forEach(dup => {
        const timeDiff = new Date(dup.last_occurrence) - new Date(dup.first_occurrence);
        const hours = Math.round(timeDiff / (1000 * 60 * 60));
        console.log(`   - ${dup.operation} (${dup.system}): ${dup.count} entries over ${hours} hours`);
        console.log(`     Statuses: ${dup.statuses.join(', ')}`);
        console.log(`     First: ${dup.first_occurrence}, Last: ${dup.last_occurrence}`);
      });
      console.log('');
    } else {
      console.log('✅ No near duplicates found\n');
    }
    
    // Check for operations by status
    console.log('📊 Operations by status:');
    const statusBreakdown = await sql`
      SELECT status, COUNT(*) as count
      FROM system_operations
      GROUP BY status
      ORDER BY count DESC
    `;
    statusBreakdown.forEach(row => {
      console.log(`   - ${row.status}: ${row.count}`);
    });
    console.log('');
    
    // Check for operations by system
    console.log('📊 Operations by system:');
    const systemBreakdown = await sql`
      SELECT system, COUNT(*) as count
      FROM system_operations
      GROUP BY system
      ORDER BY count DESC
    `;
    systemBreakdown.forEach(row => {
      console.log(`   - ${row.system}: ${row.count}`);
    });
    console.log('');
    
    // Check for operations by type
    console.log('📊 Operations by type:');
    const operationBreakdown = await sql`
      SELECT operation, COUNT(*) as count
      FROM system_operations
      GROUP BY operation
      ORDER BY count DESC
    `;
    operationBreakdown.forEach(row => {
      console.log(`   - ${row.operation}: ${row.count}`);
    });
    console.log('');
    
    // Check for recent operations
    console.log('📅 Recent operations (last 10):');
    const recentOps = await sql`
      SELECT 
        id, 
        timestamp, 
        operation, 
        system, 
        status,
        CASE 
          WHEN LENGTH(details) > 100 THEN LEFT(details, 100) || '...'
          ELSE details
        END as short_details
      FROM system_operations
      ORDER BY timestamp DESC
      LIMIT 10
    `;
    recentOps.forEach(op => {
      console.log(`   - [${op.id}] ${op.timestamp}: ${op.operation} (${op.system}) - ${op.status}`);
      if (op.short_details) {
        console.log(`     ${op.short_details}`);
      }
    });
    console.log('');
    
    // Check for orphaned or inconsistent data
    console.log('🔍 Checking for data inconsistencies...');
    
    const inconsistencies = [];
    
    // Check for operations without user_email
    const noUserEmail = await sql`
      SELECT COUNT(*) as count FROM system_operations WHERE user_email IS NULL
    `;
    if (noUserEmail[0].count > 0) {
      inconsistencies.push(`${noUserEmail[0].count} operations without user_email`);
    }
    
    // Check for operations without environment
    const noEnvironment = await sql`
      SELECT COUNT(*) as count FROM system_operations WHERE environment IS NULL
    `;
    if (noEnvironment[0].count > 0) {
      inconsistencies.push(`${noEnvironment[0].count} operations without environment`);
    }
    
    // Check for invalid JSON in metadata
    const invalidMetadata = await sql`
      SELECT COUNT(*) as count 
      FROM system_operations 
      WHERE metadata IS NULL OR metadata = ''
    `;
    if (invalidMetadata[0].count > 0) {
      inconsistencies.push(`${invalidMetadata[0].count} operations with empty/null metadata`);
    }
    
    if (inconsistencies.length > 0) {
      console.log('⚠️  Data inconsistencies found:');
      inconsistencies.forEach(issue => {
        console.log(`   - ${issue}`);
      });
      console.log('');
    } else {
      console.log('✅ No data inconsistencies found\n');
    }
    
    // Generate summary and recommendations
    console.log('📋 SUMMARY AND RECOMMENDATIONS:\n');
    
    if (exactDuplicates.length > 0) {
      console.log('🔧 CLEANUP NEEDED: Exact duplicates detected');
      console.log('   Recommendation: Remove duplicate entries, keeping the earliest one');
      console.log('   SQL to remove duplicates:');
      console.log('   DELETE FROM system_operations WHERE id NOT IN (');
      console.log('     SELECT MIN(id) FROM system_operations');
      console.log('     GROUP BY operation, timestamp, system');
      console.log('   );\n');
    }
    
    if (nearDuplicates.length > 0) {
      console.log('⚠️  REVIEW NEEDED: Multiple entries for same operations');
      console.log('   These might be legitimate (retries, updates) or duplicate logging');
      console.log('   Review each case to determine if consolidation is needed\n');
    }
    
    if (inconsistencies.length > 0) {
      console.log('🔧 DATA QUALITY: Inconsistencies need attention');
      console.log('   Consider adding validation and default values\n');
    }
    
    console.log('✅ Database health check complete!');
    
  } catch (error) {
    console.error('❌ Error checking database:', error);
    console.error('Error details:', error.message);
    
    if (error.message.includes('connection')) {
      console.log('\n💡 Troubleshooting:');
      console.log('   - Check NEON_DATABASE_URL is correct');
      console.log('   - Verify database is accessible');
      console.log('   - Ensure SSL is configured properly');
    }
  }
}

// Run the check
checkSystemOperationsDuplicates().catch(console.error);