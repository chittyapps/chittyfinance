/**
 * Unified ChittyOS Client Package
 * Reusable client for integration across all ChittyOS services
 * Can be extracted to @chittyos/client npm package
 */

import { fetchWithRetry, circuitBreakers, IntegrationError } from './error-handling';

export interface ChittyOSClientConfig {
  baseUrl: string;
  serviceToken?: string;
  timeout?: number;
  retries?: number;
  circuitBreaker?: boolean;
}

export interface ServiceHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
  services?: Record<string, {
    status: 'healthy' | 'unhealthy';
    latency?: number;
  }>;
}

/**
 * Base ChittyOS Service Client
 * Provides common functionality for all service integrations
 */
export class ChittyOSClient {
  protected baseUrl: string;
  protected serviceToken?: string;
  protected timeout: number;
  protected retries: number;
  protected circuitBreaker?: any;

  constructor(config: ChittyOSClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.serviceToken = config.serviceToken;
    this.timeout = config.timeout || 30000;
    this.retries = config.retries || 2;

    if (config.circuitBreaker) {
      const serviceName = new URL(config.baseUrl).hostname.split('.')[0];
      this.circuitBreaker = (circuitBreakers as any)[serviceName];
    }
  }

  /**
   * Make authenticated request
   */
  protected async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options?.headers as Record<string, string>,
    };

    if (this.serviceToken) {
      headers['Authorization'] = `Bearer ${this.serviceToken}`;
    }

    const fetchFn = async () => {
      return await fetchWithRetry(
        url,
        {
          ...options,
          headers,
          signal: AbortSignal.timeout(this.timeout),
        },
        {
          maxRetries: this.retries,
          baseDelay: 1000,
        }
      );
    };

    const response = this.circuitBreaker
      ? await this.circuitBreaker.execute(fetchFn)
      : await fetchFn();

    if (!response.ok) {
      throw new IntegrationError(
        `${this.constructor.name} request failed: ${response.statusText}`,
        new URL(this.baseUrl).hostname,
        response.status >= 500
      );
    }

    return response.json();
  }

  /**
   * GET request
   */
  protected async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const query = params
      ? '?' + new URLSearchParams(params).toString()
      : '';

    return this.request<T>(endpoint + query, {
      method: 'GET',
    });
  }

  /**
   * POST request
   */
  protected async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PUT request
   */
  protected async put<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * PATCH request
   */
  protected async patch<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * DELETE request
   */
  protected async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    });
  }

  /**
   * Health check
   */
  async health(): Promise<ServiceHealthResponse> {
    return this.get<ServiceHealthResponse>('/health');
  }

  /**
   * Get service status
   */
  async status(): Promise<any> {
    return this.get('/api/v1/status');
  }
}

/**
 * ChittyID Client
 */
export class ChittyIDClient extends ChittyOSClient {
  constructor(config?: Partial<ChittyOSClientConfig>) {
    super({
      baseUrl: config?.baseUrl || process.env.CHITTYID_URL || 'https://id.chitty.cc',
      serviceToken: config?.serviceToken || process.env.CHITTY_AUTH_SERVICE_TOKEN,
      circuitBreaker: true,
      ...config,
    });
  }

  async mintChittyID(entity: 'PERSON' | 'ORGANIZATION' | 'PROPERTY' | 'DEVICE'): Promise<{
    chittyId: string;
    did: string;
    entity: string;
  }> {
    return this.post('/api/v2/chittyid/mint', { entity });
  }

  async resolveChittyID(chittyId: string): Promise<{
    chittyId: string;
    did: string;
    entity: string;
    metadata?: Record<string, any>;
  }> {
    return this.get(`/api/v2/chittyid/${chittyId}`);
  }
}

/**
 * ChittyAuth Client
 */
export class ChittyAuthClient extends ChittyOSClient {
  constructor(config?: Partial<ChittyOSClientConfig>) {
    super({
      baseUrl: config?.baseUrl || process.env.CHITTYAUTH_URL || 'https://auth.chitty.cc',
      serviceToken: config?.serviceToken || process.env.CHITTY_AUTH_SERVICE_TOKEN,
      circuitBreaker: true,
      ...config,
    });
  }

  async createServiceToken(scopes: string[]): Promise<{
    token: string;
    expiresAt: string;
  }> {
    return this.post('/api/v1/tokens/service', { scopes });
  }

  async verifyToken(token: string): Promise<{
    valid: boolean;
    scopes?: string[];
    expiresAt?: string;
  }> {
    return this.post('/api/v1/tokens/verify', { token });
  }
}

/**
 * ChittyConnect Client
 */
export class ChittyConnectClient extends ChittyOSClient {
  constructor(config?: Partial<ChittyOSClientConfig>) {
    super({
      baseUrl: config?.baseUrl || process.env.CHITTYCONNECT_API_BASE || 'https://connect.chitty.cc',
      serviceToken: config?.serviceToken || process.env.CHITTYCONNECT_API_TOKEN,
      circuitBreaker: true,
      ...config,
    });
  }

  // Mercury integration
  async getMercuryAccounts(userId?: number, tenantId?: string): Promise<any[]> {
    return this.get('/api/mercury/accounts', {
      ...(userId ? { userId: userId.toString() } : {}),
      ...(tenantId ? { tenant: tenantId } : {}),
    });
  }

  async getMercurySummary(params: {
    userId?: number;
    tenantId?: string;
    accountIds: string[];
  }): Promise<any> {
    return this.post('/api/mercury/summary', {
      userId: params.userId,
      tenant: params.tenantId,
      accountIds: params.accountIds,
    });
  }
}

/**
 * ChittySchema Client
 */
export class ChittySchemaClient extends ChittyOSClient {
  constructor(config?: Partial<ChittyOSClientConfig>) {
    super({
      baseUrl: config?.baseUrl || process.env.CHITTYSCHEMA_URL || 'https://schema.chitty.cc',
      ...config,
    });
  }

  async validate(type: string, data: Record<string, any>): Promise<{
    valid: boolean;
    errors?: Array<{ path: string; message: string; code: string }>;
  }> {
    return this.post('/api/v1/validate', { type, data });
  }

  async getEntityTypes(): Promise<Array<{
    type: string;
    description: string;
  }>> {
    const response = await this.get<{ types: any[] }>('/api/v1/entity-types');
    return response.types;
  }

  async getSchema(type: string): Promise<Record<string, any>> {
    return this.get(`/api/v1/schema/${type}`);
  }
}

/**
 * ChittyChronicle Client
 */
export class ChittyChronicleClient extends ChittyOSClient {
  constructor(config?: Partial<ChittyOSClientConfig>) {
    super({
      baseUrl: config?.baseUrl || process.env.CHITTYCHRONICLE_URL || 'https://chronicle.chitty.cc',
      serviceToken: config?.serviceToken || process.env.CHITTYCHRONICLE_TOKEN,
      circuitBreaker: true,
      ...config,
    });
  }

  async logEvent(event: {
    eventType: string;
    entityId: string;
    entityType: string;
    action: string;
    actor?: Record<string, any>;
    before?: Record<string, any>;
    after?: Record<string, any>;
    metadata?: Record<string, any>;
  }): Promise<{
    eventId: string;
    timestamp: string;
  }> {
    return this.post('/api/events', {
      ...event,
      source: 'chittyfinance',
      timestamp: new Date().toISOString(),
    });
  }

  async getEvents(params: {
    entityId?: string;
    eventType?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<Array<any>> {
    return this.get('/api/events', params as any);
  }
}

/**
 * ChittyRegistry Client
 */
export class ChittyRegistryClient extends ChittyOSClient {
  constructor(config?: Partial<ChittyOSClientConfig>) {
    super({
      baseUrl: config?.baseUrl || process.env.CHITTYREGISTRY_URL || 'https://registry.chitty.cc',
      serviceToken: config?.serviceToken || process.env.CHITTY_AUTH_SERVICE_TOKEN,
      ...config,
    });
  }

  async discoverService(serviceName: string): Promise<{
    name: string;
    url: string;
    version: string;
    status: string;
  }> {
    return this.get(`/api/v1/services/${serviceName}`);
  }

  async listServices(): Promise<Array<{
    name: string;
    url: string;
    version: string;
    status: string;
  }>> {
    return this.get('/api/v1/services');
  }
}

/**
 * ChittyRental Client (wrapper)
 */
export class ChittyRentalClient extends ChittyOSClient {
  constructor(config?: Partial<ChittyOSClientConfig>) {
    super({
      baseUrl: config?.baseUrl || process.env.CHITTYRENTAL_URL || 'https://rental.chitty.cc',
      serviceToken: config?.serviceToken || process.env.CHITTYRENTAL_TOKEN,
      circuitBreaker: true,
      ...config,
    });
  }

  // Property management methods (simplified, full implementation in chittyrental-integration.ts)
  async getProperties(tenantId: string): Promise<any[]> {
    return this.get('/api/properties', { tenantId });
  }

  async getRentRoll(propertyId: string): Promise<any> {
    return this.get(`/api/properties/${propertyId}/rent-roll`);
  }
}

/**
 * Unified ChittyOS Client Factory
 * Creates and manages all service clients
 */
export class ChittyOSClientFactory {
  private static instances: Map<string, any> = new Map();

  static getChittyID(config?: Partial<ChittyOSClientConfig>): ChittyIDClient {
    if (!this.instances.has('chittyid') || config) {
      this.instances.set('chittyid', new ChittyIDClient(config));
    }
    return this.instances.get('chittyid');
  }

  static getChittyAuth(config?: Partial<ChittyOSClientConfig>): ChittyAuthClient {
    if (!this.instances.has('chittyauth') || config) {
      this.instances.set('chittyauth', new ChittyAuthClient(config));
    }
    return this.instances.get('chittyauth');
  }

  static getChittyConnect(config?: Partial<ChittyOSClientConfig>): ChittyConnectClient {
    if (!this.instances.has('chittyconnect') || config) {
      this.instances.set('chittyconnect', new ChittyConnectClient(config));
    }
    return this.instances.get('chittyconnect');
  }

  static getChittySchema(config?: Partial<ChittyOSClientConfig>): ChittySchemaClient {
    if (!this.instances.has('chittyschema') || config) {
      this.instances.set('chittyschema', new ChittySchemaClient(config));
    }
    return this.instances.get('chittyschema');
  }

  static getChittyChronicle(config?: Partial<ChittyOSClientConfig>): ChittyChronicleClient {
    if (!this.instances.has('chittychronicle') || config) {
      this.instances.set('chittychronicle', new ChittyChronicleClient(config));
    }
    return this.instances.get('chittychronicle');
  }

  static getChittyRegistry(config?: Partial<ChittyOSClientConfig>): ChittyRegistryClient {
    if (!this.instances.has('chittyregistry') || config) {
      this.instances.set('chittyregistry', new ChittyRegistryClient(config));
    }
    return this.instances.get('chittyregistry');
  }

  static getChittyRental(config?: Partial<ChittyOSClientConfig>): ChittyRentalClient {
    if (!this.instances.has('chittyrental') || config) {
      this.instances.set('chittyrental', new ChittyRentalClient(config));
    }
    return this.instances.get('chittyrental');
  }

  /**
   * Clear all cached instances
   */
  static clearCache(): void {
    this.instances.clear();
  }

  /**
   * Get health status of all services
   */
  static async healthCheckAll(): Promise<Record<string, {
    status: string;
    latency: number;
  }>> {
    const services = {
      chittyid: this.getChittyID(),
      chittyauth: this.getChittyAuth(),
      chittyconnect: this.getChittyConnect(),
      chittyschema: this.getChittySchema(),
      chittychronicle: this.getChittyChronicle(),
      chittyregistry: this.getChittyRegistry(),
      chittyrental: this.getChittyRental(),
    };

    const results: Record<string, { status: string; latency: number }> = {};

    await Promise.all(
      Object.entries(services).map(async ([name, client]) => {
        const start = Date.now();
        try {
          await client.health();
          results[name] = {
            status: 'healthy',
            latency: Date.now() - start,
          };
        } catch (error) {
          results[name] = {
            status: 'unhealthy',
            latency: Date.now() - start,
          };
        }
      })
    );

    return results;
  }
}

// Export convenience instances
export const chittyID = () => ChittyOSClientFactory.getChittyID();
export const chittyAuth = () => ChittyOSClientFactory.getChittyAuth();
export const chittyConnect = () => ChittyOSClientFactory.getChittyConnect();
export const chittySchema = () => ChittyOSClientFactory.getChittySchema();
export const chittyChronicle = () => ChittyOSClientFactory.getChittyChronicle();
export const chittyRegistry = () => ChittyOSClientFactory.getChittyRegistry();
export const chittyRental = () => ChittyOSClientFactory.getChittyRental();
