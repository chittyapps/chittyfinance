#!/usr/bin/env tsx
/**
 * Ingest All Historical Financial Data for 2024-2025
 *
 * This script syncs ALL financial data from:
 * - DoorLoop (properties, rent payments, expenses)
 * - Stripe Connect (connected accounts, charges, payouts)
 * - Wave Accounting (invoices, expenses)
 * - ChittyRental (if applicable)
 *
 * Usage:
 *   TENANT_ID=your_tenant_id tsx scripts/ingest-historical-data-2024-2025.ts
 */

import { DoorLoopClient } from '../server/lib/doorloop-integration';
import { StripeConnectClient } from '../server/lib/stripe-connect';
import { WaveBookkeepingClient } from '../server/lib/wave-bookkeeping';
import { storage } from '../server/storage';

const TENANT_ID = process.env.TENANT_ID || 'aribia-mgmt'; // Default to ARIBIA management company
const START_DATE_2024 = new Date('2024-01-01');
const END_DATE_2025 = new Date('2025-12-31');

interface SyncResults {
  doorloop: { properties: number; rentPayments: number; expenses: number; errors: string[] };
  stripe: { accounts: number; transactions: number; errors: string[] };
  wave: { invoices: number; expenses: number; errors: string[] };
  total: {
    transactions: number;
    errors: number;
  };
}

async function ingestHistoricalData(): Promise<SyncResults> {
  console.log('🚀 Starting historical data ingestion for 2024-2025\n');
  console.log(`📊 Tenant ID: ${TENANT_ID}`);
  console.log(`📅 Date Range: ${START_DATE_2024.toISOString().split('T')[0]} to ${END_DATE_2025.toISOString().split('T')[0]}\n`);

  const results: SyncResults = {
    doorloop: { properties: 0, rentPayments: 0, expenses: 0, errors: [] },
    stripe: { accounts: 0, transactions: 0, errors: [] },
    wave: { invoices: 0, expenses: 0, errors: [] },
    total: { transactions: 0, errors: 0 },
  };

  // ============================================================================
  // 1. DOORLOOP INGESTION
  // ============================================================================
  console.log('📦 Step 1: DoorLoop Property Management Data\n');
  console.log('─'.repeat(80));

  try {
    const doorloopApiKey = process.env.DOORLOOP_API_KEY;

    if (!doorloopApiKey) {
      console.log('⚠️  DOORLOOP_API_KEY not set - skipping DoorLoop ingestion\n');
    } else {
      const doorloopClient = new DoorLoopClient(doorloopApiKey);

      // Test connection first
      console.log('🔍 Testing DoorLoop connection...');
      const connectionTest = await doorloopClient.testConnection();

      if (!connectionTest.connected) {
        throw new Error(`DoorLoop connection failed: ${connectionTest.error}`);
      }

      console.log(`✅ Connected to DoorLoop`);
      console.log(`   Properties available: ${connectionTest.properties}`);
      console.log(`   Leases available: ${connectionTest.leases}`);
      console.log(`   Payments available: ${connectionTest.paymentsAvailable ? 'Yes' : 'No (Premium required)'}\n`);

      // Fetch all properties
      console.log('📋 Fetching all properties...');
      const properties = await doorloopClient.getProperties();
      results.doorloop.properties = properties.length;
      console.log(`   Found ${properties.length} properties\n`);

      // Sync each property
      for (const property of properties) {
        console.log(`🏠 Syncing: ${property.name}`);
        console.log(`   Address: ${property.address.full || property.address.line1}`);

        try {
          const syncResult = await doorloopClient.syncProperty(
            property.id,
            TENANT_ID,
            START_DATE_2024.toISOString()
          );

          results.doorloop.rentPayments += syncResult.rentPayments;
          results.doorloop.expenses += syncResult.expenses;
          results.doorloop.errors.push(...syncResult.errors);

          console.log(`   ✅ Rent payments: ${syncResult.rentPayments}`);
          console.log(`   ✅ Expenses: ${syncResult.expenses}`);
          if (syncResult.errors.length > 0) {
            console.log(`   ⚠️  Errors: ${syncResult.errors.length}`);
          }
          console.log('');
        } catch (error) {
          const errorMsg = `Failed to sync property ${property.name}: ${error}`;
          results.doorloop.errors.push(errorMsg);
          console.error(`   ❌ ${errorMsg}\n`);
        }
      }

      console.log('✅ DoorLoop ingestion complete');
      console.log(`   Total rent payments: ${results.doorloop.rentPayments}`);
      console.log(`   Total expenses: ${results.doorloop.expenses}`);
      console.log(`   Total errors: ${results.doorloop.errors.length}\n`);
    }
  } catch (error) {
    console.error(`❌ DoorLoop ingestion failed: ${error}\n`);
    results.doorloop.errors.push(`DoorLoop ingestion failed: ${error}`);
  }

  console.log('─'.repeat(80));
  console.log('');

  // ============================================================================
  // 2. STRIPE CONNECT INGESTION
  // ============================================================================
  console.log('💳 Step 2: Stripe Connect Data\n');
  console.log('─'.repeat(80));

  try {
    const stripeApiKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeApiKey) {
      console.log('⚠️  STRIPE_SECRET_KEY not set - skipping Stripe ingestion\n');
    } else {
      const stripeClient = new StripeConnectClient(stripeApiKey);

      // List all connected accounts
      console.log('🔍 Fetching connected accounts...');
      const connectedAccounts = await stripeClient.listConnectedAccounts();
      results.stripe.accounts = connectedAccounts.length;
      console.log(`   Found ${connectedAccounts.length} connected accounts\n`);

      // Sync each connected account
      for (const account of connectedAccounts) {
        console.log(`🏦 Syncing account: ${account.id}`);
        console.log(`   Type: ${account.type}`);
        console.log(`   Email: ${account.email || 'N/A'}`);
        console.log(`   Business: ${account.businessProfile?.name || 'N/A'}`);
        console.log(`   Charges enabled: ${account.chargesEnabled ? 'Yes' : 'No'}`);
        console.log(`   Payouts enabled: ${account.payoutsEnabled ? 'Yes' : 'No'}`);

        try {
          const syncResult = await stripeClient.syncAccountTransactions(
            account.id,
            TENANT_ID,
            START_DATE_2024
          );

          results.stripe.transactions += syncResult.synced;
          results.stripe.errors.push(...syncResult.errors);

          console.log(`   ✅ Transactions synced: ${syncResult.synced}`);
          if (syncResult.errors.length > 0) {
            console.log(`   ⚠️  Errors: ${syncResult.errors.length}`);
          }
          console.log('');
        } catch (error) {
          const errorMsg = `Failed to sync Stripe account ${account.id}: ${error}`;
          results.stripe.errors.push(errorMsg);
          console.error(`   ❌ ${errorMsg}\n`);
        }
      }

      console.log('✅ Stripe Connect ingestion complete');
      console.log(`   Total transactions: ${results.stripe.transactions}`);
      console.log(`   Total errors: ${results.stripe.errors.length}\n`);
    }
  } catch (error) {
    console.error(`❌ Stripe Connect ingestion failed: ${error}\n`);
    results.stripe.errors.push(`Stripe ingestion failed: ${error}`);
  }

  console.log('─'.repeat(80));
  console.log('');

  // ============================================================================
  // 3. WAVE ACCOUNTING INGESTION
  // ============================================================================
  console.log('📊 Step 3: Wave Accounting Data\n');
  console.log('─'.repeat(80));

  try {
    const waveClientId = process.env.WAVE_CLIENT_ID;
    const waveClientSecret = process.env.WAVE_CLIENT_SECRET;

    if (!waveClientId || !waveClientSecret) {
      console.log('⚠️  Wave credentials not set - skipping Wave ingestion\n');
    } else {
      // Get Wave integration from storage
      const integrations = await storage.listIntegrationsByService('wavapps');
      const waveIntegration = integrations.find(i => i.tenantId === TENANT_ID);

      if (!waveIntegration) {
        console.log('⚠️  No Wave integration found for tenant - skipping\n');
      } else {
        console.log('🔍 Syncing Wave Accounting data...');

        const waveClient = new WaveBookkeepingClient({
          clientId: waveClientId,
          clientSecret: waveClientSecret,
          redirectUri: process.env.WAVE_REDIRECT_URI || '',
        });

        const credentials = waveIntegration.credentials as any;
        waveClient.setAccessToken(credentials.access_token);

        try {
          const syncResult = await waveClient.syncToChittyFinance(credentials.business_id, TENANT_ID);

          results.wave.invoices = syncResult.invoices;
          results.wave.expenses = syncResult.expenses;

          console.log(`   ✅ Invoices synced: ${syncResult.invoices}`);
          console.log(`   ✅ Expenses synced: ${syncResult.expenses}\n`);
        } catch (error) {
          const errorMsg = `Failed to sync Wave data: ${error}`;
          results.wave.errors.push(errorMsg);
          console.error(`   ❌ ${errorMsg}\n`);
        }

        console.log('✅ Wave Accounting ingestion complete\n');
      }
    }
  } catch (error) {
    console.error(`❌ Wave ingestion failed: ${error}\n`);
    results.wave.errors.push(`Wave ingestion failed: ${error}`);
  }

  console.log('─'.repeat(80));
  console.log('');

  // ============================================================================
  // FINAL SUMMARY
  // ============================================================================
  console.log('📈 HISTORICAL DATA INGESTION SUMMARY\n');
  console.log('═'.repeat(80));
  console.log('');

  console.log('🏠 DoorLoop:');
  console.log(`   Properties synced: ${results.doorloop.properties}`);
  console.log(`   Rent payments: ${results.doorloop.rentPayments}`);
  console.log(`   Expenses: ${results.doorloop.expenses}`);
  console.log(`   Subtotal: ${results.doorloop.rentPayments + results.doorloop.expenses} transactions`);
  console.log('');

  console.log('💳 Stripe Connect:');
  console.log(`   Accounts synced: ${results.stripe.accounts}`);
  console.log(`   Transactions: ${results.stripe.transactions}`);
  console.log('');

  console.log('📊 Wave Accounting:');
  console.log(`   Invoices: ${results.wave.invoices}`);
  console.log(`   Expenses: ${results.wave.expenses}`);
  console.log(`   Subtotal: ${results.wave.invoices + results.wave.expenses} transactions`);
  console.log('');

  // Calculate totals
  results.total.transactions =
    results.doorloop.rentPayments +
    results.doorloop.expenses +
    results.stripe.transactions +
    results.wave.invoices +
    results.wave.expenses;

  results.total.errors =
    results.doorloop.errors.length +
    results.stripe.errors.length +
    results.wave.errors.length;

  console.log('═'.repeat(80));
  console.log('🎯 TOTAL RESULTS:');
  console.log(`   Total transactions ingested: ${results.total.transactions}`);
  console.log(`   Total errors: ${results.total.errors}`);
  console.log('═'.repeat(80));
  console.log('');

  if (results.total.errors > 0) {
    console.log('⚠️  ERRORS ENCOUNTERED:\n');
    [...results.doorloop.errors, ...results.stripe.errors, ...results.wave.errors].forEach((error, idx) => {
      console.log(`${idx + 1}. ${error}`);
    });
    console.log('');
  }

  console.log('✅ Historical data ingestion complete!\n');

  return results;
}

// Run the ingestion
ingestHistoricalData()
  .then(results => {
    if (results.total.errors > 0) {
      process.exit(1); // Exit with error code if there were issues
    }
  })
  .catch(error => {
    console.error('\n❌ Fatal error during ingestion:', error);
    process.exit(1);
  });
