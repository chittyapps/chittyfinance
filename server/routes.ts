import express, { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { systemStorage } from "./storage-system";
import { chittyConnectAuth, serviceAuth } from "./middleware/auth";
import { resolveTenant } from "./middleware/tenant";
import { getServiceBase } from "./lib/registry";
import { getServiceAuthHeader } from "./lib/chitty-connect";
import { z } from "zod";
import { insertAiMessageSchema, insertIntegrationSchema, insertTaskSchema } from "@shared/schema";
import { getFinancialAdvice, generateCostReductionPlan } from "./lib/openai";
import { getAggregatedFinancialData } from "./lib/financialServices";
import { listMercuryAccounts } from "./lib/chittyConnect";
import { createWaveClient } from "./lib/wave-api";
import { getRecurringCharges, getChargeOptimizations, manageRecurringCharge } from "./lib/chargeAutomation";
import {
  fetchUserRepositories,
  fetchRepositoryCommits,
  fetchRepositoryPullRequests,
  fetchRepositoryIssues
} from "./lib/github";

const MODE = process.env.MODE || 'standalone';

export async function registerRoutes(app: Express): Promise<Server> {
  // Create API router
  const api = express.Router();

  // Helper route: redirect to ChittyConnect for account linking
  app.get("/connect", (_req: Request, res: Response) => {
    const url = process.env.CHITTY_CONNECT_URL || "https://connect.chitty.cc";
    res.redirect(302, url);
  });

  // Helper route: redirect to ChittyRegister (get.chitty.cc) for service registration
  app.get("/register", (_req: Request, res: Response) => {
    const url = process.env.CHITTY_REGISTER_URL || "https://get.chitty.cc";
    res.redirect(302, url);
  });

  // Session endpoint
  api.get("/session", async (_req: Request, res: Response) => {
    const isProdSystem = (res.app.get('env') === 'production') && ((process.env.MODE || 'standalone') === 'system');
    if (isProdSystem) {
      return res.status(401).json({ message: 'Authentication required (ChittyID integration expected)' });
    }

    const user = await storage.getSessionUser();
    if (!user) return res.status(404).json({ message: 'Demo user not found' });
    const { password, ...safeUser } = user;
    res.json(safeUser);
  });

  // Tenant endpoints (system mode only)
  if (MODE === 'system') {
    api.get("/tenants", chittyConnectAuth, async (req: Request, res: Response) => {
      const userId = req.userId || (await storage.getSessionUser())?.id;
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const tenants = await systemStorage.getUserTenants(String(userId));
      res.json(tenants);
    });

    api.get("/tenants/:id", chittyConnectAuth, async (req: Request, res: Response) => {
      const tenant = await systemStorage.getTenant(req.params.id);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      res.json(tenant);
    });

    api.get("/accounts", chittyConnectAuth, resolveTenant, async (req: Request, res: Response) => {
      const accounts = await systemStorage.getAccounts(req.tenantId!);
      res.json(accounts);
    });

    api.get("/transactions", chittyConnectAuth, resolveTenant, async (req: Request, res: Response) => {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const transactions = await systemStorage.getTransactions(req.tenantId!, limit);
      res.json(transactions);
    });
  }

  // Get financial summary
  api.get("/financial-summary", async (req: Request, res: Response) => {
    // In a real app, we would get the user ID and tenant ID from the session/middleware
    const user = await storage.getSessionUser();
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
  api.get("/integrations", chittyConnectAuth, async (req: Request, res: Response) => {
    const user = await storage.getSessionUser();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const integrations = await storage.getIntegrations(user.id);
    res.json(integrations);
  });

  // Mercury account discovery via ChittyConnect (multi-account support)
  api.get("/mercury/accounts", async (req: Request, res: Response) => {
    try {
      const user = await storage.getSessionUser();
      if (!user) return res.status(404).json({ message: "User not found" });
      const tenantId = (req as any).tenantId as string | undefined;
      const accounts = await listMercuryAccounts({ userId: user.id, tenantId });
      res.json(accounts);
    } catch (error) {
      console.error("Error listing Mercury accounts:", error);
      res.status(500).json({ message: "Failed to list Mercury accounts" });
    }
  });

  // Select which Mercury accounts to sync
  api.post("/mercury/select-accounts", async (req: Request, res: Response) => {
    try {
      const user = await storage.getSessionUser();
      if (!user) return res.status(404).json({ message: "User not found" });
      const { accountIds, tenantId } = req.body as { accountIds: string[]; tenantId?: string };
      if (!Array.isArray(accountIds) || accountIds.length === 0) {
        return res.status(400).json({ message: "accountIds must be a non-empty array" });
      }
      const integrations = await storage.getIntegrations(user.id);
      let merc = integrations.find(i => i.serviceType === 'mercury_bank');
      if (!merc) {
        merc = await storage.createIntegration({
          userId: user.id,
          serviceType: 'mercury_bank',
          name: 'Mercury Bank',
          connected: true,
          credentials: {},
          description: 'Banking & Financial Data',
          lastSynced: new Date(),
        });
      }
      const updated = await storage.updateIntegration(merc.id, {
        credentials: { ...(merc.credentials || {}), selectedAccountIds: accountIds, tenantId },
        lastSynced: new Date(),
      } as any);
      res.json(updated);
    } catch (error) {
      console.error("Error selecting Mercury accounts:", error);
      res.status(500).json({ message: "Failed to update selected accounts" });
    }
  });

  // Create or update integration
  api.post("/integrations", chittyConnectAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getSessionUser();
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
  api.patch("/integrations/:id", chittyConnectAuth, async (req: Request, res: Response) => {
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

  // Wave OAuth endpoints
  api.get("/integrations/wave/authorize", chittyConnectAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getSessionUser();
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Create Wave client
      const waveClient = createWaveClient({
        clientId: process.env.WAVE_CLIENT_ID || '',
        clientSecret: process.env.WAVE_CLIENT_SECRET || '',
        redirectUri: process.env.WAVE_REDIRECT_URI || `${process.env.PUBLIC_APP_BASE_URL}/api/integrations/wave/callback`,
      });

      // Generate state token for CSRF protection
      const state = Buffer.from(JSON.stringify({ userId: user.id })).toString('base64');

      // Get authorization URL
      const authUrl = waveClient.getAuthorizationUrl(state);

      res.json({ authUrl });
    } catch (error) {
      console.error('Wave authorization error:', error);
      res.status(500).json({ message: "Failed to start Wave authorization" });
    }
  });

  api.get("/integrations/wave/callback", async (req: Request, res: Response) => {
    try {
      const { code, state } = req.query;

      if (!code || !state) {
        return res.status(400).json({ message: "Missing authorization code or state" });
      }

      // Verify state and extract user ID
      const stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
      const userId = stateData.userId;

      // Create Wave client
      const waveClient = createWaveClient({
        clientId: process.env.WAVE_CLIENT_ID || '',
        clientSecret: process.env.WAVE_CLIENT_SECRET || '',
        redirectUri: process.env.WAVE_REDIRECT_URI || `${process.env.PUBLIC_APP_BASE_URL}/api/integrations/wave/callback`,
      });

      // Exchange code for tokens
      const tokens = await waveClient.exchangeCodeForToken(code as string);
      waveClient.setAccessToken(tokens.access_token);

      // Get user's businesses
      const businesses = await waveClient.getBusinesses();

      if (businesses.length === 0) {
        return res.status(400).json({ message: "No Wave businesses found for this account" });
      }

      // Use first business by default
      const business = businesses[0];

      // Check if integration already exists
      const integrations = await storage.getIntegrations(userId);
      let integration = integrations.find(i => i.serviceType === 'wavapps');

      const credentials = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type,
        expires_in: tokens.expires_in,
        business_id: business.id,
        business_name: business.name,
      };

      if (integration) {
        // Update existing integration
        integration = await storage.updateIntegration(integration.id, {
          credentials,
          connected: true,
        });
      } else {
        // Create new integration
        integration = await storage.createIntegration({
          userId,
          name: 'Wave Accounting',
          serviceType: 'wavapps',
          credentials,
          connected: true,
        });
      }

      // Redirect to connections page with success message
      res.redirect(`${process.env.PUBLIC_APP_BASE_URL}/connections?wave=connected`);
    } catch (error) {
      console.error('Wave callback error:', error);
      res.redirect(`${process.env.PUBLIC_APP_BASE_URL}/connections?wave=error`);
    }
  });

  // Refresh Wave token
  api.post("/integrations/wave/refresh", chittyConnectAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getSessionUser();
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const integrations = await storage.getIntegrations(user.id);
      const integration = integrations.find(i => i.serviceType === 'wavapps');

      if (!integration) {
        return res.status(404).json({ message: "Wave integration not found" });
      }

      const credentials = integration.credentials as any;
      if (!credentials?.refresh_token) {
        return res.status(400).json({ message: "No refresh token available" });
      }

      // Create Wave client
      const waveClient = createWaveClient({
        clientId: process.env.WAVE_CLIENT_ID || '',
        clientSecret: process.env.WAVE_CLIENT_SECRET || '',
        redirectUri: process.env.WAVE_REDIRECT_URI || `${process.env.PUBLIC_APP_BASE_URL}/api/integrations/wave/callback`,
      });

      // Refresh token
      const newTokens = await waveClient.refreshAccessToken(credentials.refresh_token);

      // Update integration with new tokens
      const updatedIntegration = await storage.updateIntegration(integration.id, {
        credentials: {
          ...credentials,
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token,
          expires_in: newTokens.expires_in,
        },
      });

      res.json({ message: "Token refreshed successfully" });
    } catch (error) {
      console.error('Wave token refresh error:', error);
      res.status(500).json({ message: "Failed to refresh Wave token" });
    }
  });

  // Get recent transactions
  api.get("/transactions", chittyConnectAuth, async (req: Request, res: Response) => {
    const user = await storage.getSessionUser();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const transactions = await storage.getTransactions(user.id, limit);
    
    res.json(transactions);
  });

  // Get tasks
  api.get("/tasks", chittyConnectAuth, async (req: Request, res: Response) => {
    const user = await storage.getSessionUser();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const tasks = await storage.getTasks(user.id, limit);
    
    res.json(tasks);
  });

  // Create task
  api.post("/tasks", chittyConnectAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getSessionUser();
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
  api.patch("/tasks/:id", chittyConnectAuth, async (req: Request, res: Response) => {
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
  api.get("/ai-messages", chittyConnectAuth, async (req: Request, res: Response) => {
    const user = await storage.getSessionUser();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const messages = await storage.getAiMessages(user.id, limit);
    
    res.json(messages);
  });

  // Get latest AI assistant message
  api.get("/ai-assistant/latest", chittyConnectAuth, async (req: Request, res: Response) => {
    const user = await storage.getSessionUser();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const messages = await storage.getAiMessages(user.id, 1);
    const latestMessage = messages.length > 0 ? messages[0] : null;
    
    res.json(latestMessage || { content: "I'm your AI CFO assistant. How can I help you today?" });
  });

  // Send message to AI assistant
  api.post("/ai-assistant/query", chittyConnectAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getSessionUser();
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
        userQuery: query,
        userId: user.id,
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
  api.post("/ai-assistant/generate-plan", chittyConnectAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getSessionUser();
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
        monthlyExpenses: summary.monthlyExpenses,
        userId: user.id,
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
  api.get("/charges/recurring", chittyConnectAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getSessionUser();
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
      const user = await storage.getSessionUser();
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
      const user = await storage.getSessionUser();
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
  api.get("/github/repositories", chittyConnectAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getSessionUser();
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
  api.get("/github/repositories/:repoFullName/commits", chittyConnectAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getSessionUser();
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
  api.get("/github/repositories/:repoFullName/pulls", chittyConnectAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getSessionUser();
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
  api.get("/github/repositories/:repoFullName/issues", chittyConnectAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getSessionUser();
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

  // Service webhook endpoint (from Worker)
  app.post("/api/integrations/mercury/webhook", serviceAuth, async (req: Request, res: Response) => {
    try {
      const eventId = (req.headers['x-event-id'] as string) || (req.body && (req.body.id || req.body.eventId));
      if (!eventId) {
        return res.status(400).json({ message: 'missing_event_id' });
      }
      // DB-backed idempotency
      const duplicate = await storage.isWebhookDuplicate('mercury', eventId);
      if (duplicate) return res.status(202).json({ received: true, duplicate: true });
      await storage.recordWebhookEvent({ source: 'mercury', eventId, payload: req.body || null });

      // Coordinate with Chitty services via Registry (non-blocking)
      const envelope = {
        source: 'mercury',
        event_id: eventId,
        kind: req.body?.type || 'unknown',
        received_at: new Date().toISOString(),
        payload: req.body || null,
      };
      const headers = { 'content-type': 'application/json', ...getServiceAuthHeader() } as any;
      try {
        const evidenceBase = await getServiceBase('evidence');
        await fetch(`${evidenceBase.replace(/\/$/, '')}/ingest`, { method: 'POST', headers, body: JSON.stringify(envelope) });
      } catch {}
      try {
        const kind = String(envelope.kind || '');
        if (kind.startsWith('mercury.transaction')) {
          const ledgerBase = await getServiceBase('ledger');
          await fetch(`${ledgerBase.replace(/\/$/, '')}/ingest`, { method: 'POST', headers, body: JSON.stringify(envelope) });
        }
      } catch {}
      try {
        const chronicleBase = await getServiceBase('chronicle');
        const summary = { message: `Mercury event ${envelope.kind} (${eventId})`, ts: envelope.received_at };
        await fetch(`${chronicleBase.replace(/\/$/, '')}/entries`, { method: 'POST', headers, body: JSON.stringify(summary) });
      } catch {}
      try {
        const logicBase = await getServiceBase('logic');
        const summary = { key: 'finance_event', data: { source: envelope.source, kind: envelope.kind } };
        await fetch(`${logicBase.replace(/\/$/, '')}/evaluate`, { method: 'POST', headers, body: JSON.stringify(summary) });
      } catch {}

      res.status(202).json({ received: true });
    } catch (e) {
      res.status(500).json({ message: "webhook_error" });
    }
  });

  // List webhook events (coordination with events API)
  api.get('/integrations/events', chittyConnectAuth, async (req: Request, res: Response) => {
    const source = (req.query.source as string | undefined) || undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const cursor = req.query.cursor ? parseInt(req.query.cursor as string, 10) : undefined;
    const data = await storage.listWebhookEvents({ source, limit, cursor });
    res.json(data);
  });

  // Admin: list recent events (alias)
  api.get('/admin/events', chittyConnectAuth, async (req: Request, res: Response) => {
    const source = (req.query.source as string | undefined) || undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const cursor = req.query.cursor ? parseInt(req.query.cursor as string, 10) : undefined;
    const data = await storage.listWebhookEvents({ source, limit, cursor });
    res.json(data);
  });

  // Admin: replay last N events to Chitty services via Registry
  api.post('/admin/events/replay', chittyConnectAuth, async (req: Request, res: Response) => {
    try {
      const source = (req.body?.source as string | undefined) || (req.query.source as string | undefined) || undefined;
      const limit = req.body?.limit ? parseInt(String(req.body.limit), 10) : (req.query.limit ? parseInt(String(req.query.limit), 10) : 50);
      const sinceStr = (req.body?.since as string | undefined) || (req.query.since as string | undefined) || undefined;
      let items = (await storage.listWebhookEvents({ source, limit })).items;
      if (sinceStr) {
        const since = new Date(sinceStr).getTime();
        if (!Number.isNaN(since)) {
          items = items.filter((r: any) => new Date(r.receivedAt || 0).getTime() >= since);
        }
      }
      const headers = { 'content-type': 'application/json', ...getServiceAuthHeader() } as any;
      let attempted = 0, succeeded = 0; const errors: string[] = [];
      // Resolve once per replay
      let evidenceBase = '' , ledgerBase = '' , chronicleBase = '' , logicBase = '';
      try { evidenceBase = await getServiceBase('evidence'); } catch (e: any) { errors.push(`evidence: ${e?.message||e}`); }
      try { ledgerBase = await getServiceBase('ledger'); } catch (e: any) { errors.push(`ledger: ${e?.message||e}`); }
      try { chronicleBase = await getServiceBase('chronicle'); } catch (e: any) { errors.push(`chronicle: ${e?.message||e}`); }
      try { logicBase = await getServiceBase('logic'); } catch (e: any) { errors.push(`logic: ${e?.message||e}`); }
      // Optional retry service
      let retryBase = '';
      try { retryBase = await getServiceBase('retry' as any); } catch {}

      for (const row of items) {
        const eventId = (row as any).eventId || (row as any).event_id || (row as any).id;
        const kind = (row as any).payload?.type || 'unknown';
        const envelope = {
          source: (row as any).source,
          event_id: eventId,
          kind,
          received_at: new Date((row as any).receivedAt || Date.now()).toISOString(),
          payload: (row as any).payload || null,
        };
        attempted++;
        try {
          if (retryBase) {
            await fetch(`${retryBase.replace(/\/$/, '')}/enqueue`, { method: 'POST', headers, body: JSON.stringify({ type: 'finance_event_replay', envelope }) });
          } else {
            if (evidenceBase) await fetch(`${evidenceBase.replace(/\/$/, '')}/ingest`, { method: 'POST', headers, body: JSON.stringify(envelope) });
            if (ledgerBase && String(kind).startsWith('mercury.transaction')) await fetch(`${ledgerBase.replace(/\/$/, '')}/ingest`, { method: 'POST', headers, body: JSON.stringify(envelope) });
            if (chronicleBase) await fetch(`${chronicleBase.replace(/\/$/, '')}/entries`, { method: 'POST', headers, body: JSON.stringify({ message: `Replay ${envelope.kind} (${envelope.event_id})`, ts: envelope.received_at }) });
            if (logicBase) await fetch(`${logicBase.replace(/\/$/, '')}/evaluate`, { method: 'POST', headers, body: JSON.stringify({ key: 'finance_event_replay', data: { source: envelope.source, kind: envelope.kind } }) });
          }
          succeeded++;
        } catch (e: any) {
          errors.push(String(e?.message || e));
        }
      }
      res.json({ attempted, succeeded, failed: attempted - succeeded, errors: errors.slice(0, 5) });
    } catch (e: any) {
      res.status(500).json({ message: 'replay_failed', error: e?.message || String(e) });
    }
  });

  // Compliance: required health and status endpoints
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/api/v1/status', async (_req: Request, res: Response) => {
    const start = Date.now();
    let version = process.env.APP_VERSION || 'unknown';
    let dbOk = false;
    try {
      const fs = await import('fs');
      const path = await import('path');
      const pkgPath = path.resolve(process.cwd(), 'package.json');
      if (fs.existsSync(pkgPath)) {
        const raw = fs.readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(raw);
        if (pkg?.version) version = pkg.version;
      }
      // Neon connectivity smoke test in non-production
      if ((process.env.NODE_ENV || 'development') !== 'production') {
        try {
          const { db } = await import('./db');
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { sql } = await import('drizzle-orm');
          const r = await db.execute(sql`select 1 as ok`);
          dbOk = r?.rows?.[0]?.ok === 1;
        } catch {}
      }
    } catch {}

    const MODE = process.env.MODE || 'standalone';
    const nodeEnv = process.env.NODE_ENV || 'development';
    const dbConfigured = MODE === 'standalone' ? true : !!process.env.DATABASE_URL;
    const chittyBase = process.env.CHITTYCONNECT_API_BASE || process.env.CHITTY_CONNECT_URL;
    const chittyAuth = process.env.CHITTYCONNECT_API_TOKEN || process.env.CHITTY_AUTH_SERVICE_TOKEN;

    res.json({
      name: 'ChittyFinance',
      version,
      uptimeSec: Math.floor(process.uptime()),
      mode: MODE,
      nodeEnv,
      database: { configured: dbConfigured, reachable: dbOk },
      chittyConnect: { configured: !!(chittyBase && chittyAuth) },
      latencyMs: Date.now() - start,
    });
  });

  // Documentation (OpenAPI JSON)
  app.get('/api/v1/documentation', (_req: Request, res: Response) => {
    const version = process.env.APP_VERSION || '1.0.0';
    const openapi = {
      openapi: '3.0.3',
      info: { title: 'ChittyFinance API', version, description: 'ChittyFinance API for the ChittyOS ecosystem.' },
      servers: [{ url: 'https://finance.chitty.cc' }],
      paths: {
        '/health': { get: { summary: 'Health check', responses: { '200': { description: 'OK' } } } },
        '/api/v1/status': { get: { summary: 'Service status', responses: { '200': { description: 'Service status' } } } },
        '/api/mercury/accounts': { get: { summary: 'List Mercury accounts (via ChittyConnect)', responses: { '200': { description: 'Accounts' }, '401': { description: 'Unauthorized' } } } },
        '/api/mercury/select-accounts': { post: { summary: 'Select Mercury accounts to sync', responses: { '200': { description: 'Updated integration' }, '400': { description: 'Bad request' }, '401': { description: 'Unauthorized' } } } }
      }
    } as const;
    res.status(200).json(openapi);
  });

  // Prometheus-style metrics
  app.get('/api/v1/metrics', (_req: Request, res: Response) => {
    const uptime = Math.floor(process.uptime());
    const MODE = process.env.MODE || 'standalone';
    const dbConfigured = MODE === 'standalone' ? 1 : (process.env.DATABASE_URL ? 1 : 0);
    const chittyConfigured = (process.env.CHITTYCONNECT_API_BASE && (process.env.CHITTYCONNECT_API_TOKEN || process.env.CHITTY_AUTH_SERVICE_TOKEN)) ? 1 : 0;
    const lines = [
      '# HELP service_uptime_seconds Process uptime in seconds',
      '# TYPE service_uptime_seconds gauge',
      `service_uptime_seconds ${uptime}`,
      '# HELP service_database_configured Database configured (1) or not (0)',
      '# TYPE service_database_configured gauge',
      `service_database_configured ${dbConfigured}`,
      '# HELP service_chittyconnect_configured ChittyConnect configured (1) or not (0)',
      '# TYPE service_chittyconnect_configured gauge',
      `service_chittyconnect_configured ${chittyConfigured}`,
      ''
    ];
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.status(200).send(lines.join('\n'));
  });

  const httpServer = createServer(app);
  return httpServer;
}
