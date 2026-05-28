import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import {
  serializeCsv,
  serializeOfx,
  buildAccountMap,
  contentTypeForFormat,
  fileExtension,
  type ExportFormat,
  type ExportTransaction,
  type ExportAccount,
} from '../lib/transaction-export';
import { ledgerLog } from '../lib/ledger-client';

export const transactionRoutes = new Hono<HonoEnv>();

function formatTransaction(t: any) {
  return {
    id: t.id,
    accountId: t.accountId,
    amount: parseFloat(t.amount),
    type: t.type,
    category: t.category || undefined,
    description: t.description,
    date: t.date,
    payee: t.payee || undefined,
    propertyId: t.propertyId || undefined,
    unitId: t.unitId || undefined,
    reconciled: t.reconciled,
  };
}

// GET /api/transactions — list transactions for the tenant
transactionRoutes.get('/api/transactions', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined;

  const transactions = await storage.getTransactions(tenantId, limit);
  return c.json(transactions.map(formatTransaction));
});

// POST /api/transactions — create a transaction
transactionRoutes.post('/api/transactions', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const body = await c.req.json();

  if (!body.accountId) return c.json({ error: 'accountId is required' }, 400);
  if (!body.amount && body.amount !== 0) return c.json({ error: 'amount is required' }, 400);
  if (!body.type) return c.json({ error: 'type is required' }, 400);
  if (!body.description) return c.json({ error: 'description is required' }, 400);
  if (!body.date) return c.json({ error: 'date is required' }, 400);

  const created = await storage.createTransaction({
    tenantId,
    accountId: body.accountId,
    amount: String(body.amount),
    type: body.type,
    category: body.category || null,
    description: body.description,
    date: new Date(body.date),
    payee: body.payee || null,
    propertyId: body.propertyId || null,
    unitId: body.unitId || null,
    reconciled: body.reconciled ?? false,
    metadata: body.metadata || null,
  });

  ledgerLog(c, {
    entityType: 'transaction',
    entityId: created.id,
    action: 'transaction.created',
    metadata: { tenantId, amount: body.amount, type: body.type, category: body.category },
  }, c.env);

  return c.json(formatTransaction(created), 201);
});

// GET /api/transactions/export — export transactions as CSV, OFX, or QFX
transactionRoutes.get('/api/transactions/export', async (c) => {
  const storage = c.get('storage') as any;
  const tenantId = c.get('tenantId');

  const format = (c.req.query('format') || 'csv').toLowerCase() as ExportFormat;
  if (!['csv', 'ofx', 'qfx'].includes(format)) {
    return c.json({ error: 'format must be csv, ofx, or qfx' }, 400);
  }

  const accountId = c.req.query('accountId');
  const since = c.req.query('since');
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined;

  let transactions: any[];
  if (accountId) {
    transactions = await storage.getTransactionsByAccount(accountId, tenantId, since);
  } else {
    transactions = await storage.getTransactions(tenantId, limit);
  }

  if (since && !accountId) {
    const sinceDate = new Date(since);
    transactions = transactions.filter((tx: any) => new Date(tx.date) >= sinceDate);
  }

  const accounts = await storage.getAccounts(tenantId);
  const accountMap = buildAccountMap(
    accounts.map((a: any): ExportAccount => ({
      id: a.id,
      name: a.name,
      type: a.type,
      institution: a.institution,
      accountNumber: a.accountNumber,
      currency: a.currency || 'USD',
    })),
  );

  const exportTxns: ExportTransaction[] = transactions.map((tx: any) => ({
    id: tx.id,
    accountId: tx.accountId,
    amount: tx.amount,
    type: tx.type,
    category: tx.category,
    description: tx.description,
    date: tx.date,
    payee: tx.payee,
    reconciled: tx.reconciled,
    currency: tx.currency,
  }));

  const today = new Date().toISOString().slice(0, 10);
  const filename = `chittyfinance-transactions-${today}.${fileExtension(format)}`;

  ledgerLog(c, {
    entityType: 'audit',
    action: 'transaction.export',
    metadata: { tenantId, format, count: exportTxns.length, accountId: accountId || 'all' },
  }, c.env);

  if (format === 'csv') {
    const csv = serializeCsv(exportTxns, accountMap);
    return new Response(csv, {
      headers: {
        'Content-Type': contentTypeForFormat(format),
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  // OFX/QFX require a specific account
  if (!accountId) {
    return c.json({ error: 'accountId is required for OFX/QFX export' }, 400);
  }

  const account = accountMap.get(accountId);
  if (!account) {
    return c.json({ error: 'Account not found' }, 404);
  }

  const dates = exportTxns.map((tx) =>
    typeof tx.date === 'string' ? tx.date : tx.date.toISOString(),
  );
  const startDate = dates.length > 0 ? dates.reduce((a, b) => (a < b ? a : b)) : today;
  const endDate = dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : today;

  const ofx = serializeOfx({
    format,
    account,
    transactions: exportTxns,
    startDate,
    endDate,
  });

  return new Response(ofx, {
    headers: {
      'Content-Type': contentTypeForFormat(format),
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});

// PATCH /api/transactions/:id — update a transaction
transactionRoutes.patch('/api/transactions/:id', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const body = await c.req.json();

  const updates: Record<string, unknown> = {};
  if (body.reconciled !== undefined) updates.reconciled = body.reconciled;
  if (body.category !== undefined) updates.category = body.category;
  if (body.description !== undefined) updates.description = body.description;
  if (body.payee !== undefined) updates.payee = body.payee;
  if (body.amount !== undefined) updates.amount = String(body.amount);
  if (body.type !== undefined) updates.type = body.type;
  if (body.date !== undefined) updates.date = new Date(body.date);
  if (body.propertyId !== undefined) updates.propertyId = body.propertyId;
  if (body.unitId !== undefined) updates.unitId = body.unitId;

  const updated = await storage.updateTransaction(id, tenantId, updates);
  if (!updated) return c.json({ error: 'Transaction not found' }, 404);

  ledgerLog(c, {
    entityType: 'transaction',
    entityId: id,
    action: 'transaction.updated',
    metadata: { tenantId, fields: Object.keys(updates) },
  }, c.env);

  return c.json(formatTransaction(updated));
});
