import { 
  users, type User, type InsertUser,
  integrations, type Integration, type InsertIntegration,
  financialSummaries, type FinancialSummary, type InsertFinancialSummary,
  transactions, type Transaction, type InsertTransaction,
  tasks, type Task, type InsertTask,
  aiMessages, type AiMessage, type InsertAiMessage
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<User>): Promise<User | undefined>;

  // Integration operations
  getIntegrations(userId: number): Promise<Integration[]>;
  getIntegration(id: number): Promise<Integration | undefined>;
  createIntegration(integration: InsertIntegration): Promise<Integration>;
  updateIntegration(id: number, integration: Partial<Integration>): Promise<Integration | undefined>;
  
  // Financial summary operations
  getFinancialSummary(userId: number): Promise<FinancialSummary | undefined>;
  createFinancialSummary(summary: InsertFinancialSummary): Promise<FinancialSummary>;
  updateFinancialSummary(userId: number, summary: Partial<FinancialSummary>): Promise<FinancialSummary | undefined>;
  
  // Transaction operations
  getTransactions(userId: number, limit?: number): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  
  // Task operations
  getTasks(userId: number, limit?: number): Promise<Task[]>;
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
  async getFinancialSummary(userId: number): Promise<FinancialSummary | undefined> {
    const [summary] = await db
      .select()
      .from(financialSummaries)
      .where(eq(financialSummaries.userId, userId));
    return summary || undefined;
  }

  async createFinancialSummary(insertSummary: InsertFinancialSummary): Promise<FinancialSummary> {
    const [summary] = await db
      .insert(financialSummaries)
      .values(insertSummary)
      .returning();
    return summary;
  }

  async updateFinancialSummary(userId: number, data: Partial<FinancialSummary>): Promise<FinancialSummary | undefined> {
    const updatedData = { ...data, updatedAt: new Date() };
    
    const [summary] = await db
      .update(financialSummaries)
      .set(updatedData)
      .where(eq(financialSummaries.userId, userId))
      .returning();
    
    return summary || undefined;
  }

  // Transaction operations
  async getTransactions(userId: number, limit?: number): Promise<Transaction[]> {
    let query = db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.date));

    if (limit) {
      query = query.limit(limit);
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
  async getTasks(userId: number, limit?: number): Promise<Task[]> {
    // Start building the query
    let query = db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, userId));

    // Custom ordering (we'll order by multiple columns)
    // 1. Completed tasks go last
    // 2. Due date (earliest first)
    query = query.orderBy(tasks.completed, tasks.dueDate);

    if (limit) {
      query = query.limit(limit);
    }

    // Execute query
    const taskResults = await query;

    // Apply additional sorting for priority since SQL can't easily handle custom enum ordering
    return taskResults.sort((a, b) => {
      // Priority ordering
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
    let query = db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.userId, userId))
      .orderBy(desc(aiMessages.timestamp));

    if (limit) {
      query = query.limit(limit);
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
    // Check if demo user exists, if not create it
    let user = await storage.getUserByUsername("demo");
    
    if (!user) {
      // Create default user
      user = await storage.createUser({
        username: "demo",
        password: "password", // In a real app, would be hashed
        displayName: "Sarah Johnson",
        email: "sarah@example.com",
        role: "Financial Manager",
        avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
      });
      
      // Setup integrations for Chitty Services
      const integrations = [
        {
          userId: user.id,
          serviceType: "mercury_bank",
          name: "Mercury Bank",
          description: "Banking & Financial Data",
          connected: true,
          lastSynced: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
          credentials: {}
        },
        {
          userId: user.id,
          serviceType: "wavapps",
          name: "WavApps",
          description: "Accounting & Invoicing",
          connected: true,
          lastSynced: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
          credentials: {}
        },
        {
          userId: user.id,
          serviceType: "doorloop",
          name: "DoorLoop",
          description: "Property Management",
          connected: true,
          lastSynced: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
          credentials: {}
        }
      ];

      for (const integration of integrations) {
        await storage.createIntegration(integration);
      }

      // Setup financial summary
      await storage.createFinancialSummary({
        userId: user.id,
        cashOnHand: 127842.50,
        monthlyRevenue: 43291.75,
        monthlyExpenses: 26142.30,
        outstandingInvoices: 18520.00,
      });

      // Setup transactions
      const transactions = [
        {
          userId: user.id,
          title: "Client Payment - Acme Corp",
          description: "Invoice #12345",
          amount: 7500.00,
          type: "income",
          date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
        {
          userId: user.id,
          title: "Software Subscription",
          description: "Monthly SaaS Tools",
          amount: -1299.00,
          type: "expense",
          date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
        },
        {
          userId: user.id,
          title: "Client Payment - XYZ Inc",
          description: "Invoice #12347",
          amount: 4200.00,
          type: "income",
          date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
        }
      ];

      for (const transaction of transactions) {
        await storage.createTransaction(transaction);
      }

      // Setup tasks
      const tasks = [
        {
          userId: user.id,
          title: "Review Q2 expense report",
          description: "Due in 2 days",
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          priority: "due_soon",
          completed: false,
        },
        {
          userId: user.id,
          title: "Approve pending invoice payments",
          description: "5 payments requiring approval",
          dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
          priority: "urgent",
          completed: false,
        },
        {
          userId: user.id,
          title: "Schedule tax preparation meeting",
          description: "Due in 2 weeks",
          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          priority: "upcoming",
          completed: false,
        },
      ];

      for (const task of tasks) {
        await storage.createTask(task);
      }

      // Setup initial AI message
      await storage.createAiMessage({
        userId: user.id,
        content: "Based on current cash flow projections, I recommend delaying the planned office expansion until Q3. Cash reserves are currently 12% below optimal levels for your business size. Would you like me to generate a detailed cost-reduction plan?",
        role: "assistant"
      });
    }
  } catch (error) {
    console.error("Error initializing data:", error);
  }
})();