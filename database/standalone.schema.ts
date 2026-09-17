import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// STANDALONE SCHEMA — SQLite, single-tenant

export const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  email: text("email"),
  username: text("username"),
  displayName: text("display_name"),
  role: text("role"),
});

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey(),
  name: text("name"),
  type: text("type"),
  balance: real("balance"),
});

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey(),
  accountId: integer("account_id"),
  amount: real("amount"),
  description: text("description"),
  occurredAt: text("occurred_at"),
});
