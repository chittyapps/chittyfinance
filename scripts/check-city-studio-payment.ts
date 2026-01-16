#!/usr/bin/env tsx
/**
 * Check City Studio Payment Status from DoorLoop
 *
 * Usage:
 *   DOORLOOP_API_KEY=your_key tsx scripts/check-city-studio-payment.ts
 */

import { dlFetch } from '../server/integrations/doorloopClient';

const CITY_STUDIO_ADDRESS = '550 W Surf';

async function checkCityStudioPayment() {
  const apiKey = process.env.DOORLOOP_API_KEY;

  if (!apiKey) {
    console.error('❌ Error: DOORLOOP_API_KEY environment variable not set');
    console.log('\nUsage:');
    console.log('  DOORLOOP_API_KEY=your_key tsx scripts/check-city-studio-payment.ts');
    process.exit(1);
  }

  console.log('🔍 Fetching DoorLoop data...\n');

  try {
    // 1. Fetch all properties
    console.log('📋 Step 1: Fetching properties...');
    const propertiesResponse = await dlFetch('/properties?limit=200&offset=0', apiKey);
    const properties = propertiesResponse.data || [];

    console.log(`   Found ${properties.length} properties\n`);

    // 2. Find City Studio property
    const cityStudio = properties.find((p: any) =>
      p.address?.line1?.includes(CITY_STUDIO_ADDRESS) ||
      p.address?.full?.includes(CITY_STUDIO_ADDRESS) ||
      p.name?.includes('City Studio')
    );

    if (!cityStudio) {
      console.log(`❌ City Studio property not found in DoorLoop`);
      console.log(`\nSearched for addresses containing: "${CITY_STUDIO_ADDRESS}"`);
      console.log(`\nAvailable properties:`);
      properties.forEach((p: any) => {
        console.log(`  - ${p.name || 'Unnamed'}: ${p.address?.full || p.address?.line1 || 'No address'}`);
      });
      return;
    }

    console.log('✅ Found City Studio property:');
    console.log(`   ID: ${cityStudio.id}`);
    console.log(`   Name: ${cityStudio.name}`);
    console.log(`   Address: ${cityStudio.address?.full || cityStudio.address?.line1}`);
    console.log('');

    // 3. Fetch leases for City Studio
    console.log('📋 Step 2: Fetching leases...');
    const leasesResponse = await dlFetch('/leases?limit=200&offset=0', apiKey);
    const allLeases = leasesResponse.data || [];

    const cityStudioLeases = allLeases.filter((l: any) =>
      l.property?.id === cityStudio.id ||
      l.propertyId === cityStudio.id
    );

    console.log(`   Found ${cityStudioLeases.length} lease(s) for City Studio\n`);

    if (cityStudioLeases.length === 0) {
      console.log('⚠️  No leases found for City Studio');
      return;
    }

    // Display lease information
    cityStudioLeases.forEach((lease: any, index: number) => {
      console.log(`   Lease ${index + 1}:`);
      console.log(`     ID: ${lease.id}`);
      console.log(`     Tenant: ${lease.tenant?.name || 'Unknown'}`);
      console.log(`     Status: ${lease.status}`);
      console.log(`     Start Date: ${lease.startDate || 'N/A'}`);
      console.log(`     End Date: ${lease.endDate || 'N/A'}`);
      console.log(`     Monthly Rent: $${lease.monthlyRent || 'N/A'}`);
      console.log('');
    });

    // 4. Fetch payments
    console.log('📋 Step 3: Fetching payments...');
    const paymentsResponse = await dlFetch('/payments?limit=200&offset=0', apiKey);

    // Check if HTML was returned (non-premium account)
    if (paymentsResponse.html) {
      console.log('⚠️  Payments endpoint returned HTML (likely requires DoorLoop premium account)');
      console.log('   Payment data not available via API\n');

      console.log('💡 Alternative: Check payments manually at:');
      console.log('   https://app.doorloop.com/payments\n');
      return;
    }

    const allPayments = paymentsResponse.data || [];

    // Filter payments for City Studio leases
    const leaseIds = cityStudioLeases.map((l: any) => l.id);
    const cityStudioPayments = allPayments.filter((p: any) =>
      leaseIds.includes(p.leaseId) ||
      leaseIds.includes(p.lease?.id)
    );

    console.log(`   Found ${cityStudioPayments.length} payment(s) for City Studio\n`);

    if (cityStudioPayments.length === 0) {
      console.log('⚠️  No payments found for City Studio leases');
      return;
    }

    // Display payment information (sorted by date, newest first)
    const sortedPayments = cityStudioPayments.sort((a: any, b: any) => {
      const dateA = new Date(a.date || a.createdAt || 0);
      const dateB = new Date(b.date || b.createdAt || 0);
      return dateB.getTime() - dateA.getTime();
    });

    console.log('💰 Recent Payments:');
    console.log('─'.repeat(80));

    sortedPayments.slice(0, 10).forEach((payment: any, index: number) => {
      const date = payment.date || payment.createdAt || 'N/A';
      const amount = payment.amount !== undefined ? `$${payment.amount.toFixed(2)}` : 'N/A';
      const status = payment.status || 'Unknown';
      const method = payment.paymentMethod || payment.method || 'N/A';
      const memo = payment.memo || payment.description || '';

      console.log(`\n${index + 1}. Payment on ${date}`);
      console.log(`   Amount: ${amount}`);
      console.log(`   Status: ${status}`);
      console.log(`   Method: ${method}`);
      if (memo) console.log(`   Memo: ${memo}`);
      console.log(`   Lease ID: ${payment.leaseId || payment.lease?.id || 'N/A'}`);
    });

    console.log('\n' + '─'.repeat(80));

    // Summary
    const totalAmount = sortedPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
    const latestPayment = sortedPayments[0];

    console.log('\n📊 Summary:');
    console.log(`   Total Payments: ${sortedPayments.length}`);
    console.log(`   Total Amount: $${totalAmount.toFixed(2)}`);
    if (latestPayment) {
      console.log(`   Latest Payment: $${latestPayment.amount?.toFixed(2) || 'N/A'} on ${latestPayment.date || latestPayment.createdAt || 'N/A'}`);
      console.log(`   Latest Status: ${latestPayment.status || 'Unknown'}`);
    }

  } catch (error) {
    console.error('\n❌ Error fetching DoorLoop data:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);

      if (error.message.includes('401')) {
        console.error('\n💡 Tip: Your API key may be invalid or expired');
        console.error('   Get your API key from: https://app.doorloop.com/settings/api');
      }
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

// Run the script
checkCityStudioPayment();
