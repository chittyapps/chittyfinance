import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { fetchAllEstimates, aggregateValuations } from '../lib/valuation/index';
import { ledgerLog } from '../lib/ledger-client';

export const valuationRoutes = new Hono<HonoEnv>();

// GET /api/properties/:id/valuation — get cached valuations
valuationRoutes.get('/api/properties/:id/valuation', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const propertyId = c.req.param('id');

  const property = await storage.getProperty(propertyId, tenantId);
  if (!property) return c.json({ error: 'Property not found' }, 404);

  const valuations = await storage.getPropertyValuations(propertyId, tenantId);
  const estimates = valuations.map((v) => ({
    source: v.source,
    estimate: parseFloat(v.estimate || '0'),
    low: parseFloat(v.low || '0'),
    high: parseFloat(v.high || '0'),
    rentalEstimate: v.rentalEstimate ? parseFloat(v.rentalEstimate) : undefined,
    confidence: v.confidence ? parseFloat(v.confidence) : 0.7,
    fetchedAt: v.fetchedAt,
  }));

  const aggregated = aggregateValuations(estimates);
  return c.json({ property: { id: property.id, name: property.name, address: property.address }, ...aggregated });
});

// POST /api/properties/:id/valuation/refresh — fetch fresh estimates from all providers
valuationRoutes.post('/api/properties/:id/valuation/refresh', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const propertyId = c.req.param('id');

  const property = await storage.getProperty(propertyId, tenantId);
  if (!property) return c.json({ error: 'Property not found' }, 404);

  const fullAddress = `${property.address}, ${property.city}, ${property.state} ${property.zip}`;
  const { estimates, errors } = await fetchAllEstimates(fullAddress, c.env);

  if (estimates.length === 0) {
    return c.json({ error: 'No valuation providers returned estimates', providerErrors: errors }, 502);
  }

  // Cache each estimate with confidence from provider
  for (const est of estimates) {
    await storage.upsertPropertyValuation({
      propertyId,
      tenantId,
      source: est.source,
      estimate: String(est.estimate),
      low: String(est.low),
      high: String(est.high),
      rentalEstimate: est.rentalEstimate ? String(est.rentalEstimate) : null,
      confidence: String(est.confidence),
      details: est.details || {},
      fetchedAt: est.fetchedAt,
    });
  }

  const aggregated = aggregateValuations(estimates);
  ledgerLog(c, {
    entityType: 'audit',
    entityId: propertyId,
    action: 'valuation.refreshed',
    metadata: { tenantId, propertyName: property.name, providersRefreshed: estimates.length, providerErrors: errors.length, weightedEstimate: aggregated.weightedEstimate },
  }, c.env);
  return c.json({ refreshed: estimates.length, errors, ...aggregated });
});

// GET /api/properties/:id/valuation/history — valuation timeline
valuationRoutes.get('/api/properties/:id/valuation/history', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const propertyId = c.req.param('id');

  const property = await storage.getProperty(propertyId, tenantId);
  if (!property) return c.json({ error: 'Property not found' }, 404);

  const valuations = await storage.getPropertyValuations(propertyId, tenantId);
  return c.json(valuations);
});
