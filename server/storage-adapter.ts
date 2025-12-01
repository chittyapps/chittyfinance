/**
 * Storage Adapter - Unified interface for standalone and system modes
 *
 * This adapter provides a single interface for data access that automatically
 * uses the correct storage implementation based on the MODE environment variable.
 */

import { storage as standaloneStorage } from './storage';
import { systemStorage } from './storage-system';

const MODE = process.env.MODE || 'standalone';

export interface StorageAdapter {
  mode: 'standalone' | 'system';

  // User operations
  getSessionUser(): Promise<any>;

  // Tenant operations (system mode only)
  getUserTenants?(userId: string): Promise<any[]>;
  getTenant?(tenantId: string): Promise<any>;

  // Integrations (with tenant context in system mode)
  getIntegrations(userIdOrTenantId: number | string): Promise<any[]>;
  getIntegration(id: number | string, tenantId?: string): Promise<any>;
  createIntegration(data: any): Promise<any>;
  updateIntegration(id: number | string, data: any, tenantId?: string): Promise<any>;

  // Tasks (with tenant context in system mode)
  getTasks(userIdOrTenantId: number | string, limit?: number): Promise<any[]>;
  getTask(id: number | string, tenantId?: string): Promise<any>;
  createTask(data: any): Promise<any>;
  updateTask(id: number | string, data: any, tenantId?: string): Promise<any>;

  // AI Messages (with tenant context in system mode)
  getAiMessages(userIdOrTenantId: number | string, limit?: number): Promise<any[]>;
  createAiMessage(data: any): Promise<any>;

  // Transactions
  getTransactions(userIdOrTenantId: number | string, limit?: number): Promise<any[]>;
  createTransaction(data: any): Promise<any>;

  // Webhook operations (shared)
  isWebhookDuplicate(source: string, eventId: string): Promise<boolean>;
  recordWebhookEvent(data: any): Promise<any>;
  listWebhookEvents(params: any): Promise<any>;
}

class UnifiedStorageAdapter implements StorageAdapter {
  mode: 'standalone' | 'system';

  constructor() {
    this.mode = MODE === 'system' ? 'system' : 'standalone';
  }

  async getSessionUser() {
    if (this.mode === 'system') {
      return systemStorage.getSessionUser();
    }
    return standaloneStorage.getSessionUser();
  }

  async getUserTenants(userId: string) {
    if (this.mode === 'system') {
      return systemStorage.getUserTenants(userId);
    }
    return [];
  }

  async getTenant(tenantId: string) {
    if (this.mode === 'system') {
      return systemStorage.getTenant(tenantId);
    }
    return undefined;
  }

  async getIntegrations(userIdOrTenantId: number | string) {
    if (this.mode === 'system') {
      return systemStorage.getIntegrations(String(userIdOrTenantId));
    }
    return standaloneStorage.getIntegrations(Number(userIdOrTenantId));
  }

  async getIntegration(id: number | string, tenantId?: string) {
    if (this.mode === 'system' && tenantId) {
      return systemStorage.getIntegration(String(id), tenantId);
    }
    return standaloneStorage.getIntegration(Number(id));
  }

  async createIntegration(data: any) {
    if (this.mode === 'system') {
      return systemStorage.createIntegration(data);
    }
    return standaloneStorage.createIntegration(data);
  }

  async updateIntegration(id: number | string, data: any, tenantId?: string) {
    if (this.mode === 'system' && tenantId) {
      return systemStorage.updateIntegration(String(id), tenantId, data);
    }
    return standaloneStorage.updateIntegration(Number(id), data);
  }

  async getTasks(userIdOrTenantId: number | string, limit?: number) {
    if (this.mode === 'system') {
      return systemStorage.getTasks(String(userIdOrTenantId), undefined, limit);
    }
    return standaloneStorage.getTasks(Number(userIdOrTenantId), limit);
  }

  async getTask(id: number | string, tenantId?: string) {
    if (this.mode === 'system' && tenantId) {
      return systemStorage.getTask(String(id), tenantId);
    }
    return standaloneStorage.getTask(Number(id));
  }

  async createTask(data: any) {
    if (this.mode === 'system') {
      return systemStorage.createTask(data);
    }
    return standaloneStorage.createTask(data);
  }

  async updateTask(id: number | string, data: any, tenantId?: string) {
    if (this.mode === 'system' && tenantId) {
      return systemStorage.updateTask(String(id), tenantId, data);
    }
    return standaloneStorage.updateTask(Number(id), data);
  }

  async getAiMessages(userIdOrTenantId: number | string, limit?: number) {
    if (this.mode === 'system') {
      return systemStorage.getAiMessages(String(userIdOrTenantId), undefined, limit);
    }
    return standaloneStorage.getAiMessages(Number(userIdOrTenantId), limit);
  }

  async createAiMessage(data: any) {
    if (this.mode === 'system') {
      return systemStorage.createAiMessage(data);
    }
    return standaloneStorage.createAiMessage(data);
  }

  async getTransactions(userIdOrTenantId: number | string, limit?: number) {
    if (this.mode === 'system') {
      return systemStorage.getTransactions(String(userIdOrTenantId), limit);
    }
    return standaloneStorage.getTransactions(Number(userIdOrTenantId), limit);
  }

  async createTransaction(data: any) {
    if (this.mode === 'system') {
      return systemStorage.createTransaction(data);
    }
    return standaloneStorage.createTransaction(data);
  }

  async isWebhookDuplicate(source: string, eventId: string) {
    if (this.mode === 'system') {
      return systemStorage.isWebhookDuplicate(source, eventId);
    }
    return standaloneStorage.isWebhookDuplicate(source, eventId);
  }

  async recordWebhookEvent(data: any) {
    if (this.mode === 'system') {
      return systemStorage.recordWebhookEvent(data);
    }
    return standaloneStorage.recordWebhookEvent(data);
  }

  async listWebhookEvents(params: any) {
    if (this.mode === 'system') {
      return systemStorage.listWebhookEvents(params);
    }
    return standaloneStorage.listWebhookEvents(params);
  }
}

export const storageAdapter = new UnifiedStorageAdapter();
