import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import {
  executionContextMiddleware,
  inferExecutionIntent,
  setExecutionOperation,
} from '../middleware/execution-context';

function buildApp() {
  const app = new Hono<HonoEnv>();

  app.use('*', async (c, next) => {
    c.set('userId', 'user-1');
    c.set('authMethod', 'chittyauth');
    c.set('tenantId', 'tenant-authorized');
    await next();
  });
  app.use('*', executionContextMiddleware);

  app.get('/api/test', (c) => c.json(c.get('executionContext')));
  app.post('/api/allocations/preview', (c) => c.json(c.get('executionContext')));
  app.post('/api/allocations/execute', (c) => c.json(c.get('executionContext')));
  app.post('/mcp-test', (c) => {
    setExecutionOperation(c, 'finance.mcp.tool:get-property-advice', 'suggest');
    return c.json(c.get('executionContext'));
  });

  return app;
}

describe('execution context', () => {
  it('infers read, preview, suggest, and execute mechanically', () => {
    expect(inferExecutionIntent('GET', '/api/accounts')).toBe('read');
    expect(inferExecutionIntent('POST', '/api/allocations/preview')).toBe('preview');
    expect(inferExecutionIntent('POST', '/api/classification/suggest')).toBe('suggest');
    expect(inferExecutionIntent('POST', '/api/allocations/execute')).toBe('execute');
    expect(inferExecutionIntent('POST', '/api/x/preview-and-commit')).toBe('execute');
  });

  it('captures sanitized channel-neutral provenance from source header and W3C baggage', async () => {
    const app = buildApp();
    const res = await app.request('/api/test', {
      headers: {
        'X-Source-Service': 'chittyclaw',
        baggage: 'chitty.channel=slack;prop=1,chitty.workspace=workspace-1,chitty.session=session-1',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      },
    });
    const body = await res.json() as any;

    expect(body.actor).toEqual({ userId: 'user-1', authMethod: 'chittyauth' });
    expect(body.source).toEqual({
      service: 'chittyclaw',
      claimed: true,
      channel: 'slack',
      workspace: 'workspace-1',
      session: 'session-1',
    });
    expect(body.scope).toEqual({ tenantId: 'tenant-authorized' });
    expect(body.intent).toBe('read');
    expect(body.trace.traceparent).toContain('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(body.trace.requestId).toBeTruthy();
  });

  it('drops malformed or oversized provenance values', async () => {
    const app = buildApp();
    const res = await app.request('/api/test', {
      headers: {
        'X-Source-Service': 'x'.repeat(129),
        baggage: 'chitty.channel=' + 'y'.repeat(9000),
        traceparent: 'not-a-traceparent',
      },
    });
    const body = await res.json() as any;

    expect(body.source.service).toBe('finance.chitty.cc');
    expect(body.source.channel).toBeUndefined();
    expect(body.trace.traceparent).toBeUndefined();
  });

  it('uses chitty.source baggage only as a claimed provenance fallback', async () => {
    const app = buildApp();
    const body = await (await app.request('/api/test', {
      headers: { baggage: 'chitty.source=claude' },
    })).json() as any;

    expect(body.source.service).toBe('claude');
    expect(body.source.claimed).toBe(true);
  });

  it('does not derive financial scope from source metadata', async () => {
    const app = buildApp();
    const res = await app.request('/api/test', {
      headers: {
        baggage: 'chitty.workspace=tenant-attacker,chitty.session=tenant-other',
      },
    });
    const body = await res.json() as any;

    expect(body.scope.tenantId).toBe('tenant-authorized');
    expect(body.source.workspace).toBe('tenant-attacker');
  });

  it('marks preview and execute routes distinctly', async () => {
    const app = buildApp();

    const preview = await (await app.request('/api/allocations/preview', { method: 'POST' })).json() as any;
    const execute = await (await app.request('/api/allocations/execute', { method: 'POST' })).json() as any;

    expect(preview.intent).toBe('preview');
    expect(execute.intent).toBe('execute');
  });

  it('allows MCP to override the generic HTTP operation with canonical capability intent', async () => {
    const app = buildApp();
    const body = await (await app.request('/mcp-test', { method: 'POST' })).json() as any;

    expect(body.capability).toBe('finance.mcp.tool:get-property-advice');
    expect(body.intent).toBe('suggest');
    expect(body.actor.userId).toBe('user-1');
    expect(body.scope.tenantId).toBe('tenant-authorized');
  });
});
