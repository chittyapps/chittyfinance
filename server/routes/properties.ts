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
