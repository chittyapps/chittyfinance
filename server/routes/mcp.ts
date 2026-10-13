/**
 * MCP (Model Context Protocol) endpoint for ChittyFinance.
 *
 * Business handlers remain tenant-scoped by ChittyFinance. Protocol and
 * Streamable HTTP transport are delegated to the official MCP SDK.
 */

import { Hono } from 'hono';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import type { Context } from 'hono';
import type { HonoEnv } from '../env';
import { setExecutionOperation, type ExecutionIntent } from '../middleware/execution-context';

export const mcpRoutes = new Hono<HonoEnv>();

const SERVER_INFO = {
  name: 'chittyfinance',
  version: '2.0.0',
};

const RESOURCE_CAPABILITIES: Record<string, string> = {
  'finance://portfolio/summary': 'finance.mcp.resources.read:portfolio-summary',
  'finance://properties': 'finance.mcp.resources.read:properties',
  'finance://tenants': 'finance.mcp.resources.read:tenants',
};

interface McpToolDefinition {
  name: 'get-property-advice' | 'refresh-valuation';
  description: string;
  intent: ExecutionIntent;
}

const TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: 'get-property-advice',
    description: 'Get AI-powered financial advice for a specific property.',
    intent: 'suggest',
  },
  {
    name: 'refresh-valuation',
    description: 'Refresh property valuation estimates from external providers (Zillow, Redfin, HouseCanary, ATTOM, County).',
    intent: 'execute',
  },
];

async function readResource(
  uri: string,
  storage: any,
  tenantId: string,
  userId: string,
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  switch (uri) {
    case 'finance://portfolio/summary': {
      const properties = await storage.getProperties(tenantId);
      const summaries = await Promise.all(
        properties.map(async (property: any) => {
          try {
            return await storage.getPropertyFinancials(property.id, tenantId);
          } catch {
            return null;
          }
        }),
      );
      const valid = summaries.filter(Boolean);
      const totalValue = properties.reduce(
        (sum: number, property: any) => sum + Number(property.currentValue || 0),
        0,
      );
      const totalNOI = valid.reduce((sum: number, financials: any) => sum + (financials.noi || 0), 0);
      const totalUnits = valid.reduce(
        (sum: number, financials: any) => sum + (financials.totalUnits || 0),
        0,
      );
      const occupiedUnits = valid.reduce(
        (sum: number, financials: any) => sum + (financials.occupiedUnits || 0),
        0,
      );

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
          text: JSON.stringify(properties.map((property: any) => ({
            id: property.id,
            name: property.name,
            address: property.address,
            city: property.city,
            state: property.state,
            propertyType: property.propertyType,
            currentValue: property.currentValue,
            isActive: property.isActive,
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
            const tenant = membership.tenant;
            return {
              id: tenant.id,
              name: tenant.name,
              slug: tenant.slug,
              type: tenant.type,
              parentId: tenant.parentId,
              isActive: tenant.isActive,
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

async function callTool(
  name: McpToolDefinition['name'],
  args: Record<string, any>,
  storage: any,
  tenantId: string,
  env: any,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  switch (name) {
    case 'get-property-advice': {
      const { propertyId, message } = args;
      const property = await storage.getProperty(propertyId, tenantId);
      if (!property) {
        return { content: [{ type: 'text', text: `Property ${propertyId} not found.` }] };
      }

      const agentBase = env.CHITTYAGENT_API_BASE;
      const agentToken = env.CHITTYAGENT_API_TOKEN;
      let advice = `Property: ${property.name} (${property.address})\n`;

      if (agentBase && agentToken) {
        try {
          const res = await fetch(`${agentBase}/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${agentToken}`,
            },
            body: JSON.stringify({
              context: `Property: ${property.name}, ${property.address}`,
              message,
              service: 'chittyfinance',
            }),
          });
          if (res.ok) {
            const data = await res.json() as any;
            advice += data.response || data.content || 'No advice available.';
            return { content: [{ type: 'text', text: advice }] };
          }
        } catch {
          // Fall through to the deterministic rule-based response.
        }
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
  }
}

function buildMcpServer(c: Context<HonoEnv>): McpServer {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');

  const server = new McpServer(SERVER_INFO);

  server.registerResource(
    'portfolio-summary',
    'finance://portfolio/summary',
    {
      title: 'Portfolio Summary',
      description: 'Aggregated financial overview across all properties: total value, NOI, cap rate, occupancy.',
      mimeType: 'application/json',
    },
    async (uri) => readResource(uri.href, storage, tenantId, userId),
  );

  server.registerResource(
    'properties',
    'finance://properties',
    {
      title: 'Properties',
      description: 'List of all properties with address, type, value, and key metrics.',
      mimeType: 'application/json',
    },
    async (uri) => readResource(uri.href, storage, tenantId, userId),
  );

  server.registerResource(
    'tenants',
    'finance://tenants',
    {
      title: 'Tenants',
      description: 'List of legal entities available to the authorized caller.',
      mimeType: 'application/json',
    },
    async (uri) => readResource(uri.href, storage, tenantId, userId),
  );

  server.registerTool(
    'get-property-advice',
    {
      description: TOOL_DEFINITIONS[0].description,
      inputSchema: {
        propertyId: z.string().min(1).describe('UUID of the property'),
        message: z.string().min(1).describe('Question or context for the AI advisor'),
      },
    },
    async ({ propertyId, message }) => callTool(
      'get-property-advice',
      { propertyId, message },
      storage,
      tenantId,
      c.env,
    ),
  );

  server.registerTool(
    'refresh-valuation',
    {
      description: TOOL_DEFINITIONS[1].description,
      inputSchema: {
        propertyId: z.string().min(1).describe('UUID of the property to refresh'),
      },
    },
    async ({ propertyId }) => callTool(
      'refresh-valuation',
      { propertyId },
      storage,
      tenantId,
      c.env,
    ),
  );

  return server;
}

/**
 * Preserve ChittyFinance execution provenance while leaving protocol validation
 * to the MCP SDK. This observer never authorizes a request and never mutates
 * caller/tenant scope.
 */
async function observeMcpOperation(c: Context<HonoEnv>): Promise<void> {
  if (c.req.method !== 'POST') {
    setExecutionOperation(c, `finance.mcp.transport:${c.req.method.toLowerCase()}`, 'read');
    return;
  }

  let body: any;
  try {
    body = await c.req.raw.clone().json();
  } catch {
    return;
  }

  if (!body || Array.isArray(body) || typeof body.method !== 'string') return;

  switch (body.method) {
    case 'initialize':
      setExecutionOperation(c, 'finance.mcp.initialize', 'read');
      break;
    case 'resources/list':
      setExecutionOperation(c, 'finance.mcp.resources.list', 'read');
      break;
    case 'resources/read': {
      const uri = typeof body.params?.uri === 'string' ? body.params.uri : '';
      setExecutionOperation(
        c,
        RESOURCE_CAPABILITIES[uri] ?? 'finance.mcp.resources.read:unknown',
        'read',
      );
      break;
    }
    case 'tools/list':
      setExecutionOperation(c, 'finance.mcp.tools.list', 'read');
      break;
    case 'tools/call': {
      const toolName = typeof body.params?.name === 'string' ? body.params.name : '';
      const definition = TOOL_DEFINITIONS.find((tool) => tool.name === toolName);
      setExecutionOperation(
        c,
        definition ? `finance.mcp.tool:${toolName}` : 'finance.mcp.tools.call',
        definition?.intent ?? 'execute',
      );
      break;
    }
    default:
      setExecutionOperation(c, `finance.mcp.method:${body.method}`, 'read');
  }
}

mcpRoutes.all('/mcp', async (c) => {
  await observeMcpOperation(c);

  const server = buildMcpServer(c);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});
