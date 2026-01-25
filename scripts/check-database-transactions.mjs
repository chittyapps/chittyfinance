#!/usr/bin/env node
/**
 * Check ChittyFinance database for City Studio / Alexis transactions
 */

import { Pool } from '@neondatabase/serverless';
import ws from 'ws';
import { config } from 'dotenv';

config();

// Configure WebSocket for Neon
globalThis.WebSocket = ws;

async function checkDatabaseTransactions() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log('🔍 CHECKING CHITTYFINANCE DATABASE');
  console.log('='.repeat(80));

  try {
    // Check tenants
    console.log('\n📋 TENANTS:');
    const tenants = await pool.query(`
      SELECT id, name, type, slug
      FROM tenants
      ORDER BY name
    `);
    console.log(`   Found ${tenants.rows.length} tenants`);
    tenants.rows.forEach(t => {
      console.log(`   • ${t.name} (${t.type}) - ${t.id}`);
    });

    // Find City Studio tenant
    const cityStudio = tenants.rows.find(t =>
      t.name.toLowerCase().includes('city studio') ||
      t.slug === 'city-studio'
    );

    if (cityStudio) {
      console.log(`\n🏢 CITY STUDIO TENANT: ${cityStudio.id}`);

      // Get accounts for City Studio
      console.log('\n💳 CITY STUDIO ACCOUNTS:');
      const accounts = await pool.query(`
        SELECT id, name, type, institution, balance
        FROM accounts
        WHERE tenant_id = $1
      `, [cityStudio.id]);

      console.log(`   Found ${accounts.rows.length} accounts`);
      accounts.rows.forEach(acc => {
        console.log(`   • ${acc.name} (${acc.type}) - ${acc.institution}`);
        console.log(`     Balance: $${acc.balance || '0.00'}`);
      });

      // Get transactions for City Studio
      console.log('\n💰 CITY STUDIO TRANSACTIONS:');
      const transactions = await pool.query(`
        SELECT
          t.id,
          t.amount,
          t.direction,
          t.description,
          t.category,
          t.source,
          t.external_id,
          t.transaction_date,
          t.created_at,
          a.name as account_name
        FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        WHERE t.tenant_id = $1
        ORDER BY t.transaction_date DESC, t.created_at DESC
        LIMIT 50
      `, [cityStudio.id]);

      console.log(`   Found ${transactions.rows.length} transactions\n`);

      if (transactions.rows.length > 0) {
        transactions.rows.forEach((tx, idx) => {
          const date = new Date(tx.transaction_date || tx.created_at);
          console.log(`${idx + 1}. ${date.toLocaleDateString()}: $${tx.amount} (${tx.direction})`);
          console.log(`   Description: ${tx.description || 'N/A'}`);
          console.log(`   Category: ${tx.category || 'N/A'}`);
          console.log(`   Source: ${tx.source || 'manual'}`);
          console.log(`   Account: ${tx.account_name}`);
          if (tx.external_id) {
            console.log(`   External ID: ${tx.external_id}`);
          }
          console.log('');
        });

        // Check for December 2025 transactions
        console.log('\n🔍 DECEMBER 2025 TRANSACTIONS:');
        const dec2025 = transactions.rows.filter(tx => {
          const date = new Date(tx.transaction_date || tx.created_at);
          return date.getMonth() === 11 && date.getFullYear() === 2025; // December = month 11
        });

        if (dec2025.length === 0) {
          console.log('   ❌ No transactions found in December 2025');
        } else {
          console.log(`   ✅ Found ${dec2025.length} transactions in December 2025\n`);
          dec2025.forEach(tx => {
            const date = new Date(tx.transaction_date || tx.created_at);
            console.log(`   • ${date.toLocaleDateString()}: $${tx.amount} - ${tx.description}`);
          });
        }
      } else {
        console.log('   ⚠️  No transactions found for City Studio');
      }

      // Get properties for City Studio
      console.log('\n🏠 CITY STUDIO PROPERTIES:');
      const properties = await pool.query(`
        SELECT id, name, address, property_type
        FROM properties
        WHERE tenant_id = $1
      `, [cityStudio.id]);

      console.log(`   Found ${properties.rows.length} properties`);
      properties.rows.forEach(prop => {
        console.log(`   • ${prop.name}`);
        console.log(`     Address: ${prop.address || 'N/A'}`);
        console.log(`     Type: ${prop.property_type || 'N/A'}`);
      });

    } else {
      console.log('\n⚠️  City Studio tenant not found in database');
    }

    // Check integrations
    console.log('\n\n🔌 INTEGRATIONS:');
    const integrations = await pool.query(`
      SELECT id, source, status, metadata, last_synced_at
      FROM integrations
      ORDER BY source
    `);

    console.log(`   Found ${integrations.rows.length} integrations\n`);
    integrations.rows.forEach(int => {
      console.log(`   • ${int.source.toUpperCase()}`);
      console.log(`     Status: ${int.status}`);
      if (int.last_synced_at) {
        console.log(`     Last Synced: ${new Date(int.last_synced_at).toLocaleString()}`);
      }
      console.log('');
    });

  } catch (error) {
    console.error('❌ Database error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

checkDatabaseTransactions().catch(console.error);
