#!/usr/bin/env node
/**
 * Save complete DoorLoop archive before losing API access
 */

import { writeFileSync } from 'fs';

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
    return { error: `${res.status}: ${res.statusText}` };
  }

  try {
    return await res.json();
  } catch (e) {
    return { error: 'Invalid JSON' };
  }
}

async function archiveAll() {
  console.log('📦 ARCHIVING ALL DOORLOOP DATA...\n');

  const archive = {
    timestamp: new Date().toISOString(),
    metadata: {
      purpose: 'Historical backup before API access loss',
      date: '2025-12-09',
    },
    data: {},
  };

  // Properties
  console.log('📊 Archiving properties...');
  archive.data.properties = await fetchDoorLoop('/properties?limit=200');
  console.log(`   ✅ ${archive.data.properties.data?.length || 0} properties`);

  // Leases
  console.log('📋 Archiving leases...');
  archive.data.leases = await fetchDoorLoop('/leases?limit=200');
  console.log(`   ✅ ${archive.data.leases.data?.length || 0} leases`);

  // Tenants
  console.log('👥 Archiving tenants...');
  archive.data.tenants = await fetchDoorLoop('/tenants?limit=200');
  console.log(`   ✅ ${archive.data.tenants.data?.length || 0} tenants`);

  // Units
  console.log('🏠 Archiving units...');
  archive.data.units = await fetchDoorLoop('/units?limit=200');
  console.log(`   ✅ ${archive.data.units.data?.length || 0} units`);

  // Expenses
  console.log('💸 Archiving expenses...');
  archive.data.expenses = await fetchDoorLoop('/expenses?limit=200');
  console.log(`   ✅ ${archive.data.expenses.data?.length || 0} expenses`);

  // Try payments (likely won't work)
  console.log('💰 Attempting to archive payments...');
  archive.data.payments = await fetchDoorLoop('/payments?limit=200');
  if (archive.data.payments.error) {
    console.log(`   ⚠️  ${archive.data.payments.error} (expected - requires premium)`);
  } else {
    console.log(`   ✅ ${archive.data.payments.data?.length || 0} payments`);
  }

  // Get detailed info for each lease
  console.log('\n🔍 Archiving detailed lease information...');
  archive.data.leaseDetails = {};

  if (archive.data.leases.data) {
    for (const lease of archive.data.leases.data) {
      const details = await fetchDoorLoop(`/leases/${lease.id}`);
      archive.data.leaseDetails[lease.id] = details;
      process.stdout.write('.');
    }
    console.log(` ✅ ${Object.keys(archive.data.leaseDetails).length} detailed records`);
  }

  // Get detailed info for each property
  console.log('🏢 Archiving detailed property information...');
  archive.data.propertyDetails = {};

  if (archive.data.properties.data) {
    for (const property of archive.data.properties.data) {
      const details = await fetchDoorLoop(`/properties/${property.id}`);
      archive.data.propertyDetails[property.id] = details;
      process.stdout.write('.');
    }
    console.log(` ✅ ${Object.keys(archive.data.propertyDetails).length} detailed records`);
  }

  // Save archive
  const filename = `doorloop-archive-${new Date().toISOString().split('T')[0]}.json`;
  writeFileSync(filename, JSON.stringify(archive, null, 2));
  console.log(`\n✅ Archive saved to: ${filename}`);

  // Create human-readable summary
  const summary = `
================================================================================
DOORLOOP HISTORICAL ARCHIVE
================================================================================
Generated: ${archive.timestamp}
Purpose: Complete backup before API access termination

DATA SUMMARY:
  Properties: ${archive.data.properties.data?.length || 0}
  Leases: ${archive.data.leases.data?.length || 0}
  Tenants: ${archive.data.tenants.data?.length || 0}
  Units: ${archive.data.units.data?.length || 0}
  Expenses: ${archive.data.expenses.data?.length || 0}
  Payments: ${archive.data.payments.data?.length || 'NOT ACCESSIBLE'}

PROPERTIES:
${archive.data.properties.data?.map((p, idx) => `  ${idx + 1}. ${p.name} (${p.type})`).join('\n') || '  None'}

TENANTS:
${archive.data.tenants.data?.slice(0, 20).map((t, idx) => `  ${idx + 1}. ${t.firstName} ${t.lastName} - ${t.email || 'no email'}`).join('\n') || '  None'}

ACTIVE LEASES:
${archive.data.leases.data?.filter(l => l.status === 'ACTIVE').map((l, idx) => {
    const details = archive.data.leaseDetails[l.id];
    return `  ${idx + 1}. Lease ${l.id}
     Property: ${details?.property?.name || 'N/A'}
     Tenant: ${details?.tenant?.name || 'N/A'}
     Rent: $${details?.rentAmount || 0}
     Balance: $${details?.balanceDue || 0}`;
  }).join('\n\n') || '  None'}

FILES GENERATED:
  - ${filename} (complete JSON archive)
  - ${filename.replace('.json', '-summary.txt')} (this summary)

IMPORTANT NOTES:
  - Payment history NOT accessible (requires DoorLoop premium plan)
  - Some detailed fields return N/A (API limitations)
  - This is your last backup before API access expires
  - Keep these files permanently for historical reference
================================================================================
`;

  const summaryFilename = filename.replace('.json', '-summary.txt');
  writeFileSync(summaryFilename, summary);
  console.log(`✅ Summary saved to: ${summaryFilename}\n`);

  console.log(summary);

  return archive;
}

archiveAll().catch(console.error);
