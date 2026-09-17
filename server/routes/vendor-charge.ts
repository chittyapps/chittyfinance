import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { ledgerLog } from '../lib/ledger-client';
import { resolveVendorChargeIngest, VENDOR_CHARGE_ACTOR_ID } from '../lib/vendor-charge';

// ChittyScrape (scrape.chitty.cc) extracts vendor charges from portals that
// have no API — registered-agent fees, utility bills, mortgage statements.
// This route accepts a ChittyScrape result envelope plus the resolved charge
// and records it as an idempotent expense transaction.
//
// Trust level L1: the row carries a *suggested* COA code only, with a
// classification_audit entry; a human (L2+) makes it authoritative. A row a
// human has classified or reconciled is never overwritten by a re-scrape.
//
// This route does not scrape; the dispatcher (ChittyCommand cron) posts here.

export const vendorChargeRoutes = new Hono<HonoEnv>();

vendorChargeRoutes.post('/api/vendor-charge/ingest', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const resolved = resolveVendorChargeIngest(body);
  if (!resolved.ok) {
    const { status, ok: _ok, ...err } = resolved;
    return c.json(err, status);
  }
  const { input, category, suggestion, date, externalId, amount } = resolved;
  const { envelope, charge } = input;

  // Tenant comes from middleware only; the payload names an account, never a tenant.
  const account = await storage.getAccountByExternalId(input.accountExternalId, tenantId);
  if (!account) {
    return c.json(
      {
        error: 'account_missing',
        message: `No account with external_id='${input.accountExternalId}' for this tenant.`,
      },
      400,
    );
  }

  const result = await storage.upsertVendorCharge({
    tenantId,
    accountId: account.id,
    externalId,
    date,
    amount,
    vendor: charge.vendor,
    description: charge.description ?? `Vendor charge: ${charge.vendor} (${charge.period})`,
    suggestedCoaCode: suggestion.code,
    confidence: suggestion.confidence,
    actorId: VENDOR_CHARGE_ACTOR_ID,
    reason: `ChittyScrape ${envelope.portal} charge, category '${category}'`,
    metadata: {
      source: 'chittyscrape',
      portalId: envelope.portal,
      vendor: charge.vendor,
      period: charge.period,
      category,
      exactAmountUsd: charge.amountUsd,
      paymentStatus: charge.paymentStatus ?? null,
      scrapedAt: envelope.scrapedAt,
    },
    auditMetadata: {
      source: 'chittyscrape',
      portal: envelope.portal,
      category,
      period: charge.period,
    },
  });

  ledgerLog(
    c,
    {
      entityType: 'audit',
      action: result.written ? 'vendor-charge.ingest' : 'vendor-charge.ingest.skipped',
      metadata: {
        tenantId,
        portal: envelope.portal,
        vendor: charge.vendor,
        period: charge.period,
        category,
        suggestedCoaCode: suggestion.code,
        amount,
        externalId,
        transactionId: result.id,
        inserted: result.inserted,
        written: result.written,
      },
    },
    c.env,
  );

  if (!result.written) {
    // Existing row is classified or reconciled — left untouched on purpose.
    return c.json({
      recorded: false,
      reason: result.existingReconciled ? 'reconciled' : 'classified',
      transaction: { id: result.id, externalId },
    });
  }

  return c.json({
    recorded: true,
    inserted: result.inserted,
    auditRows: result.auditRows,
    transaction: {
      id: result.id,
      externalId,
      amount: result.amount,
      type: 'expense',
      suggestedCoaCode: result.suggestedCoaCode,
      classificationConfidence: suggestion.confidence,
      payee: charge.vendor,
    },
  });
});
