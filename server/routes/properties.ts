import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const propertyRoutes = new Hono<HonoEnv>();

// GET /api/properties — list properties for the tenant
propertyRoutes.get('/api/properties', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  const properties = await storage.getProperties(tenantId);
  return c.json(properties);
});

// GET /api/properties/:id — get a single property
propertyRoutes.get('/api/properties/:id', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const propertyId = c.req.param('id');

  const property = await storage.getProperty(propertyId, tenantId);
  if (!property) {
    return c.json({ error: 'Property not found' }, 404);
  }

  return c.json(property);
});

// GET /api/properties/:id/units — list units for a property
propertyRoutes.get('/api/properties/:id/units', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const propertyId = c.req.param('id');

  // Verify property belongs to tenant
  const property = await storage.getProperty(propertyId, tenantId);
  if (!property) {
    return c.json({ error: 'Property not found' }, 404);
  }

  const units = await storage.getUnits(propertyId);
  return c.json(units);
});

// GET /api/properties/:id/leases — list leases for a property's units
propertyRoutes.get('/api/properties/:id/leases', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const propertyId = c.req.param('id');

  // Verify property belongs to tenant
  const property = await storage.getProperty(propertyId, tenantId);
  if (!property) {
    return c.json({ error: 'Property not found' }, 404);
  }

  const units = await storage.getUnits(propertyId);
  const unitIds = units.map((u) => u.id);

  if (unitIds.length === 0) {
    return c.json([]);
  }

  const leases = await storage.getLeasesByUnits(unitIds);
  return c.json(leases);
});

// POST /api/properties — create a property
propertyRoutes.post('/api/properties', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const body = await c.req.json();

  const property = await storage.createProperty({ ...body, tenantId });
  return c.json(property, 201);
});

// PATCH /api/properties/:id — update a property
propertyRoutes.patch('/api/properties/:id', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const propertyId = c.req.param('id');
  const body = await c.req.json();

  const property = await storage.updateProperty(propertyId, tenantId, body);
  if (!property) return c.json({ error: 'Property not found' }, 404);
  return c.json(property);
});

// POST /api/properties/:id/units — create a unit
propertyRoutes.post('/api/properties/:id/units', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const propertyId = c.req.param('id');

  const property = await storage.getProperty(propertyId, tenantId);
  if (!property) return c.json({ error: 'Property not found' }, 404);

  const body = await c.req.json();
  const unit = await storage.createUnit({ ...body, propertyId });
  return c.json(unit, 201);
});

// PATCH /api/properties/:id/units/:unitId — update a unit
propertyRoutes.patch('/api/properties/:id/units/:unitId', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const propertyId = c.req.param('id');
  const unitId = c.req.param('unitId');

  const property = await storage.getProperty(propertyId, tenantId);
  if (!property) return c.json({ error: 'Property not found' }, 404);

  const body = await c.req.json();
  const unit = await storage.updateUnit(unitId, body);
  if (!unit) return c.json({ error: 'Unit not found' }, 404);
  return c.json(unit);
});

// POST /api/properties/:id/leases — create a lease
propertyRoutes.post('/api/properties/:id/leases', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const propertyId = c.req.param('id');

  const property = await storage.getProperty(propertyId, tenantId);
  if (!property) return c.json({ error: 'Property not found' }, 404);

  const body = await c.req.json();
  const lease = await storage.createLease(body);
  return c.json(lease, 201);
});

// PATCH /api/properties/:id/leases/:leaseId — update a lease
propertyRoutes.patch('/api/properties/:id/leases/:leaseId', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const propertyId = c.req.param('id');
  const leaseId = c.req.param('leaseId');

  const property = await storage.getProperty(propertyId, tenantId);
  if (!property) return c.json({ error: 'Property not found' }, 404);

  const body = await c.req.json();
  const lease = await storage.updateLease(leaseId, body);
  if (!lease) return c.json({ error: 'Lease not found' }, 404);
  return c.json(lease);
});

// GET /api/properties/:id/financials — NOI, cap rate, occupancy
propertyRoutes.get('/api/properties/:id/financials', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const propertyId = c.req.param('id');

  const financials = await storage.getPropertyFinancials(propertyId, tenantId);
  if (!financials) return c.json({ error: 'Property not found' }, 404);
  return c.json(financials);
});

// GET /api/properties/:id/rent-roll — unit-level rent status
propertyRoutes.get('/api/properties/:id/rent-roll', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const propertyId = c.req.param('id');

  const rentRoll = await storage.getPropertyRentRoll(propertyId, tenantId);
  if (!rentRoll) return c.json({ error: 'Property not found' }, 404);
  return c.json(rentRoll);
});

// GET /api/properties/:id/pnl — property P&L
propertyRoutes.get('/api/properties/:id/pnl', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const propertyId = c.req.param('id');
  const start = c.req.query('start');
  const end = c.req.query('end');

  if (!start || !end) {
    return c.json({ error: 'start and end query params required (YYYY-MM-DD)' }, 400);
  }

  const pnl = await storage.getPropertyPnL(propertyId, tenantId, start, end);
  return c.json(pnl);
});
