import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real, varchar, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User model - keep the existing structure
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("user"),
  avatar: text("avatar"),
  
  // Store Replit Auth information in JSON for now
  // This avoids altering the table structure
  replitAuthData: jsonb("replit_auth_data"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  displayName: true,
  email: true,
  role: true,
  avatar: true,
  replitAuthData: true,
});

// Service Integrations
export const integrations = pgTable("integrations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  serviceType: text("service_type").notNull(), // 'mercury_bank', 'wave_accounting', 'ms365', etc.
  name: text("name").notNull(),
  description: text("description"),
  connected: boolean("connected").default(false),
  credentials: jsonb("credentials"),
  lastSynced: timestamp("last_synced"),
});

export const insertIntegrationSchema = createInsertSchema(integrations).pick({
  userId: true,
  serviceType: true,
  name: true,
  description: true,
  connected: true,
  credentials: true,
  lastSynced: true,
});

// Financial Summary
export const financialSummaries = pgTable("financial_summaries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  cashOnHand: real("cash_on_hand").notNull(),
  monthlyRevenue: real("monthly_revenue").notNull(),
  monthlyExpenses: real("monthly_expenses").notNull(),
  outstandingInvoices: real("outstanding_invoices").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFinancialSummarySchema = createInsertSchema(financialSummaries).pick({
  userId: true,
  cashOnHand: true,
  monthlyRevenue: true,
  monthlyExpenses: true,
  outstandingInvoices: true,
});

// Transactions
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  amount: real("amount").notNull(),
  type: text("type").notNull(), // 'income' or 'expense'
  date: timestamp("date").defaultNow(),
});

export const insertTransactionSchema = createInsertSchema(transactions).pick({
  userId: true,
  title: true,
  description: true,
  amount: true,
  type: true,
  date: true,
});

// Financial Tasks
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date"),
  priority: text("priority"), // 'urgent', 'due_soon', 'upcoming'
  completed: boolean("completed").default(false),
});

export const insertTaskSchema = createInsertSchema(tasks).pick({
  userId: true,
  title: true,
  description: true,
  dueDate: true,
  priority: true,
  completed: true,
});

// AI Assistant Messages
export const aiMessages = pgTable("ai_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  role: text("role").notNull(), // 'system', 'user', 'assistant'
  timestamp: timestamp("timestamp").defaultNow(),
});

export const insertAiMessageSchema = createInsertSchema(aiMessages).pick({
  userId: true,
  content: true,
  role: true,
});

// Type definitions
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Integration = typeof integrations.$inferSelect;
export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;

export type FinancialSummary = typeof financialSummaries.$inferSelect;
export type InsertFinancialSummary = z.infer<typeof insertFinancialSummarySchema>;

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

export type AiMessage = typeof aiMessages.$inferSelect;
export type InsertAiMessage = z.infer<typeof insertAiMessageSchema>;
