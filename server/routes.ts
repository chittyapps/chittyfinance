import express, { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertAiMessageSchema, insertIntegrationSchema, insertTaskSchema } from "@shared/schema";
import { getFinancialAdvice, generateCostReductionPlan } from "./lib/openai";
import { getAggregatedFinancialData, getCloudflareAnalytics } from "./lib/financialServices";
import { getRecurringCharges, getChargeOptimizations, manageRecurringCharge } from "./lib/chargeAutomation";
import { 
  fetchUserRepositories, 
  fetchRepositoryCommits, 
  fetchRepositoryPullRequests, 
  fetchRepositoryIssues 
} from "./lib/github";

export async function registerRoutes(app: Express): Promise<Server> {
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

    // Get financial summary
    let summary = await storage.getFinancialSummary(user.id);

    if (!summary) {
      // If no summary exists, we'd typically fetch from external services
      // For demo, create a new summary record
      summary = await storage.createFinancialSummary({
        userId: user.id,
        cashOnHand: 127842.50,
        monthlyRevenue: 43291.75,
        monthlyExpenses: 26142.30,
        outstandingInvoices: 18520.00,
      });
    }

    res.json(summary);
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

    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const transactions = await storage.getTransactions(user.id, limit);
    
    res.json(transactions);
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

  // Cloudflare Analytics Routes
  
  // Get Cloudflare analytics
  api.get("/cloudflare/analytics", async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserByUsername("demo");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const { zoneId } = req.query;
      const analytics = await getCloudflareAnalytics(zoneId as string);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching Cloudflare analytics:", error);
      res.status(500).json({ message: "Failed to fetch Cloudflare analytics" });
    }
  });

  // Register API routes
  app.use("/api", api);

  const httpServer = createServer(app);
  return httpServer;
}
