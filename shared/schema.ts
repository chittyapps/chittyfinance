import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real, varchar, index, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

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

// User model with context awareness
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("user"),
  avatar: text("avatar"),
  replitAuthData: jsonb("replit_auth_data"),
  // Context awareness
  timezone: text("timezone").default("America/Los_Angeles"),
  locale: text("locale").default("en-US"),
  currency: text("currency").default("USD"),
  preferences: jsonb("preferences"), // UI preferences, notification settings, etc.
});

// Businesses/Properties - Multi-business support with jurisdiction awareness
export const businesses = pgTable("businesses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  parentId: integer("parent_id"), // For hierarchical businesses (e.g., portfolio > property)
  name: text("name").notNull(),
  type: text("type").notNull(), // 'portfolio', 'property', 'rental', 'commercial', etc.
  address: text("address"),
  // Jurisdiction awareness
  country: text("country").default("US"),
  state: text("state"), // State/province code
  city: text("city"),
  zipCode: text("zip_code"),
  jurisdiction: text("jurisdiction"), // Legal jurisdiction identifier
  taxRegion: text("tax_region"), // Tax authority region
  settings: jsonb("settings"), // Cascading settings (inherit from parent if null)
  metadata: jsonb("metadata"), // Flexible data (sq ft, units, purchase price, etc.)
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Tags - Flexible categorization system
export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  color: text("color"), // For UI display
  type: text("type"), // 'category', 'location', 'priority', etc.
});

// Entity Tags - Polymorphic tagging (transactions, tasks, properties)
export const entityTags = pgTable("entity_tags", {
  tagId: integer("tag_id").notNull().references(() => tags.id),
  entityType: text("entity_type").notNull(), // 'transaction', 'task', 'business'
  entityId: integer("entity_id").notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.tagId, table.entityType, table.entityId] })
}));

// AI Agent Templates - Specialized mini-agents
export const aiAgentTemplates = pgTable("ai_agent_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'cashflow', 'property_analysis', 'expense_optimizer', 'tax_planner'
  systemPrompt: text("system_prompt").notNull(),
  userPromptTemplate: text("user_prompt_template").notNull(), // Template with {{variables}}
  model: text("model").default("gpt-4o-mini"),
  temperature: real("temperature").default(0.7),
  parentId: integer("parent_id"), // For cascading templates
  active: boolean("active").default(true),
});

// Report Templates - For generating consistent reports
export const reportTemplates = pgTable("report_templates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id), // null = global template
  name: text("name").notNull(),
  type: text("type").notNull(), // 'cash_flow', 'property_performance', 'tax_summary'
  config: jsonb("config").notNull(), // Template configuration (metrics, filters, grouping)
  schedule: text("schedule"), // cron expression for automated reports
});

// Service Integrations (updated with business link)
export const integrations = pgTable("integrations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  businessId: integer("business_id").references(() => businesses.id), // Optional: link to specific business
  serviceType: text("service_type").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  connected: boolean("connected").default(false),
  credentials: jsonb("credentials"),
  lastSynced: timestamp("last_synced"),
});

// Financial Summary (updated with business link)
export const financialSummaries = pgTable("financial_summaries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  businessId: integer("business_id").references(() => businesses.id), // null = aggregate across all
  cashOnHand: real("cash_on_hand").notNull(),
  monthlyRevenue: real("monthly_revenue").notNull(),
  monthlyExpenses: real("monthly_expenses").notNull(),
  outstandingInvoices: real("outstanding_invoices").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Transactions (updated with business and tags)
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  businessId: integer("business_id").references(() => businesses.id),
  title: text("title").notNull(),
  description: text("description"),
  amount: real("amount").notNull(),
  type: text("type").notNull(), // 'income' or 'expense'
  category: text("category"), // 'rent', 'maintenance', 'utilities', etc.
  date: timestamp("date").defaultNow(),
  metadata: jsonb("metadata"), // Flexible data
});

// Tasks (updated with business and tags)
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  businessId: integer("business_id").references(() => businesses.id),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date"),
  priority: text("priority"), // 'urgent', 'due_soon', 'upcoming'
  completed: boolean("completed").default(false),
  completedAt: timestamp("completed_at"),
});

// AI Messages (updated with agent type)
export const aiMessages = pgTable("ai_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  agentType: text("agent_type"), // Which mini-agent generated this
  businessId: integer("business_id").references(() => businesses.id),
  content: text("content").notNull(),
  role: text("role").notNull(), // 'system', 'user', 'assistant'
  timestamp: timestamp("timestamp").defaultNow(),
});

// Jurisdiction Rules - Tax and regulatory rules by region
export const jurisdictionRules = pgTable("jurisdiction_rules", {
  id: serial("id").primaryKey(),
  region: text("region").notNull(), // e.g., "US-CA", "US-NY", "CA-ON"
  ruleType: text("rule_type").notNull(), // 'tax', 'regulation', 'compliance'
  name: text("name").notNull(),
  description: text("description"),
  config: jsonb("config").notNull(), // Rule configuration (tax rates, thresholds, formulas)
  effectiveDate: timestamp("effective_date"),
  expiryDate: timestamp("expiry_date"),
  active: boolean("active").default(true),
});

// Webhooks - External system connectivity
export const webhooks = pgTable("webhooks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  url: text("url").notNull(),
  events: text("events").array(), // Events to trigger on: ['transaction.created', 'task.completed']
  secret: text("secret"), // Webhook signing secret
  active: boolean("active").default(true),
  lastTriggered: timestamp("last_triggered"),
  createdAt: timestamp("created_at").defaultNow(),
});

// API Keys - For external connections
export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  key: text("key").notNull().unique(), // Hashed API key
  permissions: text("permissions").array(), // ['read:businesses', 'write:transactions']
  lastUsed: timestamp("last_used"),
  expiresAt: timestamp("expires_at"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations for better querying
export const businessesRelations = relations(businesses, ({ one, many }) => ({
  user: one(users, {
    fields: [businesses.userId],
    references: [users.id],
  }),
  parent: one(businesses, {
    fields: [businesses.parentId],
    references: [businesses.id],
  }),
  children: many(businesses),
  transactions: many(transactions),
  tasks: many(tasks),
  financialSummaries: many(financialSummaries),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertBusinessSchema = createInsertSchema(businesses).omit({ id: true, createdAt: true });
export const insertTagSchema = createInsertSchema(tags).omit({ id: true });
export const insertEntityTagSchema = createInsertSchema(entityTags);
export const insertAiAgentTemplateSchema = createInsertSchema(aiAgentTemplates).omit({ id: true });
export const insertReportTemplateSchema = createInsertSchema(reportTemplates).omit({ id: true });
export const insertIntegrationSchema = createInsertSchema(integrations).omit({ id: true, lastSynced: true });
export const insertFinancialSummarySchema = createInsertSchema(financialSummaries).omit({ id: true, updatedAt: true });
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, date: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, completedAt: true });
export const insertAiMessageSchema = createInsertSchema(aiMessages).omit({ id: true, timestamp: true });
export const insertJurisdictionRuleSchema = createInsertSchema(jurisdictionRules).omit({ id: true });
export const insertWebhookSchema = createInsertSchema(webhooks).omit({ id: true, createdAt: true, lastTriggered: true });
export const insertApiKeySchema = createInsertSchema(apiKeys).omit({ id: true, createdAt: true, lastUsed: true });

// Type definitions
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Business = typeof businesses.$inferSelect;
export type InsertBusiness = z.infer<typeof insertBusinessSchema>;

export type Tag = typeof tags.$inferSelect;
export type InsertTag = z.infer<typeof insertTagSchema>;

export type EntityTag = typeof entityTags.$inferSelect;
export type InsertEntityTag = z.infer<typeof insertEntityTagSchema>;

export type AiAgentTemplate = typeof aiAgentTemplates.$inferSelect;
export type InsertAiAgentTemplate = z.infer<typeof insertAiAgentTemplateSchema>;

export type ReportTemplate = typeof reportTemplates.$inferSelect;
export type InsertReportTemplate = z.infer<typeof insertReportTemplateSchema>;

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

export type JurisdictionRule = typeof jurisdictionRules.$inferSelect;
export type InsertJurisdictionRule = z.infer<typeof insertJurisdictionRuleSchema>;

export type Webhook = typeof webhooks.$inferSelect;
export type InsertWebhook = z.infer<typeof insertWebhookSchema>;

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
