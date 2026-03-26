import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const leaseRoutes = new Hono<HonoEnv>();

// GET /api/leases/expiring — list leases expiring within N days (default 90)
leaseRoutes.get('/api/leases/expiring', async (c) => {
  const storage = c.get('storage');
  const days = parseInt(c.req.query('days') || '90', 10);

  if (isNaN(days) || days < 1 || days > 365) {
    return c.json({ error: 'days must be between 1 and 365' }, 400);
  }

  const expiring = await storage.getExpiringLeases(days);

  return c.json(
    expiring.map(({ lease, unit, property }) => ({
      leaseId: lease.id,
      tenantName: lease.tenantName,
      tenantEmail: lease.tenantEmail,
      tenantPhone: lease.tenantPhone,
      endDate: lease.endDate,
      monthlyRent: lease.monthlyRent,
      unitNumber: unit.unitNumber,
      propertyId: property.id,
      propertyName: property.name,
      address: property.address,
      daysRemaining: Math.ceil(
        (new Date(lease.endDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
      ),
    })),
  );
});
