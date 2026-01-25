import { defineConfig } from 'drizzle-kit';

const sqliteFile = process.env.SQLITE_FILE || './chittyfinance.db';

export default defineConfig({
  out: './migrations/standalone',
  schema: './database/standalone.schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: sqliteFile,
  },
});
