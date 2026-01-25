#!/usr/bin/env node
/**
 * Final comprehensive DoorLoop archive before API access loss
 * Includes all reports, notes, files, and financial data
 */

import fs from 'fs';

const BASE_URL = 'https://app.doorloop.com/api';

async function fetchDoorLoop(endpoint) {
  const apiKey = process.env.DOORLOOP_API_KEY;

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const text = await res.text();

    if (!res.ok) {
      return { error: res.status, response: text.substring(0, 200) };
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      return { error: 'Invalid JSON', response: text.substring(0, 200) };
    }
  } catch (error) {
    return { error: 'Network error', message: error.message };
  }
}

async function createFinalArchive() {
  console.log('🗂️  CREATING FINAL DOORLOOP ARCHIVE');
  console.log('='.repeat(80));
  console.log('Date:', new Date().toISOString());
  console.log('');

  const archive = {
    timestamp: new Date().toISOString(),
    metadata: {
      purpose: 'Final comprehensive backup before API access loss',
      date: '2025-12-09',
      alexis_status: {
        lease_id: '690e47b7d84b610e20287ca2',
        tenant_id: '690e49e5d84b610e202cdb02',
        property_id: '66d7aad23cf0357c2a3c9430',
        december_2025_rent: {
          charged: 1282.26,
          paid: 0,
          balance_due: 1282.26,
          status: 'OVERDUE',
          charge_date: '2025-12-01',
          description: 'Prorated Rent December 1-15',
        },
        lease_details: {
          name: 'Alexis Pheng',
          email: 'acpheng@gmail.com',
          phone: '804-665-8632',
          start_date: '2025-11-08',
          end_date: '2026-12-15',
          monthly_rent: 2650,
          status: 'ACTIVE',
          property: 'City Studio at The Commodore',
          address: '550 W Surf St C211, Chicago IL',
        },
      },
    },
    data: {},
  };

  // Reports
  const reports = [
    '/reports/rent-roll',
    '/reports/profit-and-loss-summary',
    '/reports/cash-flow-statement',
    '/reports/balance-sheet-summary',
  ];

  console.log('📊 FETCHING REPORTS...\n');
  for (const endpoint of reports) {
    const name = endpoint.split('/').pop();
    console.log(`   Fetching ${name}...`);

    const data = await fetchDoorLoop(endpoint);

    if (data.error) {
      console.log(`   ❌ ${data.error}`);
      archive.data[name] = { error: data.error, details: data.response };
    } else {
      const recordCount = data.data?.length || data.items?.length ||
                         (typeof data === 'object' ? Object.keys(data).length : 1);
      console.log(`   ✅ ${recordCount} records`);
      archive.data[name] = data;
    }
  }

  // Additional data endpoints
  const dataEndpoints = [
    '/notes',
    '/files',
  ];

  console.log('\n📄 FETCHING ADDITIONAL DATA...\n');
  for (const endpoint of dataEndpoints) {
    const name = endpoint.substring(1); // Remove leading /
    console.log(`   Fetching ${name}...`);

    const data = await fetchDoorLoop(`${endpoint}?limit=200`);

    if (data.error) {
      console.log(`   ❌ ${data.error}`);
      archive.data[name] = { error: data.error, details: data.response };
    } else {
      const recordCount = data.data?.length || 0;
      console.log(`   ✅ ${recordCount} records`);
      archive.data[name] = data;
    }
  }

  // Include previously collected data references
  archive.data.previous_archives = {
    properties: 'doorloop-archive-2025-12-09.json (6 properties)',
    leases: 'doorloop-archive-2025-12-09.json (16 leases)',
    tenants: 'doorloop-archive-2025-12-09.json (50 tenants)',
    communications: 'doorloop-communications-2025-12-09.json (50 communications)',
    lease_charges: 'See above analysis (50 charges)',
    lease_payments: 'See above analysis (2 payments for Alexis)',
    lease_credits: 'See above analysis (1 credit for Alexis)',
    expenses: '5 expenses',
    vendor_bills: '50 vendor bills',
  };

  // Save archive
  const filename = 'doorloop-final-archive-2025-12-09.json';
  fs.writeFileSync(filename, JSON.stringify(archive, null, 2));
  console.log(`\n✅ Archive saved to: ${filename}`);

  // Create summary report
  const summary = [];
  summary.push('DOORLOOP FINAL ARCHIVE SUMMARY');
  summary.push('='.repeat(80));
  summary.push(`Date: ${new Date().toISOString()}`);
  summary.push('');
  summary.push('🎯 ALEXIS PHENG - DECEMBER 2025 RENT STATUS:');
  summary.push('');
  summary.push('   CHARGE POSTED:');
  summary.push('   Date: December 1, 2025');
  summary.push('   Amount: $1,282.26');
  summary.push('   Description: Prorated Rent December 1-15');
  summary.push('   ');
  summary.push('   PAYMENT STATUS:');
  summary.push('   ❌ NO PAYMENT RECEIVED');
  summary.push('   Balance Due: $1,282.26 (OVERDUE)');
  summary.push('');
  summary.push('   EVIDENCE:');
  summary.push('   • Daily overdue notices sent Dec 3-9, 2025');
  summary.push('   • Last payment received: Nov 6, 2025 ($2,781.67 total)');
  summary.push('   • Lease-charges endpoint shows balance: $1,282.26');
  summary.push('   • Lease-payments endpoint shows 0 Dec 2025 payments');
  summary.push('   • Lease details show overdueBalance: $1,282.26');
  summary.push('');
  summary.push('📋 LEASE DETAILS:');
  summary.push('   Tenant: Alexis Pheng');
  summary.push('   Email: acpheng@gmail.com');
  summary.push('   Phone: 804-665-8632');
  summary.push('   Property: City Studio at The Commodore');
  summary.push('   Address: 550 W Surf St C211, Chicago IL');
  summary.push('   Lease Term: Nov 8, 2025 → Dec 15, 2026');
  summary.push('   Monthly Rent: $2,650');
  summary.push('   Status: ACTIVE');
  summary.push('   Insurance: NO_INSURANCE (required but not provided)');
  summary.push('');
  summary.push('📊 ARCHIVED DATA:');
  summary.push('');

  // Count archived records
  let totalRecords = 0;
  Object.entries(archive.data).forEach(([key, value]) => {
    if (key === 'previous_archives') return;

    let count = 0;
    if (value.error) {
      summary.push(`   ❌ ${key}: Error - ${value.error}`);
    } else {
      if (value.data) count = value.data.length;
      else if (value.items) count = value.items.length;
      else if (typeof value === 'object') count = Object.keys(value).length;

      totalRecords += count;
      summary.push(`   ✅ ${key}: ${count} records`);
    }
  });

  summary.push('');
  summary.push(`Total archived records: ${totalRecords}`);
  summary.push('');
  summary.push('📦 PREVIOUS ARCHIVES:');
  summary.push('   • doorloop-archive-2025-12-09.json (properties, leases, tenants)');
  summary.push('   • doorloop-communications-2025-12-09.json (50 communications)');
  summary.push('   • Comprehensive endpoint testing (65 endpoints tested)');
  summary.push('');
  summary.push('✅ ARCHIVE COMPLETE');
  summary.push('='.repeat(80));

  const summaryText = summary.join('\n');
  fs.writeFileSync('doorloop-final-archive-2025-12-09-summary.txt', summaryText);

  console.log('\n' + summaryText);
}

createFinalArchive().catch(console.error);
