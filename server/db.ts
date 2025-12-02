import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';

// NOTE: For now the server still uses the legacy shared schema.
// We'll migrate routes/storage to the system/standalone schemas next.
import * as schema from '@shared/schema';

const MODE = process.env.MODE || 'standalone';

let db: any;
let pool: Pool | undefined;

if (MODE === 'system') {
  console.log('🔧 Database: Postgres (Neon) [system mode]');
  neonConfig.webSocketConstructor = ws;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL must be set. Did you forget to configure .env?');
  }
  pool = new Pool({ connectionString });
  db = drizzle({ client: pool, schema });
} else {
  // Standalone mode uses in-memory storage via server/storage.ts.
  // We still export a placeholder so imports succeed without crashing.
  console.log('🧪 Database: Standalone (in-memory storage)');
  db = {} as any;
}

export { db, schema, pool };
