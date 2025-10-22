import { storage } from "../storage";
import type { Business, Transaction, JurisdictionRule } from "@shared/schema";

export class JurisdictionHelper {
  /**
   * Get applicable tax rules for a business based on its jurisdiction
   */
  async getTaxRulesForBusiness(business: Business): Promise<JurisdictionRule[]> {
    const region = business.taxRegion || `${business.country}-${business.state}` || "US-CA";
    return await storage.getJurisdictionRules(region, "tax");
  }

  /**
   * Calculate tax for a transaction based on business jurisdiction
   */
  async calculateTax(transaction: Transaction, business: Business): Promise<{
    taxAmount: number;
    taxRate: number;
    taxType: string;
    jurisdiction: string;
  }> {
    const rules = await this.getTaxRulesForBusiness(business);
    
    if (rules.length === 0) {
      // Default fallback
      return {
        taxAmount: 0,
        taxRate: 0,
        taxType: "none",
        jurisdiction: business.jurisdiction || "unknown",
      };
    }

    // Apply the first applicable tax rule
    const rule = rules[0];
    const config = rule.config as any;
    const taxRate = config.rate || 0;
    const taxAmount = Math.abs(transaction.amount) * taxRate;

    return {
      taxAmount,
      taxRate,
      taxType: config.type || rule.name,
      jurisdiction: rule.region,
    };
  }

  /**
   * Get compliance requirements for a business
   */
  async getComplianceRequirements(business: Business): Promise<JurisdictionRule[]> {
    const region = business.taxRegion || `${business.country}-${business.state}` || "US-CA";
    return await storage.getJurisdictionRules(region, "compliance");
  }

  /**
   * Check if a business meets compliance requirements
   */
  async checkCompliance(business: Business): Promise<{
    compliant: boolean;
    missingRequirements: string[];
    warnings: string[];
  }> {
    const requirements = await this.getComplianceRequirements(business);
    
    const missingRequirements: string[] = [];
    const warnings: string[] = [];

    for (const requirement of requirements) {
      const config = requirement.config as any;
      
      // Check for required documents
      if (config.requiredDocuments) {
        const businessMetadata = business.metadata as any || {};
        const documents = businessMetadata.documents || [];
        
        for (const reqDoc of config.requiredDocuments) {
          if (!documents.includes(reqDoc)) {
            missingRequirements.push(`Missing document: ${reqDoc}`);
          }
        }
      }

      // Check for expiring items
      if (requirement.expiryDate) {
        const daysUntilExpiry = Math.floor(
          (requirement.expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        if (daysUntilExpiry < 30) {
          warnings.push(`${requirement.name} expires in ${daysUntilExpiry} days`);
        }
      }
    }

    return {
      compliant: missingRequirements.length === 0,
      missingRequirements,
      warnings,
    };
  }

  /**
   * Get context-aware recommendations based on user location and business jurisdiction
   */
  async getContextualRecommendations(userId: number, businessId?: number): Promise<string[]> {
    const user = await storage.getUser(userId);
    const recommendations: string[] = [];

    if (!user) return recommendations;

    // Context-aware based on timezone
    const userHour = new Date().toLocaleString("en-US", { 
      timeZone: user.timezone || "America/Los_Angeles", 
      hour: "numeric", 
      hour12: false 
    });
    const hour = parseInt(userHour);

    if (hour >= 9 && hour <= 17) {
      recommendations.push("🏢 It's business hours in your timezone - good time to review urgent tasks");
    } else if (hour >= 20 || hour <= 6) {
      recommendations.push("🌙 Evening/night in your timezone - consider scheduling tomorrow's priorities");
    }

    // Get business-specific recommendations
    if (businessId) {
      const business = await storage.getBusiness(businessId);
      if (business) {
        const compliance = await this.checkCompliance(business);
        
        if (!compliance.compliant) {
          recommendations.push(`⚠️ ${business.name} has ${compliance.missingRequirements.length} compliance issues to address`);
        }
        
        if (compliance.warnings.length > 0) {
          recommendations.push(...compliance.warnings.map(w => `📋 ${w}`));
        }
      }
    }

    return recommendations;
  }
}

export const jurisdictionHelper = new JurisdictionHelper();
