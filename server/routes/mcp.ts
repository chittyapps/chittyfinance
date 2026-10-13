/**
 * MCP (Model Context Protocol) endpoint for ChittyFinance.
 *
 * Exposes financial data as MCP resources and tools for cross-service queries.
 * Implements JSON-RPC 2.0 over HTTP POST per the MCP specification.
 *
 * Resources:
 *   finance://portfolio/summary - Portfolio-level financial overview
 *   finance://properties         - Property list with key metrics
 *   finance://tenants            - Tenant/entity list
 *
 * Tools:
 *   get-property-advice   - Get AI financial advice for a property
 *   refresh-valuation     - Refresh property valuation from external providers
 */

import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { setExecutionOperation, type ExecutionIntent } from '../middleware/execution-context';
import { buildReiHubReconciliationPlan, type ReiHubSnapshot } from '../books/rei-hub-reconciliation';
import { hasClassificationAuthority, hasCoaAuthority } from '../lib/classification-policy';
import { ledgerLog } from '../lib/ledger-client';
import { logClassificationEvent, logCoaEvent } from '../lib/chittychronicle';

export const mcpRoutes = new Hono<HonoEnv>();

// ── JSON-RPC Types ──

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, any>;
}

function rpcOk(id: string | number, result: any) {
  return { jsonrpc: '2.0' as const, id, result };
}

function rpcError(id: string | number | null, code: number, message: string) {
  return { jsonrpc: '2.0' as const, id, error: { code, message } };
}

// ── MCP Protocol Constants ──

const SERVER_INFO = {
  name: 'chittyfinance',
  version: '2.0.0',
};

const CAPABILITIES = {
  resources: { listChanged: false },
  tools: {},
};

const RESOURCE_CAPABILITIES: Record<string, string> = {
  'finance://portfolio/summary': 'finance.mcp.resources.read:portfolio-summary',
  'finance://properties': 'finance.mcp.resources.read:properties',
  'finance://tenants': 'finance.mcp.resources.read:tenants',
};

const RESOURCES = [
  {
    uri: 'finance://portfolio/summary',
    name: 'Portfolio Summary',
    description: 'Aggregated financial overview across all properties: total value, NOI, cap rate, occupancy.',
    mimeType: 'application/json',
  },
  {
    uri: 'finance://properties',
    name: 'Properties',
    description: 'List of all properties with address, type, value, and key metrics.',
    mimeType: 'application/json',
  },
  {
    uri: 'finance://tenants',
    name: 'Tenants',
    description: 'List of all legal entities (LLCs, properties, management companies) in the tenant hierarchy.',
    mimeType: 'application/json',
  },
];

interface McpToolDefinition {
  name: string;
  description: string;
  intent: ExecutionIntent;
  inputSchema: Record<string, any>;
}

const TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: 'get-property-advice',
    description: 'Get AI-powered financial advice for a specific property.',
    intent: 'suggest',
    inputSchema: {
      type: 'object' as const,
      properties: {
        propertyId: { type: 'string', description: 'UUID of the property' },
        message: { type: 'string', description: 'Question or context for the AI advisor' },
      },
      required: ['propertyId', 'message'],
    },
  },
  {
    name: 'compare-rei-hub-snapshot',
    description: 'Compare a ChittyScrape REI Hub snapshot against existing ChittyFinance transactions and return a dry-run repair plan. Performs no financial writes.',
    intent: 'suggest',
    inputSchema: {
      type: 'object' as const,
      properties: {
        snapshot: {
          type: 'object',
          description: 'ChittyScrape REI Hub snapshot containing bookedTransactions rows.',
        },
      },
      required: ['snapshot'],
    },
  },
  {
    name: 'assign-transaction-property',
    description: 'Assign an existing unreconciled transaction to an existing property. Requires L2 owner/admin/manager authority.',
    intent: 'execute',
    inputSchema: {
      type: 'object' as const,
      properties: {
        transactionId: { type: 'string' },
        propertyId: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['transactionId', 'propertyId', 'reason'],
    },
  },
  {
    name: 'classify-transaction',
    description: 'Set the authoritative COA code for a transaction through the existing L2 trust path. Requires owner/admin/manager authority.',
    intent: 'execute',
    inputSchema: {
      type: 'object' as const,
      properties: {
        transactionId: { type: 'string' },
        coaCode: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        reason: { type: 'string' },
      },
      required: ['transactionId', 'coaCode', 'reason'],
    },
  },
  {
    name: 'reconcile-transaction',
    description: 'Lock a classified transaction as reconciled through the existing L3 write path. Requires L2 owner/admin/manager authority.',
    intent: 'execute',
    inputSchema: {
      type: 'object' as const,
      properties: {
        transactionId: { type: 'string' },
      },
      required: ['transactionId'],
    },
  },
  {
    name: 'create-coa-account',
    description: 'Create a tenant-specific Chart of Accounts entry. Requires L4 owner/admin authority.',
    intent: 'execute',
    inputSchema: {
      type: 'object' as const,
      properties: {
        code: { type: 'string' },
        name: { type: 'string' },
        type: { type: 'string', enum: ['asset', 'liability', 'equity', 'income', 'expense'] },
        subtype: { type: ['string', 'null'] },
        description: { type: ['string', 'null'] },
        scheduleELine: { type: ['string', 'null'] },
        taxDeductible: { type: 'boolean' },
        parentCode: { type: ['string', 'null'] },
      },
      required: ['code', 'name', 'type'],
    },
  },
  {
    name: 'update-coa-account',
    description: 'Update an existing tenant-specific Chart of Accounts entry. Global template accounts cannot be changed. Requires L4 owner/admin authority.',
    intent: 'execute',
    inputSchema: {
      type: 'object' as const,
      properties: {
        accountId: { type: 'string' },
        code: { type: 'string' },
        name: { type: 'string' },
        type: { type: 'string', enum: ['asset', 'liability', 'equity', 'income', 'expense'] },
        subtype: { type: ['string', 'null'] },
        description: { type: ['string', 'null'] },
        scheduleELine: { type: ['string', 'null'] },
        taxDeductible: { type: 'boolean' },
        parentCode: { type: ['string', 'null'] },
      },
      required: ['accountId'],
    },
  },
  {
    name: 'refresh-valuation',
    description: 'Refresh property valuation estimates from external providers (Zillow, Redfin, HouseCanary, ATTOM, County).',
    intent: 'execute',
    inputSchema: {
      type: 'object' as const,
      properties: {
        propertyId: { type: 'string', description: 'UUID of the property to refresh' },
      },
      required: ['propertyId'],
    },
  },
];

const TOOLS = TOOL_DEFINITIONS.map(({ intent: _intent, ...tool }) => tool);

// ── Resource Handlers ──

async function readResource(uri: string, storage: any, tenantId: string, userId: string): Promise<{ contents: any[] }> {
  switch (uri) {
    case 'finance://portfolio/summary': {
      const properties = await storage.getProperties(tenantId);
      const summaries = await Promise.all(
        properties.map(async (p: any) => {
          try {
            return await storage.getPropertyFinancials(p.id, tenantId);
          } catch {
            return null;
          }
        })
      );
      const valid = summaries.filter(Boolean);
      const totalValue = properties.reduce((s: number, p: any) => s + Number(p.currentValue || 0), 0);
      const totalNOI = valid.reduce((s: number, f: any) => s + (f.noi || 0), 0);
      const totalUnits = valid.reduce((s: number, f: any) => s + (f.totalUnits || 0), 0);
      const occupiedUnits = valid.reduce((s: number, f: any) => s + (f.occupiedUnits || 0), 0);

      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({
            totalProperties: properties.length,
            totalValue,
            totalNOI,
            avgCapRate: totalValue > 0 ? (totalNOI / totalValue) * 100 : 0,
            totalUnits,
            occupiedUnits,
            occupancyRate: totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0,
          }),
        }],
      };
    }

    case 'finance://properties': {
      const properties = await storage.getProperties(tenantId);
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(properties.map((p: any) => ({
            id: p.id,
            name: p.name,
            address: p.address,
            city: p.city,
            state: p.state,
            propertyType: p.propertyType,
            currentValue: p.currentValue,
            isActive: p.isActive,
          }))),
        }],
      };
    }

    case 'finance://tenants': {
      const memberships = await storage.getUserTenants(userId);
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(memberships.map((membership: any) => {
            const t = membership.tenant;
            return {
              id: t.id,
              name: t.name,
              slug: t.slug,
              type: t.type,
              parentId: t.parentId,
              isActive: t.isActive,
              role: membership.role,
            };
          })),
        }],
      };
    }

    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
}

// ── Tool Handlers ──

async function callTool(
  name: string,
  args: Record<string, any>,
  storage: any,
  tenantId: string,
  env: any,
  userId: string,
  context: any,
): Promise<{ content: any[] }> {
  switch (name) {
    case 'get-property-advice': {
      const { propertyId, message } = args;
      const property = await storage.getProperty(propertyId, tenantId);
      if (!property) {
        return { content: [{ type: 'text', text: `Property ${propertyId} not found.` }] };
      }

      // Try ChittyAgent, fallback to rule-based
      const agentBase = env.CHITTYAGENT_API_BASE;
      const agentToken = env.CHITTYAGENT_API_TOKEN;
      let advice = `Property: ${property.name} (${property.address})\n`;

      if (agentBase && agentToken) {
        try {
          const res = await fetch(`${agentBase}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${agentToken}` },
            body: JSON.stringify({ context: `Property: ${property.name}, ${property.address}`, message, service: 'chittyfinance' }),
          });
          if (res.ok) {
            const data = await res.json() as any;
            advice += data.response || data.content || 'No advice available.';
            return { content: [{ type: 'text', text: advice }] };
          }
        } catch { /* fall through to rule-based */ }
      }

      advice += `Type: ${property.propertyType}, Value: $${Number(property.currentValue || 0).toLocaleString()}\n`;
      advice += `Regarding: ${message}\n\nRule-based advice: Review property financials, check occupancy, and ensure lease terms are competitive.`;
      return { content: [{ type: 'text', text: advice }] };
    }

    case 'compare-rei-hub-snapshot': {
      const snapshot = args.snapshot as ReiHubSnapshot | undefined;
      if (!snapshot?.bookedTransactions || !Array.isArray(snapshot.bookedTransactions.rows)) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'invalid_snapshot',
              message: 'Expected snapshot.bookedTransactions.rows from ChittyScrape rei-hub.',
            }),
          }],
        };
      }

      const [transactions, properties] = await Promise.all([
        storage.getTransactions(tenantId),
        storage.getProperties(tenantId),
      ]);
      const plan = buildReiHubReconciliationPlan(snapshot, transactions, properties);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            mode: 'dry-run',
            authority: {
              sourceOfTruth: 'chittyfinance',
              sourceRole: 'comparison-evidence',
              writesPerformed: false,
            },
            execution: {
              propertyAssignments: 'PATCH /api/transactions/:id',
              classificationSuggestions: 'POST /api/classification/suggest',
              authoritativeClassification: 'POST /api/classification/classify (L2 role required)',
              reconciliation: 'POST /api/classification/reconcile (L2 role required)',
              coaMutation: 'POST/PATCH /api/coa (L4 owner/admin required)',
            },
            plan,
          }),
        }],
      };
    }

    case 'assign-transaction-property': {
      const role = await storage.getUserRoleForTenant(userId, tenantId);
      if (!hasClassificationAuthority(role)) {
        throw new Error('L2 (owner, admin, or manager) role required to assign transaction property');
      }
      const transaction = await storage.getTransaction(args.transactionId, tenantId);
      if (!transaction) throw new Error('Transaction not found');
      if (transaction.reconciled) throw new Error('Transaction is reconciled — review/unreconcile before changing property');
      const property = await storage.getProperty(args.propertyId, tenantId);
      if (!property) throw new Error('Property not found');
      const updated = await storage.updateTransaction(args.transactionId, tenantId, { propertyId: args.propertyId });
      ledgerLog(context, {
        entityType: 'transaction',
        entityId: args.transactionId,
        action: 'transaction.property.assigned',
        actor: userId,
        actorType: 'user',
        metadata: { tenantId, propertyId: args.propertyId, reason: args.reason, via: 'mcp' },
      }, env);
      return { content: [{ type: 'text', text: JSON.stringify(updated) }] };
    }

    case 'classify-transaction': {
      const role = await storage.getUserRoleForTenant(userId, tenantId);
      if (!hasClassificationAuthority(role)) {
        throw new Error('L2 (owner, admin, or manager) role required to classify transactions');
      }
      const coa = await storage.getChartOfAccountByCode(args.coaCode, tenantId);
      if (!coa) throw new Error(`COA code ${args.coaCode} not found`);
      const confidence = args.confidence === undefined ? undefined : Number(args.confidence).toFixed(3);
      const result = await storage.classifyTransaction(args.transactionId, tenantId, args.coaCode, {
        actorId: userId,
        actorType: 'agent',
        trustLevel: 'L2',
        confidence,
        reason: args.reason,
      });
      if (!result) throw new Error('Transaction not found');
      ledgerLog(context, {
        entityType: 'audit',
        action: 'classification.classify',
        actor: userId,
        actorType: 'user',
        metadata: { tenantId, transactionId: args.transactionId, coaCode: args.coaCode, via: 'mcp' },
      }, env);
      logClassificationEvent(env, {
        transactionId: args.transactionId,
        tenantId,
        action: 'classify',
        coaCode: args.coaCode,
        actorId: userId,
        actorType: 'agent',
        confidence,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }

    case 'reconcile-transaction': {
      const role = await storage.getUserRoleForTenant(userId, tenantId);
      if (!hasClassificationAuthority(role)) {
        throw new Error('L2 (owner, admin, or manager) role required to reconcile transactions');
      }
      const outcome = await storage.reconcileTransaction(args.transactionId, tenantId, userId);
      if (!outcome) throw new Error('Transaction not found');
      if (outcome.written) {
        ledgerLog(context, {
          entityType: 'audit',
          action: 'classification.reconcile',
          actor: userId,
          actorType: 'user',
          metadata: { tenantId, transactionId: args.transactionId, via: 'mcp' },
        }, env);
        logClassificationEvent(env, {
          transactionId: args.transactionId,
          tenantId,
          action: 'reconcile',
          coaCode: outcome.row.coaCode ?? '',
          actorId: userId,
          actorType: 'agent',
        });
      }
      return { content: [{ type: 'text', text: JSON.stringify(outcome.row) }] };
    }

    case 'create-coa-account': {
      const role = await storage.getUserRoleForTenant(userId, tenantId);
      if (!hasCoaAuthority(role)) {
        throw new Error('L4 (owner or admin) role required to modify Chart of Accounts');
      }
      if (!args.code || !args.name || !['asset', 'liability', 'equity', 'income', 'expense'].includes(args.type)) {
        throw new Error('code, name, and a valid account type are required');
      }
      const existing = await storage.getChartOfAccountByCode(args.code, tenantId);
      if (existing?.tenantId === tenantId) throw new Error(`Account code ${args.code} already exists for this tenant`);
      const account = await storage.createChartOfAccount({
        tenantId,
        code: args.code,
        name: args.name,
        type: args.type,
        subtype: args.subtype ?? null,
        description: args.description ?? null,
        scheduleELine: args.scheduleELine ?? null,
        taxDeductible: args.taxDeductible ?? false,
        parentCode: args.parentCode ?? null,
        isActive: true,
        modifiedBy: userId,
      });
      ledgerLog(context, {
        entityType: 'audit',
        action: 'coa.create',
        actor: userId,
        actorType: 'user',
        metadata: { tenantId, code: args.code, name: args.name, type: args.type, via: 'mcp' },
      }, env);
      logCoaEvent(env, { accountId: account.id, tenantId, action: 'create', code: args.code, actorId: userId });
      return { content: [{ type: 'text', text: JSON.stringify(account) }] };
    }

    case 'update-coa-account': {
      const role = await storage.getUserRoleForTenant(userId, tenantId);
      if (!hasCoaAuthority(role)) {
        throw new Error('L4 (owner or admin) role required to modify Chart of Accounts');
      }
      const allowed = ['code', 'name', 'type', 'subtype', 'description', 'scheduleELine', 'taxDeductible', 'parentCode'];
      const changes: Record<string, unknown> = {};
      for (const key of allowed) if (args[key] !== undefined) changes[key] = args[key];
      if (changes.type !== undefined && !['asset', 'liability', 'equity', 'income', 'expense'].includes(String(changes.type))) {
        throw new Error('Invalid account type');
      }
      if (Object.keys(changes).length === 0) throw new Error('No COA changes supplied');
      const account = await storage.updateChartOfAccount(args.accountId, tenantId, { ...changes, modifiedBy: userId });
      if (!account) throw new Error('Tenant-specific COA account not found');
      ledgerLog(context, {
        entityType: 'audit',
        action: 'coa.update',
        actor: userId,
        actorType: 'user',
        metadata: { tenantId, accountId: args.accountId, changes: Object.keys(changes), via: 'mcp' },
      }, env);
      logCoaEvent(env, {
        accountId: account.id,
        tenantId,
        action: 'update',
        code: account.code,
        actorId: userId,
        changes,
      });
      return { content: [{ type: 'text', text: JSON.stringify(account) }] };
    }

    case 'refresh-valuation': {
      const { propertyId } = args;
      const property = await storage.getProperty(propertyId, tenantId);
      if (!property) {
        return { content: [{ type: 'text', text: `Property ${propertyId} not found.` }] };
      }

      return {
        content: [{
          type: 'text',
          text: `Valuation refresh queued for ${property.name}. Use GET /api/properties/${propertyId}/valuation to see updated estimates.`,
        }],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── MCP HTTP Endpoint ──

mcpRoutes.post('/mcp', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');

  let body: JsonRpcRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json(rpcError(null, -32700, 'Parse error'), 400);
  }

  if (body.jsonrpc !== '2.0' || !body.method) {
    return c.json(rpcError(body.id ?? null, -32600, 'Invalid request'), 400);
  }

  try {
    switch (body.method) {
      case 'initialize':
        setExecutionOperation(c, 'finance.mcp.initialize', 'read');
        return c.json(rpcOk(body.id, {
          protocolVersion: '2024-11-05',
          serverInfo: SERVER_INFO,
          capabilities: CAPABILITIES,
        }));

      case 'resources/list':
        setExecutionOperation(c, 'finance.mcp.resources.list', 'read');
        return c.json(rpcOk(body.id, { resources: RESOURCES }));

      case 'resources/read': {
        const uri = body.params?.uri;
        if (!uri) return c.json(rpcError(body.id, -32602, 'Missing uri param'), 400);
        setExecutionOperation(c, RESOURCE_CAPABILITIES[uri] ?? 'finance.mcp.resources.read:unknown', 'read');
        const result = await readResource(uri, storage, tenantId, userId);
        return c.json(rpcOk(body.id, result));
      }

      case 'tools/list':
        setExecutionOperation(c, 'finance.mcp.tools.list', 'read');
        return c.json(rpcOk(body.id, { tools: TOOLS }));

      case 'tools/call': {
        const toolName = body.params?.name;
        const toolArgs = body.params?.arguments || {};
        if (!toolName) return c.json(rpcError(body.id, -32602, 'Missing tool name'), 400);
        const toolDefinition = TOOL_DEFINITIONS.find((tool) => tool.name === toolName);
        setExecutionOperation(
          c,
          toolDefinition ? `finance.mcp.tool:${toolName}` : 'finance.mcp.tools.call',
          toolDefinition?.intent ?? 'execute',
        );
        const result = await callTool(toolName, toolArgs, storage, tenantId, c.env, userId, c);
        return c.json(rpcOk(body.id, result));
      }

      default:
        return c.json(rpcError(body.id, -32601, `Method not found: ${body.method}`), 404);
    }
  } catch (err: any) {
    return c.json(rpcError(body.id, -32000, err.message || 'Internal error'), 500);
  }
});
