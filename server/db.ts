import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { drizzle as drizzleSQLite } from "drizzle-orm/better-sqlite3";
import { Pool } from "pg";
import Database from "better-sqlite3";

import * as systemSchema from "../database/system.schema";
import * as standaloneSchema from "../database/standalone.schema";

const MODE = process.env.MODE || "standalone";

let db;
let schema;

if (MODE === "system") {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  db = drizzlePostgres(pool, { schema: systemSchema });
  schema = systemSchema;
  console.log("🟢 ChittyFinance DB: System Mode (Postgres/Neon)");
} else {
  const sqlite = new Database("./chittyfinance.db");
  db = drizzleSQLite(sqlite, { schema: standaloneSchema });
  schema = standaloneSchema;
  console.log("🟢 ChittyFinance DB: Standalone Mode (SQLite)");
}

export { db, schema };
