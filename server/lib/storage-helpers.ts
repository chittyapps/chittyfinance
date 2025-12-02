/**
 * Storage Helpers - Smart wrappers for multi-tenant storage access
 *
 * These helpers automatically handle tenant context from Express requests
 * and use the unified storage layer.
 */

import type { Request } from 'express';
import { storage } from '../storage';
import { toStringId } from './id-compat';

const MODE = process.env.MODE || 'standalone';

/**
 * Get the appropriate storage context from a request
 */
export function getStorageContext(req: Request): {
  userId: string;
  tenantId: string;
  mode: 'standalone' | 'system';
} {
  const mode = MODE === 'system' ? 'system' : 'standalone';
  const userId = toStringId(req.userId || (req as any).userId || 1);
  const tenantId = toStringId(req.tenantId || userId); // In standalone, userId === tenantId

  return {
    userId,
    tenantId,
    mode,
  };
}

/**
 * Get integrations for current user/tenant
 */
export async function getIntegrations(req: Request) {
  const ctx = getStorageContext(req);
  return storage.getIntegrations(ctx.tenantId);
}

/**
 * Get single integration
 */
export async function getIntegration(req: Request, id: number | string) {
  return storage.getIntegration(toStringId(id));
}

/**
 * Create integration
 */
export async function createIntegration(req: Request, data: any) {
  const ctx = getStorageContext(req);

  return storage.createIntegration({
    ...data,
    tenantId: ctx.tenantId,
    userId: MODE === 'standalone' ? parseInt(ctx.userId, 10) : undefined,
  });
}

/**
 * Update integration
 */
export async function updateIntegration(req: Request, id: number | string, data: any) {
  return storage.updateIntegration(toStringId(id), data);
}

/**
 * Get tasks for current user/tenant
 */
export async function getTasks(req: Request, limit?: number) {
  const ctx = getStorageContext(req);
  return storage.getTasks(ctx.tenantId, limit);
}

/**
 * Get single task
 */
export async function getTask(req: Request, id: number | string) {
  return storage.getTask(toStringId(id));
}

/**
 * Create task
 */
export async function createTask(req: Request, data: any) {
  const ctx = getStorageContext(req);

  return storage.createTask({
    ...data,
    tenantId: ctx.tenantId,
    userId: MODE === 'standalone' ? parseInt(ctx.userId, 10) : ctx.userId,
  });
}

/**
 * Update task
 */
export async function updateTask(req: Request, id: number | string, data: any) {
  return storage.updateTask(toStringId(id), data);
}

/**
 * Get AI messages for current user/tenant
 */
export async function getAiMessages(req: Request, limit?: number) {
  const ctx = getStorageContext(req);
  return storage.getAiMessages(ctx.tenantId, ctx.userId, limit);
}

/**
 * Create AI message
 */
export async function createAiMessage(req: Request, data: any) {
  const ctx = getStorageContext(req);

  return storage.createAiMessage({
    ...data,
    tenantId: MODE === 'standalone' ? parseInt(ctx.tenantId, 10) : ctx.tenantId,
    userId: MODE === 'standalone' ? parseInt(ctx.userId, 10) : ctx.userId,
  });
}

/**
 * Get transactions for current user/tenant
 */
export async function getTransactions(req: Request, limit?: number) {
  const ctx = getStorageContext(req);
  return storage.getTransactions(ctx.tenantId, limit);
}

/**
 * Create transaction
 */
export async function createTransaction(req: Request, data: any) {
  const ctx = getStorageContext(req);

  return storage.createTransaction({
    ...data,
    tenantId: MODE === 'standalone' ? parseInt(ctx.tenantId, 10) : ctx.tenantId,
    userId: MODE === 'standalone' ? parseInt(ctx.userId, 10) : undefined,
  });
}

/**
 * Get financial summary for current user/tenant
 */
export async function getFinancialSummary(req: Request) {
  const ctx = getStorageContext(req);

  if (!storage.getFinancialSummary) {
    return undefined; // System mode doesn't have this method
  }

  return storage.getFinancialSummary(ctx.userId);
}
