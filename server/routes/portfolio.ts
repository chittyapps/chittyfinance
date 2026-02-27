import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const portfolioRoutes = new Hono<HonoEnv>();

// GET /api/portfolio/summary — aggregated portfolio metrics across all active properties
portfolioRoutes.get('/api/portfolio/summary', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  const properties = await storage.getProperties(tenantId);
  const active = properties.filter((p: any) => p.isActive);

  let totalValue = 0;
  let totalNOI = 0;
  let totalUnits = 0;
  let occupiedUnits = 0;
  let capWeightedSum = 0;

  const propertyDetails = await Promise.all(
    active.map(async (p: any) => {
      const val = parseFloat(p.currentValue || '0');
      totalValue += val;

      let financials: any = null;
      try {
        financials = await storage.getPropertyFinancials(p.id, tenantId);
      } catch {
        // Property financials may fail if no transactions exist — that's fine
      }

      if (financials) {
        totalNOI += financials.noi || 0;
        totalUnits += financials.totalUnits || 0;
        occupiedUnits += financials.occupiedUnits || 0;
        capWeightedSum += (financials.capRate || 0) * val;
      }

      return {
        id: p.id,
        name: p.name,
        address: p.address,
        city: p.city,
        state: p.state,
        propertyType: p.propertyType,
        currentValue: val,
        noi: financials?.noi || 0,
        capRate: financials?.capRate || 0,
        occupancyRate: financials
          ? (financials.totalUnits > 0 ? (financials.occupiedUnits / financials.totalUnits) * 100 : 0)
          : 0,
        totalUnits: financials?.totalUnits || 0,
        occupiedUnits: financials?.occupiedUnits || 0,
      };
    })
  );

  const avgCapRate = totalValue > 0 ? capWeightedSum / totalValue : 0;
  const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

  return c.json({
    totalProperties: active.length,
    totalValue,
    totalNOI,
    avgCapRate,
    totalUnits,
    occupiedUnits,
    occupancyRate,
    properties: propertyDetails,
  });
});
