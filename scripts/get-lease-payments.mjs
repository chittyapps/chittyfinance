#!/usr/bin/env node
/**
 * Get lease payments using correct endpoint
 */

import { writeFileSync } from 'fs';

const BASE_URL = 'https://api.doorloop.com';

async function fetchEndpoint(endpoint) {
  const apiKey = process.env.DOORLOOP_API_KEY;
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  const text = await res.text();

  if (!res.ok) {
    return { error: res.status, details: text.substring(0, 200) };
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    return { error: 'parse', details: text.substring(0, 200) };
  }
}

async function getPaymentData() {
  console.log('💰 FETCHING LEASE PAYMENT DATA...\n');

  const endpoints = [
    '/lease-payments?limit=200',
    '/lease-charges?limit=200',
    '/lease-credits?limit=200',
    '/lease-reversed-payments?limit=200',
  ];

  const results = {};

  for (const endpoint of endpoints) {
    const name = endpoint.split('?')[0].split('/').pop();
    console.log(`Fetching ${name}...`);

    const data = await fetchEndpoint(endpoint);

    if (data.error) {
      console.log(`  ❌ ${data.error}: ${data.details}\n`);
      results[name] = { error: data.error, details: data.details };
    } else if (data.data || data.items) {
      const items = data.data || data.items || [];
      console.log(`  ✅ ${items.length} records\n`);
      results[name] = data;
    } else {
      console.log(`  ⚠️  Unexpected format\n`);
      results[name] = data;
    }
  }

  // Save results
  const filename = 'doorloop-payment-data-2025-12-09.json';
  writeFileSync(filename, JSON.stringify({
    timestamp: new Date().toISOString(),
    data: results,
  }, null, 2));

  console.log(`✅ Saved to: ${filename}\n`);

  // Analyze payments
  if (results['lease-payments']?.data) {
    const payments = results['lease-payments'].data;

    console.log('='.repeat(80));
    console.log(`📊 PAYMENT SUMMARY (${payments.length} total payments)`);
    console.log('='.repeat(80));

    // Group by lease
    const byLease = {};
    payments.forEach(p => {
      const leaseId = p.leaseId || p.lease?.id || 'unknown';
      if (!byLease[leaseId]) byLease[leaseId] = [];
      byLease[leaseId].push(p);
    });

    // Show summary for each lease
    Object.entries(byLease).forEach(([leaseId, payments]) => {
      console.log(`\nLease ${leaseId}: ${payments.length} payments`);

      // Sort by date
      const sorted = payments.sort((a, b) =>
        new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)
      );

      // Show last 5
      sorted.slice(0, 5).forEach(p => {
        const date = new Date(p.date || p.createdAt).toLocaleDateString();
        const amount = p.amount || 0;
        const status = p.status || 'N/A';
        console.log(`  ${date}: $${amount} (${status})`);
      });

      if (payments.length > 5) {
        console.log(`  ... and ${payments.length - 5} more`);
      }
    });
  }

  // Summary file
  let summary = `
DOORLOOP PAYMENT DATA ARCHIVE
Generated: ${new Date().toISOString()}

`;

  Object.entries(results).forEach(([name, data]) => {
    const count = data.data?.length || data.items?.length || 0;
    summary += `${name}: ${count} records\n`;
  });

  if (results['lease-payments']?.data) {
    summary += `\nPAYMENT DETAILS:\n`;
    summary += JSON.stringify(results['lease-payments'].data, null, 2);
  }

  writeFileSync(filename.replace('.json', '-summary.txt'), summary);
  console.log(`\n✅ Summary saved to: ${filename.replace('.json', '-summary.txt')}`);
}

getPaymentData().catch(console.error);
