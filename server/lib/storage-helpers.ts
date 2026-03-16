
/**
 * Storage Helpers - Smart wrappers for multi-tenant storage access
 *
 * These helpers automatically handle tenant context from Express requests
 * and use the unified storage layer.
 */

import type { Request } from 'express';
import { storage } from '../storage';
import { toStringId } from './id-compat';

const store = storage as any;

interface StorageRequest extends Request {
  userId?: string | number;
  tenantId?: string | number;
}

const MODE = process.env.MODE || 'standalone';

/**
 * Get the appropriate storage context from a request
 */
export function getStorageContext(req: StorageRequest): {
  userId: string;
  tenantId: string;
  mode: 'standalone' | 'system';
} {
  const mode = MODE === 'system' ? 'system' : 'standalone';
  const userId = toStringId(req.userId || 1);
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
export async function getIntegrations(req: StorageRequest) {
  const ctx = getStorageContext(req);
  return store.getIntegrations(ctx.tenantId);
}

/**
 * Get single integration
 */
export async function getIntegration(req: Request, id: number | string) {
  return store.getIntegration(toStringId(id));
}

/**
 * Create integration
 */
export async function createIntegration(req: Request, data: any) {
  const ctx = getStorageContext(req);

  return store.createIntegration({
    ...data,
    tenantId: ctx.tenantId,
    userId: MODE === 'standalone' ? parseInt(ctx.userId, 10) : undefined,
  });
}

/**
 * Update integration
 */
export async function updateIntegration(req: Request, id: number | string, data: any) {
  return store.updateIntegration(toStringId(id), data);
}

/**
 * Get tasks for current user/tenant
 */
export async function getTasks(req: Request, limit?: number) {
  const ctx = getStorageContext(req);
  return store.getTasks(ctx.tenantId, limit);
}

/**
 * Get single task
 */
export async function getTask(req: Request, id: number | string) {
  return store.getTask(toStringId(id));
}

/**
 * Create task
 */
export async function createTask(req: Request, data: any) {
  const ctx = getStorageContext(req);

  return store.createTask({
    ...data,
    tenantId: ctx.tenantId,
    userId: MODE === 'standalone' ? parseInt(ctx.userId, 10) : ctx.userId,
  });
}

/**
 * Update task
 */
export async function updateTask(req: Request, id: number | string, data: any) {
  return store.updateTask(toStringId(id), data);
}

/**
 * Get AI messages for current user/tenant
 */
export async function getAiMessages(req: Request, limit?: number) {
  const ctx = getStorageContext(req);
  return store.getAiMessages(ctx.tenantId, ctx.userId, limit);
}

/**
 * Create AI message
 */
export async function createAiMessage(req: Request, data: any) {
  const ctx = getStorageContext(req);

  return store.createAiMessage({
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
  return store.getTransactions(ctx.tenantId, limit);
}

/**
 * Create transaction
 */
export async function createTransaction(req: Request, data: any) {
  const ctx = getStorageContext(req);

  return store.createTransaction({
    ...data,
    tenantId: MODE === 'standalone' ? parseInt(ctx.tenantId, 10) : ctx.tenantId,
    userId: MODE === 'standalone' ? parseInt(ctx.userId, 10) : undefined,
  });
}

/**
 * Get financial summary for current user/tenant
 */
export async function getFinancialSummary(req: StorageRequest) {
  const ctx = getStorageContext(req);

  if (!store.getFinancialSummary) {
    return undefined; // System mode doesn't have this method
  }

  return store.getFinancialSummary(ctx.userId);
}
