// @ts-nocheck - TODO: Add proper types
/**
 * ChittySchema Integration for ChittyFinance
 * Validates financial data against centralized ChittyOS schema service
 */

import { fetchWithRetry, IntegrationError } from './error-handling';

const CHITTYSCHEMA_BASE_URL = process.env.CHITTYSCHEMA_URL || 'https://schema.chitty.cc';

export interface ValidationResult {
  valid: boolean;
  errors?: Array<{
    path: string;
    message: string;
    code: string;
  }>;
  warnings?: Array<{
    path: string;
    message: string;
  }>;
}

export interface EntityTypeInfo {
  type: string;
  description: string;
  schema: Record<string, any>;
  version: string;
}

/**
 * Validate data against ChittySchema
 */
export async function validateWithChittySchema(
  entityType: string,
  data: Record<string, any>
): Promise<ValidationResult> {
  try {
    const response = await fetchWithRetry(
      `${CHITTYSCHEMA_BASE_URL}/api/v1/validate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: entityType,
          data,
        }),
      },
      {
        maxRetries: 2,
        baseDelay: 500,
      }
    );

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('ChittySchema validation error:', error);
    throw new IntegrationError(
      'Schema validation service unavailable',
      'chittyschema',
      true
    );
  }
}

/**
 * Get available entity types from ChittySchema
 */
export async function getEntityTypes(): Promise<EntityTypeInfo[]> {
  try {
    const response = await fetchWithRetry(
      `${CHITTYSCHEMA_BASE_URL}/api/v1/entity-types`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
      {
        maxRetries: 2,
        baseDelay: 500,
      }
    );

    const result = await response.json();
    return result.types || [];
  } catch (error) {
    console.error('ChittySchema entity types fetch error:', error);
    return [];
  }
}

/**
 * Get schema details for a specific entity type
 */
export async function getSchemaDetails(entityType: string): Promise<EntityTypeInfo | null> {
  try {
    const response = await fetchWithRetry(
      `${CHITTYSCHEMA_BASE_URL}/api/v1/schema/${entityType}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
      {
        maxRetries: 2,
        baseDelay: 500,
      }
    );

    if (response.status === 404) {
      return null;
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error(`ChittySchema details fetch error for ${entityType}:`, error);
    return null;
  }
}

/**
 * Validate transaction before creation/update
 */
export async function validateTransaction(transaction: Record<string, any>): Promise<ValidationResult> {
  return validateWithChittySchema('transaction', {
    amount: transaction.amount,
    type: transaction.type,
    description: transaction.description,
    date: transaction.date,
    category: transaction.category,
    tenantId: transaction.tenantId,
    accountId: transaction.accountId,
  });
}

/**
 * Validate tenant/entity before creation
 */
export async function validateTenant(tenant: Record<string, any>): Promise<ValidationResult> {
  return validateWithChittySchema('tenant', {
    name: tenant.name,
    type: tenant.type,
    taxId: tenant.taxId,
    parentId: tenant.parentId,
  });
}

/**
 * Validate account before creation
 */
export async function validateAccount(account: Record<string, any>): Promise<ValidationResult> {
  return validateWithChittySchema('account', {
    name: account.name,
    type: account.type,
    institution: account.institution,
    currency: account.currency,
    tenantId: account.tenantId,
  });
}

/**
 * Validate property before creation
 */
export async function validateProperty(property: Record<string, any>): Promise<ValidationResult> {
  return validateWithChittySchema('property', {
    name: property.name,
    address: property.address,
    city: property.city,
    state: property.state,
    zip: property.zip,
    propertyType: property.propertyType,
    tenantId: property.tenantId,
  });
}

/**
 * Middleware for validating requests against ChittySchema
 */
export function schemaValidationMiddleware(entityType: string) {
  return async (req: any, res: any, next: any) => {
    // Skip validation if disabled
    if (process.env.SKIP_SCHEMA_VALIDATION === 'true') {
      return next();
    }

    try {
      const result = await validateWithChittySchema(entityType, req.body);

      if (!result.valid) {
        return res.status(400).json({
          error: 'Schema validation failed',
          code: 'SCHEMA_VALIDATION_ERROR',
          errors: result.errors,
          warnings: result.warnings,
        });
      }

      // Attach warnings to request for logging
      if (result.warnings && result.warnings.length > 0) {
        req.schemaWarnings = result.warnings;
      }

      next();
    } catch (error) {
      // Log error but don't block request if schema service is down
      console.error('Schema validation service error:', error);

      if (process.env.NODE_ENV === 'production') {
        // In production, continue without validation if service is down
        console.warn('Continuing without schema validation due to service unavailability');
        next();
      } else {
        // In development, return error
        res.status(503).json({
          error: 'Schema validation service unavailable',
          code: 'SCHEMA_SERVICE_UNAVAILABLE',
        });
      }
    }
  };
}

/**
 * Batch validate multiple entities
 */
export async function batchValidate(
  items: Array<{ type: string; data: Record<string, any> }>
): Promise<Array<ValidationResult>> {
  const results = await Promise.all(
    items.map(item => validateWithChittySchema(item.type, item.data))
  );

  return results;
}

/**
 * Health check for ChittySchema service
 */
export async function checkSchemaServiceHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${CHITTYSCHEMA_BASE_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    return response.ok;
  } catch (error) {
    return false;
  }
}
