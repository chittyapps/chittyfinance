#!/usr/bin/env node
/**
 * Pull tenant communications, messages, statements, and payment records
 */

import { writeFileSync, appendFileSync } from 'fs';

const BASE_URL = 'https://app.doorloop.com/api';

async function fetchDoorLoop(endpoint) {
  const apiKey = process.env.DOORLOOP_API_KEY;
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  console.log(`   ${endpoint}: ${res.status}`);

  const text = await res.text();

  if (!res.ok) {
    return { error: `${res.status}`, response: text.substring(0, 200) };
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    return { error: 'Invalid JSON', response: text.substring(0, 200) };
  }
}

async function pullCommunications() {
  console.log('📨 PULLING COMMUNICATIONS & FINANCIAL RECORDS...\n');

  const endpoints = [
    // Communications
    '/messages?limit=200',
    '/communications?limit=200',
    '/conversations?limit=200',
    '/emails?limit=200',
    '/sms?limit=200',
    '/notifications?limit=200',

    // Financial
    '/payments?limit=200',
    '/payment-methods?limit=200',
    '/charges?limit=200',
    '/receipts?limit=200',
    '/statements?limit=200',
    '/ledger?limit=200',
    '/bills?limit=200',
    '/invoices?limit=200',
    '/credits?limit=200',
    '/debits?limit=200',

    // Documents
    '/documents?limit=200',
    '/files?limit=200',
    '/attachments?limit=200',

    // Accounting
    '/accounts?limit=200',
    '/journal-entries?limit=200',
    '/general-ledger?limit=200',
    '/balance-sheet?limit=200',
    '/income-statement?limit=200',
    '/cash-flow?limit=200',

    // Reports
    '/reports?limit=200',
    '/rent-roll?limit=200',
    '/delinquency-report?limit=200',
  ];

  const results = {};
  const successfulEndpoints = [];

  for (const endpoint of endpoints) {
    const data = await fetchDoorLoop(endpoint);
    const name = endpoint.split('?')[0].replace('/', '');

    if (!data.error && data.data && data.data.length > 0) {
      results[name] = data;
      successfulEndpoints.push(endpoint);
      console.log(`     ✅ ${data.data.length} items\n`);
    } else if (!data.error && data.data) {
      console.log(`     ⚠️  0 items\n`);
    } else {
      console.log(`     ❌ ${data.error}\n`);
    }
  }

  // Save results
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `doorloop-communications-${timestamp}.json`;

  writeFileSync(filename, JSON.stringify({
    timestamp: new Date().toISOString(),
    successfulEndpoints,
    data: results,
  }, null, 2));

  console.log(`\n✅ Saved to: ${filename}`);
  console.log(`\n📊 SUMMARY:`);
  console.log(`   Successful endpoints: ${successfulEndpoints.length}`);
  Object.entries(results).forEach(([name, data]) => {
    console.log(`   - ${name}: ${data.data?.length || 0} items`);
  });

  // Create summary
  let summary = `
================================================================================
DOORLOOP COMMUNICATIONS & FINANCIAL RECORDS
================================================================================
Generated: ${new Date().toISOString()}
Accessible Endpoints: ${successfulEndpoints.length}

`;

  Object.entries(results).forEach(([name, data]) => {
    summary += `\n${name.toUpperCase()} (${data.data.length} records):\n`;
    summary += '─'.repeat(80) + '\n';

    data.data.slice(0, 5).forEach((item, idx) => {
      summary += `\n${idx + 1}. ${JSON.stringify(item, null, 2).substring(0, 500)}\n`;
    });

    if (data.data.length > 5) {
      summary += `\n... and ${data.data.length - 5} more\n`;
    }
  });

  summary += `\n\nFull data saved in: ${filename}\n`;

  const summaryFilename = filename.replace('.json', '-summary.txt');
  writeFileSync(summaryFilename, summary);
  console.log(`✅ Summary saved to: ${summaryFilename}\n`);
}

pullCommunications().catch(console.error);
