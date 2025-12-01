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
    }
  }

  return charges;
}

// Mock function to fetch charges from Mercury Bank
async function fetchMercuryBankCharges(integration: Integration): Promise<ChargeDetails[]> {
  // In a real implementation, this would connect to Mercury Bank API
  console.log(`Fetching recurring charges from Mercury Bank for integration ID ${integration.id}`);
  
  // Return mock data for demo purposes
  return [
    {
      id: "merc-charge-1",
      merchantName: "Adobe Creative Cloud",
      amount: 52.99,
      date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
      category: "Software",
      recurring: true,
      nextChargeDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days in future
      subscriptionId: "adobe-sub-123"
    },
    {
      id: "merc-charge-2",
      merchantName: "AWS",
      amount: 237.45,
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      category: "Cloud Services",
      recurring: true,
      nextChargeDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000), // 25 days in future
      subscriptionId: "aws-sub-456"
    }
  ];
}

// Mock function to fetch charges from WavApps
async function fetchWavAppsCharges(integration: Integration): Promise<ChargeDetails[]> {
  // In a real implementation, this would connect to WavApps API
  console.log(`Fetching recurring charges from WavApps for integration ID ${integration.id}`);
  
  // Return mock data for demo purposes
  return [
    {
      id: "wavapps-charge-1",
      merchantName: "Salesforce",
      amount: 150.00,
      date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
      category: "CRM",
      recurring: true,
      nextChargeDate: new Date(Date.now() + 22 * 24 * 60 * 60 * 1000), // 22 days in future
      subscriptionId: "sf-sub-789"
    },
    {
      id: "wavapps-charge-2",
      merchantName: "Zoom",
      amount: 14.99,
      date: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000), // 12 days ago
      category: "Communication",
      recurring: true,
      nextChargeDate: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000), // 18 days in future
      subscriptionId: "zoom-sub-101"
    }
  ];
}

// Mock function to fetch charges from DoorLoop
async function fetchDoorLoopCharges(integration: Integration): Promise<ChargeDetails[]> {
  // In a real implementation, this would connect to DoorLoop API
  console.log(`Fetching recurring charges from DoorLoop for integration ID ${integration.id}`);
  
  // Return mock data for demo purposes
  return [
    {
      id: "doorloop-charge-1",
      merchantName: "Property Insurance - 123 Main St",
      amount: 175.50,
      date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
      category: "Insurance",
      recurring: true,
      nextChargeDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days in future
      subscriptionId: "ins-sub-345"
    },
    {
      id: "doorloop-charge-2",
      merchantName: "Landscaping Service",
      amount: 120.00,
      date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      category: "Property Maintenance",
      recurring: true,
      nextChargeDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), // 21 days in future
      subscriptionId: "landscape-sub-567"
    }
  ];
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
  }
  
  return recommendations;
}

// Cancel or modify a recurring charge
export async function manageRecurringCharge(
  userId: number, 
  chargeId: string, 
  action: 'cancel' | 'modify',
  modifications?: { amount?: number }
): Promise<{ success: boolean; message: string }> {
  // In a real implementation, this would connect to the appropriate service API
  // to cancel or modify the subscription
  
  console.log(`Managing charge ${chargeId} with action ${action}`);
  
  // Return mock success response for demo purposes
  return {
    success: true,
    message: action === 'cancel' 
      ? "Subscription cancellation has been scheduled."
      : "Subscription has been modified successfully."
  };
}