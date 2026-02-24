import { Integration } from "@shared/schema";
import { storage } from "../storage";

// Interface for charge details
export interface ChargeDetails {
  id: string;
  merchantName: string;
  amount: number;
  date: Date;
  category: string;
  recurring: boolean;
  nextChargeDate?: Date;
  subscriptionId?: string;
}

// Interface for charge optimization recommendation
export interface OptimizationRecommendation {
  chargeId: string;
  merchantName: string;
  currentAmount: number;
  suggestedAction: 'cancel' | 'downgrade' | 'consolidate' | 'negotiate';
  potentialSavings: number;
  reasoning: string;
  alternativeOptions?: string[];
}

// Get all recurring charges from connected services
export async function getRecurringCharges(userId: number | string): Promise<ChargeDetails[]> {
  const integrations = await storage.getIntegrations(String(userId));
  const charges: ChargeDetails[] = [];

  for (const integration of integrations) {
    if (!integration.connected) continue;

    // Add charges based on integration type
    switch (integration.serviceType) {
      case 'mercury_bank':
        const mercuryCharges = await fetchMercuryBankCharges(integration);
        charges.push(...mercuryCharges);
        break;
      case 'wavapps':
        const wavappsCharges = await fetchWavAppsCharges(integration);
        charges.push(...wavappsCharges);
        break;
      case 'doorloop':
        const doorloopCharges = await fetchDoorLoopCharges(integration);
        charges.push(...doorloopCharges);
        break;
      case 'stripe':
        const stripeCharges = await fetchStripeCharges(integration);
        charges.push(...stripeCharges);
        break;
      case 'brex':
        const brexCharges = await fetchBrexCharges(integration);
        charges.push(...brexCharges);
        break;
      case 'quickbooks':
        const quickbooksCharges = await fetchQuickBooksCharges(integration);
        charges.push(...quickbooksCharges);
        break;
      case 'xero':
        const xeroCharges = await fetchXeroCharges(integration);
        charges.push(...xeroCharges);
        break;
    }
  }

  return charges;
}

// TODO: Wire to Mercury Bank API via ChittyConnect (real integration exists in financialServices.ts)
async function fetchMercuryBankCharges(_integration: Integration): Promise<ChargeDetails[]> {
  console.warn('Mercury Bank recurring charge detection not yet implemented');
  return [];
}

// TODO: Wire to Wave Accounting API (real integration exists in wave-api.ts)
async function fetchWavAppsCharges(_integration: Integration): Promise<ChargeDetails[]> {
  console.warn('Wave Accounting recurring charge detection not yet implemented');
  return [];
}

// TODO: Wire to DoorLoop property management API
async function fetchDoorLoopCharges(_integration: Integration): Promise<ChargeDetails[]> {
  console.warn('DoorLoop recurring charge detection not yet implemented');
  return [];
}

// TODO: Wire to Stripe API (real integration exists in stripe.ts)
async function fetchStripeCharges(_integration: Integration): Promise<ChargeDetails[]> {
  console.warn('Stripe recurring charge detection not yet implemented');
  return [];
}

// TODO: Wire to QuickBooks API
async function fetchQuickBooksCharges(_integration: Integration): Promise<ChargeDetails[]> {
  console.warn('QuickBooks recurring charge detection not yet implemented');
  return [];
}

// TODO: Wire to Xero API
async function fetchXeroCharges(_integration: Integration): Promise<ChargeDetails[]> {
  console.warn('Xero recurring charge detection not yet implemented');
  return [];
}

// TODO: Wire to Brex API
async function fetchBrexCharges(_integration: Integration): Promise<ChargeDetails[]> {
  console.warn('Brex recurring charge detection not yet implemented');
  return [];
}

// Analyze charges and provide optimization recommendations
export async function getChargeOptimizations(userId: number): Promise<OptimizationRecommendation[]> {
  const charges = await getRecurringCharges(userId);
  const recommendations: OptimizationRecommendation[] = [];
  
  // Analyze each charge for potential optimization
  for (const charge of charges) {
    // Simple logic - for demo purposes only
    // In a real implementation, this would use more sophisticated analysis
    
    // Example: For software subscriptions over $50, suggest looking for alternatives
    if (charge.category === "Software" && charge.amount > 50) {
      recommendations.push({
        chargeId: charge.id,
        merchantName: charge.merchantName,
        currentAmount: charge.amount,
        suggestedAction: 'downgrade',
        potentialSavings: charge.amount * 0.3, // Estimate 30% savings
        reasoning: "Consider downgrading to a cheaper tier or switching to an alternative solution.",
        alternativeOptions: ["Canva Pro", "Affinity Suite"]
      });
    }
    
    // Example: For cloud services, suggest negotiation
    if (charge.category === "Cloud Services") {
      recommendations.push({
        chargeId: charge.id,
        merchantName: charge.merchantName,
        currentAmount: charge.amount,
        suggestedAction: 'negotiate',
        potentialSavings: charge.amount * 0.2, // Estimate 20% savings
        reasoning: "Cloud service providers often offer discounts for committed usage or prepayment.",
        alternativeOptions: ["Reserved instances", "Savings plans"]
      });
    }
    
    // For Accounting Software, suggest consolidation
    if (charge.category === "Accounting Software") {
      recommendations.push({
        chargeId: charge.id,
        merchantName: charge.merchantName,
        currentAmount: charge.amount,
        suggestedAction: 'consolidate',
        potentialSavings: charge.amount * 0.5, // Estimate 50% savings
        reasoning: "Multiple accounting software subscriptions detected. Consider consolidating to one platform.",
        alternativeOptions: ["QuickBooks", "Xero", "FreshBooks"]
      });
    }
    
    // For Project Management tools, suggest consolidation
    if (charge.category === "Project Management") {
      recommendations.push({
        chargeId: charge.id,
        merchantName: charge.merchantName,
        currentAmount: charge.amount,
        suggestedAction: 'consolidate',
        potentialSavings: charge.amount * 0.4, // Estimate 40% savings
        reasoning: "Multiple project management subscriptions detected. Consolidate to reduce costs.",
        alternativeOptions: ["Asana", "ClickUp", "Notion"]
      });
    }
    
    // For Subscription services over $150, suggest negotiation
    if (charge.category === "Subscription" && charge.amount > 150) {
      recommendations.push({
        chargeId: charge.id,
        merchantName: charge.merchantName,
        currentAmount: charge.amount,
        suggestedAction: 'negotiate',
        potentialSavings: charge.amount * 0.15, // Estimate 15% savings
        reasoning: "High-cost subscription detected. Negotiate annual pricing or bulk discounts.",
        alternativeOptions: ["Annual prepayment", "Team license"]
      });
    }
    
    // For Communication tools, suggest consolidation
    if (charge.category === "Communication") {
      recommendations.push({
        chargeId: charge.id,
        merchantName: charge.merchantName,
        currentAmount: charge.amount,
        suggestedAction: 'consolidate',
        potentialSavings: charge.amount * 0.3, // Estimate 30% savings
        reasoning: "Multiple communication tools detected. Consider consolidating to one platform.",
        alternativeOptions: ["Microsoft Teams", "Slack", "Discord"]
      });
    }
  }
  
  return recommendations;
}

// Cancel or modify a recurring charge via the originating service API
export async function manageRecurringCharge(
  _userId: number,
  chargeId: string,
  action: 'cancel' | 'modify',
  _modifications?: { amount?: number }
): Promise<{ success: boolean; message: string }> {
  // TODO: Route to the appropriate service API (Stripe, Mercury, etc.) based on charge prefix
  console.warn(`manageRecurringCharge not yet implemented: ${action} on ${chargeId}`);
  return {
    success: false,
    message: `Charge management (${action}) requires a connected integration API — not yet implemented.`
  };
}