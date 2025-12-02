import express, { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { chittyConnectAuth, serviceAuth } from "./middleware/auth";
import { resolveTenant } from "./middleware/tenant";
import { getServiceBase } from "./lib/registry";
import { getServiceAuthHeader } from "./lib/chitty-connect";
import { z } from "zod";
import { insertAiMessageSchema, insertIntegrationSchema, insertTaskSchema } from "@shared/schema";
import { db } from "./db";
import { eq, and, inArray } from "drizzle-orm";
import * as schema from "../database/system.schema";
import { getFinancialAdvice, generateCostReductionPlan } from "./lib/openai";
import { getAggregatedFinancialData } from "./lib/financialServices";
import { listMercuryAccounts } from "./lib/chittyConnect";
import { createWaveClient } from "./lib/wave-api";
import { getRecurringCharges, getChargeOptimizations, manageRecurringCharge } from "./lib/chargeAutomation";
import { ensureCustomerForTenant, createCheckoutSession, verifyWebhook } from "./lib/stripe";
import {
  fetchUserRepositories,
  fetchRepositoryCommits,
  fetchRepositoryPullRequests,
  fetchRepositoryIssues
} from "./lib/github";
import { generateOAuthState, validateOAuthState } from "./lib/oauth-state";
import { requireIntegration } from "./lib/integration-validation";
import * as storageHelpers from "./lib/storage-helpers";
import { toStringId } from "./lib/id-compat";

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

  // System status endpoint (for mode detection)
  api.get("/v1/status", (_req: Request, res: Response) => {
    res.json({
      mode: MODE,
      version: "1.0.0",
      env: process.env.NODE_ENV || 'development',
    });
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
      const tenants = await storage.getUserTenants(String(userId));
      res.json(tenants);
    });

    api.get("/tenants/:id", chittyConnectAuth, async (req: Request, res: Response) => {
      const tenant = await storage.getTenant(req.params.id);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      res.json(tenant);
    });

    api.get("/accounts", chittyConnectAuth, resolveTenant, async (req: Request, res: Response) => {
      if (!storage.getAccounts) {
        return res.status(501).json({ error: 'Accounts not supported in this mode' });
      }
      const accounts = await storage.getAccounts(req.tenantId!);
      res.json(accounts);
    });

    api.get("/transactions", chittyConnectAuth, resolveTenant, async (req: Request, res: Response) => {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const transactions = await storage.getTransactions(req.tenantId!, limit);
      res.json(transactions);
    });

    // Property management endpoints (system mode only)
    api.get("/properties", chittyConnectAuth, resolveTenant, async (req: Request, res: Response) => {
      try {
        const properties = await db.select().from(schema.properties).where(eq(schema.properties.tenantId, req.tenantId!));
        res.json(properties);
      } catch (error) {
        console.error("Error fetching properties:", error);
        res.status(500).json({ error: "Failed to fetch properties" });
      }
    });

    api.get("/properties/:id", chittyConnectAuth, resolveTenant, async (req: Request, res: Response) => {
      try {
        const [property] = await db
          .select()
          .from(schema.properties)
          .where(and(eq(schema.properties.id, req.params.id), eq(schema.properties.tenantId, req.tenantId!)));

        if (!property) {
          return res.status(404).json({ error: "Property not found" });
        }

        res.json(property);
      } catch (error) {
        console.error("Error fetching property:", error);
        res.status(500).json({ error: "Failed to fetch property" });
      }
    });

    api.get("/properties/:id/units", chittyConnectAuth, resolveTenant, async (req: Request, res: Response) => {
      try {
        // Verify property belongs to current tenant
        const [property] = await db
          .select()
          .from(schema.properties)
          .where(and(eq(schema.properties.id, req.params.id), eq(schema.properties.tenantId, req.tenantId!)));

        if (!property) {
          return res.status(404).json({ error: "Property not found" });
        }

        const units = await db.select().from(schema.units).where(eq(schema.units.propertyId, req.params.id));
        res.json(units);
      } catch (error) {
        console.error("Error fetching units:", error);
        res.status(500).json({ error: "Failed to fetch units" });
      }
    });

    api.get("/properties/:id/leases", chittyConnectAuth, resolveTenant, async (req: Request, res: Response) => {
      try {
        // Get units for this property
        const units = await db.select().from(schema.units).where(eq(schema.units.propertyId, req.params.id));
        const unitIds = units.map((u: any) => u.id);

        if (unitIds.length === 0) {
          return res.json([]);
        }

        // Get leases for these units
        const leases = await db.select().from(schema.leases).where(inArray(schema.leases.unitId, unitIds));
        res.json(leases);
      } catch (error) {
        console.error("Error fetching leases:", error);
        res.status(500).json({ error: "Failed to fetch leases" });
      }
    });
  }

  // Get financial summary
  api.get("/financial-summary", async (req: Request, res: Response) => {
    const user = await storage.getSessionUser();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get financial summary (only available in standalone mode)
    if (storage.getFinancialSummary) {
      let summary = await storage.getFinancialSummary(toStringId(user.id));

      if (!summary && storage.createFinancialSummary) {
        summary = await storage.createFinancialSummary({
          userId: typeof user.id === 'number' ? user.id : parseInt(user.id, 10),
          cashOnHand: 127842.50,
          monthlyRevenue: 43291.75,
          monthlyExpenses: 26142.30,
          outstandingInvoices: 18520.00,
        });
      }

      return res.json(summary);
    }

    res.status(501).json({ message: "Financial summary not available in system mode" });
  });

  // Get integrations (multi-tenant aware)
  api.get("/integrations", chittyConnectAuth, async (req: Request, res: Response) => {
    try {
      const integrations = await storageHelpers.getIntegrations(req);
      res.json(integrations);
    } catch (error) {
      console.error("Error fetching integrations:", error);
      res.status(500).json({ message: "Failed to fetch integrations" });
    }
  });

  // Get integration configuration status
  api.get("/integrations/status", chittyConnectAuth, async (req: Request, res: Response) => {
    const { validateAllIntegrations } = await import("./lib/integration-validation");
    const status = validateAllIntegrations();
    res.json(status);
  });

  // Stripe connect: create/fetch customer and mark connected
  api.post("/integrations/stripe/connect", chittyConnectAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getSessionUser();
      if (!user) return res.status(404).json({ message: 'User not found' });
      const tenantId = (req as any).tenantId || String(user.id);
      const customerId = await ensureCustomerForTenant({ tenantId, tenantName: user.displayName, email: user.email });
      // Upsert integration record
      const integrations = await storage.getIntegrations(user.id);
      let stripeInt = integrations.find(i => i.serviceType === 'stripe');
      if (!stripeInt) {
        stripeInt = await storage.createIntegration({
          userId: user.id,
          serviceType: 'stripe',
          name: 'Stripe',
          connected: true,
          credentials: { customerId, tenantId },
          description: 'Payments',
          lastSynced: new Date(),
        });
      } else {
        stripeInt = await storage.updateIntegration(stripeInt.id, {
          connected: true,
          credentials: { ...(stripeInt.credentials||{}), customerId, tenantId },
          lastSynced: new Date(),
        }) as any;
      }
      res.json({ connected: true, customerId });
    } catch (e: any) {
      console.error('Stripe connect error', e);
      res.status(500).json({ message: 'Failed to connect Stripe' });
    }
  });

  // Stripe checkout: create ad-hoc session for custom amount
  api.post("/integrations/stripe/checkout", chittyConnectAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getSessionUser();
      if (!user) return res.status(404).json({ message: 'User not found' });
      const body = req.body as any;
      const amountCents = Number(body?.amountCents);
      if (!Number.isFinite(amountCents) || amountCents < 50) {
        return res.status(400).json({ message: 'amountCents must be >= 50' });
      }
      const label = String(body?.label || 'ChittyFinance Payment');
      const purpose = String(body?.purpose || 'test');
      const tenantId = (req as any).tenantId || String(user.id);
      const integrations = await storage.getIntegrations(user.id);
      let stripeInt = integrations.find(i => i.serviceType === 'stripe');
      let customerId = (stripeInt?.credentials as any)?.customerId as string | undefined;
      if (!customerId) {
        customerId = await ensureCustomerForTenant({ tenantId, tenantName: user.displayName, email: user.email });
      }
      const idempotencyKey = `checkout:${tenantId}:${Date.now()}`;
      const session = await createCheckoutSession({ tenantId, customerId, amountCents, label, purpose, idempotencyKey });
      res.json({ url: session.url, id: session.id });
    } catch (e: any) {
      console.error('Stripe checkout error', e);
      res.status(500).json({ message: 'Failed to create checkout session' });
    }
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
      const id = req.params.id;

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
      // Validate Wave credentials are configured
      requireIntegration('wave');

      const user = await storage.getSessionUser();
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Create Wave client
      const waveClient = createWaveClient({
        clientId: process.env.WAVE_CLIENT_ID!,
        clientSecret: process.env.WAVE_CLIENT_SECRET!,
        redirectUri: process.env.WAVE_REDIRECT_URI || `${process.env.PUBLIC_APP_BASE_URL}/api/integrations/wave/callback`,
      });

      // Generate secure state token with CSRF protection
      const state = generateOAuthState(user.id);

      // Get authorization URL
      const authUrl = waveClient.getAuthorizationUrl(state);

      res.json({ authUrl });
    } catch (error) {
      console.error('Wave authorization error:', error);

      if (error instanceof Error) {
        // Return specific error message for configuration issues
        if (error.message.includes('not configured')) {
          return res.status(503).json({
            message: "Wave integration not configured",
            details: error.message
          });
        }
      }

      res.status(500).json({ message: "Failed to start Wave authorization" });
    }
  });

  api.get("/integrations/wave/callback", async (req: Request, res: Response) => {
    try {
      const { code, state, error } = req.query;

      // Handle OAuth errors
      if (error) {
        console.error('Wave OAuth error:', error);
        return res.redirect(`${process.env.PUBLIC_APP_BASE_URL}/connections?wave=error&reason=${error}`);
      }

      if (!code || !state) {
        return res.redirect(`${process.env.PUBLIC_APP_BASE_URL}/connections?wave=error&reason=missing_params`);
      }

      // Validate and extract state data
      const stateData = validateOAuthState(state as string);
      if (!stateData) {
        console.error('Wave OAuth: Invalid or expired state token');
        return res.redirect(`${process.env.PUBLIC_APP_BASE_URL}/connections?wave=error&reason=invalid_state`);
      }

      const userId = typeof stateData.userId === 'string' ? parseInt(stateData.userId, 10) : stateData.userId;

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
      const integrations = await storage.getIntegrations(toStringId(userId));
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

  // Get tasks (multi-tenant aware)
  api.get("/tasks", chittyConnectAuth, async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const tasks = await storageHelpers.getTasks(req, limit);
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ message: "Failed to fetch tasks" });
    }
  });

  // Create task (multi-tenant aware)
  api.post("/tasks", chittyConnectAuth, async (req: Request, res: Response) => {
    try {
      const task = await storageHelpers.createTask(req, req.body);
      res.status(201).json(task);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid task data", errors: error.errors });
      }
      console.error("Error creating task:", error);
      res.status(500).json({ message: "Failed to create task" });
    }
  });

  // Update task (multi-tenant aware)
  api.patch("/tasks/:id", chittyConnectAuth, async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const task = await storageHelpers.getTask(req, id);

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      const updatedTask = await storageHelpers.updateTask(req, id, req.body);
      res.json(updatedTask);
    } catch (error) {
      console.error("Error updating task:", error);
      res.status(500).json({ message: "Failed to update task" });
    }
  });

  // Get AI messages (multi-tenant aware)
  api.get("/ai-messages", chittyConnectAuth, async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const messages = await storageHelpers.getAiMessages(req, limit);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching AI messages:", error);
      res.status(500).json({ message: "Failed to fetch AI messages" });
    }
  });

  // Get latest AI assistant message
  api.get("/ai-assistant/latest", chittyConnectAuth, async (req: Request, res: Response) => {
    const user = await storage.getSessionUser();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const userId = toStringId(user.id);
    const messages = await storage.getAiMessages(userId, userId, 1);
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

      const userId = toStringId(user.id);

      // Store user message
      await storage.createAiMessage({
        userId: typeof user.id === 'number' ? user.id : parseInt(user.id, 10),
        tenantId: typeof user.id === 'number' ? user.id : parseInt(user.id, 10),
        content: query,
        role: "user"
      });

      // Get financial data (standalone mode only)
      if (!storage.getFinancialSummary) {
        return res.status(501).json({ message: "AI assistant not available in system mode yet" });
      }

      const summary = await storage.getFinancialSummary(userId);
      if (!summary) {
        return res.status(404).json({ message: "Financial summary not found" });
      }

      // Get previous assistant message for context
      const previousMessages = await storage.getAiMessages(userId, userId, 2);
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

      // Get financial data (standalone mode only)
      if (!storage.getFinancialSummary) {
        return res.status(501).json({ message: "Cost reduction plan not available in system mode yet" });
      }

      const summary = await storage.getFinancialSummary(toStringId(user.id));
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
        tests: [] as Array<{ name: string, success: boolean, data: any, error?: string }>
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
      const universalData = await transformToUniversalFormat(user.id, integrations); // transformToUniversalFormat is not imported

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
  api.get("/universal-connector/secured", async (req: Request, res: Response) => { // isAuthenticated is not imported
    try {
      const user = req.user as any; // req.user is not available without isAuthenticated
      const userId = user.claims.sub;

      // Get the user from our database
      const dbUser = await storage.getUserByUsername("demo"); // For demo, we'll use the demo user
      if (!dbUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get all integrations to fetch data from
      const integrations = await storage.getIntegrations(dbUser.id);

      // Transform the data into universal format
      const universalData = await transformToUniversalFormat(dbUser.id, integrations); // transformToUniversalFormat is not imported

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
  // Stripe webhook (raw body needed for signature verification)
  app.post('/api/integrations/stripe/webhook', express.raw({ type: 'application/json' }), async (req: any, res: Response) => {
    try {
      const signature = req.headers['stripe-signature'];
      const event = verifyWebhook(req.body, signature);

      // Idempotency: record event using existing webhook store
      const eventId = event.id;
      const duplicate = await storage.isWebhookDuplicate('stripe', eventId);
      if (!duplicate) {
        await storage.recordWebhookEvent({ source: 'stripe', eventId, payload: event as any });
      }

      switch (event.type) {
        case 'checkout.session.completed':
        case 'payment_intent.succeeded':
        case 'payment_intent.payment_failed':
        case 'payment_intent.canceled':
          // For now, we just acknowledge and rely on events log
          break;
      }
      return res.json({ received: true });
    } catch (err) {
      console.error('Stripe webhook error', err);
      return res.status(400).send(`Webhook Error`);
    }
  });

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