import { pgTable, serial, text, integer, boolean, timestamp, decimal } from "drizzle-orm/pg-core";

// SYSTEM SCHEMA — Postgres (Neon), multi-tenant

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  username: text("username").notNull(),
  displayName: text("display_name"),
  role: text("role"),
});

export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  parentId: integer("parent_id"),
});

export const tenantUsers = pgTable("tenant_users", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  userId: integer("user_id").notNull(),
  role: text("role").notNull(),
});

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  name: text("name"),
  type: text("type"),
  balance: decimal("balance", { precision: 12, scale: 2 }),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  accountId: integer("account_id"),
  amount: decimal("amount", { precision: 12, scale: 2 }),
  description: text("description"),
  occurredAt: timestamp("occurred_at"),
});
