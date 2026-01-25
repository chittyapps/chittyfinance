/**
 * Wave Setup Helper
 * Fetches your Business ID and lists accounts to find Anchor Account ID
 *
 * Usage:
 *   WAVE_ACCESS_TOKEN=xxx npx ts-node scripts/wave-setup.ts
 */

const WAVE_GRAPHQL_ENDPOINT = 'https://gql.waveapps.com/graphql/public';

async function graphql<T>(accessToken: string, query: string, variables?: Record<string, any>): Promise<T> {
  const response = await fetch(WAVE_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Wave API error: ${response.status} ${await response.text()}`);
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors, null, 2)}`);
  }

  return result.data;
}

async function main() {
  const accessToken = process.env.WAVE_ACCESS_TOKEN;

  if (!accessToken) {
    console.error('Error: WAVE_ACCESS_TOKEN environment variable required');
    console.log('\nUsage:');
    console.log('  WAVE_ACCESS_TOKEN=xxx npx ts-node scripts/wave-setup.ts');
    process.exit(1);
  }

  console.log('Fetching Wave businesses...\n');

  // Get businesses
  const businessData = await graphql<any>(accessToken, `
    query {
      user {
        businesses(page: 1, pageSize: 10) {
          edges {
            node {
              id
              name
              currency { code }
            }
          }
        }
      }
    }
  `);

  const businesses = businessData.user.businesses.edges.map((e: any) => e.node);

  if (businesses.length === 0) {
    console.log('No businesses found in Wave account.');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('BUSINESSES');
  console.log('='.repeat(60));

  for (const biz of businesses) {
    console.log(`\n  Name: ${biz.name}`);
    console.log(`  ID:   ${biz.id}  <-- Use this as WAVE_BUSINESS_ID`);
    console.log(`  Currency: ${biz.currency.code}`);
  }

  // Use first business to get accounts
  const businessId = businesses[0].id;

  console.log('\n' + '='.repeat(60));
  console.log(`BANK/CASH ACCOUNTS (for ${businesses[0].name})`);
  console.log('='.repeat(60));
  console.log('Pick one of these as your WAVE_ANCHOR_ACCOUNT_ID:\n');

  const accountData = await graphql<any>(accessToken, `
    query GetAccounts($businessId: ID!) {
      business(id: $businessId) {
        accounts(types: [ASSET], page: 1, pageSize: 50) {
          edges {
            node {
              id
              name
              subtype { name value }
              isArchived
            }
          }
        }
      }
    }
  `, { businessId });

  const accounts = accountData.business.accounts.edges
    .map((e: any) => e.node)
    .filter((a: any) => !a.isArchived);

  // Filter to bank/cash accounts
  const bankAccounts = accounts.filter((a: any) =>
    a.subtype?.value === 'CASH_AND_BANK' ||
    a.name.toLowerCase().includes('bank') ||
    a.name.toLowerCase().includes('checking') ||
    a.name.toLowerCase().includes('savings') ||
    a.name.toLowerCase().includes('cash')
  );

  for (const acct of bankAccounts) {
    console.log(`  ${acct.name}`);
    console.log(`    ID: ${acct.id}`);
    console.log('');
  }

  if (bankAccounts.length === 0) {
    console.log('  (No bank accounts found. Showing all asset accounts:)\n');
    for (const acct of accounts.slice(0, 10)) {
      console.log(`  ${acct.name} [${acct.subtype?.name || 'N/A'}]`);
      console.log(`    ID: ${acct.id}`);
      console.log('');
    }
  }

  console.log('='.repeat(60));
  console.log('NEXT STEPS');
  console.log('='.repeat(60));
  console.log(`
Add these to your .env or 1Password:

  WAVE_ACCESS_TOKEN=${accessToken.substring(0, 10)}...
  WAVE_BUSINESS_ID=${businessId}
  WAVE_ANCHOR_ACCOUNT_ID=<pick from above>

Then run:
  npx ts-node scripts/sync-turbotenant-wave.ts data/ledger.csv --dry-run
`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
