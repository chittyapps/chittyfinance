// System schema for ChittyFinance
// Multi-tenant architecture for IT CAN BE LLC business structure
// Uses Neon PostgreSQL with decimal precision for accounting

import { pgTable, uuid, text, timestamp, decimal, boolean, integer, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
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

// Chart of Accounts (database-backed, tenant-customizable)
// Global accounts have NULL tenant_id; tenant-specific accounts override or extend
export const chartOfAccounts = pgTable('chart_of_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id), // NULL = global default
  code: text('code').notNull(), // e.g. '5070'
  name: text('name').notNull(), // e.g. 'Repairs'
  type: text('type').notNull(), // 'asset', 'liability', 'equity', 'income', 'expense'
  subtype: text('subtype'), // 'cash', 'receivable', 'fixed', 'contra', 'current', 'long-term', 'capital', 'suspense', 'non-deductible'
  description: text('description'),
  scheduleELine: text('schedule_e_line'), // IRS Schedule E line reference
  taxDeductible: boolean('tax_deductible').notNull().default(false),
  parentCode: text('parent_code'), // for hierarchical grouping (e.g. '5100' parent of '5110')
  isActive: boolean('is_active').notNull().default(true),
  effectiveDate: timestamp('effective_date'), // when this account definition became active
  modifiedBy: text('modified_by'), // L4 auditor who last changed this (user ID or agent session ID)
  metadata: jsonb('metadata'), // additional config (keywords, aliases, etc.)
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index('coa_tenant_idx').on(table.tenantId),
  codeIdx: index('coa_code_idx').on(table.code),
  typeIdx: index('coa_type_idx').on(table.type),
  // Unique code per tenant (tenant-specific accounts)
  tenantCodeIdx: uniqueIndex('coa_tenant_code_idx').on(table.tenantId, table.code),
  // Unique code for global accounts (WHERE tenant_id IS NULL)
  // Drizzle doesn't support partial indexes directly, so we use the composite above
  // and enforce global uniqueness via application logic + seed script
}));

export const insertChartOfAccountsSchema = createInsertSchema(chartOfAccounts);
export type ChartOfAccount = typeof chartOfAccounts.$inferSelect;
export type InsertChartOfAccount = z.infer<typeof insertChartOfAccountsSchema>;

// Financial accounts (bank accounts, credit cards, etc.)
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'checking', 'savings', 'credit', 'investment', 'mortgage', 'loan', 'tax_liability'
  institution: text('institution'), // 'Mercury Bank', 'Wave', etc.
  accountNumber: text('account_number'), // Last 4 digits only
  balance: decimal('balance', { precision: 12, scale: 2 }).notNull().default('0'),
  currency: text('currency').notNull().default('USD'),
  externalId: text('external_id'), // For Mercury/Wave API integration
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata'),
  // Liability-specific details (nullable — only populated for liability account types)
  // mortgage: {interestRate, escrowBalance, payoffAmount, maturityDate, lender, monthlyPayment}
  // tax_liability: {taxYear, pin, installments: [{number, amount, dueDate, status}], exemptions}
  // loan: {interestRate, principal, payoffAmount, maturityDate, lender, monthlyPayment}
  liabilityDetails: jsonb('liability_details'),
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
  currency: text('currency').notNull().default('USD'), // ISO 4217: USD, COP, etc.
  type: text('type').notNull(), // 'income', 'expense', 'transfer'
  category: text('category'), // 'rent', 'maintenance', 'utilities', 'management_fee', etc.
  description: text('description').notNull(),
  date: timestamp('date').notNull(),
  payee: text('payee'),
  propertyId: uuid('property_id').references(() => properties.id), // Links to properties table
  unitId: uuid('unit_id').references(() => units.id), // Links to units table
  externalId: text('external_id'), // For bank/Wave API sync
  // COA classification (trust-path governed)
  coaCode: text('coa_code'), // authoritative classification (L2+ can write)
  suggestedCoaCode: text('suggested_coa_code'), // AI/keyword proposal (L1 writes, L3 reviews)
  classificationConfidence: decimal('classification_confidence', { precision: 4, scale: 3 }), // 0.000-1.000
  classifiedBy: text('classified_by'), // who/what set coa_code: user UUID, agent session ID, or 'auto'
  classifiedAt: timestamp('classified_at'), // when coa_code was set
  reconciled: boolean('reconciled').notNull().default(false),
  reconciledBy: text('reconciled_by'), // L3 auditor who locked this transaction
  reconciledAt: timestamp('reconciled_at'), // when reconciliation happened
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index('transactions_tenant_idx').on(table.tenantId),
  accountIdx: index('transactions_account_idx').on(table.accountId),
  dateIdx: index('transactions_date_idx').on(table.date),
  propertyIdx: index('transactions_property_idx').on(table.propertyId),
  coaIdx: index('transactions_coa_idx').on(table.tenantId, table.coaCode),
  unclassifiedIdx: index('transactions_unclassified_idx').on(table.tenantId, table.coaCode),
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
  currency: text('currency').notNull().default('USD'), // ISO 4217: USD, COP, etc.
  exchangeRate: decimal('exchange_rate', { precision: 12, scale: 6 }), // Multiply: amount * exchangeRate = USD equivalent (e.g., 100 COP * 0.000244 = 0.0244 USD)
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

// Allocation rules (automated inter-company allocation configuration)
export const allocationRules = pgTable('allocation_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  ruleType: text('rule_type').notNull(), // 'management_fee', 'cost_sharing', 'rent_passthrough', 'custom_pct'
  sourceTenantId: uuid('source_tenant_id').notNull().references(() => tenants.id),
  targetTenantId: uuid('target_tenant_id').notNull().references(() => tenants.id),
  percentage: decimal('percentage', { precision: 5, scale: 2 }), // e.g. 10.00 for 10% management fee
  fixedAmount: decimal('fixed_amount', { precision: 12, scale: 2 }), // flat fee alternative
  frequency: text('frequency').notNull().default('monthly'), // 'monthly', 'quarterly', 'annually', 'per_transaction'
  sourceCategory: text('source_category'), // filter: only allocate from this tx category
  allocationMethod: text('allocation_method').notNull().default('percentage'), // 'percentage', 'fixed', 'remainder'
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata'), // additional config (e.g. cap amounts, minimum thresholds)
  lastRunAt: timestamp('last_run_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  sourceTenantIdx: index('allocation_rules_source_tenant_idx').on(table.sourceTenantId),
  targetTenantIdx: index('allocation_rules_target_tenant_idx').on(table.targetTenantId),
  ruleTypeIdx: index('allocation_rules_type_idx').on(table.ruleType),
}));

export const insertAllocationRuleSchema = createInsertSchema(allocationRules);
export type AllocationRule = typeof allocationRules.$inferSelect;
export type InsertAllocationRule = z.infer<typeof insertAllocationRuleSchema>;

// Allocation run log (audit trail for each allocation execution)
export const allocationRuns = pgTable('allocation_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  ruleId: uuid('rule_id').notNull().references(() => allocationRules.id),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  sourceAmount: decimal('source_amount', { precision: 12, scale: 2 }).notNull(),
  allocatedAmount: decimal('allocated_amount', { precision: 12, scale: 2 }).notNull(),
  transactionCount: integer('transaction_count').notNull().default(0),
  intercompanyTransactionId: uuid('intercompany_transaction_id').references(() => intercompanyTransactions.id),
  status: text('status').notNull().default('pending'), // 'pending', 'approved', 'posted', 'reversed'
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  ruleIdx: index('allocation_runs_rule_idx').on(table.ruleId),
  periodIdx: index('allocation_runs_period_idx').on(table.periodStart, table.periodEnd),
  statusIdx: index('allocation_runs_status_idx').on(table.status),
}));

export const insertAllocationRunSchema = createInsertSchema(allocationRuns);
export type AllocationRun = typeof allocationRuns.$inferSelect;
export type InsertAllocationRun = z.infer<typeof insertAllocationRunSchema>;

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
  purchaseCurrency: text('purchase_currency').notNull().default('USD'), // ISO 4217
  purchaseDate: timestamp('purchase_date'),
  currentValue: decimal('current_value', { precision: 12, scale: 2 }),
  currentValueCurrency: text('current_value_currency').notNull().default('USD'), // ISO 4217
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
  rentCurrency: text('rent_currency').notNull().default('USD'), // ISO 4217
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
  currency: text('currency').notNull().default('USD'), // ISO 4217: USD, COP, etc.
  securityDeposit: decimal('security_deposit', { precision: 12, scale: 2 }), // Same currency as lease.currency
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

// Property Valuations (cached external AVM estimates)
export const propertyValuations = pgTable('property_valuations', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id').notNull().references(() => properties.id),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  source: text('source').notNull(), // 'zillow', 'redfin', 'housecanary', 'attom', 'county', 'manual'
  estimate: decimal('estimate', { precision: 12, scale: 2 }),
  low: decimal('low', { precision: 12, scale: 2 }),
  high: decimal('high', { precision: 12, scale: 2 }),
  rentalEstimate: decimal('rental_estimate', { precision: 12, scale: 2 }),
  confidence: decimal('confidence', { precision: 4, scale: 3 }), // 0.000-1.000
  details: jsonb('details'), // Provider-specific data (zestimate details, comps, etc.)
  fetchedAt: timestamp('fetched_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  propertyIdx: index('property_valuations_property_idx').on(table.propertyId),
  tenantIdx: index('property_valuations_tenant_idx').on(table.tenantId),
  sourceIdx: index('property_valuations_source_idx').on(table.source),
  propertySourceIdx: uniqueIndex('property_valuations_property_source_idx').on(table.propertyId, table.source),
}));

export const insertPropertyValuationSchema = createInsertSchema(propertyValuations);
export type PropertyValuation = typeof propertyValuations.$inferSelect;
export type InsertPropertyValuation = z.infer<typeof insertPropertyValuationSchema>;

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

// Communication log (SMS/email sent to tenants)
export const commsLog = pgTable('comms_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  propertyId: uuid('property_id').references(() => properties.id),
  recipientName: text('recipient_name').notNull(),
  recipientContact: text('recipient_contact').notNull(), // phone or email
  channel: text('channel').notNull(), // 'sms', 'email'
  template: text('template'), // template name, if used
  body: text('body').notNull(),
  status: text('status').notNull().default('sent'), // 'sent', 'delivered', 'failed'
  sentAt: timestamp('sent_at').notNull().defaultNow(),
  metadata: jsonb('metadata'),
}, (table) => ({
  tenantIdx: index('comms_log_tenant_idx').on(table.tenantId),
  propertyIdx: index('comms_log_property_idx').on(table.propertyId),
  channelIdx: index('comms_log_channel_idx').on(table.channel),
}));

export const insertCommsLogSchema = createInsertSchema(commsLog);
export type CommsLog = typeof commsLog.$inferSelect;
export type InsertCommsLog = z.infer<typeof insertCommsLogSchema>;

// Approval workflows (maintenance requests, expense approvals, vendor management)
export const workflows = pgTable('workflows', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  propertyId: uuid('property_id').references(() => properties.id),
  type: text('type').notNull(), // 'maintenance_request', 'expense_approval', 'vendor_dispatch'
  title: text('title').notNull(),
  description: text('description'),
  requestor: text('requestor'), // name or userId
  costEstimate: decimal('cost_estimate', { precision: 12, scale: 2 }),
  costCurrency: text('cost_currency').notNull().default('USD'), // ISO 4217
  status: text('status').notNull().default('requested'), // 'requested', 'approved', 'in_progress', 'completed', 'rejected'
  metadata: jsonb('metadata'), // approvedBy, approvedAt, completedAt, vendor info, etc.
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index('workflows_tenant_idx').on(table.tenantId),
  propertyIdx: index('workflows_property_idx').on(table.propertyId),
  statusIdx: index('workflows_status_idx').on(table.status),
}));

export const insertWorkflowSchema = createInsertSchema(workflows);
export type Workflow = typeof workflows.$inferSelect;
export type InsertWorkflow = z.infer<typeof insertWorkflowSchema>;

// Classification audit trail (tracks every COA code change on a transaction)
// Enforces maker/checker: L2 classifies, L3 reconciles — same session can't do both
export const classificationAudit = pgTable('classification_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id), // denormalized for tenant-scoped queries
  previousCoaCode: text('previous_coa_code'), // NULL on first classification
  newCoaCode: text('new_coa_code').notNull(),
  action: text('action').notNull(), // 'classify', 'reclassify', 'reconcile', 'override'
  trustLevel: text('trust_level').notNull(), // 'L0', 'L1', 'L2', 'L3', 'L4'
  actorId: text('actor_id').notNull(), // user UUID, agent session ID, or 'auto'
  actorType: text('actor_type').notNull(), // 'user', 'agent', 'system'
  confidence: decimal('confidence', { precision: 4, scale: 3 }), // 0.000-1.000 at time of action
  reason: text('reason'), // why the change was made (correction reason, AI explanation, etc.)
  metadata: jsonb('metadata'), // session context, model used, etc.
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  transactionIdx: index('classification_audit_transaction_idx').on(table.transactionId),
  tenantIdx: index('classification_audit_tenant_idx').on(table.tenantId),
  actorIdx: index('classification_audit_actor_idx').on(table.actorId),
  trustLevelIdx: index('classification_audit_trust_level_idx').on(table.trustLevel),
}));

export const insertClassificationAuditSchema = createInsertSchema(classificationAudit);
export type ClassificationAudit = typeof classificationAudit.$inferSelect;
export type InsertClassificationAudit = z.infer<typeof insertClassificationAuditSchema>;
