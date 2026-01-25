#!/usr/bin/env node
/**
 * Check Alexis lease payment status - Simple version
 */

const LEASE_ID = '690e47b7d84b610e20287ca2';
const BASE_URL = 'https://app.doorloop.com/api';

async function checkAlexisLease() {
  const apiKey = process.env.DOORLOOP_API_KEY;

  if (!apiKey) {
    console.error('❌ DOORLOOP_API_KEY environment variable not set');
    process.exit(1);
  }

  console.log('🔍 Checking Alexis lease (City Studio)...\n');
  console.log(`📋 Lease ID: ${LEASE_ID}\n`);

  try {
    // Get lease details
    console.log('📄 Fetching lease details...');
    const leaseRes = await fetch(`${BASE_URL}/leases/${LEASE_ID}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!leaseRes.ok) {
      const text = await leaseRes.text();
      throw new Error(`API error: ${leaseRes.status} ${leaseRes.statusText}\n${text}`);
    }

    const lease = await leaseRes.json();

    console.log('✅ Lease Details:');
    console.log(`   Property: ${lease.property?.name || 'N/A'}`);
    console.log(`   Tenant: ${lease.tenant?.name || 'N/A'}`);
    console.log(`   Status: ${lease.status || 'N/A'}`);
    console.log(`   Rent Amount: $${lease.rentAmount || 0}`);
    console.log(`   Balance Due: $${lease.balanceDue || 0}`);
    console.log(`   Start Date: ${lease.startDate || 'N/A'}`);
    console.log(`   End Date: ${lease.endDate || 'N/A'}`);
    console.log('');

    // Get all payments
    console.log('💰 Fetching all payments...');
    const paymentsRes = await fetch(`${BASE_URL}/payments?limit=200`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!paymentsRes.ok) {
      const text = await paymentsRes.text();
      console.log('⚠️  Payments endpoint returned error (may require premium plan)');
      console.log(`   ${paymentsRes.status}: ${text.substring(0, 200)}`);
      return;
    }

    const paymentsData = await paymentsRes.json();
    const allPayments = paymentsData.data || [];

    // Filter payments for this lease
    const leasePayments = allPayments.filter(p => p.leaseId === LEASE_ID);

    if (leasePayments.length > 0) {
      console.log(`✅ Found ${leasePayments.length} payment(s) for this lease:\n`);

      // Sort by date (newest first)
      leasePayments.sort((a, b) => new Date(b.date) - new Date(a.date));

      leasePayments.forEach((payment, idx) => {
        const date = new Date(payment.date);
        console.log(`${idx + 1}. Payment on ${date.toLocaleDateString()}`);
        console.log(`   Amount: $${payment.amount || 0}`);
        console.log(`   Status: ${payment.status || 'N/A'}`);
        console.log(`   Method: ${payment.paymentMethod || 'N/A'}`);
        console.log(`   Reference: ${payment.reference || 'N/A'}`);
        console.log('');
      });

      // Check for December 2025 payment
      const dec2025 = leasePayments.find(p => {
        const date = new Date(p.date);
        return date.getMonth() === 11 && date.getFullYear() === 2025;
      });

      console.log('─'.repeat(60));
      if (dec2025) {
        console.log('✅ DECEMBER 2025 PAYMENT FOUND!');
        console.log(`   Date: ${new Date(dec2025.date).toLocaleDateString()}`);
        console.log(`   Amount: $${dec2025.amount}`);
        console.log(`   Status: ${dec2025.status}`);
      } else {
        console.log('⚠️  NO DECEMBER 2025 PAYMENT FOUND');

        // Show most recent payment
        if (leasePayments.length > 0) {
          const latest = leasePayments[0];
          console.log('\n📅 Most recent payment:');
          console.log(`   Date: ${new Date(latest.date).toLocaleDateString()}`);
          console.log(`   Amount: $${latest.amount}`);
          console.log(`   Status: ${latest.status}`);
        }
      }
      console.log('─'.repeat(60));

    } else {
      console.log('⚠️  No payments found for this lease');
      console.log(`\n💡 Total payments in system: ${allPayments.length}`);
      if (allPayments.length > 0) {
        console.log('   (Payments exist but none match this lease ID)');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkAlexisLease();
