import {
  users,
  loans,
  payments,
  timelineEvents,
  communications,
  documents,
  statements,
  taxImplications,
  type User,
  type InsertUser,
  type InsertLoan,
  type Loan,
  type LoanWithRelations,
  type InsertPayment,
  type Payment,
  type InsertTimelineEvent,
  type TimelineEvent,
  type TimelineEventWithUser,
  type InsertCommunication,
  type Communication,
  type InsertDocument,
  type Document,
  type InsertStatement,
  type Statement,
  type InsertTaxImplication,
  type TaxImplication,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, sql, count } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserSettings(userId: string, settings: {
    creditorTerm?: string;
    debtorTerm?: string;
    seasonalTheme?: string;
  }): Promise<User>;

  // Loan operations
  createLoan(loan: InsertLoan): Promise<Loan>;
  getUserLoans(userId: string): Promise<LoanWithRelations[]>;
  getLoanById(loanId: string): Promise<LoanWithRelations | undefined>;
  getLoanWithRelations(loanId: string): Promise<LoanWithRelations | undefined>;
  updateLoan(loanId: string, updates: Partial<Loan>): Promise<Loan>;

  // Payment operations
  createPayment(payment: InsertPayment): Promise<Payment>;
  getLoanPayments(loanId: string): Promise<Payment[]>;
  getPaymentsByLoan(loanId: string): Promise<Payment[]>;
  updatePayment(paymentId: string, updates: Partial<Payment>): Promise<Payment>;

  // Timeline operations
  createTimelineEvent(event: InsertTimelineEvent): Promise<TimelineEvent>;
  getLoanTimeline(loanId: string): Promise<TimelineEventWithUser[]>;
  getTimelineEvents(loanId: string): Promise<TimelineEventWithUser[]>;

  // Communication operations
  createCommunication(communication: InsertCommunication): Promise<Communication>;
  getLoanCommunications(loanId: string): Promise<Communication[]>;
  getCommunicationsByLoan(loanId: string): Promise<Communication[]>;

  // Document operations
  createDocument(document: InsertDocument): Promise<Document>;
  getLoanDocuments(loanId: string): Promise<Document[]>;
  getDocumentsByLoan(loanId: string): Promise<Document[]>;

  // Dashboard statistics
  getUserDashboardStats(userId: string): Promise<{
    totalLent: number;
    activeLoans: number;
    avgInterestRate: number;
    onTimeRate: number;
  }>;

  // Statement operations
  createStatement(statement: InsertStatement): Promise<Statement>;
  getStatementForPeriod(loanId: string, startDate: Date, endDate: Date): Promise<Statement | undefined>;
  getLoanStatements(loanId: string): Promise<Statement[]>;
  getActiveLoans(): Promise<Loan[]>;
  getLoanWithPayments(loanId: string): Promise<LoanWithRelations | undefined>;
  
  // Tax calculation operations
  createTaxImplication(taxImplication: InsertTaxImplication): Promise<TaxImplication>;
  getTaxImplication(userId: string, taxYear: number): Promise<TaxImplication | undefined>;
  getPaymentsByYear(loanId: string, year: number): Promise<Payment[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(userData: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .returning();
    return user;
  }

  async updateUserSettings(userId: string, settings: {
    creditorTerm?: string;
    debtorTerm?: string;
    seasonalTheme?: string;
  }): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        ...settings,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  // Loan operations
  async createLoan(loan: InsertLoan): Promise<Loan> {
    const loanData = {
      ...loan,
      remainingBalance: loan.amount, // Initialize remaining balance to loan amount
    };
    
    const [newLoan] = await db
      .insert(loans)
      .values(loanData)
      .returning();
    return newLoan;
  }

  async getUserLoans(userId: string): Promise<LoanWithRelations[]> {
    const userLoans = await db
      .select()
      .from(loans)
      .leftJoin(users, eq(loans.lenderId, users.id))
      .where(or(eq(loans.lenderId, userId), eq(loans.borrowerId, userId)))
      .orderBy(desc(loans.createdAt));

    // Get related data for each loan
    const loansWithRelations: LoanWithRelations[] = [];
    
    for (const row of userLoans) {
      const loan = row.loans;
      const lender = await this.getUser(loan.lenderId);
      const borrower = await this.getUser(loan.borrowerId);
      
      if (lender && borrower) {
        loansWithRelations.push({
          ...loan,
          lender,
          borrower,
        });
      }
    }

    return loansWithRelations;
  }

  async getLoanById(loanId: string): Promise<LoanWithRelations | undefined> {
    const [loan] = await db
      .select()
      .from(loans)
      .where(eq(loans.id, loanId));

    if (!loan) return undefined;

    const lender = await this.getUser(loan.lenderId);
    const borrower = await this.getUser(loan.borrowerId);
    const loanPayments = await this.getLoanPayments(loanId);
    const timeline = await this.getLoanTimeline(loanId);
    const loanCommunications = await this.getLoanCommunications(loanId);
    const loanDocuments = await this.getLoanDocuments(loanId);

    if (!lender || !borrower) return undefined;

    return {
      ...loan,
      lender,
      borrower,
      payments: loanPayments,
      timelineEvents: timeline,
      communications: loanCommunications,
      documents: loanDocuments,
    };
  }

  async getLoanWithRelations(loanId: string): Promise<LoanWithRelations | undefined> {
    return this.getLoanById(loanId);
  }

  async updateLoan(loanId: string, updates: Partial<Loan>): Promise<Loan> {
    const [updatedLoan] = await db
      .update(loans)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(loans.id, loanId))
      .returning();
    return updatedLoan;
  }

  // Payment operations
  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [newPayment] = await db
      .insert(payments)
      .values(payment)
      .returning();
    return newPayment;
  }

  async getLoanPayments(loanId: string): Promise<Payment[]> {
    return await db
      .select()
      .from(payments)
      .where(eq(payments.loanId, loanId))
      .orderBy(desc(payments.scheduledDate));
  }

  async getPaymentsByLoan(loanId: string): Promise<Payment[]> {
    return this.getLoanPayments(loanId);
  }

  async updatePayment(paymentId: string, updates: Partial<Payment>): Promise<Payment> {
    const [updatedPayment] = await db
      .update(payments)
      .set(updates)
      .where(eq(payments.id, paymentId))
      .returning();
    return updatedPayment;
  }

  // Timeline operations
  async createTimelineEvent(event: InsertTimelineEvent): Promise<TimelineEvent> {
    const [newEvent] = await db
      .insert(timelineEvents)
      .values(event)
      .returning();
    return newEvent;
  }

  async getLoanTimeline(loanId: string): Promise<TimelineEventWithUser[]> {
    const events = await db
      .select()
      .from(timelineEvents)
      .leftJoin(users, eq(timelineEvents.createdBy, users.id))
      .where(eq(timelineEvents.loanId, loanId))
      .orderBy(desc(timelineEvents.createdAt));

    return events.map(row => ({
      ...row.timeline_events,
      createdByUser: row.users || undefined,
    }));
  }

  async getTimelineEvents(loanId: string): Promise<TimelineEventWithUser[]> {
    return this.getLoanTimeline(loanId);
  }

  // Communication operations
  async createCommunication(communication: InsertCommunication): Promise<Communication> {
    const [newCommunication] = await db
      .insert(communications)
      .values(communication)
      .returning();
    return newCommunication;
  }

  async getLoanCommunications(loanId: string): Promise<Communication[]> {
    return await db
      .select()
      .from(communications)
      .where(eq(communications.loanId, loanId))
      .orderBy(desc(communications.createdAt));
  }

  async getCommunicationsByLoan(loanId: string): Promise<Communication[]> {
    return this.getLoanCommunications(loanId);
  }

  // Document operations
  async createDocument(document: InsertDocument): Promise<Document> {
    const [newDocument] = await db
      .insert(documents)
      .values(document)
      .returning();
    return newDocument;
  }

  async getLoanDocuments(loanId: string): Promise<Document[]> {
    return await db
      .select()
      .from(documents)
      .where(eq(documents.loanId, loanId))
      .orderBy(desc(documents.createdAt));
  }

  async getDocumentsByLoan(loanId: string): Promise<Document[]> {
    return this.getLoanDocuments(loanId);
  }

  // Dashboard statistics
  async getUserDashboardStats(userId: string): Promise<{
    totalLent: number;
    activeLoans: number;
    avgInterestRate: number;
    onTimeRate: number;
  }> {
    // Total amount lent
    const [totalLentResult] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${loans.amount}), 0)`,
      })
      .from(loans)
      .where(eq(loans.lenderId, userId));

    // Active loans count
    const [activeLoansResult] = await db
      .select({
        count: count(),
      })
      .from(loans)
      .where(and(eq(loans.lenderId, userId), eq(loans.status, 'active')));

    // Average interest rate
    const [avgRateResult] = await db
      .select({
        avgRate: sql<number>`COALESCE(AVG(${loans.interestRate}), 0)`,
      })
      .from(loans)
      .where(eq(loans.lenderId, userId));

    // On-time payment rate
    const [totalPaymentsResult] = await db
      .select({
        total: count(),
      })
      .from(payments)
      .leftJoin(loans, eq(payments.loanId, loans.id))
      .where(eq(loans.lenderId, userId));

    const [onTimePaymentsResult] = await db
      .select({
        onTime: count(),
      })
      .from(payments)
      .leftJoin(loans, eq(payments.loanId, loans.id))
      .where(and(
        eq(loans.lenderId, userId),
        or(eq(payments.status, 'completed'), eq(payments.status, 'early'))
      ));

    const onTimeRate = totalPaymentsResult.total > 0 
      ? (onTimePaymentsResult.onTime / totalPaymentsResult.total) * 100 
      : 100;

    return {
      totalLent: Number(totalLentResult.total) || 0,
      activeLoans: activeLoansResult.count,
      avgInterestRate: Number(avgRateResult.avgRate) || 0,
      onTimeRate,
    };
  }

  // Statement operations
  async createStatement(statement: InsertStatement): Promise<Statement> {
    const [newStatement] = await db.insert(statements).values(statement).returning();
    return newStatement;
  }

  async getStatementForPeriod(loanId: string, startDate: Date, endDate: Date): Promise<Statement | undefined> {
    const [statement] = await db
      .select()
      .from(statements)
      .where(
        and(
          eq(statements.loanId, loanId),
          eq(statements.statementPeriodStart, startDate),
          eq(statements.statementPeriodEnd, endDate)
        )
      );
    return statement;
  }

  async getLoanStatements(loanId: string): Promise<Statement[]> {
    return await db
      .select()
      .from(statements)
      .where(eq(statements.loanId, loanId))
      .orderBy(desc(statements.statementDate));
  }

  async getActiveLoans(): Promise<Loan[]> {
    return await db
      .select()
      .from(loans)
      .where(eq(loans.status, 'active'));
  }

  async getLoanWithPayments(loanId: string): Promise<LoanWithRelations | undefined> {
    const loan = await this.getLoanById(loanId);
    if (!loan) return undefined;
    
    const loanPayments = await this.getLoanPayments(loanId);
    return {
      ...loan,
      payments: loanPayments
    };
  }

  // Tax calculation operations
  async createTaxImplication(taxImplication: InsertTaxImplication): Promise<TaxImplication> {
    const [newTaxImplication] = await db.insert(taxImplications).values(taxImplication).returning();
    return newTaxImplication;
  }

  async getTaxImplication(userId: string, taxYear: number): Promise<TaxImplication | undefined> {
    const [taxImplication] = await db
      .select()
      .from(taxImplications)
      .where(
        and(
          eq(taxImplications.userId, userId),
          eq(taxImplications.taxYear, taxYear)
        )
      );
    return taxImplication;
  }

  async getPaymentsByYear(loanId: string, year: number): Promise<Payment[]> {
    return await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.loanId, loanId),
          sql`EXTRACT(YEAR FROM ${payments.paymentDate}) = ${year}`
        )
      );
  }
}

export const storage = new DatabaseStorage();
