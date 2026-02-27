/**
 * AI Property Advice Endpoint Tests
 * Tests POST /api/ai/property-advice with mocked storage
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { serviceAuth } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { aiRoutes } from '../routes/ai';

const TEST_TOKEN = 'test-service-token';
const TENANT_ID = 'b5fa96af-10eb-4d47-b9af-8fcb2ce24f81';
const PROP_1 = '11111111-1111-1111-1111-111111111111';

let mockStorage: Record<string, any>;

function createTestApp() {
  const app = new Hono<HonoEnv>();

  app.use('/api/*', serviceAuth, tenantMiddleware, async (c, next) => {
    c.set('storage', mockStorage as any);
    await next();
  });

  app.route('/', aiRoutes);
  return app;
}

function authHeaders(extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${TEST_TOKEN}`,
    'X-Tenant-ID': TENANT_ID,
    'Content-Type': 'application/json',
    ...extra,
  };
}

const testEnv = {
  CHITTY_AUTH_SERVICE_TOKEN: TEST_TOKEN,
  DATABASE_URL: 'postgresql://fake:fake@localhost/fake',
  MODE: 'system',
  NODE_ENV: 'test',
} as any;

beforeEach(() => {
  mockStorage = {
    getProperty: vi.fn().mockImplementation((id: string, tenantId: string) => {
      if (id === PROP_1 && tenantId === TENANT_ID) {
        return Promise.resolve({
          id: PROP_1,
          tenantId: TENANT_ID,
          name: 'City Studio',
          address: '550 W Surf St',
          city: 'Chicago',
          state: 'IL',
          zip: '60657',
          propertyType: 'condo',
          currentValue: '350000',
          purchasePrice: '280000',
          isActive: true,
        });
      }
      return Promise.resolve(undefined);
    }),
    getPropertyFinancials: vi.fn().mockImplementation((id: string, tenantId: string) => {
      if (id === PROP_1 && tenantId === TENANT_ID) {
        return Promise.resolve({
          propertyId: PROP_1,
          noi: 18000,
          capRate: 5.1,
          cashOnCash: 6.4,
          occupancyRate: 100,
          totalUnits: 1,
          occupiedUnits: 1,
          totalIncome: 26400,
          totalExpenses: 8400,
        });
      }
      return Promise.resolve(null);
    }),
    getAiMessages: vi.fn().mockResolvedValue([]),
    createAiMessage: vi.fn().mockImplementation((data: any) =>
      Promise.resolve({ id: 'msg-1', ...data, createdAt: new Date() }),
    ),
  };
});

describe('POST /api/ai/property-advice', () => {
  it('returns 400 if propertyId is missing', async () => {
    const app = createTestApp();
    const res = await app.request('/api/ai/property-advice', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ message: 'How is my property doing?' }),
    }, testEnv);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('propertyId and message are required');
  });

  it('returns 400 if message is missing', async () => {
    const app = createTestApp();
    const res = await app.request('/api/ai/property-advice', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ propertyId: PROP_1 }),
    }, testEnv);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('propertyId and message are required');
  });

  it('returns 404 if property not found', async () => {
    const app = createTestApp();
    const nonExistentId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const res = await app.request('/api/ai/property-advice', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ propertyId: nonExistentId, message: 'Tell me about this property' }),
    }, testEnv);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Property not found');
  });

  it('returns rule-based fallback when no AI configured', async () => {
    const app = createTestApp();
    const res = await app.request('/api/ai/property-advice', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ propertyId: PROP_1, message: 'How is my property doing?' }),
    }, testEnv);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('assistant');
    expect(body.provider).toBe('rule-based');
    expect(body.model).toBeNull();
    expect(body.content).toContain('City Studio');
    expect(body.content).toContain('cap rate');
    expect(body.content).toContain('NOI');
  });

  it('includes property name in rule-based response', async () => {
    const app = createTestApp();
    const res = await app.request('/api/ai/property-advice', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ propertyId: PROP_1, message: 'Summarize performance' }),
    }, testEnv);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toContain('City Studio');
  });

  it('calls storage.getProperty with correct args', async () => {
    const app = createTestApp();
    await app.request('/api/ai/property-advice', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ propertyId: PROP_1, message: 'How is my property?' }),
    }, testEnv);
    expect(mockStorage.getProperty).toHaveBeenCalledWith(PROP_1, TENANT_ID);
  });

  it('calls storage.getPropertyFinancials with correct args', async () => {
    const app = createTestApp();
    await app.request('/api/ai/property-advice', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ propertyId: PROP_1, message: 'What is my cap rate?' }),
    }, testEnv);
    expect(mockStorage.getPropertyFinancials).toHaveBeenCalledWith(PROP_1, TENANT_ID);
  });
});
