import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  decimal,
  integer,
  pgEnum,
  boolean,
  uuid
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Loan status enum
export const loanStatusEnum = pgEnum('loan_status', [
  'pending',
  'active',
  'completed',
  'defaulted',
  'cancelled'
]);

// Payment status enum
export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'completed',
  'late',
  'missed',
  'early'
]);

// Timeline event type enum
export const timelineEventTypeEnum = pgEnum('timeline_event_type', [
  'loan_created',
  'payment_made',
  'payment_missed',
  'communication',
  'document_added',
  'rate_changed',
  'terms_amended',
  'loan_completed',
  'dispute_opened',
  'dispute_resolved'
]);

// Loans table
export const loans = pgTable("loans", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  lenderId: varchar("lender_id").notNull().references(() => users.id),
  borrowerId: varchar("borrower_id").notNull().references(() => users.id),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  interestRate: decimal("interest_rate", { precision: 5, scale: 3 }).notNull(),
  termMonths: integer("term_months").notNull(),
  monthlyPayment: decimal("monthly_payment", { precision: 12, scale: 2 }).notNull(),
  remainingBalance: decimal("remaining_balance", { precision: 12, scale: 2 }).notNull(),
  status: loanStatusEnum("status").default('pending').notNull(),
  purpose: text("purpose"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  nextPaymentDate: timestamp("next_payment_date"),
  earlyPaymentBonus: decimal("early_payment_bonus", { precision: 5, scale: 2 }).default('0'),
  latePaymentPenalty: decimal("late_payment_penalty", { precision: 5, scale: 2 }).default('0'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Payments table
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  loanId: uuid("loan_id").notNull().references(() => loans.id),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  scheduledDate: timestamp("scheduled_date").notNull(),
  paidDate: timestamp("paid_date"),
  status: paymentStatusEnum("status").default('pending').notNull(),
  principalAmount: decimal("principal_amount", { precision: 12, scale: 2 }).notNull(),
  interestAmount: decimal("interest_amount", { precision: 12, scale: 2 }).notNull(),
  bonusAmount: decimal("bonus_amount", { precision: 12, scale: 2 }).default('0'),
  penaltyAmount: decimal("penalty_amount", { precision: 12, scale: 2 }).default('0'),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Timeline events table
export const timelineEvents = pgTable("timeline_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  loanId: uuid("loan_id").notNull().references(() => loans.id),
  type: timelineEventTypeEnum("type").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  metadata: jsonb("metadata"), // For storing additional event data
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
});

// Communications table
export const communications = pgTable("communications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  loanId: uuid("loan_id").notNull().references(() => loans.id),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  receiverId: varchar("receiver_id").notNull().references(() => users.id),
  subject: varchar("subject", { length: 255 }),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Documents table
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  loanId: uuid("loan_id").notNull().references(() => loans.id),
  title: varchar("title", { length: 255 }).notNull(),
  type: varchar("type", { length: 100 }).notNull(), // agreement, receipt, amendment, etc.
  fileUrl: varchar("file_url"),
  uploadedBy: varchar("uploaded_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  loansAsLender: many(loans, { relationName: "lender" }),
  loansAsBorrower: many(loans, { relationName: "borrower" }),
  sentCommunications: many(communications, { relationName: "sender" }),
  receivedCommunications: many(communications, { relationName: "receiver" }),
  uploadedDocuments: many(documents),
  createdEvents: many(timelineEvents),
}));

export const loansRelations = relations(loans, ({ one, many }) => ({
  lender: one(users, {
    fields: [loans.lenderId],
    references: [users.id],
    relationName: "lender",
  }),
  borrower: one(users, {
    fields: [loans.borrowerId],
    references: [users.id],
    relationName: "borrower",
  }),
  payments: many(payments),
  timelineEvents: many(timelineEvents),
  communications: many(communications),
  documents: many(documents),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  loan: one(loans, {
    fields: [payments.loanId],
    references: [loans.id],
  }),
}));

export const timelineEventsRelations = relations(timelineEvents, ({ one }) => ({
  loan: one(loans, {
    fields: [timelineEvents.loanId],
    references: [loans.id],
  }),
  createdByUser: one(users, {
    fields: [timelineEvents.createdBy],
    references: [users.id],
  }),
}));

export const communicationsRelations = relations(communications, ({ one }) => ({
  loan: one(loans, {
    fields: [communications.loanId],
    references: [loans.id],
  }),
  sender: one(users, {
    fields: [communications.senderId],
    references: [users.id],
    relationName: "sender",
  }),
  receiver: one(users, {
    fields: [communications.receiverId],
    references: [users.id],
    relationName: "receiver",
  }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  loan: one(loans, {
    fields: [documents.loanId],
    references: [loans.id],
  }),
  uploadedByUser: one(users, {
    fields: [documents.uploadedBy],
    references: [users.id],
  }),
}));

// Zod schemas for validation
export const insertLoanSchema = createInsertSchema(loans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  remainingBalance: true,
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
});

export const insertTimelineEventSchema = createInsertSchema(timelineEvents).omit({
  id: true,
  createdAt: true,
});

export const insertCommunicationSchema = createInsertSchema(communications).omit({
  id: true,
  createdAt: true,
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  createdAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertLoan = z.infer<typeof insertLoanSchema>;
export type Loan = typeof loans.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertTimelineEvent = z.infer<typeof insertTimelineEventSchema>;
export type TimelineEvent = typeof timelineEvents.$inferSelect;
export type InsertCommunication = z.infer<typeof insertCommunicationSchema>;
export type Communication = typeof communications.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

// Extended types with relations
export type LoanWithRelations = Loan & {
  lender: User;
  borrower: User;
  payments?: Payment[];
  timelineEvents?: TimelineEvent[];
  communications?: Communication[];
  documents?: Document[];
};

export type TimelineEventWithUser = TimelineEvent & {
  createdByUser?: User;
};
