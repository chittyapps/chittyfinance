import { Hono } from 'hono';
import type { HonoEnv } from '../env';

const MS_PER_DAY = 86_400_000;

export const leaseRoutes = new Hono<HonoEnv>();

leaseRoutes.get('/api/leases/expiring', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');
  const days = parseInt(c.req.query('days') || '90', 10);

  if (isNaN(days) || days < 1 || days > 365) {
    return c.json({ error: 'days must be between 1 and 365' }, 400);
  }

  try {
    const expiring = await storage.getExpiringLeases(days, tenantId);

    return c.json(
      expiring.map(({ lease, unit, property }) => ({
        leaseId: lease.id,
        tenantName: lease.tenantName,
        endDate: lease.endDate,
        monthlyRent: lease.monthlyRent,
        unitNumber: unit.unitNumber,
        propertyId: property.id,
        propertyName: property.name,
        address: property.address,
        daysRemaining: Math.ceil(
          (new Date(lease.endDate).getTime() - Date.now()) / MS_PER_DAY,
        ),
      })),
    );
  } catch (err) {
    console.error('[leases:expiring] Failed:', err);
    return c.json({ error: 'Failed to retrieve expiring leases' }, 500);
  }
});
