import { 
  users, type User, type InsertUser,
  businesses, type Business, type InsertBusiness,
  tags, type Tag, type InsertTag,
  entityTags, type EntityTag, type InsertEntityTag,
  aiAgentTemplates, type AiAgentTemplate, type InsertAiAgentTemplate,
  reportTemplates, type ReportTemplate, type InsertReportTemplate,
  integrations, type Integration, type InsertIntegration,
  financialSummaries, type FinancialSummary, type InsertFinancialSummary,
  transactions, type Transaction, type InsertTransaction,
  tasks, type Task, type InsertTask,
  aiMessages, type AiMessage, type InsertAiMessage
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, inArray, isNull } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<User>): Promise<User | undefined>;

  // Business operations
  getBusinesses(userId: number, parentId?: number | null): Promise<Business[]>;
  getBusiness(id: number): Promise<Business | undefined>;
  createBusiness(business: InsertBusiness): Promise<Business>;
  updateBusiness(id: number, data: Partial<Business>): Promise<Business | undefined>;
  
  // Tag operations
  getTags(userId: number): Promise<Tag[]>;
  createTag(tag: InsertTag): Promise<Tag>;
  addEntityTag(entityTag: InsertEntityTag): Promise<EntityTag>;
  getEntityTags(entityType: string, entityId: number): Promise<Tag[]>;
  
  // AI Agent Template operations
  getAiAgentTemplates(type?: string): Promise<AiAgentTemplate[]>;
  getAiAgentTemplate(id: number): Promise<AiAgentTemplate | undefined>;
  createAiAgentTemplate(template: InsertAiAgentTemplate): Promise<AiAgentTemplate>;
  
  // Report Template operations
  getReportTemplates(userId?: number): Promise<ReportTemplate[]>;
  createReportTemplate(template: InsertReportTemplate): Promise<ReportTemplate>;

  // Integration operations
  getIntegrations(userId: number): Promise<Integration[]>;
  getIntegration(id: number): Promise<Integration | undefined>;
  createIntegration(integration: InsertIntegration): Promise<Integration>;
  updateIntegration(id: number, integration: Partial<Integration>): Promise<Integration | undefined>;
  
  // Financial summary operations
  getFinancialSummary(userId: number, businessId?: number | null): Promise<FinancialSummary | undefined>;
  createFinancialSummary(summary: InsertFinancialSummary): Promise<FinancialSummary>;
  updateFinancialSummary(userId: number, summary: Partial<FinancialSummary>, businessId?: number | null): Promise<FinancialSummary | undefined>;
  
  // Transaction operations
  getTransactions(userId: number, businessId?: number | null, limit?: number): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  
  // Task operations
  getTasks(userId: number, businessId?: number | null, limit?: number): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, task: Partial<Task>): Promise<Task | undefined>;
  
  // AI Message operations
  getAiMessages(userId: number, limit?: number): Promise<AiMessage[]>;
  createAiMessage(message: InsertAiMessage): Promise<AiMessage>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }
  
  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }
  
  async updateUser(id: number, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  // Business operations
  async getBusinesses(userId: number, parentId?: number | null): Promise<Business[]> {
    if (parentId === undefined) {
      return await db.select().from(businesses).where(eq(businesses.userId, userId));
    }
    
    if (parentId === null) {
      return await db.select().from(businesses).where(
        and(eq(businesses.userId, userId), isNull(businesses.parentId))
      );
    }
    
    return await db.select().from(businesses).where(
      and(eq(businesses.userId, userId), eq(businesses.parentId, parentId))
    );
  }

  async getBusiness(id: number): Promise<Business | undefined> {
    const [business] = await db.select().from(businesses).where(eq(businesses.id, id));
    return business || undefined;
  }

  async createBusiness(insertBusiness: InsertBusiness): Promise<Business> {
    const [business] = await db.insert(businesses).values(insertBusiness).returning();
    return business;
  }

  async updateBusiness(id: number, data: Partial<Business>): Promise<Business | undefined> {
    const [business] = await db
      .update(businesses)
      .set(data)
      .where(eq(businesses.id, id))
      .returning();
    return business || undefined;
  }

  // Tag operations
  async getTags(userId: number): Promise<Tag[]> {
    return await db.select().from(tags).where(eq(tags.userId, userId));
  }

  async createTag(insertTag: InsertTag): Promise<Tag> {
    const [tag] = await db.insert(tags).values(insertTag).returning();
    return tag;
  }

  async addEntityTag(insertEntityTag: InsertEntityTag): Promise<EntityTag> {
    const [entityTag] = await db.insert(entityTags).values(insertEntityTag).returning();
    return entityTag;
  }

  async getEntityTags(entityType: string, entityId: number): Promise<Tag[]> {
    const result = await db
      .select({ tag: tags })
      .from(entityTags)
      .innerJoin(tags, eq(entityTags.tagId, tags.id))
      .where(and(eq(entityTags.entityType, entityType), eq(entityTags.entityId, entityId)));
    
    return result.map(r => r.tag);
  }

  // AI Agent Template operations
  async getAiAgentTemplates(type?: string): Promise<AiAgentTemplate[]> {
    if (type) {
      return await db.select().from(aiAgentTemplates).where(
        and(eq(aiAgentTemplates.type, type), eq(aiAgentTemplates.active, true))
      );
    }
    return await db.select().from(aiAgentTemplates).where(eq(aiAgentTemplates.active, true));
  }

  async getAiAgentTemplate(id: number): Promise<AiAgentTemplate | undefined> {
    const [template] = await db.select().from(aiAgentTemplates).where(eq(aiAgentTemplates.id, id));
    return template || undefined;
  }

  async createAiAgentTemplate(insertTemplate: InsertAiAgentTemplate): Promise<AiAgentTemplate> {
    const [template] = await db.insert(aiAgentTemplates).values(insertTemplate).returning();
    return template;
  }

  // Report Template operations
  async getReportTemplates(userId?: number): Promise<ReportTemplate[]> {
    if (userId) {
      return await db.select().from(reportTemplates).where(eq(reportTemplates.userId, userId));
    }
    return await db.select().from(reportTemplates).where(isNull(reportTemplates.userId));
  }

  async createReportTemplate(insertTemplate: InsertReportTemplate): Promise<ReportTemplate> {
    const [template] = await db.insert(reportTemplates).values(insertTemplate).returning();
    return template;
  }

  // Integration operations
  async getIntegrations(userId: number): Promise<Integration[]> {
    return await db
      .select()
      .from(integrations)
      .where(eq(integrations.userId, userId));
  }

  async getIntegration(id: number): Promise<Integration | undefined> {
    const [integration] = await db
      .select()
      .from(integrations)
      .where(eq(integrations.id, id));
    return integration || undefined;
  }

  async createIntegration(insertIntegration: InsertIntegration): Promise<Integration> {
    const [integration] = await db
      .insert(integrations)
      .values(insertIntegration)
      .returning();
    return integration;
  }

  async updateIntegration(id: number, data: Partial<Integration>): Promise<Integration | undefined> {
    const [integration] = await db
      .update(integrations)
      .set(data)
      .where(eq(integrations.id, id))
      .returning();
    return integration || undefined;
  }

  // Financial summary operations
  async getFinancialSummary(userId: number, businessId?: number | null): Promise<FinancialSummary | undefined> {
    if (businessId === undefined) {
      const [summary] = await db
        .select()
        .from(financialSummaries)
        .where(and(eq(financialSummaries.userId, userId), isNull(financialSummaries.businessId)));
      return summary || undefined;
    }
    
    if (businessId === null) {
      const [summary] = await db
        .select()
        .from(financialSummaries)
        .where(and(eq(financialSummaries.userId, userId), isNull(financialSummaries.businessId)));
      return summary || undefined;
    }
    
    const [summary] = await db
      .select()
      .from(financialSummaries)
      .where(and(eq(financialSummaries.userId, userId), eq(financialSummaries.businessId, businessId)));
    return summary || undefined;
  }

  async createFinancialSummary(insertSummary: InsertFinancialSummary): Promise<FinancialSummary> {
    const [summary] = await db
      .insert(financialSummaries)
      .values(insertSummary)
      .returning();
    return summary;
  }

  async updateFinancialSummary(userId: number, data: Partial<FinancialSummary>, businessId?: number | null): Promise<FinancialSummary | undefined> {
    const updatedData = { ...data, updatedAt: new Date() };
    
    const condition = businessId === undefined || businessId === null
      ? and(eq(financialSummaries.userId, userId), isNull(financialSummaries.businessId))
      : and(eq(financialSummaries.userId, userId), eq(financialSummaries.businessId, businessId));
    
    const [summary] = await db
      .update(financialSummaries)
      .set(updatedData)
      .where(condition)
      .returning();
    
    return summary || undefined;
  }

  // Transaction operations
  async getTransactions(userId: number, businessId?: number | null, limit?: number): Promise<Transaction[]> {
    const condition = businessId === undefined
      ? eq(transactions.userId, userId)
      : businessId === null
      ? and(eq(transactions.userId, userId), isNull(transactions.businessId))
      : and(eq(transactions.userId, userId), eq(transactions.businessId, businessId));
    
    const query = db
      .select()
      .from(transactions)
      .where(condition)
      .orderBy(desc(transactions.date));

    if (limit) {
      return await query.limit(limit);
    }

    return await query;
  }

  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    const [transaction] = await db
      .insert(transactions)
      .values(insertTransaction)
      .returning();
    return transaction;
  }

  // Task operations
  async getTasks(userId: number, businessId?: number | null, limit?: number): Promise<Task[]> {
    const condition = businessId === undefined
      ? eq(tasks.userId, userId)
      : businessId === null
      ? and(eq(tasks.userId, userId), isNull(tasks.businessId))
      : and(eq(tasks.userId, userId), eq(tasks.businessId, businessId));
    
    const query = db
      .select()
      .from(tasks)
      .where(condition)
      .orderBy(tasks.completed, tasks.dueDate);

    const taskResults = limit ? await query.limit(limit) : await query;

    // Apply additional sorting for priority
    return taskResults.sort((a, b) => {
      const priorityOrder = { urgent: 0, due_soon: 1, upcoming: 2, null: 3 };
      const aPriority = a.priority ? priorityOrder[a.priority as keyof typeof priorityOrder] : priorityOrder.null;
      const bPriority = b.priority ? priorityOrder[b.priority as keyof typeof priorityOrder] : priorityOrder.null;
      
      if (aPriority !== bPriority) return aPriority - bPriority;
      return 0;
    });
  }

  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, id));
    return task || undefined;
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const [task] = await db
      .insert(tasks)
      .values(insertTask)
      .returning();
    return task;
  }

  async updateTask(id: number, data: Partial<Task>): Promise<Task | undefined> {
    const [task] = await db
      .update(tasks)
      .set(data)
      .where(eq(tasks.id, id))
      .returning();
    return task || undefined;
  }

  // AI Message operations
  async getAiMessages(userId: number, limit?: number): Promise<AiMessage[]> {
    const query = db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.userId, userId))
      .orderBy(desc(aiMessages.timestamp));

    if (limit) {
      return await query.limit(limit);
    }

    return await query;
  }

  async createAiMessage(insertMessage: InsertAiMessage): Promise<AiMessage> {
    const [message] = await db
      .insert(aiMessages)
      .values(insertMessage)
      .returning();
    return message;
  }
}

// Use the DatabaseStorage
export const storage = new DatabaseStorage();

// Initialize default data
(async () => {
  try {
    // Check if demo user exists
    let user = await storage.getUserByUsername("demo");
    
    if (!user) {
      // Create default user
      user = await storage.createUser({
        username: "demo",
        password: "password",
        displayName: "Sarah Johnson",
        email: "sarah@example.com",
        role: "Financial Manager",
        avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
      });
      
      // Create demo businesses/properties
      const mainPortfolio = await storage.createBusiness({
        userId: user.id,
        name: "Main Portfolio",
        type: "portfolio",
        settings: { currency: "USD", timezone: "America/Los_Angeles" },
        active: true
      });
      
      const property1 = await storage.createBusiness({
        userId: user.id,
        parentId: mainPortfolio.id,
        name: "Sunset Apartments",
        type: "rental",
        address: "123 Sunset Blvd, Los Angeles, CA",
        metadata: { units: 12, sqft: 8400, purchasePrice: 2100000 },
        active: true
      });
      
      const property2 = await storage.createBusiness({
        userId: user.id,
        parentId: mainPortfolio.id,
        name: "Downtown Office Building",
        type: "commercial",
        address: "456 Main St, San Francisco, CA",
        metadata: { units: 6, sqft: 12000, purchasePrice: 4500000 },
        active: true
      });
      
      // Create AI Agent Templates
      await storage.createAiAgentTemplate({
        name: "Cash Flow Analyzer",
        type: "cashflow",
        systemPrompt: "You are a specialized financial AI focused on cash flow analysis. Provide insights on income trends, expense patterns, and liquidity management.",
        userPromptTemplate: "Analyze the cash flow for {{businessName}} over the last {{period}}. Current balance: {{balance}}. Monthly income: {{income}}. Monthly expenses: {{expenses}}.",
        model: "gpt-4o-mini",
        temperature: 0.7,
        active: true
      });
      
      await storage.createAiAgentTemplate({
        name: "Property Performance Advisor",
        type: "property_analysis",
        systemPrompt: "You are a property management AI specialist. Analyze occupancy rates, maintenance costs, and rental income to provide actionable recommendations.",
        userPromptTemplate: "Evaluate the performance of {{propertyName}}. Occupancy: {{occupancy}}%. Monthly rent: ${{rent}}. Maintenance costs: ${{maintenance}}. Provide optimization recommendations.",
        model: "gpt-4o-mini",
        temperature: 0.7,
        active: true
      });
      
      await storage.createAiAgentTemplate({
        name: "Expense Optimizer",
        type: "expense_optimizer",
        systemPrompt: "You are an expense optimization AI. Identify cost-saving opportunities, negotiate better rates, and eliminate wasteful spending.",
        userPromptTemplate: "Review expenses for {{businessName}}. Top categories: {{categories}}. Identify opportunities to reduce costs by at least {{target}}%.",
        model: "gpt-4o-mini",
        temperature: 0.5,
        active: true
      });
      
      // Setup integrations
      const integrationsList = [
        {
          userId: user.id,
          serviceType: "mercury_bank",
          name: "Mercury Bank",
          description: "Banking & Financial Data",
          connected: true,
          credentials: {}
        },
        {
          userId: user.id,
          serviceType: "wavapps",
          name: "WavApps",
          description: "Accounting & Invoicing",
          connected: true,
          credentials: {}
        },
        {
          userId: user.id,
          serviceType: "doorloop",
          name: "DoorLoop",
          description: "Property Management",
          connected: true,
          credentials: {}
        }
      ];

      for (const integration of integrationsList) {
        await storage.createIntegration(integration);
      }

      // Setup financial summary (aggregate)
      await storage.createFinancialSummary({
        userId: user.id,
        cashOnHand: 127842.50,
        monthlyRevenue: 43291.75,
        monthlyExpenses: 26142.30,
        outstandingInvoices: 18520.00,
      });

      // Setup transactions
      const transactionsList = [
        {
          userId: user.id,
          businessId: property1.id,
          title: "Rent Payment - Unit 3A",
          description: "Monthly rent",
          amount: 2800.00,
          type: "income",
          category: "rent"
        },
        {
          userId: user.id,
          businessId: property1.id,
          title: "HVAC Maintenance",
          description: "Annual service",
          amount: -1200.00,
          type: "expense",
          category: "maintenance"
        },
        {
          userId: user.id,
          businessId: property2.id,
          title: "Office Lease - Suite 201",
          description: "Monthly commercial lease",
          amount: 5500.00,
          type: "income",
          category: "rent"
        }
      ];

      for (const transaction of transactionsList) {
        await storage.createTransaction(transaction);
      }

      // Setup tasks
      const tasksList = [
        {
          userId: user.id,
          businessId: property1.id,
          title: "Schedule roof inspection",
          description: "Annual safety check for Sunset Apartments",
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          priority: "due_soon",
          completed: false,
        },
        {
          userId: user.id,
          businessId: property2.id,
          title: "Renew insurance policy",
          description: "Commercial property insurance renewal",
          dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
          priority: "urgent",
          completed: false,
        },
        {
          userId: user.id,
          title: "Review Q3 portfolio performance",
          description: "Quarterly analysis across all properties",
          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          priority: "upcoming",
          completed: false,
        },
      ];

      for (const task of tasksList) {
        await storage.createTask(task);
      }

      // Setup initial AI message
      await storage.createAiMessage({
        userId: user.id,
        agentType: "cashflow",
        content: "Based on your current portfolio performance, your rental income is strong at $43,291/month. However, I notice your maintenance costs are 15% above market average. Would you like me to analyze opportunities to optimize these expenses?",
        role: "assistant"
      });
    }
  } catch (error) {
    console.error("Error initializing data:", error);
  }
})();
