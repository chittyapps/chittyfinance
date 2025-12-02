#!/usr/bin/env node
// Mode detection script for ChittyFinance
// Determines whether to run in standalone or system mode

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function detectMode() {
  // Check if MODE is explicitly set
  if (process.env.MODE) {
    console.log(`✅ Mode explicitly set: ${process.env.MODE}`);
    return process.env.MODE;
  }

  // Check for system mode indicators
  const hasSystemDatabase = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('neon');
  const hasChittyIdToken = !!process.env.CHITTY_ID_SERVICE_TOKEN;
  const hasSystemConfig = fs.existsSync(path.join(__dirname, '../deploy/system-wrangler.toml'));

  if (hasSystemDatabase || hasChittyIdToken || hasSystemConfig) {
    console.log('🔧 Auto-detected: SYSTEM mode (ChittyOS integration)');
    return 'system';
  }

  // Default to standalone
  console.log('🔧 Auto-detected: STANDALONE mode (local development)');
  return 'standalone';
}

const mode = detectMode();

// Write detected mode to environment
console.log(`\n📝 Running in ${mode.toUpperCase()} mode`);
console.log(`   To override, set MODE=${mode === 'system' ? 'standalone' : 'system'}\n`);

// Set npm script to run
process.env.npm_lifecycle_event = `dev:${mode}`;

export { detectMode };
