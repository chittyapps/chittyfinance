import { Hono } from 'hono';
import type { HonoEnv } from '../env';

/**
 * Private ChittyConnect -> ChittyFinance read projection.
 *
 * This surface is reachable only through the Cloudflare service binding used by
 * ChittyConnect. It deliberately does not accept bearer secrets: the binding is
 * the transport boundary, the synthetic "internal" hostname prevents the public
 * finance.chitty.cc route from reaching it, and X-ChittyOS-Caller identifies the
 * owning broker.
 *
 * No writes live here. ChittyFinance remains the financial system of record.
 */
export const internalChittyConnectRoutes = new Hono<HonoEnv>();

internalChittyConnectRoutes.use('/internal/chittyconnect/*', async (c, next) => {
  const hostname = new URL(c.req.url).hostname.toLowerCase();
  const caller = c.req.header('x-chittyos-caller');

  if (hostname !== 'internal' || caller !== 'chittyconnect') {
    // Do not advertise the private surface on the public Worker.
    return c.json({ error: 'not_found' }, 404);
  }

  await next();
});

function formatAccount(account: any) {
  return {
    id: account.id,
    tenantId: account.tenantId,
    name: account.name,
    type: account.type,
    institution: account.institution || '',
    accountNumber: account.accountNumber || undefined,
    balance: Number(account.balance),
    currency: account.currency,
    externalId: account.externalId || undefined,
    isActive: account.isActive,
    metadata: account.metadata || undefined,
    updatedAt: account.updatedAt,
  };
}

function formatTransaction(tx: any) {
  return {
    id: tx.id,
    tenantId: tx.tenantId,
    accountId: tx.accountId,
    amount: Number(tx.amount),
    type: tx.type,
    category: tx.category || undefined,
    description: tx.description,
    date: tx.date,
    payee: tx.payee || undefined,
    reconciled: tx.reconciled,
    externalId: tx.externalId || undefined,
    metadata: tx.metadata || undefined,
  };
}

async function resolveTenant(storage: any, reference: string) {
  const tenants = await storage.getTenants();
  const normalized = decodeURIComponent(reference).trim().toLowerCase();

  return tenants.find((tenant: any) =>
    tenant.id === reference ||
    String(tenant.slug || '').toLowerCase() === normalized ||
    String(tenant.name || '').toLowerCase() === normalized
  );
}

function withinWindow(tx: any, start?: string, end?: string) {
  const time = new Date(tx.date).getTime();
  if (!Number.isFinite(time)) return false;
  if (start && time < new Date(start).getTime()) return false;
  if (end && time > new Date(end).getTime()) return false;
  return true;
}

// GET /internal/chittyconnect/entities
// System-mode projection used by ChittyConnect to resolve canonical tenant and
// financial-account bindings before reconciliation. Read-only by design.
internalChittyConnectRoutes.get('/internal/chittyconnect/entities', async (c) => {
  const storage = c.get('storage');
  const tenants = await storage.getTenants();

  const entities = await Promise.all(tenants.map(async (tenant: any) => {
    const accounts = await storage.getAccounts(tenant.id);
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      type: tenant.type,
      parentId: tenant.parentId || undefined,
      isActive: tenant.isActive,
      metadata: tenant.metadata || undefined,
      accounts: accounts.map(formatAccount),
    };
  }));

  return c.json({ entities });
});

// GET /internal/chittyconnect/entities/:entity/balances
internalChittyConnectRoutes.get('/internal/chittyconnect/entities/:entity/balances', async (c) => {
  const storage = c.get('storage');
  const tenant = await resolveTenant(storage, c.req.param('entity'));
  if (!tenant) return c.json({ error: 'entity_not_found' }, 404);

  const [accounts, summary] = await Promise.all([
    storage.getAccounts(tenant.id),
    storage.getSummary(tenant.id),
  ]);

  return c.json({
    entity: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      type: tenant.type,
    },
    accounts: accounts.map(formatAccount),
    summary,
  });
});

// GET /internal/chittyconnect/entities/:entity/transactions?start=&end=
internalChittyConnectRoutes.get('/internal/chittyconnect/entities/:entity/transactions', async (c) => {
  const storage = c.get('storage');
  const tenant = await resolveTenant(storage, c.req.param('entity'));
  if (!tenant) return c.json({ error: 'entity_not_found' }, 404);

  const start = c.req.query('start');
  const end = c.req.query('end');
  const rows = await storage.getTransactions(tenant.id);
  const transactions = rows
    .filter((tx: any) => withinWindow(tx, start, end))
    .map(formatTransaction);

  return c.json({
    entity: { id: tenant.id, name: tenant.name, slug: tenant.slug, type: tenant.type },
    transactions,
  });
});

// GET /internal/chittyconnect/entities/:entity/cash-flow?start=&end=
internalChittyConnectRoutes.get('/internal/chittyconnect/entities/:entity/cash-flow', async (c) => {
  const storage = c.get('storage');
  const tenant = await resolveTenant(storage, c.req.param('entity'));
  if (!tenant) return c.json({ error: 'entity_not_found' }, 404);

  const start = c.req.query('start');
  const end = c.req.query('end');
  const rows = (await storage.getTransactions(tenant.id))
    .filter((tx: any) => withinWindow(tx, start, end));

  let inflows = 0;
  let outflows = 0;
  let transferCount = 0;

  for (const tx of rows) {
    const amount = Number(tx.amount);
    if (!Number.isFinite(amount)) continue;
    if (tx.type === 'transfer') {
      transferCount++;
      continue;
    }
    if (tx.type === 'income') inflows += Math.abs(amount);
    else if (tx.type === 'expense') outflows += Math.abs(amount);
  }

  return c.json({
    entity: { id: tenant.id, name: tenant.name, slug: tenant.slug, type: tenant.type },
    start: start || null,
    end: end || null,
    inflows,
    outflows,
    net: inflows - outflows,
    transactionCount: rows.length,
    transferCount,
  });
});
