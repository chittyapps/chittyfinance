const fetch = require('node-fetch');

const BASE_URL = 'https://app.doorloop.com/api';
const apiKey = process.env.DOORLOOP_API_KEY;

async function checkPayments() {
  console.log('💰 Checking DoorLoop payments...\n');

  try {
    const res = await fetch(`${BASE_URL}/payments?limit=100&offset=0`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!res.ok) {
      const text = await res.text();
      console.log(`❌ Error: ${res.status} ${res.statusText}`);
      console.log(`Response: ${text}`);
      return;
    }

    const payments = await res.json();

    if (payments.data && payments.data.length > 0) {
      console.log(`✅ Found ${payments.data.length} payments\n`);

      // Show all recent payments
      payments.data.forEach((p, idx) => {
        console.log(`${idx + 1}. Payment ID: ${p.id}`);
        console.log(`   Date: ${p.date || 'N/A'}`);
        console.log(`   Amount: $${p.amount || 0}`);
        console.log(`   Status: ${p.status || 'N/A'}`);
        console.log(`   Method: ${p.paymentMethod || 'N/A'}`);
        console.log(`   Lease ID: ${p.leaseId || 'N/A'}`);
        console.log(`   Reference: ${p.reference || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('❌ No payment data available');
      console.log('This might indicate:');
      console.log('  - DoorLoop account has no payment history');
      console.log('  - Payment access requires premium/paid plan');
      console.log('  - API permissions need to be updated');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkPayments().catch(console.error);
