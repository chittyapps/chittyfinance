// Standalone schema for ChittyFinance
// Simplified single-tenant SQLite for local development

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Users (simplified - no multi-tenant)
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  name: text('name').notNull(),
  role: text('role').notNull().default('user'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const insertUserSchema = createInsertSchema(users);
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

// Accounts
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'checking', 'savings', 'credit'
  balance: real('balance').notNull().default(0),
  institution: text('institution'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const insertAccountSchema = createInsertSchema(accounts);
export type Account = typeof accounts.$inferSelect;
export type InsertAccount = z.infer<typeof insertAccountSchema>;

// Transactions
export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  accountId: text('account_id').notNull().references(() => accounts.id),
  amount: real('amount').notNull(),
  type: text('type').notNull(), // 'income', 'expense', 'transfer'
  category: text('category'),
  description: text('description').notNull(),
  date: integer('date', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const insertTransactionSchema = createInsertSchema(transactions);
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

// Properties (simplified)
export const properties = sqliteTable('properties', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  address: text('address').notNull(),
  monthlyRent: real('monthly_rent'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const insertPropertySchema = createInsertSchema(properties);
export type Property = typeof properties.$inferSelect;
export type InsertProperty = z.infer<typeof insertPropertySchema>;

// Tasks
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  description: text('description'),
  dueDate: integer('due_date', { mode: 'timestamp' }),
  priority: text('priority'),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const insertTaskSchema = createInsertSchema(tasks);
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

// Integrations
export const integrations = sqliteTable('integrations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  serviceType: text('service_type').notNull(),
  name: text('name').notNull(),
  connected: integer('connected', { mode: 'boolean' }).default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const insertIntegrationSchema = createInsertSchema(integrations);
export type Integration = typeof integrations.$inferSelect;
export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;
