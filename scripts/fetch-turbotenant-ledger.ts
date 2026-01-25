#!/usr/bin/env npx ts-node
/**
 * Fetch TurboTenant Ledger from Google Sheets
 *
 * Automatically downloads the general ledger CSV and runs analysis.
 *
 * Usage:
 *   npx ts-node scripts/fetch-turbotenant-ledger.ts [--analyze] [--output <file>]
 */

import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';

// Google Sheet ID from the URL
const SHEET_ID = '1mOMFTrsaxzoqCDVhWlGpseNla-s7--3Ehsg7wL_jvII';

// Different export URL formats to try
const EXPORT_URLS = [
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`,
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`,
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/pub?output=csv`,
];

interface FetchResult {
  success: boolean;
  data?: string;
  error?: string;
}

// Fetch with redirect following
function fetchUrl(url: string, maxRedirects = 5): Promise<FetchResult> {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ChittyFinance/1.0)',
        'Accept': 'text/csv,text/plain,*/*',
      },
    }, (response) => {
      // Handle redirects
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        if (maxRedirects <= 0) {
          resolve({ success: false, error: 'Too many redirects' });
          return;
        }
        const redirectUrl = response.headers.location.startsWith('http')
          ? response.headers.location
          : new URL(response.headers.location, url).toString();
        fetchUrl(redirectUrl, maxRedirects - 1).then(resolve);
        return;
      }

      // Check for success
      if (response.statusCode !== 200) {
        resolve({ success: false, error: `HTTP ${response.statusCode}` });
        return;
      }

      // Check content type
      const contentType = response.headers['content-type'] || '';
      if (contentType.includes('text/html')) {
        // Likely a login page or error page
        resolve({ success: false, error: 'Got HTML instead of CSV (auth required?)' });
        return;
      }

      // Collect data
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        // Validate it looks like CSV
        if (data.includes('<html') || data.includes('<!DOCTYPE')) {
          resolve({ success: false, error: 'Got HTML instead of CSV' });
          return;
        }
        resolve({ success: true, data });
      });
    });

    request.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    request.setTimeout(30000, () => {
      request.destroy();
      resolve({ success: false, error: 'Request timeout' });
    });
  });
}

async function fetchLedger(): Promise<string | null> {
  console.log('🔄 Attempting to fetch ledger from Google Sheets...\n');

  for (const url of EXPORT_URLS) {
    console.log(`   Trying: ${url.substring(0, 60)}...`);
    const result = await fetchUrl(url);

    if (result.success && result.data) {
      console.log(`   ✅ Success! Got ${result.data.length} bytes\n`);
      return result.data;
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
    }
  }

  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const outputIdx = args.indexOf('--output');
  const outputFile = outputIdx >= 0 ? args[outputIdx + 1] : null;
  const analyze = args.includes('--analyze');

  // Fetch the ledger
  const csvData = await fetchLedger();

  if (!csvData) {
    console.log('\n❌ Could not fetch ledger automatically.\n');
    console.log('The Google Sheet may require authentication. Options:\n');
    console.log('1. Make the sheet truly public:');
    console.log('   - Open: https://docs.google.com/spreadsheets/d/' + SHEET_ID);
    console.log('   - Click Share → "Anyone with the link" → Viewer\n');
    console.log('2. Download manually and run:');
    console.log('   npx ts-node scripts/import-turbotenant.ts <downloaded.csv> --analyze\n');
    console.log('3. Publish the sheet:');
    console.log('   - File → Share → Publish to web → CSV format');
    console.log('   - Then update EXPORT_URLS in this script with the published URL\n');
    process.exit(1);
  }

  // Save raw CSV
  const rawPath = outputFile || 'turbotenant-ledger.csv';
  fs.writeFileSync(rawPath, csvData);
  console.log(`📁 Saved raw CSV to: ${rawPath}`);

  // Show preview
  const lines = csvData.split('\n');
  console.log(`\n📊 Preview (${lines.length} rows):`);
  console.log('─'.repeat(80));
  for (const line of lines.slice(0, 5)) {
    console.log(line.substring(0, 100) + (line.length > 100 ? '...' : ''));
  }
  if (lines.length > 5) {
    console.log(`... and ${lines.length - 5} more rows`);
  }
  console.log('─'.repeat(80));

  // Run analysis if requested
  if (analyze) {
    console.log('\n🔄 Running analysis...\n');
    const { spawn } = await import('child_process');
    const child = spawn('npx', ['ts-node', 'scripts/import-turbotenant.ts', rawPath, '--analyze'], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    await new Promise<void>((resolve) => child.on('close', resolve));
  } else {
    console.log('\n💡 To analyze the ledger, run:');
    console.log(`   npx ts-node scripts/import-turbotenant.ts ${rawPath} --analyze`);
  }
}

main().catch(console.error);
