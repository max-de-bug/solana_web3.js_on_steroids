import { SteroidConnectionConfig, SteroidClientConfig } from '../types/SteroidWalletTypes.js';

/**
 * Runtime validation for configuration objects.
 * Catches common misconfiguration at construction time instead of at first use.
 */

/** Validates a SteroidClientConfig, throwing on invalid values. */
export function validateClientConfig(config: SteroidClientConfig): void {
  if (config.connection) {
    validateConnectionConfig(config.connection);
  }
}

/** Validates a SteroidConnectionConfig, throwing on invalid values. */
export function validateConnectionConfig(config: SteroidConnectionConfig): void {
  if (config.maxRetries !== undefined && (config.maxRetries < 0 || !Number.isInteger(config.maxRetries))) {
    throw new RangeError(`maxRetries must be a non-negative integer, got ${config.maxRetries}`);
  }
  if (config.retryDelay !== undefined && config.retryDelay < 0) {
    throw new RangeError(`retryDelay must be non-negative, got ${config.retryDelay}`);
  }
  if (config.healthCheckInterval !== undefined && config.healthCheckInterval < 0) {
    throw new RangeError(`healthCheckInterval must be non-negative, got ${config.healthCheckInterval}`);
  }
  if (config.requestTimeout !== undefined && config.requestTimeout <= 0) {
    throw new RangeError(`requestTimeout must be positive, got ${config.requestTimeout}`);
  }
  if (config.raceNodes !== undefined && (config.raceNodes < 0 || !Number.isInteger(config.raceNodes))) {
    throw new RangeError(`raceNodes must be a non-negative integer, got ${config.raceNodes}`);
  }
  if (config.maxSlotLag !== undefined && config.maxSlotLag <= 0) {
    throw new RangeError(`maxSlotLag must be positive, got ${config.maxSlotLag}`);
  }
  if (config.fallbacks) {
    for (const url of config.fallbacks) {
      validateEndpointUrl(url);
    }
  }
}

/** Basic validation for an RPC endpoint URL */
export function validateEndpointUrl(url: string): void {
  if (!url || typeof url !== 'string') {
    throw new TypeError(`Endpoint URL must be a non-empty string, got ${JSON.stringify(url)}`);
  }
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new TypeError(`Endpoint URL must use http or https protocol, got ${parsed.protocol}`);
    }
  } catch (error) {
    if (error instanceof TypeError) throw error;
    throw new TypeError(`Invalid endpoint URL: ${url}`);
  }
}
