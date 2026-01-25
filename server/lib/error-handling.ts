// @ts-nocheck - TODO: Add proper types
/**
 * Error Handling and Retry Logic for ChittyFinance
 * Provides comprehensive error handling, retry mechanisms, and rate limit management
 */

import type { Request, Response, NextFunction } from 'express';

// Custom error types
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export class RateLimitError extends APIError {
  constructor(message: string = 'Rate limit exceeded', public retryAfter?: number) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', true);
    this.name = 'RateLimitError';
  }
}

export class ValidationError extends APIError {
  constructor(message: string, public fields?: Record<string, string>) {
    super(message, 400, 'VALIDATION_ERROR', false);
    this.name = 'ValidationError';
  }
}

export class IntegrationError extends APIError {
  constructor(
    message: string,
    public service: string,
    retryable: boolean = true
  ) {
    super(message, 502, 'INTEGRATION_ERROR', retryable);
    this.name = 'IntegrationError';
  }
}

// Retry configuration
export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number; // milliseconds
  maxDelay?: number; // milliseconds
  backoffMultiplier?: number;
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  shouldRetry: (error: Error, attempt: number) => {
    // Retry on network errors, timeouts, and 5xx errors
    if (error instanceof APIError) {
      return error.retryable && attempt < 3;
    }
    if (error.message.includes('ETIMEDOUT') || error.message.includes('ECONNREFUSED')) {
      return true;
    }
    return false;
  },
};

/**
 * Execute function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (attempt === config.maxRetries || !config.shouldRetry(lastError, attempt)) {
        throw lastError;
      }

      // Calculate delay with exponential backoff and jitter
      const exponentialDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt);
      const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
      const delay = Math.min(exponentialDelay + jitter, config.maxDelay);

      console.warn(`Retry attempt ${attempt + 1}/${config.maxRetries} after ${delay}ms:`, lastError.message);

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Rate limiter using sliding window
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}

  /**
   * Check if request is allowed
   */
  async check(key: string): Promise<{ allowed: boolean; retryAfter?: number }> {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];

    // Remove old timestamps outside the window
    const validTimestamps = timestamps.filter(ts => now - ts < this.windowMs);

    if (validTimestamps.length >= this.maxRequests) {
      // Calculate retry after
      const oldestTimestamp = Math.min(...validTimestamps);
      const retryAfter = Math.ceil((this.windowMs - (now - oldestTimestamp)) / 1000);

      return { allowed: false, retryAfter };
    }

    // Add new timestamp
    validTimestamps.push(now);
    this.requests.set(key, validTimestamps);

    return { allowed: true };
  }

  /**
   * Clean up old entries (call periodically)
   */
  cleanup() {
    const now = Date.now();
    for (const [key, timestamps] of this.requests.entries()) {
      const validTimestamps = timestamps.filter(ts => now - ts < this.windowMs);
      if (validTimestamps.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, validTimestamps);
      }
    }
  }
}

// Global rate limiters
export const apiRateLimiter = new RateLimiter(100, 60000); // 100 requests per minute
export const integrationRateLimiter = new RateLimiter(30, 60000); // 30 integration calls per minute

// Cleanup rate limiters every 5 minutes
setInterval(() => {
  apiRateLimiter.cleanup();
  integrationRateLimiter.cleanup();
}, 300000);

/**
 * Express middleware for rate limiting
 */
export function rateLimitMiddleware(limiter: RateLimiter) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const result = await limiter.check(key);

    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfter || 60);
      res.setHeader('X-RateLimit-Reset', Date.now() + (result.retryAfter || 60) * 1000);
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: result.retryAfter,
      });
    }

    next();
  };
}

/**
 * Express error handling middleware
 */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  console.error('Error:', err);

  // Handle known error types
  if (err instanceof APIError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(err instanceof ValidationError && err.fields ? { fields: err.fields } : {}),
      ...(err instanceof RateLimitError && err.retryAfter ? { retryAfter: err.retryAfter } : {}),
    });
  }

  // Handle validation errors from zod
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: (err as any).errors,
    });
  }

  // Handle database errors
  if (err.message.includes('duplicate key') || err.message.includes('unique constraint')) {
    return res.status(409).json({
      error: 'Resource already exists',
      code: 'DUPLICATE_RESOURCE',
    });
  }

  // Default 500 error
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' ? { details: err.message, stack: err.stack } : {}),
  });
}

/**
 * Wrapper for async route handlers
 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Fetch with retry and timeout
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  return withRetry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (!response.ok) {
        // Check for rate limit
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
          throw new RateLimitError('External API rate limit exceeded', retryAfter);
        }

        // Check if retryable
        const retryable = response.status >= 500 || response.status === 408;
        throw new IntegrationError(
          `HTTP ${response.status}: ${response.statusText}`,
          new URL(url).hostname,
          retryable
        );
      }

      return response;
    } finally {
      clearTimeout(timeout);
    }
  }, retryOptions);
}

/**
 * Circuit breaker pattern for external services
 */
export class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000 // 1 minute
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime < this.timeout) {
        throw new IntegrationError('Circuit breaker is open', 'external-service', false);
      }
      // Try half-open
      this.state = 'half-open';
    }

    try {
      const result = await fn();

      // Success - reset circuit
      if (this.state === 'half-open') {
        this.state = 'closed';
      }
      this.failures = 0;

      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();

      // Open circuit if threshold exceeded
      if (this.failures >= this.threshold) {
        this.state = 'open';
        console.error(`Circuit breaker opened after ${this.failures} failures`);
      }

      throw error;
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
    };
  }

  reset() {
    this.state = 'closed';
    this.failures = 0;
    this.lastFailureTime = 0;
  }
}

// Global circuit breakers for external services
export const circuitBreakers = {
  mercury: new CircuitBreaker(5, 60000),
  wave: new CircuitBreaker(5, 60000),
  stripe: new CircuitBreaker(5, 60000),
  doorloop: new CircuitBreaker(5, 60000),
  chittyConnect: new CircuitBreaker(3, 30000),
};
