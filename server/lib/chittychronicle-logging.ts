// @ts-nocheck - TODO: Add proper types
/**
 * ChittyChronicle Integration for ChittyFinance
 * Sends all financial events to centralized audit trail
 */

import { fetchWithRetry, IntegrationError } from './error-handling';

const CHITTYCHRONICLE_BASE_URL = process.env.CHITTYCHRONICLE_URL || 'https://chronicle.chitty.cc';
const CHITTYCHRONICLE_TOKEN = process.env.CHITTYCHRONICLE_TOKEN || process.env.CHITTY_AUTH_SERVICE_TOKEN;

export interface AuditEvent {
  eventType: string;
  entityId: string;
  entityType: string;
  action: string;
  actor?: {
    userId: string;
    userName?: string;
    role?: string;
  };
  before?: Record<string, any>;
  after?: Record<string, any>;
  metadata?: Record<string, any>;
  timestamp?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ChronicleResponse {
  success: boolean;
  eventId?: string;
  timestamp?: string;
}

/**
 * Log event to ChittyChronicle
 */
export async function logToChronicle(event: AuditEvent): Promise<ChronicleResponse> {
  // Skip logging if disabled or no token
  if (process.env.SKIP_CHRONICLE_LOGGING === 'true' || !CHITTYCHRONICLE_TOKEN) {
    console.warn('ChittyChronicle logging disabled or not configured');
    return { success: false };
  }

  try {
    const response = await fetchWithRetry(
      `${CHITTYCHRONICLE_BASE_URL}/api/events`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CHITTYCHRONICLE_TOKEN}`,
        },
        body: JSON.stringify({
          ...event,
          timestamp: event.timestamp || new Date().toISOString(),
          source: 'chittyfinance',
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
    console.error('ChittyChronicle logging error:', error);
    // Don't throw - logging failures shouldn't block operations
    return { success: false };
  }
}

/**
 * Log transaction creation
 */
export async function logTransactionCreated(
  transaction: Record<string, any>,
  userId?: string
): Promise<void> {
  await logToChronicle({
    eventType: 'financial_transaction',
    entityId: transaction.id,
    entityType: 'transaction',
    action: 'created',
    actor: userId ? { userId } : undefined,
    after: {
      amount: transaction.amount,
      type: transaction.type,
      description: transaction.description,
      category: transaction.category,
      date: transaction.date,
    },
    metadata: {
      tenantId: transaction.tenantId,
      accountId: transaction.accountId,
      propertyId: transaction.propertyId,
    },
  });
}

/**
 * Log transaction update
 */
export async function logTransactionUpdated(
  transactionId: string,
  before: Record<string, any>,
  after: Record<string, any>,
  userId?: string
): Promise<void> {
  await logToChronicle({
    eventType: 'financial_transaction',
    entityId: transactionId,
    entityType: 'transaction',
    action: 'updated',
    actor: userId ? { userId } : undefined,
    before: {
      amount: before.amount,
      type: before.type,
      description: before.description,
      reconciled: before.reconciled,
    },
    after: {
      amount: after.amount,
      type: after.type,
      description: after.description,
      reconciled: after.reconciled,
    },
    metadata: {
      tenantId: after.tenantId,
      changes: Object.keys(after).filter(key => before[key] !== after[key]),
    },
  });
}

/**
 * Log transaction deletion
 */
export async function logTransactionDeleted(
  transaction: Record<string, any>,
  userId?: string
): Promise<void> {
  await logToChronicle({
    eventType: 'financial_transaction',
    entityId: transaction.id,
    entityType: 'transaction',
    action: 'deleted',
    actor: userId ? { userId } : undefined,
    before: {
      amount: transaction.amount,
      type: transaction.type,
      description: transaction.description,
    },
    metadata: {
      tenantId: transaction.tenantId,
      accountId: transaction.accountId,
    },
  });
}

/**
 * Log account creation
 */
export async function logAccountCreated(
  account: Record<string, any>,
  userId?: string
): Promise<void> {
  await logToChronicle({
    eventType: 'financial_account',
    entityId: account.id,
    entityType: 'account',
    action: 'created',
    actor: userId ? { userId } : undefined,
    after: {
      name: account.name,
      type: account.type,
      institution: account.institution,
      currency: account.currency,
    },
    metadata: {
      tenantId: account.tenantId,
      externalId: account.externalId,
    },
  });
}

/**
 * Log integration connection
 */
export async function logIntegrationConnected(
  integration: Record<string, any>,
  userId?: string
): Promise<void> {
  await logToChronicle({
    eventType: 'integration',
    entityId: integration.id,
    entityType: 'integration',
    action: 'connected',
    actor: userId ? { userId } : undefined,
    after: {
      serviceType: integration.serviceType,
      connected: true,
    },
    metadata: {
      tenantId: integration.tenantId,
    },
  });
}

/**
 * Log integration disconnection
 */
export async function logIntegrationDisconnected(
  integration: Record<string, any>,
  userId?: string
): Promise<void> {
  await logToChronicle({
    eventType: 'integration',
    entityId: integration.id,
    entityType: 'integration',
    action: 'disconnected',
    actor: userId ? { userId } : undefined,
    before: {
      serviceType: integration.serviceType,
      connected: true,
    },
    after: {
      serviceType: integration.serviceType,
      connected: false,
    },
    metadata: {
      tenantId: integration.tenantId,
    },
  });
}

/**
 * Log batch import operation
 */
export async function logBatchImport(
  result: {
    imported: number;
    skipped: number;
    errors: number;
  },
  tenantId: string,
  userId?: string
): Promise<void> {
  await logToChronicle({
    eventType: 'bulk_operation',
    entityId: tenantId,
    entityType: 'tenant',
    action: 'transaction_import',
    actor: userId ? { userId } : undefined,
    metadata: {
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Log reconciliation action
 */
export async function logReconciliation(
  accountId: string,
  transactionIds: string[],
  tenantId: string,
  userId?: string
): Promise<void> {
  await logToChronicle({
    eventType: 'reconciliation',
    entityId: accountId,
    entityType: 'account',
    action: 'reconciled',
    actor: userId ? { userId } : undefined,
    metadata: {
      tenantId,
      transactionCount: transactionIds.length,
      transactionIds,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Log suspicious activity (fraud detection)
 */
export async function logSuspiciousActivity(
  entityId: string,
  entityType: string,
  reason: string,
  details: Record<string, any>
): Promise<void> {
  await logToChronicle({
    eventType: 'security_alert',
    entityId,
    entityType,
    action: 'suspicious_activity_detected',
    metadata: {
      reason,
      severity: 'high',
      ...details,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Middleware to automatically log API actions
 */
export function auditMiddleware(req: any, res: any, next: any) {
  // Store original methods
  const originalJson = res.json;
  const originalSend = res.send;

  // Override response methods to log after successful operations
  res.json = function (data: any) {
    // Log successful operations
    if (res.statusCode >= 200 && res.statusCode < 300) {
      logAPIAction(req, res, data).catch(console.error);
    }
    return originalJson.call(this, data);
  };

  res.send = function (data: any) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      logAPIAction(req, res, data).catch(console.error);
    }
    return originalSend.call(this, data);
  };

  next();
}

/**
 * Internal function to log API actions
 */
async function logAPIAction(req: any, res: any, responseData: any): Promise<void> {
  // Only log mutating operations
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return;
  }

  const action = {
    POST: 'created',
    PUT: 'updated',
    PATCH: 'updated',
    DELETE: 'deleted',
  }[req.method] || 'modified';

  // Extract entity info from URL
  const urlParts = req.path.split('/').filter(Boolean);
  const entityType = urlParts[urlParts.length - 1];
  const entityId = responseData?.id || urlParts[urlParts.length - 2] || 'unknown';

  await logToChronicle({
    eventType: 'api_action',
    entityId,
    entityType,
    action,
    actor: req.userId ? { userId: req.userId } : undefined,
    metadata: {
      method: req.method,
      path: req.path,
      tenantId: req.tenantId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    },
  });
}

/**
 * Health check for ChittyChronicle service
 */
export async function checkChronicleServiceHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${CHITTYCHRONICLE_BASE_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    return response.ok;
  } catch (error) {
    return false;
  }
}
