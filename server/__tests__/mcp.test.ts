import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { mcpRoutes } from '../routes/mcp';

/**
 * MCP endpoint tests against the SDK Streamable HTTP transport.
 *
 * The route is stateless: initialize negotiates the protocol, and subsequent
 * requests carry MCP-Protocol-Version without requiring an in-memory session.
 */

const PROTOCOL_VERSION = '2025-11-25';

function createMockStorage() {
  return {
    getProperties: vi.fn().mockResolvedValue([
      {
        id: 'p1',
        name: 'City Studio',
        address: '550 W Surf',
        city: 'Chicago',
        state: 'IL',
        propertyType: 'condo',
        currentValue: '350000',
        isActive: true,
      },
      {
        id: 'p2',
        name: 'Apt Arlene',
        address: '4343 N Clarendon',
        city: 'Chicago',
        state: 'IL',
        propertyType: 'condo',
        currentValue: '250000',
        isActive: true,
      },
    ]),
    getPropertyFinancials: vi.fn().mockResolvedValue({
      noi: 15000,
      totalUnits: 1,
      occupiedUnits: 1,
    }),
    getUserTenants: vi.fn().mockResolvedValue([
      {
        role: 'owner',
        tenant: {
          id: 't1',
          name: 'IT CAN BE LLC',
          slug: 'icb',
          type: 'holding',
          parentId: null,
          isActive: true,
        },
      },
    ]),
    getProperty: vi.fn().mockResolvedValue({
      id: 'p1',
      name: 'City Studio',
      address: '550 W Surf',
      propertyType: 'condo',
      currentValue: '350000',
    }),
  };
}

function buildApp() {
  const app = new Hono<HonoEnv>();
  const storage = createMockStorage();
  let observedExecution: any;

  app.use('*', async (c, next) => {
    c.set('storage', storage as any);
    c.set('tenantId', 'test-tenant');
    c.set('userId', 'user-1');
    c.set('authMethod', 'chittyauth');
    c.set('executionContext', {
      actor: { userId: 'user-1', authMethod: 'chittyauth' },
      source: { service: 'test', claimed: false },
      scope: { tenantId: 'test-tenant' },
      capability: 'finance.http.post:/mcp',
      intent: 'execute',
      trace: { requestId: 'test-request' },
    });
    await next();
    observedExecution = c.get('executionContext');
  });

  app.route('/', mcpRoutes);
  return { app, storage, getExecution: () => observedExecution };
}

function rpc(
  app: Hono<HonoEnv>,
  method: string,
  params?: Record<string, any>,
  id: number | string = 1,
) {
  return app.request('/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': PROTOCOL_VERSION,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  }, {} as any);
}

function initialize(app: Hono<HonoEnv>) {
  return rpc(app, 'initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'chittyfinance-test', version: '1.0.0' },
  });
}

describe('MCP Streamable HTTP endpoint', () => {
  let app: Hono<HonoEnv>;
  let storage: ReturnType<typeof createMockStorage>;
  let getExecution: () => any;

  beforeEach(() => {
    ({ app, storage, getExecution } = buildApp());
  });

  it('negotiates a supported 2025-era protocol via the SDK', async () => {
    const res = await initialize(app);
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(body.jsonrpc).toBe('2.0');
    expect(body.result.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(body.result.serverInfo.name).toBe('chittyfinance');
    expect(body.result.capabilities.resources).toBeDefined();
    expect(body.result.capabilities.tools).toBeDefined();
    expect(getExecution().capability).toBe('finance.mcp.initialize');
    expect(getExecution().intent).toBe('read');
  });

  it('no longer hard-codes the initial 2024 protocol revision', async () => {
    const res = await initialize(app);
    const body = await res.json() as any;
    expect(body.result.protocolVersion).not.toBe('2024-11-05');
  });

  it('rejects bad JSON through the SDK transport', async () => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': PROTOCOL_VERSION,
      },
      body: '{not json',
    }, {} as any);

    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await res.json() as any;
    expect(body.error.code).toBe(-32700);
  });

  it('rejects invalid JSON-RPC through the SDK transport', async () => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': PROTOCOL_VERSION,
      },
      body: JSON.stringify({ jsonrpc: '1.0', id: 1, method: 'tools/list' }),
    }, {} as any);

    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await res.json() as any;
    expect(body.error).toBeDefined();
  });

  it('returns a protocol error for an unknown method', async () => {
    const res = await rpc(app, 'nonexistent/method');
    const body = await res.json() as any;
    expect(body.error.code).toBe(-32601);
  });

  it('uses Streamable HTTP method handling instead of a POST-only Hono route', async () => {
    const res = await app.request('/mcp', {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
    }, {} as any);

    expect([200, 405]).toContain(res.status);
    expect(getExecution().capability).toBe('finance.mcp.transport:get');
    expect(getExecution().intent).toBe('read');
  });

  it('lists resources', async () => {
    const res = await rpc(app, 'resources/list');
    const body = await res.json() as any;

    expect(body.result.resources).toHaveLength(3);
    expect(body.result.resources.map((resource: any) => resource.uri)).toEqual([
      'finance://portfolio/summary',
      'finance://properties',
      'finance://tenants',
    ]);
    expect(getExecution().capability).toBe('finance.mcp.resources.list');
    expect(getExecution().intent).toBe('read');
  });

  it('reads finance://portfolio/summary', async () => {
    const res = await rpc(app, 'resources/read', { uri: 'finance://portfolio/summary' });
    const body = await res.json() as any;
    const data = JSON.parse(body.result.contents[0].text);

    expect(body.result.contents).toHaveLength(1);
    expect(data.totalProperties).toBe(2);
    expect(data.totalValue).toBe(600000);
    expect(data.totalNOI).toBe(30000);
    expect(getExecution().capability).toBe('finance.mcp.resources.read:portfolio-summary');
    expect(getExecution().intent).toBe('read');
  });

  it('reads finance://properties', async () => {
    const res = await rpc(app, 'resources/read', { uri: 'finance://properties' });
    const body = await res.json() as any;
    const data = JSON.parse(body.result.contents[0].text);

    expect(data).toHaveLength(2);
    expect(data[0].name).toBe('City Studio');
  });

  it('reads finance://tenants from caller memberships only', async () => {
    const res = await rpc(app, 'resources/read', { uri: 'finance://tenants' });
    const body = await res.json() as any;
    const data = JSON.parse(body.result.contents[0].text);

    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('IT CAN BE LLC');
    expect(data[0].role).toBe('owner');
    expect(storage.getUserTenants).toHaveBeenCalledWith('user-1');
  });

  it('does not expose tenants outside the caller memberships', async () => {
    storage.getUserTenants.mockResolvedValueOnce([
      {
        role: 'viewer',
        tenant: {
          id: 't2',
          name: 'ARIBIA LLC',
          slug: 'aribia',
          type: 'operating',
          parentId: 't1',
          isActive: true,
        },
      },
    ]);

    const res = await rpc(app, 'resources/read', { uri: 'finance://tenants' });
    const body = await res.json() as any;
    const data = JSON.parse(body.result.contents[0].text);

    expect(data.map((tenant: any) => tenant.id)).toEqual(['t2']);
    expect(data.find((tenant: any) => tenant.id === 't1')).toBeUndefined();
  });

  it('returns an SDK protocol error for an unknown resource', async () => {
    const res = await rpc(app, 'resources/read', { uri: 'finance://unknown' });
    const body = await res.json() as any;
    expect(body.error).toBeDefined();
    expect(getExecution().capability).toBe('finance.mcp.resources.read:unknown');
  });

  it('lists tools', async () => {
    const res = await rpc(app, 'tools/list');
    const body = await res.json() as any;

    expect(body.result.tools.map((tool: any) => tool.name)).toEqual([
      'get-property-advice',
      'refresh-valuation',
    ]);
    expect(getExecution().capability).toBe('finance.mcp.tools.list');
    expect(getExecution().intent).toBe('read');
  });

  it('calls get-property-advice through the registered SDK tool', async () => {
    const res = await rpc(app, 'tools/call', {
      name: 'get-property-advice',
      arguments: { propertyId: 'p1', message: 'Should I refinance?' },
    });
    const body = await res.json() as any;

    expect(body.result.content).toHaveLength(1);
    expect(body.result.content[0].text).toContain('City Studio');
    expect(body.result.content[0].text).toContain('Rule-based advice');
    expect(getExecution().capability).toBe('finance.mcp.tool:get-property-advice');
    expect(getExecution().intent).toBe('suggest');
  });

  it('calls refresh-valuation and preserves execute intent', async () => {
    const res = await rpc(app, 'tools/call', {
      name: 'refresh-valuation',
      arguments: { propertyId: 'p1' },
    });
    const body = await res.json() as any;

    expect(body.result.content[0].text).toContain('Valuation refresh queued');
    expect(body.result.content[0].text).toContain('City Studio');
    expect(getExecution().capability).toBe('finance.mcp.tool:refresh-valuation');
    expect(getExecution().intent).toBe('execute');
  });

  it('returns not-found text for a missing property', async () => {
    storage.getProperty.mockResolvedValueOnce(null);
    const res = await rpc(app, 'tools/call', {
      name: 'get-property-advice',
      arguments: { propertyId: 'xxx', message: 'test' },
    });
    const body = await res.json() as any;

    expect(body.result.content[0].text).toContain('not found');
  });

  it('lets the SDK reject an unknown tool while preserving execute provenance', async () => {
    const res = await rpc(app, 'tools/call', {
      name: 'nonexistent-tool',
      arguments: {},
    });
    const body = await res.json() as any;

    expect(body.result?.isError || body.error).toBeTruthy();
    if (body.result?.content?.[0]?.text) {
      expect(body.result.content[0].text.toLowerCase()).toContain('tool');
    }
    expect(getExecution().capability).toBe('finance.mcp.tools.call');
    expect(getExecution().intent).toBe('execute');
  });

  it('lets the SDK validate tool arguments', async () => {
    const res = await rpc(app, 'tools/call', {
      name: 'get-property-advice',
      arguments: { propertyId: 'p1' },
    });
    const body = await res.json() as any;

    expect(body.result?.isError || body.error).toBeTruthy();
  });
});
