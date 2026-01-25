#!/usr/bin/env node
/**
 * Fetch ALL DoorLoop data with pagination
 * Comprehensive final backup before API access expires
 */

import fs from 'fs';

const BASE_URL = 'https://app.doorloop.com/api';
const BATCH_SIZE = 200; // Maximum records per request

async function fetchDoorLoop(endpoint, params = {}) {
  const apiKey = process.env.DOORLOOP_API_KEY;

  const queryParams = new URLSearchParams(params).toString();
  const url = `${BASE_URL}${endpoint}${queryParams ? '?' + queryParams : ''}`;

  try {
    const res = await fetch(url, {
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

async function fetchAllPaginated(endpoint, name) {
  console.log(`\n📥 Fetching ALL ${name}...`);

  let allData = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    console.log(`   Page ${page}...`);

    const result = await fetchDoorLoop(endpoint, {
      limit: BATCH_SIZE,
      skip: (page - 1) * BATCH_SIZE,
    });

    if (result.error) {
      console.log(`   ❌ Error on page ${page}: ${result.error}`);
      break;
    }

    const records = result.data || result.items || [];

    if (records.length === 0) {
      hasMore = false;
      break;
    }

    allData = allData.concat(records);
    console.log(`   ✅ ${records.length} records (total: ${allData.length})`);

    // Check if there are more pages
    if (records.length < BATCH_SIZE) {
      hasMore = false;
    } else {
      page++;
      // Rate limiting - wait 500ms between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`   🎯 TOTAL: ${allData.length} ${name}`);
  return allData;
}

async function fetchAllData() {
  console.log('🗂️  FETCHING ALL DOORLOOP DATA');
  console.log('='.repeat(80));
  console.log('Date:', new Date().toISOString());
  console.log('This may take several minutes...\n');

  const archive = {
    timestamp: new Date().toISOString(),
    metadata: {
      purpose: 'Complete comprehensive backup of all DoorLoop data',
      date: '2025-12-09',
      fetch_method: 'Paginated fetch with 200 records per page',
    },
    data: {},
    summary: {},
  };

  // Define all endpoints to fetch
  const endpoints = [
    { path: '/communications', name: 'communications' },
    { path: '/files', name: 'files' },
    { path: '/notes', name: 'notes' },
    { path: '/properties', name: 'properties' },
    { path: '/units', name: 'units' },
    { path: '/leases', name: 'leases' },
    { path: '/tenants', name: 'tenants' },
    { path: '/owners', name: 'owners' },
    { path: '/vendors', name: 'vendors' },
    { path: '/lease-charges', name: 'lease_charges' },
    { path: '/lease-payments', name: 'lease_payments' },
    { path: '/lease-credits', name: 'lease_credits' },
    { path: '/lease-reversed-payments', name: 'lease_reversed_payments' },
    { path: '/expenses', name: 'expenses' },
    { path: '/vendor-bills', name: 'vendor_bills' },
    { path: '/notifications', name: 'notifications' },
    { path: '/accounts', name: 'accounts' },
    { path: '/tasks', name: 'tasks' },
  ];

  // Additional single-fetch endpoints (reports)
  const singleEndpoints = [
    { path: '/reports/rent-roll', name: 'rent_roll' },
  ];

  // Fetch all paginated data
  for (const endpoint of endpoints) {
    try {
      const data = await fetchAllPaginated(endpoint.path, endpoint.name);
      archive.data[endpoint.name] = data;
      archive.summary[endpoint.name] = {
        count: data.length,
        fetched_at: new Date().toISOString(),
      };
    } catch (error) {
      console.log(`   ❌ Error fetching ${endpoint.name}:`, error.message);
      archive.data[endpoint.name] = { error: error.message };
      archive.summary[endpoint.name] = { error: error.message };
    }
  }

  // Fetch single-request endpoints
  console.log('\n📊 Fetching reports...');
  for (const endpoint of singleEndpoints) {
    try {
      console.log(`   ${endpoint.name}...`);
      const result = await fetchDoorLoop(endpoint.path);

      if (result.error) {
        console.log(`   ❌ Error: ${result.error}`);
        archive.data[endpoint.name] = { error: result.error };
      } else {
        const count = result.data?.length || result.items?.length ||
                     (typeof result === 'object' ? Object.keys(result).length : 1);
        console.log(`   ✅ ${count} records`);
        archive.data[endpoint.name] = result;
        archive.summary[endpoint.name] = {
          count: count,
          fetched_at: new Date().toISOString(),
        };
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      archive.data[endpoint.name] = { error: error.message };
    }
  }

  // Calculate totals
  let totalRecords = 0;
  Object.values(archive.summary).forEach(item => {
    if (item.count) totalRecords += item.count;
  });

  archive.summary.total_records = totalRecords;
  archive.summary.completed_at = new Date().toISOString();

  // Save archive
  const filename = 'doorloop-complete-archive-2025-12-09.json';
  fs.writeFileSync(filename, JSON.stringify(archive, null, 2));

  console.log('\n' + '='.repeat(80));
  console.log('✅ COMPLETE ARCHIVE SAVED');
  console.log('='.repeat(80));
  console.log(`File: ${filename}`);
  console.log(`Total Records: ${totalRecords}`);
  console.log('');
  console.log('Summary by endpoint:');
  Object.entries(archive.summary).forEach(([key, value]) => {
    if (key === 'total_records' || key === 'completed_at') return;
    if (value.error) {
      console.log(`  ❌ ${key}: Error - ${value.error}`);
    } else {
      console.log(`  ✅ ${key}: ${value.count} records`);
    }
  });
  console.log('');
  console.log(`Total: ${totalRecords} records`);
  console.log('='.repeat(80));

  // Create detailed summary file
  const summaryLines = [];
  summaryLines.push('DOORLOOP COMPLETE DATA ARCHIVE');
  summaryLines.push('='.repeat(80));
  summaryLines.push(`Created: ${new Date().toISOString()}`);
  summaryLines.push('');
  summaryLines.push('📊 DATA SUMMARY:');
  summaryLines.push('');

  Object.entries(archive.summary).forEach(([key, value]) => {
    if (key === 'total_records' || key === 'completed_at') return;
    if (value.error) {
      summaryLines.push(`  ❌ ${key}: Error - ${value.error}`);
    } else {
      summaryLines.push(`  ✅ ${key}: ${value.count.toLocaleString()} records`);
    }
  });

  summaryLines.push('');
  summaryLines.push(`🎯 TOTAL RECORDS: ${totalRecords.toLocaleString()}`);
  summaryLines.push('');
  summaryLines.push('📁 FILES:');
  summaryLines.push(`  • ${filename} (complete JSON archive)`);
  summaryLines.push(`  • doorloop-complete-archive-summary.txt (this file)`);
  summaryLines.push('');
  summaryLines.push('✅ ARCHIVE COMPLETE');
  summaryLines.push('='.repeat(80));

  const summaryText = summaryLines.join('\n');
  fs.writeFileSync('doorloop-complete-archive-summary.txt', summaryText);

  console.log('\nSummary saved to: doorloop-complete-archive-summary.txt');
  console.log('\n✅ ALL DATA FETCHED AND ARCHIVED\n');
}

fetchAllData().catch(console.error);
