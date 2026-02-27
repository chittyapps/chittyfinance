/**
 * Portfolio Summary Route Tests
 * Tests the GET /api/portfolio/summary endpoint with mocked storage
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { serviceAuth } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { portfolioRoutes } from '../routes/portfolio';

const TEST_TOKEN = 'test-service-token';
const TENANT_ID = 'b5fa96af-10eb-4d47-b9af-8fcb2ce24f81';

const PROP_1 = '11111111-1111-1111-1111-111111111111';
const PROP_2 = '22222222-2222-2222-2222-222222222222';
const PROP_INACTIVE = '44444444-4444-4444-4444-444444444444';

function createTestApp(storage: any) {
  const app = new Hono<HonoEnv>();

  app.use('/api/*', serviceAuth, tenantMiddleware, async (c, next) => {
    c.set('storage', storage as any);
    await next();
  });

  app.route('/', portfolioRoutes);
  return app;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${TEST_TOKEN}`,
    'X-Tenant-ID': TENANT_ID,
    'Content-Type': 'application/json',
  };
}

const env: any = {
  CHITTY_AUTH_SERVICE_TOKEN: TEST_TOKEN,
  DATABASE_URL: 'postgresql://fake:fake@localhost/fake',
  FINANCE_KV: {},
  FINANCE_R2: {},
  ASSETS: { fetch: async () => new Response('Not Found', { status: 404 }) },
};

let mockStorage: Record<string, any>;

beforeEach(() => {
  mockStorage = {
    getProperties: vi.fn().mockResolvedValue([
      {
        id: PROP_1, tenantId: TENANT_ID, name: 'City Studio',
        address: '550 W Surf St', city: 'Chicago', state: 'IL', zip: '60657',
        propertyType: 'condo', currentValue: '350000', isActive: true,
      },
      {
        id: PROP_2, tenantId: TENANT_ID, name: 'Apt Arlene',
        address: '4343 N Clarendon', city: 'Chicago', state: 'IL', zip: '60613',
        propertyType: 'condo', currentValue: '280000', isActive: true,
      },
      {
        id: PROP_INACTIVE, tenantId: TENANT_ID, name: 'Sold Property',
        address: '999 Old St', city: 'Chicago', state: 'IL', zip: '60600',
        propertyType: 'house', currentValue: '100000', isActive: false,
      },
    ]),
    getPropertyFinancials: vi.fn().mockImplementation((propertyId: string, _tenantId: string) => {
      if (propertyId === PROP_1) {
        return Promise.resolve({
          propertyId: PROP_1, noi: 18000, capRate: 5.14,
          cashOnCash: 6.1, occupancyRate: 100, totalUnits: 1,
          occupiedUnits: 1, totalIncome: 26400, totalExpenses: 8400,
        });
      }
      if (propertyId === PROP_2) {
        return Promise.resolve({
          propertyId: PROP_2, noi: 12000, capRate: 4.29,
          cashOnCash: 5.0, occupancyRate: 50, totalUnits: 2,
          occupiedUnits: 1, totalIncome: 24000, totalExpenses: 12000,
        });
      }
      return Promise.resolve(null);
    }),
  };
});

describe('GET /api/portfolio/summary', () => {
  it('returns aggregated portfolio metrics for active properties', async () => {
    const app = createTestApp(mockStorage);
    const res = await app.request('/api/portfolio/summary', { headers: authHeaders() }, env);
    expect(res.status).toBe(200);

    const body = await res.json() as any;

    // Only active properties should be counted (2 of 3)
    expect(body.totalProperties).toBe(2);

    // totalValue = 350000 + 280000 = 630000
    expect(body.totalValue).toBe(630000);

    // totalNOI = 18000 + 12000 = 30000
    expect(body.totalNOI).toBe(30000);

    // totalUnits = 1 + 2 = 3
    expect(body.totalUnits).toBe(3);

    // occupiedUnits = 1 + 1 = 2
    expect(body.occupiedUnits).toBe(2);

    // occupancyRate = (2 / 3) * 100 = 66.666...
    expect(body.occupancyRate).toBeCloseTo(66.67, 1);

    // avgCapRate = (5.14 * 350000 + 4.29 * 280000) / 630000
    // = (1799000 + 1201200) / 630000 = 3000200 / 630000 ~ 4.762
    expect(body.avgCapRate).toBeCloseTo(4.762, 1);

    // Properties array contains details for 2 active properties
    expect(body.properties).toHaveLength(2);
  });

  it('returns correct per-property details', async () => {
    const app = createTestApp(mockStorage);
    const res = await app.request('/api/portfolio/summary', { headers: authHeaders() }, env);
    const body = await res.json() as any;

    const city = body.properties.find((p: any) => p.id === PROP_1);
    expect(city).toBeDefined();
    expect(city.name).toBe('City Studio');
    expect(city.currentValue).toBe(350000);
    expect(city.noi).toBe(18000);
    expect(city.capRate).toBe(5.14);
    expect(city.totalUnits).toBe(1);
    expect(city.occupiedUnits).toBe(1);
    expect(city.occupancyRate).toBe(100);

    const apt = body.properties.find((p: any) => p.id === PROP_2);
    expect(apt).toBeDefined();
    expect(apt.name).toBe('Apt Arlene');
    expect(apt.currentValue).toBe(280000);
    expect(apt.noi).toBe(12000);
    expect(apt.occupancyRate).toBe(50);
  });

  it('excludes inactive properties', async () => {
    const app = createTestApp(mockStorage);
    const res = await app.request('/api/portfolio/summary', { headers: authHeaders() }, env);
    const body = await res.json() as any;

    const ids = body.properties.map((p: any) => p.id);
    expect(ids).not.toContain(PROP_INACTIVE);
  });

  it('handles empty portfolio gracefully', async () => {
    mockStorage.getProperties.mockResolvedValueOnce([]);
    const app = createTestApp(mockStorage);
    const res = await app.request('/api/portfolio/summary', { headers: authHeaders() }, env);
    expect(res.status).toBe(200);

    const body = await res.json() as any;
    expect(body.totalProperties).toBe(0);
    expect(body.totalValue).toBe(0);
    expect(body.totalNOI).toBe(0);
    expect(body.avgCapRate).toBe(0);
    expect(body.occupancyRate).toBe(0);
    expect(body.properties).toHaveLength(0);
  });

  it('handles properties with no financials data', async () => {
    mockStorage.getPropertyFinancials.mockResolvedValue(null);
    const app = createTestApp(mockStorage);
    const res = await app.request('/api/portfolio/summary', { headers: authHeaders() }, env);
    expect(res.status).toBe(200);

    const body = await res.json() as any;
    // Values should still be present but zero since financials returned null
    expect(body.totalProperties).toBe(2);
    expect(body.totalValue).toBe(630000);
    expect(body.totalNOI).toBe(0);
    expect(body.totalUnits).toBe(0);
    expect(body.occupiedUnits).toBe(0);
    expect(body.occupancyRate).toBe(0);
    expect(body.avgCapRate).toBe(0);
  });

  it('handles getPropertyFinancials throwing errors', async () => {
    mockStorage.getPropertyFinancials.mockRejectedValue(new Error('DB connection lost'));
    const app = createTestApp(mockStorage);
    const res = await app.request('/api/portfolio/summary', { headers: authHeaders() }, env);
    expect(res.status).toBe(200);

    const body = await res.json() as any;
    // Should still succeed with zero financials
    expect(body.totalProperties).toBe(2);
    expect(body.totalValue).toBe(630000);
    expect(body.totalNOI).toBe(0);
  });

  it('calls getPropertyFinancials with tenantId for each active property', async () => {
    const app = createTestApp(mockStorage);
    await app.request('/api/portfolio/summary', { headers: authHeaders() }, env);

    expect(mockStorage.getPropertyFinancials).toHaveBeenCalledTimes(2);
    expect(mockStorage.getPropertyFinancials).toHaveBeenCalledWith(PROP_1, TENANT_ID);
    expect(mockStorage.getPropertyFinancials).toHaveBeenCalledWith(PROP_2, TENANT_ID);
    // Should NOT be called for the inactive property
    expect(mockStorage.getPropertyFinancials).not.toHaveBeenCalledWith(PROP_INACTIVE, expect.anything());
  });

  it('rejects request without auth', async () => {
    const app = createTestApp(mockStorage);
    const res = await app.request('/api/portfolio/summary', {
      headers: { 'X-Tenant-ID': TENANT_ID },
    }, env);
    expect(res.status).toBe(401);
  });

  it('rejects request without tenant ID', async () => {
    const app = createTestApp(mockStorage);
    const res = await app.request('/api/portfolio/summary', {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    }, env);
    expect(res.status).toBe(400);
  });
});
