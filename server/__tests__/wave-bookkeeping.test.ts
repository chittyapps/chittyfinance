import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies that make network calls
vi.mock('../storage', () => ({
  storage: {
    getTransactions: vi.fn().mockResolvedValue([]),
    createTransaction: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../lib/chittychronicle-logging', () => ({
  logToChronicle: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/chittyschema-validation', () => ({
  validateTransaction: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
}));

import { WaveBookkeepingClient, createWaveBookkeepingClient } from '../lib/wave-bookkeeping';
import { WaveAPIClient } from '../lib/wave-api';

// Build a minimal raw invoice node as Wave GraphQL would return it
function makeRawInvoice(overrides: Record<string, any> = {}) {
  return {
    id: 'inv-1',
    invoiceNumber: 'INV-001',
    customer: { id: 'cust-1', name: 'Acme Corp' },
    invoiceDate: '2024-06-15',
    dueDate: '2024-07-15',
    status: 'PAID',
    subTotal: { value: '1000.00', currency: { code: 'USD' } },
    total: { value: '1080.00', currency: { code: 'USD' } },
    amountDue: { value: '0.00' },
    items: [
      {
        description: 'Consulting',
        quantity: 10,
        unitPrice: 100,
        total: { value: '1000.00' },
        account: { id: 'acc-income' },
      },
    ],
    taxes: [
      {
        name: 'Sales Tax',
        rate: 0.08,
        amount: { value: '80.00' },
      },
    ],
    ...overrides,
  };
}

const defaultConfig = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://example.com/callback',
};

describe('WaveBookkeepingClient - getInvoices', () => {
  let client: WaveBookkeepingClient;
  let graphqlSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = new WaveBookkeepingClient(defaultConfig);
    client.setAccessToken('test-token');
  });

  function mockGraphQL(invoiceNodes: any[]) {
    graphqlSpy = vi.spyOn(WaveAPIClient.prototype as any, 'graphql').mockResolvedValue({
      business: {
        invoices: {
          edges: invoiceNodes.map(node => ({ node })),
        },
      },
    });
  }

  it('maps GraphQL response to WaveInvoice shape', async () => {
    mockGraphQL([makeRawInvoice()]);
    const invoices = await client.getInvoices('biz-1');
    expect(invoices).toHaveLength(1);
    const inv = invoices[0];
    expect(inv.id).toBe('inv-1');
    expect(inv.invoiceNumber).toBe('INV-001');
    expect(inv.customerId).toBe('cust-1');
    expect(inv.customerName).toBe('Acme Corp');
    expect(inv.invoiceDate).toBe('2024-06-15');
    expect(inv.dueDate).toBe('2024-07-15');
    expect(inv.status).toBe('PAID');
    expect(inv.subtotal).toBe(1000);
    expect(inv.total).toBe(1080);
    expect(inv.amountDue).toBe(0);
    expect(inv.currency).toBe('USD');
  });

  it('maps items correctly including accountId', async () => {
    mockGraphQL([makeRawInvoice()]);
    const invoices = await client.getInvoices('biz-1');
    const item = invoices[0].items[0];
    expect(item.description).toBe('Consulting');
    expect(item.quantity).toBe(10);
    expect(item.unitPrice).toBe(100);
    expect(item.total).toBe(1000);
    expect(item.accountId).toBe('acc-income');
  });

  it('maps taxes correctly', async () => {
    mockGraphQL([makeRawInvoice()]);
    const invoices = await client.getInvoices('biz-1');
    const tax = invoices[0].taxes[0];
    expect(tax.name).toBe('Sales Tax');
    expect(tax.rate).toBe(0.08);
    expect(tax.amount).toBe(80);
  });

  it('filters by status', async () => {
    mockGraphQL([
      makeRawInvoice({ id: 'inv-1', status: 'PAID' }),
      makeRawInvoice({ id: 'inv-2', status: 'DRAFT' }),
      makeRawInvoice({ id: 'inv-3', status: 'PAID' }),
    ]);
    const invoices = await client.getInvoices('biz-1', { status: 'PAID' });
    expect(invoices).toHaveLength(2);
    expect(invoices.every(i => i.status === 'PAID')).toBe(true);
  });

  it('filters by customerId', async () => {
    mockGraphQL([
      makeRawInvoice({ id: 'inv-1', customer: { id: 'cust-A', name: 'Alpha Corp' } }),
      makeRawInvoice({ id: 'inv-2', customer: { id: 'cust-B', name: 'Beta Inc' } }),
    ]);
    const invoices = await client.getInvoices('biz-1', { customerId: 'cust-A' });
    expect(invoices).toHaveLength(1);
    expect(invoices[0].customerId).toBe('cust-A');
  });

  it('filters by startDate (inclusive)', async () => {
    mockGraphQL([
      makeRawInvoice({ id: 'inv-1', invoiceDate: '2024-03-01' }),
      makeRawInvoice({ id: 'inv-2', invoiceDate: '2024-04-01' }),
      makeRawInvoice({ id: 'inv-3', invoiceDate: '2024-04-15' }),
    ]);
    const invoices = await client.getInvoices('biz-1', { startDate: '2024-04-01' });
    expect(invoices).toHaveLength(2);
    expect(invoices.map(i => i.invoiceDate)).toEqual(['2024-04-01', '2024-04-15']);
  });

  it('filters by endDate (inclusive)', async () => {
    mockGraphQL([
      makeRawInvoice({ id: 'inv-1', invoiceDate: '2024-03-01' }),
      makeRawInvoice({ id: 'inv-2', invoiceDate: '2024-04-01' }),
      makeRawInvoice({ id: 'inv-3', invoiceDate: '2024-05-01' }),
    ]);
    const invoices = await client.getInvoices('biz-1', { endDate: '2024-04-01' });
    expect(invoices).toHaveLength(2);
    expect(invoices.map(i => i.invoiceDate)).toEqual(['2024-03-01', '2024-04-01']);
  });

  it('applies all filters together (AND semantics)', async () => {
    mockGraphQL([
      makeRawInvoice({ id: 'inv-1', status: 'PAID', invoiceDate: '2024-04-15', customer: { id: 'cust-A', name: 'A' } }),
      makeRawInvoice({ id: 'inv-2', status: 'DRAFT', invoiceDate: '2024-04-15', customer: { id: 'cust-A', name: 'A' } }),
      makeRawInvoice({ id: 'inv-3', status: 'PAID', invoiceDate: '2024-03-01', customer: { id: 'cust-A', name: 'A' } }),
      makeRawInvoice({ id: 'inv-4', status: 'PAID', invoiceDate: '2024-04-15', customer: { id: 'cust-B', name: 'B' } }),
    ]);
    const invoices = await client.getInvoices('biz-1', {
      status: 'PAID',
      customerId: 'cust-A',
      startDate: '2024-04-01',
      endDate: '2024-04-30',
    });
    expect(invoices).toHaveLength(1);
    expect(invoices[0].id).toBe('inv-1');
  });

  it('returns empty array when no invoices match filter', async () => {
    mockGraphQL([makeRawInvoice({ status: 'DRAFT' })]);
    const invoices = await client.getInvoices('biz-1', { status: 'PAID' });
    expect(invoices).toHaveLength(0);
  });

  it('returns all invoices when no filters specified', async () => {
    mockGraphQL([
      makeRawInvoice({ id: 'inv-1', status: 'PAID' }),
      makeRawInvoice({ id: 'inv-2', status: 'DRAFT' }),
    ]);
    const invoices = await client.getInvoices('biz-1');
    expect(invoices).toHaveLength(2);
  });

  it('uses product name as description fallback when description is missing', async () => {
    const rawInv = makeRawInvoice();
    rawInv.items[0].description = null;
    rawInv.items[0].product = { name: 'Product Alpha' };
    mockGraphQL([rawInv]);
    const invoices = await client.getInvoices('biz-1');
    expect(invoices[0].items[0].description).toBe('Product Alpha');
  });

  it('initializes payments as an empty array', async () => {
    mockGraphQL([makeRawInvoice()]);
    const invoices = await client.getInvoices('biz-1');
    expect(invoices[0].payments).toEqual([]);
  });
});

describe('WaveBookkeepingClient - recordInvoicePayment', () => {
  let client: WaveBookkeepingClient;

  beforeEach(() => {
    client = new WaveBookkeepingClient(defaultConfig);
    client.setAccessToken('test-token');
  });

  it('maps GraphQL response to WavePayment shape', async () => {
    vi.spyOn(WaveAPIClient.prototype as any, 'graphql').mockResolvedValue({
      invoicePaymentRecord: {
        payment: {
          id: 'pay-1',
          amount: { value: '1080.00' },
          date: '2024-07-01',
          paymentMethod: 'ACH',
        },
      },
    });

    const payment = await client.recordInvoicePayment('inv-1', {
      amount: 1080,
      date: '2024-07-01',
      paymentMethod: 'ACH',
      memo: 'Full payment',
    });

    expect(payment.id).toBe('pay-1');
    expect(payment.amount).toBe(1080);
    expect(payment.date).toBe('2024-07-01');
    expect(payment.paymentMethod).toBe('ACH');
    expect(payment.invoiceId).toBe('inv-1');
    expect(payment.memo).toBe('Full payment');
  });

  it('parses amount as a float from GraphQL string value', async () => {
    vi.spyOn(WaveAPIClient.prototype as any, 'graphql').mockResolvedValue({
      invoicePaymentRecord: {
        payment: {
          id: 'pay-2',
          amount: { value: '250.50' },
          date: '2024-08-01',
          paymentMethod: 'CHECK',
        },
      },
    });

    const payment = await client.recordInvoicePayment('inv-2', {
      amount: 250.5,
      date: '2024-08-01',
      paymentMethod: 'CHECK',
    });

    expect(payment.amount).toBe(250.5);
  });
});

describe('WaveBookkeepingClient - getCustomers', () => {
  let client: WaveBookkeepingClient;

  beforeEach(() => {
    client = new WaveBookkeepingClient(defaultConfig);
    client.setAccessToken('test-token');
  });

  it('maps customer nodes to WaveCustomer shape', async () => {
    vi.spyOn(WaveAPIClient.prototype as any, 'graphql').mockResolvedValue({
      business: {
        customers: {
          edges: [
            {
              node: {
                id: 'cust-1',
                name: 'Acme Corp',
                email: 'billing@acme.com',
                phone: '555-0100',
                address: {
                  addressLine1: '100 Main St',
                  addressLine2: 'Suite 200',
                  city: 'Springfield',
                  province: { name: 'Illinois' },
                  postalCode: '62701',
                  country: { name: 'United States' },
                },
                currency: { code: 'USD' },
              },
            },
          ],
        },
      },
    });

    const customers = await client.getCustomers('biz-1');
    expect(customers).toHaveLength(1);
    const c = customers[0];
    expect(c.id).toBe('cust-1');
    expect(c.name).toBe('Acme Corp');
    expect(c.email).toBe('billing@acme.com');
    expect(c.phone).toBe('555-0100');
    expect(c.address?.line1).toBe('100 Main St');
    expect(c.address?.line2).toBe('Suite 200');
    expect(c.address?.city).toBe('Springfield');
    expect(c.address?.state).toBe('Illinois');
    expect(c.address?.zip).toBe('62701');
    expect(c.address?.country).toBe('United States');
    expect(c.currency).toBe('USD');
    expect(c.balance).toBe(0); // Balance is always 0 (not calculated from API)
  });

  it('returns undefined address when customer has no address', async () => {
    vi.spyOn(WaveAPIClient.prototype as any, 'graphql').mockResolvedValue({
      business: {
        customers: {
          edges: [
            {
              node: {
                id: 'cust-2',
                name: 'Simple Customer',
                email: null,
                phone: null,
                address: null,
                currency: { code: 'CAD' },
              },
            },
          ],
        },
      },
    });

    const customers = await client.getCustomers('biz-1');
    expect(customers[0].address).toBeUndefined();
    expect(customers[0].currency).toBe('CAD');
  });
});

describe('WaveBookkeepingClient - getAccounts', () => {
  let client: WaveBookkeepingClient;

  beforeEach(() => {
    client = new WaveBookkeepingClient(defaultConfig);
    client.setAccessToken('test-token');
  });

  it('maps account nodes to WaveAccount shape', async () => {
    vi.spyOn(WaveAPIClient.prototype as any, 'graphql').mockResolvedValue({
      business: {
        accounts: {
          edges: [
            {
              node: {
                id: 'acc-1',
                name: 'Business Checking',
                type: { name: 'Asset' },
                subtype: { name: 'Checking' },
                currency: { code: 'USD' },
              },
            },
          ],
        },
      },
    });

    const accounts = await client.getAccounts('biz-1');
    expect(accounts).toHaveLength(1);
    const a = accounts[0];
    expect(a.id).toBe('acc-1');
    expect(a.name).toBe('Business Checking');
    expect(a.type).toBe('Asset');
    expect(a.subtype).toBe('Checking');
    expect(a.currency).toBe('USD');
    expect(a.balance).toBe(0); // Always 0 (not fetched from API)
  });
});

describe('createWaveBookkeepingClient factory', () => {
  it('creates a WaveBookkeepingClient instance', () => {
    const client = createWaveBookkeepingClient({
      clientId: 'test-id',
      clientSecret: 'test-secret',
      redirectUri: 'https://example.com/callback',
    });
    expect(client).toBeInstanceOf(WaveBookkeepingClient);
  });

  it('creates a WaveBookkeepingClient that is also a WaveAPIClient', () => {
    const client = createWaveBookkeepingClient({
      clientId: 'test-id',
      clientSecret: 'test-secret',
      redirectUri: 'https://example.com/callback',
    });
    expect(client).toBeInstanceOf(WaveAPIClient);
  });

  it('creates distinct client instances each time', () => {
    const config = { clientId: 'id', clientSecret: 'secret', redirectUri: 'https://example.com' };
    const client1 = createWaveBookkeepingClient(config);
    const client2 = createWaveBookkeepingClient(config);
    expect(client1).not.toBe(client2);
  });
});
