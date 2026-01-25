// server/bootstrap.ts
import { config } from "dotenv";
config();

import Database from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";

import { neon } from "@neondatabase/serverless";
import { drizzle as drizzlePostgres } from "drizzle-orm/neon-http";

export const MODE = process.env.MODE ?? "standalone";

let db: any;

if (MODE === "system") {
  console.log("🔵 ChittyFinance DB: System Mode (Neon/Postgres)");
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set for system mode");
  }
  const sql = neon(process.env.DATABASE_URL);
  db = drizzlePostgres(sql); // backed by database/system.schema.ts
} else {
  console.log("🟢 ChittyFinance DB: Standalone Mode (SQLite)");
  const sqlite = new Database("./chittyfinance.db");
  db = drizzleSqlite(sqlite); // backed by shared/standalone.schema.ts
}

export { db };
