#!/usr/bin/env node
/**
 * COMPREHENSIVE Door Loop Archive - Everything before API access expires
 */

import { writeFileSync } from 'fs';

const BASE_URL = 'https://app.doorloop.com/api';
const LOG_FILE = 'doorloop-comprehensive-archive.log';

function log(msg) {
  console.log(msg);
}

async function fetchEndpoint(endpoint) {
  const apiKey = process.env.DOORLOOP_API_KEY;
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    const text = await res.text();

    if (!res.ok) {
      return { error: res.status, details: text.substring(0, 100) };
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      return { error: 'parse', details: text.substring(0, 100) };
    }
  } catch (error) {
    return { error: 'fetch', details: error.message };
  }
}

async function comprehensiveArchive() {
  console.log('🏢 COMPREHENSIVE DOORLOOP ARCHIVE');
  console.log('='.repeat(80));
  console.log(`Started: ${new Date().toISOString()}\n`);

  const endpoints = {
    // Core Data
    properties: '/properties?limit=200',
    leases: '/leases?limit=200',
    tenants: '/tenants?limit=200',
    units: '/units?limit=200',
    owners: '/owners?limit=200',
    vendors: '/vendors?limit=200',

    // Communications & Messages
    communications: '/communications?limit=200',
    messages: '/messages?limit=200',
    conversations: '/conversations?limit=200',
    emails: '/emails?limit=200',
    sms: '/sms?limit=200',
    notifications: '/notifications?limit=200',
    announcements: '/announcements?limit=200',
    'portal-announcements': '/portal-announcements?limit=200',
    'portal-messages': '/portal-messages?limit=200',

    // Applications & Status
    applications: '/applications?limit=200',
    'application-data': '/application-data?limit=200',
    prospects: '/prospects?limit=200',
    'tenant-status': '/tenant-status?limit=200',
    'tenant-portal': '/tenant-portal?limit=200',
    'tenant-portal-access': '/tenant-portal-access?limit=200',

    // Financial
    payments: '/payments?limit=200',
    charges: '/charges?limit=200',
    receipts: '/receipts?limit=200',
    invoices: '/invoices?limit=200',
    bills: '/bills?limit=200',
    expenses: '/expenses?limit=200',
    transactions: '/transactions?limit=200',
    credits: '/credits?limit=200',
    debits: '/debits?limit=200',
    'payment-methods': '/payment-methods?limit=200',
    statements: '/statements?limit=200',
    ledger: '/ledger?limit=200',
    'rent-roll': '/rent-roll?limit=200',

    // Violations & Issues
    violations: '/violations?limit=200',
    'lease-violations': '/lease-violations?limit=200',
    issues: '/issues?limit=200',
    complaints: '/complaints?limit=200',

    // Maintenance
    maintenance: '/maintenance?limit=200',
    'work-orders': '/work-orders?limit=200',
    'service-requests': '/service-requests?limit=200',

    // Documents
    documents: '/documents?limit=200',
    files: '/files?limit=200',
    attachments: '/attachments?limit=200',
    leases: '/lease-documents?limit=200',

    // Reports
    reports: '/reports?limit=200',
    'delinquency-report': '/delinquency-report?limit=200',
    'occupancy-report': '/occupancy-report?limit=200',
    'financial-report': '/financial-report?limit=200',

    // Accounting
    accounts: '/accounts?limit=200',
    'general-ledger': '/general-ledger?limit=200',
    'journal-entries': '/journal-entries?limit=200',
    'balance-sheet': '/balance-sheet?limit=200',
    'income-statement': '/income-statement?limit=200',
    'cash-flow': '/cash-flow?limit=200',

    // CRM Data
    contacts: '/contacts?limit=200',
    leads: '/leads?limit=200',
    'crm-data': '/crm-data?limit=200',
    'crm-activities': '/crm-activities?limit=200',
    'crm-notes': '/crm-notes?limit=200',
    'crm-tasks': '/crm-tasks?limit=200',
    'crm-pipeline': '/crm-pipeline?limit=200',
    interactions: '/interactions?limit=200',
    activities: '/activities?limit=200',
    notes: '/notes?limit=200',
    tasks: '/tasks?limit=200',
  };

  const archive = {
    timestamp: new Date().toISOString(),
    metadata: {
      purpose: 'Final comprehensive backup before API access expires',
      endpoints_tested: Object.keys(endpoints).length,
    },
    accessible: {},
    inaccessible: {},
    stats: {
      total: 0,
      accessible: 0,
      inaccessible: 0,
    },
  };

  console.log(`Testing ${Object.keys(endpoints).length} endpoints...\n`);

  for (const [name, endpoint] of Object.entries(endpoints)) {
    process.stdout.write(`${name.padEnd(30)} `);
    const data = await fetchEndpoint(endpoint);

    if (data.error) {
      archive.inaccessible[name] = {
        endpoint,
        error: data.error,
        details: data.details,
      };
      archive.stats.inaccessible++;
      console.log(`❌ ${data.error}`);
    } else if (data.data) {
      archive.accessible[name] = data;
      archive.stats.accessible++;
      archive.stats.total += data.data.length;
      console.log(`✅ ${data.data.length} records`);
    } else {
      archive.accessible[name] = data;
      archive.stats.accessible++;
      console.log(`✅ (structure)`);
    }
  }

  // Save archive
  const filename = `doorloop-final-archive-${new Date().toISOString().split('T')[0]}.json`;
  writeFileSync(filename, JSON.stringify(archive, null, 2));

  console.log('\n' + '='.repeat(80));
  console.log('📊 FINAL STATISTICS');
  console.log('='.repeat(80));
  console.log(`Total endpoints tested: ${Object.keys(endpoints).length}`);
  console.log(`Accessible: ${archive.stats.accessible}`);
  console.log(`Inaccessible: ${archive.stats.inaccessible}`);
  console.log(`Total records archived: ${archive.stats.total}`);
  console.log(`\n✅ Archive saved: ${filename}`);

  // Create summary
  let summary = `
DOORLOOP COMPREHENSIVE ARCHIVE - FINAL BACKUP
Generated: ${archive.timestamp}

ACCESSIBLE ENDPOINTS (${archive.stats.accessible}):
${Object.entries(archive.accessible).map(([name, data]) =>
  `  ${name}: ${data.data?.length || 'structure'} records`
).join('\n')}

INACCESSIBLE ENDPOINTS (${archive.stats.inaccessible}):
${Object.entries(archive.inaccessible).map(([name, info]) =>
  `  ${name}: ${info.error} - ${info.details}`
).join('\n')}

TOTAL RECORDS ARCHIVED: ${archive.stats.total}
ARCHIVE FILE: ${filename}
`;

  const summaryFile = filename.replace('.json', '-summary.txt');
  writeFileSync(summaryFile, summary);
  console.log(`✅ Summary saved: ${summaryFile}\n`);
  console.log(summary);
}

comprehensiveArchive().catch(console.error);
