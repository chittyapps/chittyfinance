#!/usr/bin/env node
/**
 * Fetch DoorLoop communications
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

  console.log(`Status: ${res.status}`);

  const text = await res.text();

  if (!res.ok) {
    return { error: `${res.status}`, response: text.substring(0, 500) };
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    return { error: 'Invalid JSON', response: text.substring(0, 500) };
  }
}

async function getCommunications() {
  console.log('📨 FETCHING DOORLOOP COMMUNICATIONS...\n');

  const data = await fetchDoorLoop('/communications?limit=200');

  if (data.error) {
    console.log(`❌ Error: ${data.error}`);
    console.log(`Response: ${data.response}\n`);
  } else if (data.data) {
    console.log(`✅ Found ${data.data.length} communications\n`);

    // Save to file
    const fs = await import('fs');
    const filename = 'doorloop-communications-2025-12-09.json';
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`Saved to: ${filename}\n`);

    // Show summary
    console.log('COMMUNICATIONS SUMMARY:');
    console.log('='.repeat(80));

    data.data.slice(0, 20).forEach((comm, idx) => {
      console.log(`\n${idx + 1}. ${comm.type || 'Unknown type'}`);
      console.log(`   Date: ${comm.date || comm.createdAt || 'N/A'}`);
      console.log(`   Subject: ${comm.subject || 'N/A'}`);
      console.log(`   From: ${comm.from || 'N/A'}`);
      console.log(`   To: ${comm.to || 'N/A'}`);

      if (comm.message || comm.body) {
        const message = (comm.message || comm.body).substring(0, 100);
        console.log(`   Message: ${message}...`);
      }
    });

    if (data.data.length > 20) {
      console.log(`\n... and ${data.data.length - 20} more communications`);
    }

    // Look for Alexis communications
    console.log('\n\n🔍 ALEXIS PHENG COMMUNICATIONS:');
    console.log('='.repeat(80));

    const alexisComms = data.data.filter(comm =>
      JSON.stringify(comm).toLowerCase().includes('alexis') ||
      JSON.stringify(comm).toLowerCase().includes('pheng') ||
      JSON.stringify(comm).toLowerCase().includes('acpheng')
    );

    if (alexisComms.length === 0) {
      console.log('❌ No communications found for Alexis Pheng');
    } else {
      console.log(`✅ Found ${alexisComms.length} communications\n`);
      alexisComms.forEach((comm, idx) => {
        console.log(`${idx + 1}. ${comm.type || 'Unknown'}`);
        console.log(`   Date: ${comm.date || comm.createdAt || 'N/A'}`);
        console.log(`   Subject: ${comm.subject || 'N/A'}`);
        if (comm.message || comm.body) {
          console.log(`   Message: ${(comm.message || comm.body).substring(0, 200)}`);
        }
        console.log('');
      });
    }

  } else {
    console.log('⚠️  Unexpected response format');
    console.log(JSON.stringify(data, null, 2));
  }
}

getCommunications().catch(console.error);
