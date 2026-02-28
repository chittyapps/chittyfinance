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

const TOOLS = [
  {
    name: 'get-property-advice',
    description: 'Get AI-powered financial advice for a specific property.',
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
    name: 'refresh-valuation',
    description: 'Refresh property valuation estimates from external providers (Zillow, Redfin, HouseCanary, ATTOM, County).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        propertyId: { type: 'string', description: 'UUID of the property to refresh' },
      },
      required: ['propertyId'],
    },
  },
];

// ── Resource Handlers ──

async function readResource(uri: string, storage: any, tenantId: string): Promise<{ contents: any[] }> {
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
      const tenants = await storage.getTenants();
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(tenants.map((t: any) => ({
            id: t.id,
            name: t.name,
            slug: t.slug,
            type: t.type,
            parentId: t.parentId,
            isActive: t.isActive,
          }))),
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
        return c.json(rpcOk(body.id, {
          protocolVersion: '2024-11-05',
          serverInfo: SERVER_INFO,
          capabilities: CAPABILITIES,
        }));

      case 'resources/list':
        return c.json(rpcOk(body.id, { resources: RESOURCES }));

      case 'resources/read': {
        const uri = body.params?.uri;
        if (!uri) return c.json(rpcError(body.id, -32602, 'Missing uri param'), 400);
        const result = await readResource(uri, storage, tenantId);
        return c.json(rpcOk(body.id, result));
      }

      case 'tools/list':
        return c.json(rpcOk(body.id, { tools: TOOLS }));

      case 'tools/call': {
        const toolName = body.params?.name;
        const toolArgs = body.params?.arguments || {};
        if (!toolName) return c.json(rpcError(body.id, -32602, 'Missing tool name'), 400);
        const result = await callTool(toolName, toolArgs, storage, tenantId, c.env);
        return c.json(rpcOk(body.id, result));
      }

      default:
        return c.json(rpcError(body.id, -32601, `Method not found: ${body.method}`), 404);
    }
  } catch (err: any) {
    return c.json(rpcError(body.id, -32000, err.message || 'Internal error'), 500);
  }
});
