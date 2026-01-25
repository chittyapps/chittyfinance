#!/usr/bin/env node
/**
 * Fetch DoorLoop Reports and Additional Data
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
      return { error: res.status, details: text.substring(0, 500) };
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      return { error: 'Invalid JSON', details: text.substring(0, 500) };
    }
  } catch (error) {
    return { error: 'Network error', details: error.message };
  }
}

async function main() {
  console.log('📊 DOORLOOP REPORTS & DATA FETCH');
  console.log('='.repeat(80));
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const endpoints = [
    { name: 'rent-roll', path: '/reports/rent-roll' },
    { name: 'profit-and-loss', path: '/reports/profit-and-loss-summary' },
    { name: 'cash-flow', path: '/reports/cash-flow-statement' },
    { name: 'balance-sheet', path: '/reports/balance-sheet-summary' },
    { name: 'notes', path: '/notes?limit=200' },
    { name: 'files', path: '/files?limit=200' },
  ];

  const results = {};

  for (const endpoint of endpoints) {
    process.stdout.write(`Fetching ${endpoint.name}... `);

    const data = await fetchDoorLoop(endpoint.path);

    if (data.error) {
      console.log(`❌ ${data.error}`);
      results[endpoint.name] = { error: data.error, details: data.details };
    } else {
      const count = data.data?.length || data.items?.length || 'N/A';
      console.log(`✅ ${count} records`);
      results[endpoint.name] = data;
    }
  }

  // Save results
  const filename = 'doorloop-reports-2025-12-09.json';
  fs.writeFileSync(filename, JSON.stringify(results, null, 2));

  console.log('\n' + '='.repeat(80));
  console.log(`✅ Saved to: ${filename}\n`);

  // Display summaries
  console.log('REPORTS SUMMARY:');
  console.log('='.repeat(80));

  // Rent Roll
  if (results['rent-roll']?.data || results['rent-roll']?.rows) {
    const rentRoll = results['rent-roll'];
    console.log('\n📋 RENT ROLL:');

    if (rentRoll.data) {
      console.log(`   Found ${rentRoll.data.length} entries`);
      rentRoll.data.slice(0, 5).forEach(entry => {
        console.log(`   • ${entry.tenant || 'N/A'}: $${entry.rent || 'N/A'} - ${entry.status || 'N/A'}`);
      });
    } else if (rentRoll.rows) {
      console.log(`   Found ${rentRoll.rows.length} rows`);
      rentRoll.rows.slice(0, 5).forEach(row => {
        console.log(`   • ${JSON.stringify(row).substring(0, 100)}`);
      });
    } else {
      console.log('   Report structure:', Object.keys(rentRoll));
    }
  } else if (results['rent-roll']?.error) {
    console.log('\n📋 RENT ROLL: ❌', results['rent-roll'].error);
  }

  // P&L
  if (results['profit-and-loss']) {
    console.log('\n💰 PROFIT & LOSS:');
    const pl = results['profit-and-loss'];

    if (pl.error) {
      console.log('   ❌', pl.error);
    } else {
      console.log('   Structure:', Object.keys(pl));

      if (pl.income) console.log(`   Income: $${pl.income}`);
      if (pl.expenses) console.log(`   Expenses: $${pl.expenses}`);
      if (pl.netIncome) console.log(`   Net Income: $${pl.netIncome}`);
      if (pl.totalRevenue) console.log(`   Revenue: $${pl.totalRevenue}`);
      if (pl.totalExpenses) console.log(`   Total Expenses: $${pl.totalExpenses}`);
    }
  }

  // Cash Flow
  if (results['cash-flow']) {
    console.log('\n💵 CASH FLOW:');
    const cf = results['cash-flow'];

    if (cf.error) {
      console.log('   ❌', cf.error);
    } else {
      console.log('   Structure:', Object.keys(cf));

      if (cf.operating) console.log(`   Operating: $${cf.operating}`);
      if (cf.investing) console.log(`   Investing: $${cf.investing}`);
      if (cf.financing) console.log(`   Financing: $${cf.financing}`);
    }
  }

  // Balance Sheet
  if (results['balance-sheet']) {
    console.log('\n📊 BALANCE SHEET:');
    const bs = results['balance-sheet'];

    if (bs.error) {
      console.log('   ❌', bs.error);
    } else {
      console.log('   Structure:', Object.keys(bs));

      if (bs.assets) console.log(`   Assets: $${bs.assets}`);
      if (bs.liabilities) console.log(`   Liabilities: $${bs.liabilities}`);
      if (bs.equity) console.log(`   Equity: $${bs.equity}`);
      if (bs.totalAssets) console.log(`   Total Assets: $${bs.totalAssets}`);
    }
  }

  // Notes
  if (results.notes?.data) {
    console.log(`\n📝 NOTES: ${results.notes.data.length} total`);
    results.notes.data.slice(0, 5).forEach((note, idx) => {
      const date = new Date(note.createdAt || note.date);
      console.log(`   ${idx + 1}. ${date.toLocaleDateString()}: ${note.note?.substring(0, 60) || 'N/A'}...`);
    });
  } else if (results.notes?.error) {
    console.log('\n📝 NOTES: ❌', results.notes.error);
  }

  // Files
  if (results.files?.data) {
    console.log(`\n📁 FILES: ${results.files.data.length} total`);
    results.files.data.slice(0, 10).forEach((file, idx) => {
      console.log(`   ${idx + 1}. ${file.name || file.filename || 'N/A'} (${file.size || 'N/A'} bytes)`);
    });
  } else if (results.files?.error) {
    console.log('\n📁 FILES: ❌', results.files.error);
  }

  console.log('\n' + '='.repeat(80));
}

main().catch(console.error);
