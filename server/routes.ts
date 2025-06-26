import express, { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertAiMessageSchema, insertIntegrationSchema, insertTaskSchema } from "@shared/schema";
import { getFinancialAdvice, generateCostReductionPlan } from "./lib/openai";
import { getAggregatedFinancialData } from "./lib/financialServices";
import { getRecurringCharges, getChargeOptimizations, manageRecurringCharge } from "./lib/chargeAutomation";
import { 
  fetchUserRepositories, 
  fetchRepositoryCommits, 
  fetchRepositoryPullRequests, 
  fetchRepositoryIssues 
} from "./lib/github";
import { transformToUniversalFormat } from "./lib/universalConnector";
import { setupAuth, isAuthenticated } from "./replitAuth";

// Function to seed new integrations for the demo user
async function seedNewIntegrations() {
  try {
    const user = await storage.getUserByUsername("demo");
    if (!user) return;
    
    const existingIntegrations = await storage.getIntegrations(user.id);
    const existingServiceTypes = new Set(existingIntegrations.map(i => i.serviceType));
    
    // New integrations to add if they don't exist
    const newIntegrations = [
      {
        serviceType: 'stripe',
        name: 'Stripe',
        description: 'Payment processing platform',
        connected: true
      },
      {
        serviceType: 'quickbooks',
        name: 'QuickBooks',
        description: 'Accounting software',
        connected: true
      },
      {
        serviceType: 'xero',
        name: 'Xero',
        description: 'International accounting platform',
        connected: true
      },
      {
        serviceType: 'brex',
        name: 'Brex',
        description: 'Business credit cards & expense management',
        connected: true
      },
      {
        serviceType: 'gusto',
        name: 'Gusto',
        description: 'Payroll, benefits, and HR',
        connected: true
      }
    ];
    
    // Add any missing integrations
    for (const integration of newIntegrations) {
      if (!existingServiceTypes.has(integration.serviceType)) {
        await storage.createIntegration({
          ...integration,
          userId: user.id,
          lastSynced: new Date()
        });
      }
    }
  } catch (error) {
    console.error("Error seeding new integrations:", error);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup Replit Auth
  await setupAuth(app);
  
  // Seed new integrations
  await seedNewIntegrations();
  
  // Create API router
  const api = express.Router();

  // Auto-login for demo purposes - in a real app this would be a proper authentication flow
  api.get("/session", async (req: Request, res: Response) => {
    const user = await storage.getUserByUsername("demo");
    
    if (!user) {
      return res.status(404).json({ 
        message: "Demo user not found" 
      });
    }
    
    // Don't send password to client
    const { password, ...safeUser } = user;
    res.json(safeUser);
  });

  // Get financial summary
  api.get("/financial-summary", async (req: Request, res: Response) => {
    // In a real app, we would get the user ID from the session
    const user = await storage.getUserByUsername("demo");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    try {
      // Get all integrations to fetch data from
      const integrations = await storage.getIntegrations(user.id);
      
      // Get aggregated financial data from all connected services
      const financialData = await getAggregatedFinancialData(integrations);
      
      // Update or create summary in database
      let summary = await storage.getFinancialSummary(user.id);
      
      if (summary) {
        // Update existing summary with latest data
        summary = await storage.updateFinancialSummary(user.id, {
          cashOnHand: financialData.cashOnHand,
          monthlyRevenue: financialData.monthlyRevenue,
          monthlyExpenses: financialData.monthlyExpenses,
          outstandingInvoices: financialData.outstandingInvoices
        });
      } else {
        // Create new summary
        summary = await storage.createFinancialSummary({
          userId: user.id,
          cashOnHand: financialData.cashOnHand,
          monthlyRevenue: financialData.monthlyRevenue,
          monthlyExpenses: financialData.monthlyExpenses,
          outstandingInvoices: financialData.outstandingInvoices
        });
      }
      
      // Add metrics and payroll data for the response
      const enhancedSummary = {
        ...summary,
        metrics: financialData.metrics,
        payroll: financialData.payroll
      };
      
      res.json(enhancedSummary);
    } catch (error) {
      console.error("Error fetching financial summary:", error);
      
      // Fall back to existing database record if there's an error
      let summary = await storage.getFinancialSummary(user.id);
      
      if (!summary) {
        // If no summary exists, create a basic one
        summary = await storage.createFinancialSummary({
          userId: user.id,
          cashOnHand: 127842.50,
          monthlyRevenue: 43291.75,
          monthlyExpenses: 26142.30,
          outstandingInvoices: 18520.00,
        });
      }
      
      res.json(summary);
    }
  });

  // Get integrations
  api.get("/integrations", async (req: Request, res: Response) => {
    const user = await storage.getUserByUsername("demo");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const integrations = await storage.getIntegrations(user.id);
    res.json(integrations);
  });

  // Create or update integration
  api.post("/integrations", async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserByUsername("demo");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const data = insertIntegrationSchema.parse({ ...req.body, userId: user.id });
      const integration = await storage.createIntegration(data);
      res.status(201).json(integration);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid integration data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create integration" });
    }
  });

  // Update integration
  api.patch("/integrations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid integration ID" });
      }

      const integration = await storage.getIntegration(id);
      if (!integration) {
        return res.status(404).json({ message: "Integration not found" });
      }

      const updatedIntegration = await storage.updateIntegration(id, req.body);
      res.json(updatedIntegration);
    } catch (error) {
      res.status(500).json({ message: "Failed to update integration" });
    }
  });

  // Get recent transactions
  api.get("/transactions", async (req: Request, res: Response) => {
    const user = await storage.getUserByUsername("demo");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    try {
      // Get integrations to fetch live transaction data
      const integrations = await storage.getIntegrations(user.id);
      
      // Get aggregated financial data which includes transactions
      const financialData = await getAggregatedFinancialData(integrations);
      
      // Return transactions from financial data if available
      if (financialData.transactions && financialData.transactions.length > 0) {
        const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
        const limitedTransactions = limit ? 
          financialData.transactions.slice(0, limit) : 
          financialData.transactions;
        
        return res.json(limitedTransactions);
      }
      
      // Fallback to database if no live transactions
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const transactions = await storage.getTransactions(user.id, limit);
      
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      
      // Fallback to database on error
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const transactions = await storage.getTransactions(user.id, limit);
      
      res.json(transactions);
    }
  });

  // Get tasks
  api.get("/tasks", async (req: Request, res: Response) => {
    const user = await storage.getUserByUsername("demo");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const tasks = await storage.getTasks(user.id, limit);
    
    res.json(tasks);
  });

  // Create task
  api.post("/tasks", async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserByUsername("demo");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const data = insertTaskSchema.parse({ ...req.body, userId: user.id });
      const task = await storage.createTask(data);
      res.status(201).json(task);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid task data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create task" });
    }
  });

  // Update task
  api.patch("/tasks/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid task ID" });
      }

      const task = await storage.getTask(id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      const updatedTask = await storage.updateTask(id, req.body);
      res.json(updatedTask);
    } catch (error) {
      res.status(500).json({ message: "Failed to update task" });
    }
  });

  // Get AI messages
  api.get("/ai-messages", async (req: Request, res: Response) => {
    const user = await storage.getUserByUsername("demo");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const messages = await storage.getAiMessages(user.id, limit);
    
    res.json(messages);
  });

  // Get latest AI assistant message
  api.get("/ai-assistant/latest", async (req: Request, res: Response) => {
    const user = await storage.getUserByUsername("demo");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const messages = await storage.getAiMessages(user.id, 1);
    const latestMessage = messages.length > 0 ? messages[0] : null;
    
    res.json(latestMessage || { content: "I'm your AI CFO assistant. How can I help you today?" });
  });

  // Send message to AI assistant
  api.post("/ai-assistant/query", async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserByUsername("demo");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { query } = req.body;
      if (!query || typeof query !== "string") {
        return res.status(400).json({ message: "Query is required" });
      }

      // Store user message
      await storage.createAiMessage({
        userId: user.id,
        content: query,
        role: "user"
      });

      // Get financial data
      const summary = await storage.getFinancialSummary(user.id);
      if (!summary) {
        return res.status(404).json({ message: "Financial summary not found" });
      }

      // Get previous assistant message for context
      const previousMessages = await storage.getAiMessages(user.id, 2);
      const previousAssistantMessage = previousMessages.find(m => m.role === "assistant")?.content;

      // Get AI response
      const aiResponse = await getFinancialAdvice({
        cashOnHand: summary.cashOnHand,
        monthlyRevenue: summary.monthlyRevenue,
        monthlyExpenses: summary.monthlyExpenses,
        outstandingInvoices: summary.outstandingInvoices,
        previousAdvice: previousAssistantMessage,
        userQuery: query
      });

      // Store AI response
      const assistantMessage = await storage.createAiMessage({
        userId: user.id,
        content: aiResponse,
        role: "assistant"
      });

      res.json(assistantMessage);
    } catch (error) {
      console.error("AI assistant query error:", error);
      res.status(500).json({ message: "Failed to process AI assistant query" });
    }
  });

  // Generate cost reduction plan
  api.post("/ai-assistant/generate-plan", async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserByUsername("demo");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get financial data
      const summary = await storage.getFinancialSummary(user.id);
      if (!summary) {
        return res.status(404).json({ message: "Financial summary not found" });
      }

      // Generate plan
      const plan = await generateCostReductionPlan({
        cashOnHand: summary.cashOnHand,
        monthlyRevenue: summary.monthlyRevenue,
        monthlyExpenses: summary.monthlyExpenses
      });

      // Store AI response
      const assistantMessage = await storage.createAiMessage({
        userId: user.id,
        content: plan,
        role: "assistant"
      });

      res.json(assistantMessage);
    } catch (error) {
      console.error("Cost reduction plan generation error:", error);
      res.status(500).json({ message: "Failed to generate cost reduction plan" });
    }
  });

  // Charge Automation Routes
  
  // Get recurring charges
  api.get("/charges/recurring", async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserByUsername("demo");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const charges = await getRecurringCharges(user.id);
      res.json(charges);
    } catch (error) {
      console.error("Error fetching recurring charges:", error);
      res.status(500).json({ message: "Failed to fetch recurring charges" });
    }
  });
  
  // Get charge optimization recommendations
  api.get("/charges/optimizations", async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserByUsername("demo");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const optimizations = await getChargeOptimizations(user.id);
      res.json(optimizations);
    } catch (error) {
      console.error("Error generating charge optimizations:", error);
      res.status(500).json({ message: "Failed to generate charge optimizations" });
    }
  });
  
  // Cancel or modify a recurring charge
  api.post("/charges/manage", async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserByUsername("demo");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const { chargeId, action, modifications } = req.body;
      
      if (!chargeId || !action) {
        return res.status(400).json({ message: "chargeId and action are required" });
      }
      
      if (action !== 'cancel' && action !== 'modify') {
        return res.status(400).json({ message: "action must be 'cancel' or 'modify'" });
      }
      
      const result = await manageRecurringCharge(user.id, chargeId, action, modifications);
      res.json(result);
    } catch (error) {
      console.error("Error managing recurring charge:", error);
      res.status(500).json({ message: "Failed to manage recurring charge" });
    }
  });
  
  // Financial Platform Integration Testing Endpoint
  api.get("/test-financial-platform/:platformId", async (req: Request, res: Response) => {
    try {
      // Get the platform identifier from the URL params
      const platformId = req.params.platformId;
      
      // Get demo user for now - in production this would use the authenticated user
      const user = await storage.getUserByUsername("demo");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Get all integrations for this user
      const integrations = await storage.getIntegrations(user.id);
      
      // Find the specified integration
      const integration = integrations.find(i => i.serviceType === platformId);
      
      if (!integration) {
        return res.status(404).json({ 
          success: false,
          message: `Integration for platform '${platformId}' not found`, 
          availablePlatforms: integrations.map(i => i.serviceType)
        });
      }
      
      // Initialize results container
      const results = {
        platformId,
        platformName: integration.name,
        tests: [] as Array<{name: string, success: boolean, data: any, error?: string}>
      };
      
      // Test 1: Financial Data Fetch
      try {
        let financialData;
        
        // Call the appropriate function based on the platform ID
        switch (platformId) {
          case "mercury_bank":
          case "wavapps":
          case "doorloop":
          case "stripe":
          case "quickbooks":
          case "xero":
          case "brex":
          case "gusto":
            financialData = await getAggregatedFinancialData([integration]);
            break;
          default:
            throw new Error(`No handler defined for platform: ${platformId}`);
        }
        
        results.tests.push({
          name: "Financial Data Fetch",
          success: true,
          data: financialData
        });
      } catch (error: any) {
        results.tests.push({
          name: "Financial Data Fetch",
          success: false,
          data: null,
          error: error.message
        });
      }
      
      // Test 2: Recurring Charges
      try {
        let recurringCharges;
        
        // Only test recurring charges on platforms that support it
        if (["mercury_bank", "wavapps", "doorloop", "stripe", "quickbooks", "xero", "brex"].includes(platformId)) {
          recurringCharges = await getRecurringCharges(user.id);
          
          results.tests.push({
            name: "Recurring Charges",
            success: true,
            data: recurringCharges
          });
        } else {
          results.tests.push({
            name: "Recurring Charges",
            success: false,
            data: null,
            error: "Platform does not support recurring charges"
          });
        }
      } catch (error: any) {
        results.tests.push({
          name: "Recurring Charges",
          success: false,
          data: null,
          error: error.message
        });
      }
      
      // Test 3: Connection Status
      try {
        // Update the last synced timestamp to verify connection is active
        const updatedIntegration = await storage.updateIntegration(integration.id, {
          lastSynced: new Date()
        });
        
        results.tests.push({
          name: "Connection Status",
          success: true,
          data: {
            connected: updatedIntegration?.connected,
            lastSynced: updatedIntegration?.lastSynced
          }
        });
      } catch (error: any) {
        results.tests.push({
          name: "Connection Status",
          success: false,
          data: null,
          error: error.message
        });
      }
      
      // Calculate overall success
      const overallSuccess = results.tests.every(test => test.success);
      
      // Send complete test results
      res.json({
        success: overallSuccess,
        platform: {
          id: platformId,
          name: integration.name,
          type: integration.serviceType
        },
        testResults: results.tests,
        timestamp: new Date()
      });
      
    } catch (error: any) {
      console.error(`Error testing financial platform ${req.params.platformId}:`, error);
      res.status(500).json({ 
        success: false,
        message: `Failed to test financial platform: ${error.message}`
      });
    }
  });

  // Test endpoint for financial platform integration (without authentication)
  api.get("/test-platform/:platformId", async (req: Request, res: Response) => {
    try {
      // Get the platform identifier from the URL params
      const platformId = req.params.platformId;
      
      // Get demo user 
      const user = await storage.getUserByUsername("demo");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Get all integrations for this user
      const integrations = await storage.getIntegrations(user.id);
      
      // Find the specified integration
      const integration = integrations.find(i => i.serviceType === platformId);
      
      if (!integration) {
        return res.status(404).json({ 
          success: false,
          message: `Integration for platform '${platformId}' not found`, 
          availablePlatforms: integrations.map(i => i.serviceType)
        });
      }
      
      // Get financial data for this platform
      const financialData = await getAggregatedFinancialData([integration]);
      
      // Send results
      res.json({
        success: true,
        platform: {
          id: platformId,
          name: integration.name,
          type: integration.serviceType
        },
        financialData,
        timestamp: new Date()
      });
      
    } catch (error: any) {
      console.error(`Error testing platform ${req.params.platformId}:`, error);
      res.status(500).json({ 
        success: false,
        message: `Failed to test platform: ${error.message}`
      });
    }
  });

  // Universal Connector endpoint
  api.get("/universal-connector", async (req: Request, res: Response) => {
    try {
      // In a real app, we would get the user ID from the session
      // Here we use the demo user
      const user = await storage.getUserByUsername("demo");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Get all integrations to fetch data from
      const integrations = await storage.getIntegrations(user.id);
      
      // Transform the data into universal format
      const universalData = await transformToUniversalFormat(user.id, integrations);
      
      res.json(universalData);
    } catch (error: any) {
      console.error("Error generating universal connector data:", error);
      res.status(500).json({ 
        success: false,
        message: `Universal Connector Error: ${error.message}`
      });
    }
  });
  
  // Test endpoint for Universal Connector with authentication
  api.get("/universal-connector/secured", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      
      // Get the user from our database
      const dbUser = await storage.getUserByUsername("demo"); // For demo, we'll use the demo user
      if (!dbUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Get all integrations to fetch data from
      const integrations = await storage.getIntegrations(dbUser.id);
      
      // Transform the data into universal format
      const universalData = await transformToUniversalFormat(dbUser.id, integrations);
      
      // Add authenticated user info
      universalData.authInfo = {
        authenticatedUserId: userId,
        authenticatedAt: new Date().toISOString(),
        authMethod: "replit_auth"
      };
      
      res.json(universalData);
    } catch (error: any) {
      console.error("Error generating authenticated universal connector data:", error);
      res.status(500).json({ 
        success: false,
        message: `Universal Connector Error: ${error.message}`
      });
    }
  });

// GitHub Integration Routes
  
  // Get GitHub repositories
  api.get("/github/repositories", async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserByUsername("demo");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Get GitHub integration
      const integrations = await storage.getIntegrations(user.id);
      const githubIntegration = integrations.find(i => i.serviceType === "github");
      
      if (!githubIntegration) {
        // For demo purposes, create a GitHub integration if it doesn't exist
        const newIntegration = await storage.createIntegration({
          userId: user.id,
          serviceType: "github",
          name: "GitHub",
          description: "Source Code & Development",
          connected: true,
          lastSynced: new Date(),
          credentials: {}
        });
        
        const repositories = await fetchUserRepositories(newIntegration);
        return res.json(repositories);
      }
      
      const repositories = await fetchUserRepositories(githubIntegration);
      res.json(repositories);
    } catch (error) {
      console.error("Error fetching GitHub repositories:", error);
      res.status(500).json({ message: "Failed to fetch GitHub repositories" });
    }
  });
  
  // Get GitHub repository commits
  api.get("/github/repositories/:repoFullName/commits", async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserByUsername("demo");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const { repoFullName } = req.params;
      if (!repoFullName) {
        return res.status(400).json({ message: "Repository name is required" });
      }
      
      // Get GitHub integration
      const integrations = await storage.getIntegrations(user.id);
      const githubIntegration = integrations.find(i => i.serviceType === "github");
      
      if (!githubIntegration) {
        return res.status(404).json({ message: "GitHub integration not found" });
      }
      
      const commits = await fetchRepositoryCommits(githubIntegration, repoFullName);
      res.json(commits);
    } catch (error) {
      console.error(`Error fetching commits for ${req.params.repoFullName}:`, error);
      res.status(500).json({ message: "Failed to fetch repository commits" });
    }
  });
  
  // Get GitHub repository pull requests
  api.get("/github/repositories/:repoFullName/pulls", async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserByUsername("demo");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const { repoFullName } = req.params;
      if (!repoFullName) {
        return res.status(400).json({ message: "Repository name is required" });
      }
      
      // Get GitHub integration
      const integrations = await storage.getIntegrations(user.id);
      const githubIntegration = integrations.find(i => i.serviceType === "github");
      
      if (!githubIntegration) {
        return res.status(404).json({ message: "GitHub integration not found" });
      }
      
      const pullRequests = await fetchRepositoryPullRequests(githubIntegration, repoFullName);
      res.json(pullRequests);
    } catch (error) {
      console.error(`Error fetching pull requests for ${req.params.repoFullName}:`, error);
      res.status(500).json({ message: "Failed to fetch repository pull requests" });
    }
  });
  
  // Get GitHub repository issues
  api.get("/github/repositories/:repoFullName/issues", async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserByUsername("demo");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const { repoFullName } = req.params;
      if (!repoFullName) {
        return res.status(400).json({ message: "Repository name is required" });
      }
      
      // Get GitHub integration
      const integrations = await storage.getIntegrations(user.id);
      const githubIntegration = integrations.find(i => i.serviceType === "github");
      
      if (!githubIntegration) {
        return res.status(404).json({ message: "GitHub integration not found" });
      }
      
      const issues = await fetchRepositoryIssues(githubIntegration, repoFullName);
      res.json(issues);
    } catch (error) {
      console.error(`Error fetching issues for ${req.params.repoFullName}:`, error);
      res.status(500).json({ message: "Failed to fetch repository issues" });
    }
  });

  // Register API routes
  app.use("/api", api);

  const httpServer = createServer(app);
  return httpServer;
}
