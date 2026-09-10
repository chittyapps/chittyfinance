import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { chargeRoutes, detectRecurringCharges, analyzeOptimizations } from '../routes/charges';

/**
 * These replace an older suite that mocked `storage.getIntegrations` and
 * asserted a stub contract ("returns empty array — stub implementation",
 * "not yet implemented"). Both had been false for some time: the route was
 * implemented for real and reads `storage.getTransactions`, so every one of
 * those tests was failing with a 500 while the endpoint worked fine.
 *
 * The detection and recommendation logic is pure, so it is exercised directly
 * against realistic transaction shapes rather than through a mocked datastore.
 */

type Tx = Parameters<typeof detectRecurringCharges>[0][number];

function tx(over: Partial<Tx> & { payee: string; amount: string; date: string }): Tx {
  return {
    id: `tx-${over.payee}-${over.date}`,
    type: 'expense',
    category: 'Software',
    description: over.payee,
    ...over,
  } as Tx;
}

describe('detectRecurringCharges', () => {
  it('returns nothing for an empty ledger', () => {
    expect(detectRecurringCharges([])).toEqual([]);
  });

  it('ignores a payee seen only once', () => {
    expect(detectRecurringCharges([tx({ payee: 'Notion', amount: '-10.00', date: '2026-01-05' })])).toEqual([]);
  });

  it('ignores income, since a recurring charge is an outflow', () => {
    const rows = [
      tx({ payee: 'Rent Deposit', amount: '2400.00', date: '2026-01-01', type: 'income' }),
      tx({ payee: 'Rent Deposit', amount: '2400.00', date: '2026-02-01', type: 'income' }),
    ];
    expect(detectRecurringCharges(rows)).toEqual([]);
  });

  it('detects a monthly charge and projects the next date', () => {
    const rows = [
      tx({ payee: 'Adobe', amount: '-59.99', date: '2026-01-12' }),
      tx({ payee: 'Adobe', amount: '-59.99', date: '2026-02-12' }),
      tx({ payee: 'Adobe', amount: '-59.99', date: '2026-03-12' }),
    ];
    const [charge] = detectRecurringCharges(rows);
    expect(charge.merchantName).toBe('Adobe');
    expect(charge.occurrences).toBe(3);
    expect(charge.frequency).toBe('monthly');
    expect(charge.amount).toBeCloseTo(59.99, 2);
    // next charge is projected a month past the most recent occurrence
    expect(charge.nextChargeDate?.slice(0, 7)).toBe('2026-04');
  });

  it('groups by payee case-insensitively', () => {
    const rows = [
      tx({ payee: 'ADOBE', amount: '-59.99', date: '2026-01-12' }),
      tx({ payee: 'adobe', amount: '-59.99', date: '2026-02-12' }),
    ];
    expect(detectRecurringCharges(rows)).toHaveLength(1);
  });

  it('sorts the biggest charge first', () => {
    const rows = [
      tx({ payee: 'Small', amount: '-5.00', date: '2026-01-01' }),
      tx({ payee: 'Small', amount: '-5.00', date: '2026-02-01' }),
      tx({ payee: 'Large', amount: '-500.00', date: '2026-01-01' }),
      tx({ payee: 'Large', amount: '-500.00', date: '2026-02-01' }),
    ];
    const charges = detectRecurringCharges(rows);
    expect(charges.map((ch) => ch.merchantName)).toEqual(['Large', 'Small']);
  });
});

describe('analyzeOptimizations', () => {
  it('recommends nothing when there are no charges', () => {
    expect(analyzeOptimizations([])).toEqual([]);
  });

  it('only ever recommends actions the manage endpoint accepts', () => {
    // POST /api/charges/manage rejects anything outside this set with a 400,
    // so a recommendation the caller cannot act on is a dead end.
    const accepted = new Set(['cancel', 'downgrade', 'consolidate', 'negotiate']);
    const rows = [
      tx({ payee: 'Adobe', amount: '-59.99', date: '2026-01-12' }),
      tx({ payee: 'Adobe', amount: '-59.99', date: '2026-02-12' }),
      tx({ payee: 'Figma', amount: '-45.00', date: '2026-01-20' }),
      tx({ payee: 'Figma', amount: '-45.00', date: '2026-02-20' }),
      tx({ payee: 'Storage Unit', amount: '-210.00', date: '2026-01-03', category: 'Facilities' }),
      tx({ payee: 'Storage Unit', amount: '-210.00', date: '2026-02-03', category: 'Facilities' }),
    ];
    const recs = analyzeOptimizations(detectRecurringCharges(rows));
    for (const r of recs) {
      expect(accepted, `suggestedAction ${r.suggestedAction}`).toContain(r.suggestedAction);
      expect(r.potentialSavings).toBeGreaterThanOrEqual(0);
      expect(r.chargeId).toBeTruthy();
    }
  });

  it('does not credit a small charge with the whole category\'s savings', () => {
    // Consolidation groups by category. Crediting each member with a share of
    // the category total made a $1/mo line report $300.30 against a $1,000/mo
    // neighbour, and counted the same saving once per member.
    const rows = [
      tx({ payee: 'Tiny', amount: '-1.00', date: '2026-01-01' }),
      tx({ payee: 'Tiny', amount: '-1.00', date: '2026-02-01' }),
      tx({ payee: 'Huge', amount: '-1000.00', date: '2026-01-01' }),
      tx({ payee: 'Huge', amount: '-1000.00', date: '2026-02-01' }),
    ];
    const charges = detectRecurringCharges(rows);
    const recs = analyzeOptimizations(charges);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.every((r) => r.suggestedAction === 'consolidate')).toBe(true);

    const tiny = recs.find((r) => r.merchantName === 'Tiny')!;
    const huge = recs.find((r) => r.merchantName === 'Huge')!;
    expect(tiny.potentialSavings).toBeLessThan(huge.potentialSavings);
    for (const r of recs) {
      const src = charges.find((c) => c.id === r.chargeId)!;
      expect(r.potentialSavings, `${r.merchantName}`).toBeLessThanOrEqual(src.amount);
    }
  });

  it('never invents savings larger than the charge itself', () => {
    const rows = [
      tx({ payee: 'Adobe', amount: '-59.99', date: '2026-01-12' }),
      tx({ payee: 'Adobe', amount: '-59.99', date: '2026-02-12' }),
    ];
    const charges = detectRecurringCharges(rows);
    for (const r of analyzeOptimizations(charges)) {
      const source = charges.find((ch) => ch.id === r.chargeId)!;
      expect(r.potentialSavings).toBeLessThanOrEqual(source.amount * 12);
    }
  });
});

/**
 * The pure-function tests above do not exercise the HTTP layer, so these cover
 * what only a request can: tenant scoping, the validation branches, and the
 * 404. The storage stand-in implements exactly the two methods the route calls
 * -- an older version of this file stubbed `getIntegrations`, which the route
 * stopped using, and every test then failed with a 500 that nobody saw.
 */
const baseEnv = {
  CHITTY_AUTH_SERVICE_TOKEN: 'svc-token',
  DATABASE_URL: 'fake',
  FINANCE_KV: {} as any,
  FINANCE_R2: {} as any,
  ASSETS: {} as any,
};

const TENANT = 'tenant-1';

function buildApp(storage: Record<string, unknown>) {
  const app = new Hono<HonoEnv>();
  app.use('*', async (c, next) => {
    c.set('tenantId', TENANT);
    c.set('storage', storage as any);
    await next();
  });
  app.route('/', chargeRoutes);
  return app;
}

function recurringLedger() {
  return [
    tx({ payee: 'Adobe', amount: '-59.99', date: '2026-01-12' }),
    tx({ payee: 'Adobe', amount: '-59.99', date: '2026-02-12' }),
  ];
}

describe('GET /api/charges/* — HTTP layer', () => {
  it('scopes the transaction read to the tenant from context, not the query string', async () => {
    const getTransactions = vi.fn().mockResolvedValue(recurringLedger());
    const app = buildApp({ getTransactions });
    // A caller-supplied tenantId must not reach storage.
    const res = await app.request('/api/charges/recurring?tenantId=other-tenant', {}, baseEnv);
    expect(res.status).toBe(200);
    expect(getTransactions).toHaveBeenCalledWith(TENANT);
    expect(getTransactions).not.toHaveBeenCalledWith('other-tenant');
  });

  it('returns detected charges as JSON', async () => {
    const app = buildApp({ getTransactions: vi.fn().mockResolvedValue(recurringLedger()) });
    const res = await app.request('/api/charges/recurring', {}, baseEnv);
    const body = (await res.json()) as Array<{ merchantName: string }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].merchantName).toBe('Adobe');
  });

  it('returns an empty array for an empty ledger rather than erroring', async () => {
    const app = buildApp({ getTransactions: vi.fn().mockResolvedValue([]) });
    const res = await app.request('/api/charges/recurring', {}, baseEnv);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('serves optimizations from the same tenant-scoped read', async () => {
    const getTransactions = vi.fn().mockResolvedValue(recurringLedger());
    const app = buildApp({ getTransactions });
    const res = await app.request('/api/charges/optimizations', {}, baseEnv);
    expect(res.status).toBe(200);
    expect(getTransactions).toHaveBeenCalledWith(TENANT);
    expect(Array.isArray(await res.json())).toBe(true);
  });
});

describe('POST /api/charges/manage — HTTP layer', () => {
  function manage(app: ReturnType<typeof buildApp>, payload: unknown) {
    return app.request(
      '/api/charges/manage',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) },
      baseEnv,
    );
  }

  it('rejects a missing chargeId or action with 400', async () => {
    const app = buildApp({ updateTransaction: vi.fn() });
    expect((await manage(app, { action: 'cancel' })).status).toBe(400);
    expect((await manage(app, { chargeId: 'c-1' })).status).toBe(400);
  });

  it('rejects an action outside the accepted set with 400', async () => {
    const updateTransaction = vi.fn();
    const app = buildApp({ updateTransaction });
    const res = await manage(app, { chargeId: 'c-1', action: 'delete' });
    expect(res.status).toBe(400);
    expect(updateTransaction).not.toHaveBeenCalled();
  });

  it('accepts every action analyzeOptimizations can recommend', async () => {
    for (const action of ['cancel', 'downgrade', 'consolidate', 'negotiate']) {
      const app = buildApp({ updateTransaction: vi.fn().mockResolvedValue({ id: 'c-1' }) });
      const res = await manage(app, { chargeId: 'c-1', action });
      expect(res.status, `action ${action}`).toBe(200);
    }
  });

  it('flags the charge against the context tenant and echoes the action', async () => {
    const updateTransaction = vi.fn().mockResolvedValue({ id: 'c-1' });
    const app = buildApp({ updateTransaction });
    const res = await manage(app, { chargeId: 'c-1', action: 'cancel' });
    expect(res.status).toBe(200);
    expect(updateTransaction).toHaveBeenCalledWith(
      'c-1',
      TENANT,
      expect.objectContaining({ metadata: expect.objectContaining({ chargeAction: 'cancel' }) }),
    );
    expect(await res.json()).toMatchObject({ success: true, chargeId: 'c-1', action: 'cancel' });
  });

  it('returns 404 when the transaction does not exist', async () => {
    const app = buildApp({ updateTransaction: vi.fn().mockResolvedValue(null) });
    const res = await manage(app, { chargeId: 'nope', action: 'cancel' });
    expect(res.status).toBe(404);
  });
});
