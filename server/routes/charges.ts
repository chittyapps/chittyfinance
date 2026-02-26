import { Hono } from 'hono';
import type { HonoEnv } from '../env';

export const chargeRoutes = new Hono<HonoEnv>();

// Charge detail and optimization interfaces (mirrored from chargeAutomation.ts)
interface ChargeDetails {
  id: string;
  merchantName: string;
  amount: number;
  date: Date;
  category: string;
  recurring: boolean;
  nextChargeDate?: Date;
  subscriptionId?: string;
}

interface OptimizationRecommendation {
  chargeId: string;
  merchantName: string;
  currentAmount: number;
  suggestedAction: 'cancel' | 'downgrade' | 'consolidate' | 'negotiate';
  potentialSavings: number;
  reasoning: string;
  alternativeOptions?: string[];
}

// All integration fetch functions are stubs — return empty arrays
// They'll be wired to real APIs when those integrations support charge detection
function fetchChargesFromIntegration(_serviceType: string, _credentials: unknown): ChargeDetails[] {
  return [];
}

function analyzeOptimizations(charges: ChargeDetails[]): OptimizationRecommendation[] {
  const recommendations: OptimizationRecommendation[] = [];

  for (const charge of charges) {
    if (charge.category === 'Software' && charge.amount > 50) {
      recommendations.push({
        chargeId: charge.id, merchantName: charge.merchantName,
        currentAmount: charge.amount, suggestedAction: 'downgrade',
        potentialSavings: charge.amount * 0.3,
        reasoning: 'Consider downgrading to a cheaper tier or switching to an alternative solution.',
        alternativeOptions: ['Canva Pro', 'Affinity Suite'],
      });
    }
    if (charge.category === 'Cloud Services') {
      recommendations.push({
        chargeId: charge.id, merchantName: charge.merchantName,
        currentAmount: charge.amount, suggestedAction: 'negotiate',
        potentialSavings: charge.amount * 0.2,
        reasoning: 'Cloud service providers often offer discounts for committed usage or prepayment.',
        alternativeOptions: ['Reserved instances', 'Savings plans'],
      });
    }
    if (charge.category === 'Accounting Software') {
      recommendations.push({
        chargeId: charge.id, merchantName: charge.merchantName,
        currentAmount: charge.amount, suggestedAction: 'consolidate',
        potentialSavings: charge.amount * 0.5,
        reasoning: 'Multiple accounting software subscriptions detected. Consider consolidating to one platform.',
        alternativeOptions: ['QuickBooks', 'Xero', 'FreshBooks'],
      });
    }
    if (charge.category === 'Project Management') {
      recommendations.push({
        chargeId: charge.id, merchantName: charge.merchantName,
        currentAmount: charge.amount, suggestedAction: 'consolidate',
        potentialSavings: charge.amount * 0.4,
        reasoning: 'Multiple project management subscriptions detected. Consolidate to reduce costs.',
        alternativeOptions: ['Asana', 'ClickUp', 'Notion'],
      });
    }
    if (charge.category === 'Subscription' && charge.amount > 150) {
      recommendations.push({
        chargeId: charge.id, merchantName: charge.merchantName,
        currentAmount: charge.amount, suggestedAction: 'negotiate',
        potentialSavings: charge.amount * 0.15,
        reasoning: 'High-cost subscription detected. Negotiate annual pricing or bulk discounts.',
        alternativeOptions: ['Annual prepayment', 'Team license'],
      });
    }
    if (charge.category === 'Communication') {
      recommendations.push({
        chargeId: charge.id, merchantName: charge.merchantName,
        currentAmount: charge.amount, suggestedAction: 'consolidate',
        potentialSavings: charge.amount * 0.3,
        reasoning: 'Multiple communication tools detected. Consider consolidating to one platform.',
        alternativeOptions: ['Microsoft Teams', 'Slack', 'Discord'],
      });
    }
  }

  return recommendations;
}

// GET /api/charges/recurring — list recurring charges from integrations
chargeRoutes.get('/api/charges/recurring', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  const integrations = await storage.getIntegrations(tenantId);
  const charges: ChargeDetails[] = [];

  for (const integration of integrations) {
    if (!integration.connected) continue;
    charges.push(...fetchChargesFromIntegration(integration.serviceType, integration.credentials));
  }

  return c.json(charges);
});

// GET /api/charges/optimizations — optimization recommendations
chargeRoutes.get('/api/charges/optimizations', async (c) => {
  const storage = c.get('storage');
  const tenantId = c.get('tenantId');

  const integrations = await storage.getIntegrations(tenantId);
  const charges: ChargeDetails[] = [];

  for (const integration of integrations) {
    if (!integration.connected) continue;
    charges.push(...fetchChargesFromIntegration(integration.serviceType, integration.credentials));
  }

  return c.json(analyzeOptimizations(charges));
});

// POST /api/charges/manage — execute management action on a charge
chargeRoutes.post('/api/charges/manage', async (c) => {
  const body = await c.req.json();
  const { chargeId, action } = body;

  if (!chargeId || !action) {
    return c.json({ error: 'chargeId and action are required' }, 400);
  }

  if (action !== 'cancel' && action !== 'modify') {
    return c.json({ error: "action must be 'cancel' or 'modify'" }, 400);
  }

  return c.json({
    success: false,
    message: `Charge management (${action}) requires a connected integration API — not yet implemented.`,
  });
});
