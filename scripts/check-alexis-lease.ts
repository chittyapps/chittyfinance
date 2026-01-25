#!/usr/bin/env tsx
/**
 * Check Alexis lease payment status
 */

import { DoorLoopClient } from '../server/lib/doorloop-integration';

const LEASE_ID = '690e47b7d84b610e20287ca2';

async function checkAlexisLease() {
  const apiKey = process.env.DOORLOOP_API_KEY;

  if (!apiKey) {
    console.error('❌ DOORLOOP_API_KEY environment variable not set');
    console.log('💡 Set it with: export DOORLOOP_API_KEY="op://Claude-Code Tools/DOORLOOP_API_KEY/api_key"');
    process.exit(1);
  }

  const doorloop = new DoorLoopClient(apiKey);

  console.log('🔍 Checking Alexis lease (City Studio)...\n');
  console.log(`📋 Lease ID: ${LEASE_ID}\n`);

  try {
    // Get lease details
    console.log('📄 Fetching lease details...');
    const response = await fetch(`https://app.doorloop.com/api/leases/${LEASE_ID}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const lease = await response.json();

    console.log('✅ Lease Details:');
    console.log(`   Property: ${lease.property?.name || 'N/A'}`);
    console.log(`   Tenant: ${lease.tenant?.name || 'N/A'}`);
    console.log(`   Status: ${lease.status || 'N/A'}`);
    console.log(`   Rent Amount: $${lease.rentAmount || 0}`);
    console.log(`   Balance Due: $${lease.balanceDue || 0}`);
    console.log(`   Start Date: ${lease.startDate || 'N/A'}`);
    console.log(`   End Date: ${lease.endDate || 'N/A'}`);
    console.log('');

    // Get payments for this lease
    console.log('💰 Fetching payments...');
    const payments = await doorloop.getLeasePayments(parseInt(LEASE_ID, 16));

    if (payments.length > 0) {
      console.log(`✅ Found ${payments.length} payment(s):\n`);

      payments.forEach((payment, idx) => {
        console.log(`${idx + 1}. Payment on ${payment.date}`);
        console.log(`   Amount: $${payment.amount}`);
        console.log(`   Status: ${payment.status}`);
        console.log(`   Method: ${payment.paymentMethod || 'N/A'}`);
        console.log(`   Reference: ${payment.reference || 'N/A'}`);
        console.log('');
      });

      // Check for December 2025 payment
      const dec2025 = payments.find(p => {
        const date = new Date(p.date);
        return date.getMonth() === 11 && date.getFullYear() === 2025;
      });

      if (dec2025) {
        console.log('✅ DECEMBER 2025 PAYMENT FOUND!');
        console.log(`   Date: ${dec2025.date}`);
        console.log(`   Amount: $${dec2025.amount}`);
        console.log(`   Status: ${dec2025.status}`);
      } else {
        console.log('⚠️  No December 2025 payment found');
      }
    } else {
      console.log('⚠️  No payments found for this lease');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkAlexisLease();
