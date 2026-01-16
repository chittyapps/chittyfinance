#!/usr/bin/env node
/**
 * Pull ALL available data from DoorLoop
 */

const BASE_URL = 'https://app.doorloop.com/api';

async function fetchDoorLoop(endpoint) {
  const apiKey = process.env.DOORLOOP_API_KEY;
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    return { error: `${res.status}: ${text.substring(0, 100)}` };
  }

  try {
    return await res.json();
  } catch (e) {
    return { error: 'Invalid JSON response' };
  }
}

async function pullAllData() {
  const apiKey = process.env.DOORLOOP_API_KEY;
  if (!apiKey) {
    console.error('❌ DOORLOOP_API_KEY not set');
    process.exit(1);
  }

  console.log('🔍 PULLING ALL DOORLOOP DATA...\n');

  // 1. Properties
  console.log('📊 PROPERTIES:');
  console.log('='.repeat(80));
  const properties = await fetchDoorLoop('/properties?limit=100');

  if (properties.error) {
    console.log(`❌ Error: ${properties.error}\n`);
  } else if (properties.data) {
    properties.data.forEach((p, idx) => {
      console.log(`\n${idx + 1}. ${p.name || 'Unnamed'} (ID: ${p.id})`);
      console.log(`   Address: ${p.address?.line1 || 'N/A'}, ${p.address?.city || 'N/A'}`);
      console.log(`   Type: ${p.type || 'N/A'}`);
      console.log(`   Units: ${p.units || 0}`);
      console.log(`   Status: ${p.status || 'N/A'}`);
    });
    console.log(`\n✅ Total properties: ${properties.data.length}\n`);
  }

  // 2. Leases
  console.log('📋 LEASES:');
  console.log('='.repeat(80));
  const leases = await fetchDoorLoop('/leases?limit=100');

  if (leases.error) {
    console.log(`❌ Error: ${leases.error}\n`);
  } else if (leases.data) {
    const activeLeases = leases.data.filter(l => l.status === 'ACTIVE');
    const inactiveLeases = leases.data.filter(l => l.status === 'INACTIVE');

    console.log(`\n📗 ACTIVE LEASES (${activeLeases.length}):\n`);
    activeLeases.forEach((l, idx) => {
      console.log(`${idx + 1}. Lease ID: ${l.id}`);
      console.log(`   Status: ${l.status}`);
      console.log(`   Property ID: ${l.propertyId || 'N/A'}`);
      console.log(`   Tenant ID: ${l.tenantId || 'N/A'}`);
      console.log('');
    });

    console.log(`📕 INACTIVE LEASES (${inactiveLeases.length}):\n`);
    inactiveLeases.forEach((l, idx) => {
      console.log(`${idx + 1}. Lease ID: ${l.id}`);
      console.log(`   Status: ${l.status}`);
      console.log('');
    });
  }

  // 3. Get detailed info for each active lease
  console.log('🔍 DETAILED LEASE INFORMATION:');
  console.log('='.repeat(80));

  if (leases.data) {
    const activeLeases = leases.data.filter(l => l.status === 'ACTIVE');

    for (const lease of activeLeases) {
      console.log(`\n📄 Fetching details for lease ${lease.id}...`);
      const details = await fetchDoorLoop(`/leases/${lease.id}`);

      if (details.error) {
        console.log(`   ❌ ${details.error}`);
      } else {
        console.log(`   Property: ${details.property?.name || 'N/A'}`);
        console.log(`   Property Address: ${details.property?.address?.line1 || 'N/A'}`);
        console.log(`   Tenant: ${details.tenant?.name || 'N/A'}`);
        console.log(`   Tenant Email: ${details.tenant?.email || 'N/A'}`);
        console.log(`   Rent: $${details.rentAmount || 0}`);
        console.log(`   Balance Due: $${details.balanceDue || 0}`);
        console.log(`   Start Date: ${details.startDate || 'N/A'}`);
        console.log(`   End Date: ${details.endDate || 'N/A'}`);
        console.log(`   Status: ${details.status || 'N/A'}`);

        // Store for later matching
        if (!global.leaseDetails) global.leaseDetails = {};
        global.leaseDetails[lease.id] = details;
      }
    }
  }

  // 4. Try payments endpoint
  console.log('\n💰 PAYMENTS:');
  console.log('='.repeat(80));
  const payments = await fetchDoorLoop('/payments?limit=200');

  if (payments.error) {
    console.log(`❌ Payments not accessible: ${payments.error}`);
    console.log('   (This typically requires a DoorLoop premium subscription)\n');
  } else if (payments.data) {
    console.log(`✅ Found ${payments.data.length} payments\n`);

    // Group by lease
    const paymentsByLease = {};
    payments.data.forEach(p => {
      if (!paymentsByLease[p.leaseId]) {
        paymentsByLease[p.leaseId] = [];
      }
      paymentsByLease[p.leaseId].push(p);
    });

    Object.entries(paymentsByLease).forEach(([leaseId, payments]) => {
      const leaseInfo = global.leaseDetails?.[leaseId];
      console.log(`\n📋 Lease: ${leaseId}`);
      if (leaseInfo) {
        console.log(`   Property: ${leaseInfo.property?.name || 'N/A'}`);
        console.log(`   Tenant: ${leaseInfo.tenant?.name || 'N/A'}`);
      }
      console.log(`   Payments: ${payments.length}`);

      // Show last 3 payments
      const sorted = payments.sort((a, b) => new Date(b.date) - new Date(a.date));
      sorted.slice(0, 3).forEach(p => {
        console.log(`     • ${new Date(p.date).toLocaleDateString()}: $${p.amount} (${p.status})`);
      });
    });
  }

  // 5. Try other endpoints
  console.log('\n🔍 TRYING OTHER ENDPOINTS:');
  console.log('='.repeat(80));

  const endpoints = [
    '/tenants?limit=100',
    '/units?limit=100',
    '/transactions?limit=100',
    '/expenses?limit=100',
    '/maintenance?limit=100',
  ];

  for (const endpoint of endpoints) {
    console.log(`\nTrying ${endpoint}...`);
    const data = await fetchDoorLoop(endpoint);

    if (data.error) {
      console.log(`   ❌ ${data.error}`);
    } else if (data.data) {
      console.log(`   ✅ Found ${data.data.length} items`);
      if (data.data.length > 0 && data.data.length <= 5) {
        console.log(`   Sample:`, JSON.stringify(data.data[0], null, 2).substring(0, 300));
      }
    }
  }

  // Final Summary
  console.log('\n');
  console.log('='.repeat(80));
  console.log('📊 SUMMARY OF ACCESSIBLE DATA');
  console.log('='.repeat(80));
  console.log(`Properties: ${properties.data?.length || 0}`);
  console.log(`Leases: ${leases.data?.length || 0}`);
  console.log(`Payments: ${payments.data?.length || 'NOT ACCESSIBLE'}`);
  console.log('='.repeat(80));
}

pullAllData().catch(console.error);
