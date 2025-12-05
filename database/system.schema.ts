// System schema for ChittyFinance
// Multi-tenant architecture for IT CAN BE LLC business structure
// Uses Neon PostgreSQL with decimal precision for accounting

import { pgTable, uuid, text, timestamp, decimal, boolean, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Tenants represent legal entities (LLCs, properties, etc.)
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  type: text('type').notNull(), // 'holding', 'series', 'property', 'management', 'personal'
  parentId: uuid('parent_id').references((): any => tenants.id), // For LLC hierarchy
  taxId: text('tax_id'), // EIN or SSN
  metadata: jsonb('metadata'), // Legal documents, addresses, etc.
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  slugIdx: index('tenants_slug_idx').on(table.slug),
  parentIdx: index('tenants_parent_idx').on(table.parentId),
}));

export const insertTenantSchema = createInsertSchema(tenants);
export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;

// Users with access to one or more tenants
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  chittyId: text('chitty_id').unique(), // ChittyID DID (future integration)
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  name: text('name').notNull(),
  role: text('role').notNull().default('user'), // 'admin', 'manager', 'accountant', 'user'
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  emailIdx: index('users_email_idx').on(table.email),
  chittyIdIdx: index('users_chitty_id_idx').on(table.chittyId),
}));

export const insertUserSchema = createInsertSchema(users);
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

// User access to tenants with specific permissions
export const tenantUsers = pgTable('tenant_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  role: text('role').notNull().default('viewer'), // 'owner', 'admin', 'manager', 'viewer'
  permissions: jsonb('permissions'), // Granular permissions
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  tenantUserIdx: index('tenant_users_tenant_user_idx').on(table.tenantId, table.userId),
}));

export const insertTenantUserSchema = createInsertSchema(tenantUsers);
export type TenantUser = typeof tenantUsers.$inferSelect;
export type InsertTenantUser = z.infer<typeof insertTenantUserSchema>;

// Financial accounts (bank accounts, credit cards, etc.)
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'checking', 'savings', 'credit', 'investment'
  institution: text('institution'), // 'Mercury Bank', 'Wave', etc.
  accountNumber: text('account_number'), // Last 4 digits only
  balance: decimal('balance', { precision: 12, scale: 2 }).notNull().default('0'),
  currency: text('currency').notNull().default('USD'),
  externalId: text('external_id'), // For Mercury/Wave API integration
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index('accounts_tenant_idx').on(table.tenantId),
  externalIdx: index('accounts_external_idx').on(table.externalId),
}));

export const insertAccountSchema = createInsertSchema(accounts);
export type Account = typeof accounts.$inferSelect;
export type InsertAccount = z.infer<typeof insertAccountSchema>;

// Transactions (income, expenses, transfers)
export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  type: text('type').notNull(), // 'income', 'expense', 'transfer'
  category: text('category'), // 'rent', 'maintenance', 'utilities', 'management_fee', etc.
  description: text('description').notNull(),
  date: timestamp('date').notNull(),
  payee: text('payee'),
  propertyId: uuid('property_id'), // Links to properties table
  unitId: uuid('unit_id'), // Links to units table
  externalId: text('external_id'), // For bank/Wave API sync
  reconciled: boolean('reconciled').notNull().default(false),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index('transactions_tenant_idx').on(table.tenantId),
  accountIdx: index('transactions_account_idx').on(table.accountId),
  dateIdx: index('transactions_date_idx').on(table.date),
  propertyIdx: index('transactions_property_idx').on(table.propertyId),
}));

export const insertTransactionSchema = createInsertSchema(transactions);
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

// Inter-company transactions (between tenants)
export const intercompanyTransactions = pgTable('intercompany_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromTenantId: uuid('from_tenant_id').notNull().references(() => tenants.id),
  toTenantId: uuid('to_tenant_id').notNull().references(() => tenants.id),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  description: text('description').notNull(),
  date: timestamp('date').notNull(),
  fromTransactionId: uuid('from_transaction_id').references(() => transactions.id),
  toTransactionId: uuid('to_transaction_id').references(() => transactions.id),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  fromTenantIdx: index('intercompany_from_tenant_idx').on(table.fromTenantId),
  toTenantIdx: index('intercompany_to_tenant_idx').on(table.toTenantId),
}));

export const insertIntercompanyTransactionSchema = createInsertSchema(intercompanyTransactions);
export type IntercompanyTransaction = typeof intercompanyTransactions.$inferSelect;
export type InsertIntercompanyTransaction = z.infer<typeof insertIntercompanyTransactionSchema>;

// Properties (real estate assets)
export const properties = pgTable('properties', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  state: text('state').notNull(),
  zip: text('zip').notNull(),
  country: text('country').notNull().default('USA'),
  propertyType: text('property_type').notNull(), // 'condo', 'apartment', 'house', 'commercial'
  purchasePrice: decimal('purchase_price', { precision: 12, scale: 2 }),
  purchaseDate: timestamp('purchase_date'),
  currentValue: decimal('current_value', { precision: 12, scale: 2 }),
  metadata: jsonb('metadata'), // Photos, documents, etc.
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index('properties_tenant_idx').on(table.tenantId),
}));

export const insertPropertySchema = createInsertSchema(properties);
export type Property = typeof properties.$inferSelect;
export type InsertProperty = z.infer<typeof insertPropertySchema>;

// Rental Units (if property has multiple units)
export const units = pgTable('units', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id').notNull().references(() => properties.id),
  unitNumber: text('unit_number'),
  bedrooms: integer('bedrooms'),
  bathrooms: decimal('bathrooms', { precision: 3, scale: 1 }),
  squareFeet: integer('square_feet'),
  monthlyRent: decimal('monthly_rent', { precision: 12, scale: 2 }),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  propertyIdx: index('units_property_idx').on(table.propertyId),
}));

export const insertUnitSchema = createInsertSchema(units);
export type Unit = typeof units.$inferSelect;
export type InsertUnit = z.infer<typeof insertUnitSchema>;

// Leases
export const leases = pgTable('leases', {
  id: uuid('id').primaryKey().defaultRandom(),
  unitId: uuid('unit_id').notNull().references(() => units.id),
  tenantName: text('tenant_name').notNull(),
  tenantEmail: text('tenant_email'),
  tenantPhone: text('tenant_phone'),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  monthlyRent: decimal('monthly_rent', { precision: 12, scale: 2 }).notNull(),
  securityDeposit: decimal('security_deposit', { precision: 12, scale: 2 }),
  status: text('status').notNull().default('active'), // 'active', 'expired', 'terminated'
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  unitIdx: index('leases_unit_idx').on(table.unitId),
  statusIdx: index('leases_status_idx').on(table.status),
}));

export const insertLeaseSchema = createInsertSchema(leases);
export type Lease = typeof leases.$inferSelect;
export type InsertLease = z.infer<typeof insertLeaseSchema>;

// Service Integrations (Mercury, Wave, Stripe, etc.)
export const integrations = pgTable('integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  serviceType: text('service_type').notNull(), // 'mercury_bank', 'wave_accounting', 'stripe', etc.
  name: text('name').notNull(),
  description: text('description'),
  connected: boolean('connected').default(false),
  credentials: jsonb('credentials'), // Encrypted API keys, tokens
  lastSynced: timestamp('last_synced'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index('integrations_tenant_idx').on(table.tenantId),
}));

export const insertIntegrationSchema = createInsertSchema(integrations);
export type Integration = typeof integrations.$inferSelect;
export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;

// Financial Tasks
export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').references(() => users.id),
  title: text('title').notNull(),
  description: text('description'),
  dueDate: timestamp('due_date'),
  priority: text('priority'), // 'urgent', 'high', 'medium', 'low'
  status: text('status').notNull().default('pending'), // 'pending', 'in_progress', 'completed'
  relatedTo: text('related_to'), // 'property', 'transaction', 'lease', etc.
  relatedId: uuid('related_id'),
  completed: boolean('completed').default(false),
  completedAt: timestamp('completed_at'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index('tasks_tenant_idx').on(table.tenantId),
  userIdx: index('tasks_user_idx').on(table.userId),
}));

export const insertTaskSchema = createInsertSchema(tasks);
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

// AI Messages (financial advice conversations)
export const aiMessages = pgTable('ai_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  role: text('role').notNull(), // 'system', 'user', 'assistant'
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index('ai_messages_tenant_idx').on(table.tenantId),
  userIdx: index('ai_messages_user_idx').on(table.userId),
}));

export const insertAiMessageSchema = createInsertSchema(aiMessages);
export type AiMessage = typeof aiMessages.$inferSelect;
export type InsertAiMessage = z.infer<typeof insertAiMessageSchema>;
