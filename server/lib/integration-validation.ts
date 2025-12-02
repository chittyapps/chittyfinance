/**
 * Integration Configuration Validation
 *
 * Validates that required environment variables are set for each integration
 */

export interface IntegrationConfig {
  required: string[];
  optional?: string[];
}

export const INTEGRATION_CONFIGS: Record<string, IntegrationConfig> = {
  wave: {
    required: ['WAVE_CLIENT_ID', 'WAVE_CLIENT_SECRET'],
    optional: ['WAVE_REDIRECT_URI'],
  },
  stripe: {
    required: ['STRIPE_SECRET_KEY'],
    optional: ['STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET'],
  },
  mercury: {
    required: ['CHITTYCONNECT_API_BASE'],
    optional: ['CHITTYCONNECT_API_TOKEN', 'CHITTY_AUTH_SERVICE_TOKEN'],
  },
  openai: {
    required: ['OPENAI_API_KEY'],
  },
};

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  message: string;
}

/**
 * Validate integration configuration
 */
export function validateIntegration(integration: string): ValidationResult {
  const config = INTEGRATION_CONFIGS[integration];

  if (!config) {
    return {
      valid: false,
      missing: [],
      message: `Unknown integration: ${integration}`,
    };
  }

  const missing = config.required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    return {
      valid: false,
      missing,
      message: `${integration.toUpperCase()} integration not configured. Missing: ${missing.join(', ')}`,
    };
  }

  return {
    valid: true,
    missing: [],
    message: `${integration.toUpperCase()} integration configured`,
  };
}

/**
 * Validate all integrations and return status
 */
export function validateAllIntegrations(): Record<string, ValidationResult> {
  const results: Record<string, ValidationResult> = {};

  for (const integration of Object.keys(INTEGRATION_CONFIGS)) {
    results[integration] = validateIntegration(integration);
  }

  return results;
}

/**
 * Throw error if integration not configured
 */
export function requireIntegration(integration: string): void {
  const result = validateIntegration(integration);

  if (!result.valid) {
    throw new Error(result.message);
  }
}
