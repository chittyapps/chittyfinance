import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mcpRoutes } from '../routes/mcp';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';

/**
 * MCP (Model Context Protocol) endpoint tests.
 *
 * Tests the JSON-RPC 2.0 handler at POST /mcp for:
 *  - initialize handshake
 *  - resources/list, resources/read
 *  - tools/list, tools/call
 *  - error handling (bad JSON, unknown method, unknown resource/tool)
 */

// ── Mock storage ──
function createMockStorage() {
  return {
    getProperties: vi.fn().mockResolvedValue([
      { id: 'p1', name: 'City Studio', address: '550 W Surf', city: 'Chicago', state: 'IL', propertyType: 'condo', currentValue: '350000', isActive: true },
      { id: 'p2', name: 'Apt Arlene', address: '4343 N Clarendon', city: 'Chicago', state: 'IL', propertyType: 'condo', currentValue: '250000', isActive: true },
    ]),
    getPropertyFinancials: vi.fn().mockResolvedValue({ noi: 15000, totalUnits: 1, occupiedUnits: 1 }),
    getTenants: vi.fn().mockResolvedValue([
      { id: 't1', name: 'IT CAN BE LLC', slug: 'icb', type: 'holding', parentId: null, isActive: true },
    ]),
    getProperty: vi.fn().mockResolvedValue({
      id: 'p1', name: 'City Studio', address: '550 W Surf', propertyType: 'condo', currentValue: '350000',
    }),
  };
}

function buildApp() {
  const app = new Hono<HonoEnv>();
  const storage = createMockStorage();

  // Inject mock storage + tenantId into context
  app.use('*', async (c, next) => {
    c.set('storage', storage as any);
    c.set('tenantId', 'test-tenant');
    await next();
  });

  app.route('/', mcpRoutes);
  return { app, storage };
}

function rpc(app: Hono<HonoEnv>, method: string, params?: Record<string, any>, id: number | string = 1) {
  return app.request('/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  }, {} as any);
}

describe('MCP endpoint', () => {
  let app: Hono<HonoEnv>;
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    ({ app, storage } = buildApp());
  });

  // ── Protocol ──

  it('handles initialize', async () => {
    const res = await rpc(app, 'initialize');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.jsonrpc).toBe('2.0');
    expect(body.result.protocolVersion).toBe('2024-11-05');
    expect(body.result.serverInfo.name).toBe('chittyfinance');
    expect(body.result.capabilities.resources).toBeDefined();
    expect(body.result.capabilities.tools).toBeDefined();
  });

  it('rejects bad JSON', async () => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    }, {} as any);
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error.code).toBe(-32700);
  });

  it('rejects invalid JSON-RPC', async () => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '1.0', id: 1, method: 'test' }),
    }, {} as any);
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error.code).toBe(-32600);
  });

  it('returns -32601 for unknown method', async () => {
    const res = await rpc(app, 'nonexistent/method');
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error.code).toBe(-32601);
  });

  // ── Resources ──

  it('lists resources', async () => {
    const res = await rpc(app, 'resources/list');
    const body = await res.json() as any;
    expect(body.result.resources).toHaveLength(3);
    expect(body.result.resources.map((r: any) => r.uri)).toEqual([
      'finance://portfolio/summary',
      'finance://properties',
      'finance://tenants',
    ]);
  });

  it('reads finance://portfolio/summary', async () => {
    const res = await rpc(app, 'resources/read', { uri: 'finance://portfolio/summary' });
    const body = await res.json() as any;
    expect(body.result.contents).toHaveLength(1);
    const data = JSON.parse(body.result.contents[0].text);
    expect(data.totalProperties).toBe(2);
    expect(data.totalValue).toBe(600000);
    expect(data.totalNOI).toBe(30000); // 15000 * 2
  });

  it('reads finance://properties', async () => {
    const res = await rpc(app, 'resources/read', { uri: 'finance://properties' });
    const body = await res.json() as any;
    const data = JSON.parse(body.result.contents[0].text);
    expect(data).toHaveLength(2);
    expect(data[0].name).toBe('City Studio');
  });

  it('reads finance://tenants', async () => {
    const res = await rpc(app, 'resources/read', { uri: 'finance://tenants' });
    const body = await res.json() as any;
    const data = JSON.parse(body.result.contents[0].text);
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('IT CAN BE LLC');
  });

  it('returns error for unknown resource', async () => {
    const res = await rpc(app, 'resources/read', { uri: 'finance://unknown' });
    expect(res.status).toBe(500);
    const body = await res.json() as any;
    expect(body.error.code).toBe(-32000);
  });

  it('returns error for missing uri param', async () => {
    const res = await rpc(app, 'resources/read', {});
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error.code).toBe(-32602);
  });

  // ── Tools ──

  it('lists tools', async () => {
    const res = await rpc(app, 'tools/list');
    const body = await res.json() as any;
    expect(body.result.tools).toHaveLength(2);
    expect(body.result.tools.map((t: any) => t.name)).toEqual([
      'get-property-advice',
      'refresh-valuation',
    ]);
  });

  it('calls get-property-advice (rule-based fallback)', async () => {
    const res = await rpc(app, 'tools/call', {
      name: 'get-property-advice',
      arguments: { propertyId: 'p1', message: 'Should I refinance?' },
    });
    const body = await res.json() as any;
    expect(body.result.content).toHaveLength(1);
    expect(body.result.content[0].text).toContain('City Studio');
    expect(body.result.content[0].text).toContain('Rule-based advice');
  });

  it('calls refresh-valuation', async () => {
    const res = await rpc(app, 'tools/call', {
      name: 'refresh-valuation',
      arguments: { propertyId: 'p1' },
    });
    const body = await res.json() as any;
    expect(body.result.content[0].text).toContain('Valuation refresh queued');
    expect(body.result.content[0].text).toContain('City Studio');
  });

  it('returns not-found for missing property in tool call', async () => {
    storage.getProperty.mockResolvedValueOnce(null);
    const res = await rpc(app, 'tools/call', {
      name: 'get-property-advice',
      arguments: { propertyId: 'xxx', message: 'test' },
    });
    const body = await res.json() as any;
    expect(body.result.content[0].text).toContain('not found');
  });

  it('returns error for unknown tool', async () => {
    const res = await rpc(app, 'tools/call', {
      name: 'nonexistent-tool',
      arguments: {},
    });
    expect(res.status).toBe(500);
    const body = await res.json() as any;
    expect(body.error.code).toBe(-32000);
  });

  it('returns error for missing tool name', async () => {
    const res = await rpc(app, 'tools/call', {});
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error.code).toBe(-32602);
  });
});
