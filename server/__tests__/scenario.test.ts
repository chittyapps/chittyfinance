/**
 * User Scenario Tests & Pressure Tests
 * Tests full user flows through the Hono app with mocked storage
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { serviceAuth } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { propertyRoutes } from '../routes/properties';
import { valuationRoutes } from '../routes/valuation';
import { importRoutes } from '../routes/import';

const TEST_TOKEN = 'test-service-token';
const TENANT_ID = 'b5fa96af-10eb-4d47-b9af-8fcb2ce24f81'; // IT CAN BE LLC

// Valid UUIDs for mock entities (Zod validates UUID format from drizzle-zod)
const PROP_1 = '11111111-1111-1111-1111-111111111111';
const PROP_2 = '22222222-2222-2222-2222-222222222222';
const PROP_NEW = '33333333-3333-3333-3333-333333333333';
const UNIT_1 = 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const UNIT_NEW = 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const UNIT_FOREIGN = 'cccc3333-cccc-cccc-cccc-cccccccccccc';
const LEASE_1 = 'dddd4444-dddd-dddd-dddd-dddddddddddd';
const LEASE_NEW = 'eeee5555-eeee-eeee-eeee-eeeeeeeeeeee';
const ACCT_1 = 'ffff6666-ffff-ffff-ffff-ffffffffffff';
const VAL_1 = '99991111-9999-9999-9999-999999999999';
const VAL_NEW = '99992222-9999-9999-9999-999999999999';
const TXN_NEW = '88881111-8888-8888-8888-888888888888';

function createTestApp() {
  const app = new Hono<HonoEnv>();

  // Apply middleware to all /api/* routes
  app.use('/api/*', serviceAuth, tenantMiddleware, async (c, next) => {
    // Mock storage middleware
    c.set('storage', mockStorage as any);
    await next();
  });

  app.route('/', propertyRoutes);
  app.route('/', valuationRoutes);
  app.route('/', importRoutes);
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

// Mock storage that tracks calls
let mockStorage: Record<string, any>;

beforeEach(() => {
  mockStorage = {
    getProperties: vi.fn().mockResolvedValue([
      { id: PROP_1, tenantId: TENANT_ID, name: 'City Studio', address: '550 W Surf St', city: 'Chicago', state: 'IL', zip: '60657', propertyType: 'condo', isActive: true },
      { id: PROP_2, tenantId: TENANT_ID, name: 'Apt Arlene', address: '4343 N Clarendon', city: 'Chicago', state: 'IL', zip: '60613', propertyType: 'condo', isActive: true },
    ]),
    getProperty: vi.fn().mockImplementation((id: string, tenantId: string) => {
      if (id === PROP_1 && tenantId === TENANT_ID)
        return Promise.resolve({ id: PROP_1, tenantId: TENANT_ID, name: 'City Studio', address: '550 W Surf St', city: 'Chicago', state: 'IL', zip: '60657', propertyType: 'condo', isActive: true });
      if (id === PROP_2 && tenantId === TENANT_ID)
        return Promise.resolve({ id: PROP_2, tenantId: TENANT_ID, name: 'Apt Arlene', address: '4343 N Clarendon', city: 'Chicago', state: 'IL', zip: '60613', propertyType: 'condo', isActive: true });
      return Promise.resolve(undefined);
    }),
    createProperty: vi.fn().mockImplementation((data: any) =>
      Promise.resolve({ id: PROP_NEW, ...data, createdAt: new Date(), updatedAt: new Date() }),
    ),
    updateProperty: vi.fn().mockImplementation((id: string, tenantId: string, data: any) => {
      if (id === PROP_1) return Promise.resolve({ id: PROP_1, tenantId, ...data, updatedAt: new Date() });
      return Promise.resolve(undefined);
    }),
    getUnits: vi.fn().mockImplementation((propertyId: string) => {
      if (propertyId === PROP_1) return Promise.resolve([
        { id: UNIT_1, propertyId: PROP_1, unitNumber: 'C211', bedrooms: 1, bathrooms: '1.0', squareFeet: 750, monthlyRent: '2200', isActive: true },
      ]);
      return Promise.resolve([]);
    }),
    createUnit: vi.fn().mockImplementation((data: any) =>
      Promise.resolve({ id: UNIT_NEW, ...data, createdAt: new Date(), updatedAt: new Date() }),
    ),
    updateUnit: vi.fn().mockImplementation((id: string, propertyId: string, data: any) => {
      if (id === UNIT_1 && propertyId === PROP_1) return Promise.resolve({ id: UNIT_1, propertyId, ...data, updatedAt: new Date() });
      return Promise.resolve(undefined);
    }),
    getLeasesByUnits: vi.fn().mockResolvedValue([
      { id: LEASE_1, unitId: UNIT_1, tenantName: 'John Doe', monthlyRent: '2200', status: 'active', startDate: new Date('2024-01-01'), endDate: new Date('2025-12-31') },
    ]),
    createLease: vi.fn().mockImplementation((data: any) =>
      Promise.resolve({ id: LEASE_NEW, ...data, createdAt: new Date(), updatedAt: new Date() }),
    ),
    updateLease: vi.fn().mockImplementation((id: string, unitIds: string[], data: any) => {
      if (id === LEASE_1 && unitIds.includes(UNIT_1)) return Promise.resolve({ id: LEASE_1, ...data, updatedAt: new Date() });
      return Promise.resolve(undefined);
    }),
    getPropertyFinancials: vi.fn().mockResolvedValue({
      propertyId: PROP_1, noi: 18000, capRate: 5.2, cashOnCash: 6.1,
      occupancyRate: 100, totalUnits: 1, occupiedUnits: 1, totalIncome: 26400, totalExpenses: 8400,
    }),
    getPropertyRentRoll: vi.fn().mockResolvedValue([
      { unitId: UNIT_1, unitNumber: 'C211', expectedRent: 2200, actualPaid: 2200, status: 'paid', tenantName: 'John Doe' },
    ]),
    getPropertyPnL: vi.fn().mockResolvedValue({
      income: { rent: 26400 }, expenses: { maintenance: 4200, utilities: 2400, insurance: 1800 },
      totalIncome: 26400, totalExpenses: 8400, net: 18000,
    }),
    getPropertyValuations: vi.fn().mockResolvedValue([
      { id: VAL_1, propertyId: PROP_1, source: 'zillow', estimate: '350000', low: '330000', high: '370000', confidence: '0.900', fetchedAt: new Date() },
    ]),
    upsertPropertyValuation: vi.fn().mockImplementation((data: any) =>
      Promise.resolve({ id: VAL_NEW, ...data }),
    ),
    getAccount: vi.fn().mockImplementation((id: string, tenantId: string) => {
      if (id === ACCT_1 && tenantId === TENANT_ID) return Promise.resolve({ id: ACCT_1, tenantId, name: 'Operating', type: 'checking' });
      return Promise.resolve(undefined);
    }),
    getTransactionByExternalId: vi.fn().mockResolvedValue(undefined),
    createTransaction: vi.fn().mockImplementation((data: any) =>
      Promise.resolve({ id: TXN_NEW, ...data, createdAt: new Date() }),
    ),
    getIntegrations: vi.fn().mockResolvedValue([]),
  };
});

const env: any = {
  CHITTY_AUTH_SERVICE_TOKEN: TEST_TOKEN,
  DATABASE_URL: 'postgresql://fake:fake@localhost/fake',
  FINANCE_KV: {},
  FINANCE_R2: {},
  ASSETS: { fetch: async () => new Response('Not Found', { status: 404 }) },
};

// ═══════════════════════════════════════════════════════════════
// SCENARIO 1: Property Manager Full Workflow
// ═══════════════════════════════════════════════════════════════
describe('Scenario: Property manager workflow', () => {
  it('lists properties for tenant', async () => {
    const app = createTestApp();
    const res = await app.request('/api/properties', { headers: authHeaders() }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe('City Studio');
  });

  it('gets property details', async () => {
    const app = createTestApp();
    const res = await app.request(`/api/properties/${PROP_1}`, { headers: authHeaders() }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.name).toBe('City Studio');
    expect(body.address).toBe('550 W Surf St');
  });

  it('creates a new property with Zod validation', async () => {
    const app = createTestApp();
    const res = await app.request('/api/properties', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        name: 'New Building', address: '123 Main St', city: 'Chicago',
        state: 'IL', zip: '60601', propertyType: 'apartment',
      }),
    }, env);
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.name).toBe('New Building');
    expect(mockStorage.createProperty).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Building', tenantId: TENANT_ID }),
    );
  });

  it('rejects property creation with missing required fields', async () => {
    const app = createTestApp();
    const res = await app.request('/api/properties', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: 'Incomplete' }), // missing address, city, state, zip, propertyType
    }, env);
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
  });

  it('updates a property', async () => {
    const app = createTestApp();
    const res = await app.request(`/api/properties/${PROP_1}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ name: 'Renamed Studio' }),
    }, env);
    expect(res.status).toBe(200);
  });

  it('returns 404 for non-existent property', async () => {
    const app = createTestApp();
    const NON_EXISTENT = '00000000-0000-0000-0000-000000000000';
    const res = await app.request(`/api/properties/${NON_EXISTENT}`, { headers: authHeaders() }, env);
    expect(res.status).toBe(404);
  });

  it('gets units for a property', async () => {
    const app = createTestApp();
    const res = await app.request(`/api/properties/${PROP_1}/units`, { headers: authHeaders() }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body).toHaveLength(1);
    expect(body[0].unitNumber).toBe('C211');
  });

  it('creates a unit for a property', async () => {
    const app = createTestApp();
    const res = await app.request(`/api/properties/${PROP_1}/units`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ unitNumber: 'C212', bedrooms: 2, bathrooms: '1.0', squareFeet: 900 }),
    }, env);
    expect(res.status).toBe(201);
  });

  it('updates a unit with tenant isolation', async () => {
    const app = createTestApp();
    const res = await app.request(`/api/properties/${PROP_1}/units/${UNIT_1}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ monthlyRent: '2400' }),
    }, env);
    expect(res.status).toBe(200);
    expect(mockStorage.updateUnit).toHaveBeenCalledWith(UNIT_1, PROP_1, expect.any(Object));
  });

  it('gets leases for a property', async () => {
    const app = createTestApp();
    const res = await app.request(`/api/properties/${PROP_1}/leases`, { headers: authHeaders() }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body).toHaveLength(1);
    expect(body[0].tenantName).toBe('John Doe');
  });

  it('creates a lease with unit-property verification', async () => {
    const app = createTestApp();
    const res = await app.request(`/api/properties/${PROP_1}/leases`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        unitId: UNIT_1, tenantName: 'Jane Smith',
        startDate: '2025-01-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z', monthlyRent: '2300',
      }),
    }, env);
    expect(res.status).toBe(201);
  });

  it('rejects lease for unit not in property', async () => {
    const app = createTestApp();
    const res = await app.request(`/api/properties/${PROP_1}/leases`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        unitId: UNIT_FOREIGN, tenantName: 'Attacker',
        startDate: '2025-01-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z', monthlyRent: '100',
      }),
    }, env);
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toContain('does not belong');
  });

  it('gets financials for a property', async () => {
    const app = createTestApp();
    const res = await app.request(`/api/properties/${PROP_1}/financials`, { headers: authHeaders() }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.noi).toBe(18000);
    expect(body.occupancyRate).toBe(100);
  });

  it('gets rent roll', async () => {
    const app = createTestApp();
    const res = await app.request(`/api/properties/${PROP_1}/rent-roll`, { headers: authHeaders() }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body[0].status).toBe('paid');
  });

  it('gets P&L with date range', async () => {
    const app = createTestApp();
    const res = await app.request(`/api/properties/${PROP_1}/pnl?start=2025-01-01&end=2025-12-31`, { headers: authHeaders() }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.net).toBe(18000);
  });

  it('rejects P&L without date params', async () => {
    const app = createTestApp();
    const res = await app.request(`/api/properties/${PROP_1}/pnl`, { headers: authHeaders() }, env);
    expect(res.status).toBe(400);
  });

  it('returns 404 for P&L on non-existent property', async () => {
    const app = createTestApp();
    mockStorage.getPropertyPnL.mockResolvedValueOnce(null);
    const res = await app.request(`/api/properties/${PROP_1}/pnl?start=2025-01-01&end=2025-12-31`, { headers: authHeaders() }, env);
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════
// SCENARIO 2: Valuation Flow
// ═══════════════════════════════════════════════════════════════
describe('Scenario: Valuation workflow', () => {
  it('gets cached valuations with aggregation', async () => {
    const app = createTestApp();
    const res = await app.request(`/api/properties/${PROP_1}/valuation`, { headers: authHeaders() }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.property.name).toBe('City Studio');
    expect(body.weightedEstimate).toBe(350000);
    expect(body.sources).toBe(1);
  });

  it('returns 404 for valuation on non-existent property', async () => {
    const app = createTestApp();
    const NON_EXISTENT = '00000000-0000-0000-0000-000000000000';
    const res = await app.request(`/api/properties/${NON_EXISTENT}/valuation`, { headers: authHeaders() }, env);
    expect(res.status).toBe(404);
  });

  it('gets valuation history', async () => {
    const app = createTestApp();
    const res = await app.request(`/api/properties/${PROP_1}/valuation/history`, { headers: authHeaders() }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body).toHaveLength(1);
    expect(body[0].source).toBe('zillow');
  });
});

// ═══════════════════════════════════════════════════════════════
// SCENARIO 3: TurboTenant CSV Import
// ═══════════════════════════════════════════════════════════════
describe('Scenario: TurboTenant CSV import', () => {
  it('imports valid CSV data', async () => {
    const app = createTestApp();
    const csv = `date,description,amount,category
2024-01-15,Rent Payment Unit C211,2200,rent
2024-01-20,Plumber Repair,-150,maintenance
2024-02-15,Rent Payment Unit C211,2200,rent`;

    const res = await app.request(`/api/import/turbotenant?accountId=${ACCT_1}`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'text/plain' },
      body: csv,
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.parsed).toBe(3);
    expect(body.imported).toBe(3);
    expect(body.skipped).toBe(0);
    expect(body.errors).toHaveLength(0);
    expect(mockStorage.createTransaction).toHaveBeenCalledTimes(3);
  });

  it('handles CSV with quoted fields containing commas', async () => {
    const app = createTestApp();
    const csv = `date,description,amount,category
2024-01-15,"Rent, Unit C211",2200,rent
2024-01-20,"Repair: sink, faucet, toilet",-350,maintenance`;

    const res = await app.request(`/api/import/turbotenant?accountId=${ACCT_1}`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'text/plain' },
      body: csv,
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.parsed).toBe(2);
    expect(body.imported).toBe(2);
  });

  it('deduplicates on re-import', async () => {
    const app = createTestApp();
    // First import
    mockStorage.getTransactionByExternalId.mockResolvedValue({ id: 'existing-txn' });

    const csv = `date,description,amount,category
2024-01-15,Rent Payment,2200,rent`;

    const res = await app.request(`/api/import/turbotenant?accountId=${ACCT_1}`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'text/plain' },
      body: csv,
    }, env);
    expect(res.status).toBe(422); // All skipped = no imports
    const body = await res.json() as any;
    expect(body.skipped).toBe(1);
    expect(body.imported).toBe(0);
  });

  it('rejects empty CSV', async () => {
    const app = createTestApp();
    const res = await app.request(`/api/import/turbotenant?accountId=${ACCT_1}`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'text/plain' },
      body: 'date,description,amount\n',
    }, env);
    expect(res.status).toBe(400);
  });

  it('rejects missing accountId', async () => {
    const app = createTestApp();
    const res = await app.request('/api/import/turbotenant', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'text/plain' },
      body: 'date,description,amount\n2024-01-15,Test,100',
    }, env);
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toContain('accountId');
  });

  it('rejects non-existent account', async () => {
    const app = createTestApp();
    const res = await app.request(`/api/import/turbotenant?accountId=${'00000000-0000-0000-0000-ffffffffffff'}`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'text/plain' },
      body: 'date,description,amount\n2024-01-15,Test,100',
    }, env);
    expect(res.status).toBe(404);
  });

  it('rejects Wave sync without configured credentials', async () => {
    const app = createTestApp();
    const res = await app.request('/api/import/wave-sync', {
      method: 'POST',
      headers: authHeaders(),
    }, env);
    expect(res.status).toBe(503);
    const body = await res.json() as any;
    expect(body.error).toContain('not configured');
  });
});

// ═══════════════════════════════════════════════════════════════
// SCENARIO 4: Auth Boundary Testing
// ═══════════════════════════════════════════════════════════════
describe('Scenario: Auth boundaries', () => {
  it('rejects requests without auth token', async () => {
    const app = createTestApp();
    const res = await app.request('/api/properties', {
      headers: { 'X-Tenant-ID': TENANT_ID },
    }, env);
    expect(res.status).toBe(401);
  });

  it('rejects requests with wrong token', async () => {
    const app = createTestApp();
    const res = await app.request('/api/properties', {
      headers: { Authorization: 'Bearer wrong-token', 'X-Tenant-ID': TENANT_ID },
    }, env);
    expect(res.status).toBe(401);
  });

  it('rejects requests without tenant ID', async () => {
    const app = createTestApp();
    const res = await app.request('/api/properties', {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    }, env);
    expect(res.status).toBe(400);
  });

  it('handles Bearer prefix variations', async () => {
    const app = createTestApp();
    // No "Bearer " prefix
    const res = await app.request('/api/properties', {
      headers: { Authorization: TEST_TOKEN, 'X-Tenant-ID': TENANT_ID },
    }, env);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// SCENARIO 5: Cross-Tenant Isolation
// ═══════════════════════════════════════════════════════════════
describe('Scenario: Cross-tenant isolation', () => {
  it('cannot access property from different tenant', async () => {
    const app = createTestApp();
    const OTHER_TENANT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const res = await app.request(`/api/properties/${PROP_1}`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}`, 'X-Tenant-ID': OTHER_TENANT, 'Content-Type': 'application/json' },
    }, env);
    expect(res.status).toBe(404);
    // getProperty was called with the OTHER tenant ID, which won't match
    expect(mockStorage.getProperty).toHaveBeenCalledWith(PROP_1, OTHER_TENANT);
  });
});

// ═══════════════════════════════════════════════════════════════
// PRESSURE TEST: Concurrent Requests
// ═══════════════════════════════════════════════════════════════
describe('Pressure: Concurrent requests', () => {
  it('handles 50 concurrent property list requests', async () => {
    const app = createTestApp();
    const requests = Array.from({ length: 50 }, () =>
      app.request('/api/properties', { headers: authHeaders() }, env),
    );
    const results = await Promise.all(requests);
    const statuses = results.map((r) => r.status);
    expect(statuses.every((s) => s === 200)).toBe(true);
    expect(mockStorage.getProperties).toHaveBeenCalledTimes(50);
  });

  it('handles 20 concurrent CSV imports', async () => {
    const app = createTestApp();
    const csv = `date,description,amount,category
2024-01-15,Rent,2200,rent`;

    const requests = Array.from({ length: 20 }, () =>
      app.request(`/api/import/turbotenant?accountId=${ACCT_1}`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'text/plain' },
        body: csv,
      }, env),
    );
    const results = await Promise.all(requests);
    expect(results.every((r) => r.status === 200)).toBe(true);
  });

  it('handles mixed concurrent read/write operations', async () => {
    const app = createTestApp();
    const reads = Array.from({ length: 25 }, () =>
      app.request('/api/properties', { headers: authHeaders() }, env),
    );
    const writes = Array.from({ length: 10 }, (_, i) =>
      app.request('/api/properties', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          name: `Property ${i}`, address: `${i} Main St`, city: 'Chicago',
          state: 'IL', zip: '60601', propertyType: 'apartment',
        }),
      }, env),
    );
    const results = await Promise.all([...reads, ...writes]);
    const readResults = results.slice(0, 25);
    const writeResults = results.slice(25);
    expect(readResults.every((r) => r.status === 200)).toBe(true);
    expect(writeResults.every((r) => r.status === 201)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// PRESSURE TEST: Malformed Input
// ═══════════════════════════════════════════════════════════════
describe('Pressure: Malformed input', () => {
  it('handles extremely large CSV gracefully', async () => {
    const app = createTestApp();
    const header = 'date,description,amount,category\n';
    const rows = Array.from({ length: 1000 }, (_, i) =>
      `2024-01-${String(i % 28 + 1).padStart(2, '0')},Payment ${i},${100 + i},rent`,
    ).join('\n');
    const csv = header + rows;

    const res = await app.request(`/api/import/turbotenant?accountId=${ACCT_1}`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'text/plain' },
      body: csv,
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.parsed).toBe(1000);
    expect(body.imported).toBe(1000);
  });

  it('handles malformed JSON body on property creation', async () => {
    const app = createTestApp();
    const res = await app.request('/api/properties', {
      method: 'POST',
      headers: authHeaders(),
      body: 'this is not json{{{',
    }, env);
    // Hono returns 400 for malformed JSON
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('handles empty body on property creation', async () => {
    const app = createTestApp();
    const res = await app.request('/api/properties', {
      method: 'POST',
      headers: authHeaders(),
      body: '{}',
    }, env);
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBe('Validation failed');
  });

  it('handles SQL injection attempts in query params', async () => {
    const app = createTestApp();
    const res = await app.request(`/api/properties/${PROP_1}/pnl?start=2025-01-01'; DROP TABLE properties;--&end=2025-12-31`, {
      headers: authHeaders(),
    }, env);
    // Should not crash; Drizzle parameterizes queries
    expect([200, 404]).toContain(res.status);
  });

  it('handles unicode in property names', async () => {
    const app = createTestApp();
    const res = await app.request('/api/properties', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        name: '日本語ビル 🏢', address: '123 Main St', city: 'Chicago',
        state: 'IL', zip: '60601', propertyType: 'apartment',
      }),
    }, env);
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.name).toBe('日本語ビル 🏢');
  });

  it('handles CSV with special characters', async () => {
    const app = createTestApp();
    const csv = `date,description,amount,category
2024-01-15,"Rent — Unit #5 (Jan '24)",2200,rent
2024-01-20,"Repairs: ñ, ü, é",-150,maintenance`;

    const res = await app.request(`/api/import/turbotenant?accountId=${ACCT_1}`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'text/plain' },
      body: csv,
    }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.parsed).toBe(2);
    expect(body.imported).toBe(2);
  });
});
