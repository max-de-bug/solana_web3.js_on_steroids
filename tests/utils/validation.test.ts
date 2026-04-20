import { describe, it, expect } from 'vitest';
import {
  validateClientConfig,
  validateConnectionConfig,
  validateEndpointUrl,
} from '../../src/utils/validation.js';

describe('Config Validation', () => {
  describe('validateEndpointUrl', () => {
    it('should accept valid http URLs', () => {
      expect(() => validateEndpointUrl('http://localhost:8899')).not.toThrow();
    });

    it('should accept valid https URLs', () => {
      expect(() => validateEndpointUrl('https://api.mainnet-beta.solana.com')).not.toThrow();
    });

    it('should reject empty strings', () => {
      expect(() => validateEndpointUrl('')).toThrow(TypeError);
    });

    it('should reject non-http protocols', () => {
      expect(() => validateEndpointUrl('ftp://example.com')).toThrow(TypeError);
    });

    it('should reject malformed URLs', () => {
      expect(() => validateEndpointUrl('not-a-url')).toThrow(TypeError);
    });
  });

  describe('validateConnectionConfig', () => {
    it('should accept a valid config', () => {
      expect(() =>
        validateConnectionConfig({
          maxRetries: 3,
          retryDelay: 500,
          healthCheckInterval: 30000,
          requestTimeout: 10000,
          raceNodes: 2,
          maxSlotLag: 50,
        })
      ).not.toThrow();
    });

    it('should accept an empty config', () => {
      expect(() => validateConnectionConfig({})).not.toThrow();
    });

    it('should reject negative maxRetries', () => {
      expect(() => validateConnectionConfig({ maxRetries: -1 })).toThrow(RangeError);
    });

    it('should reject non-integer maxRetries', () => {
      expect(() => validateConnectionConfig({ maxRetries: 2.5 })).toThrow(RangeError);
    });

    it('should reject negative retryDelay', () => {
      expect(() => validateConnectionConfig({ retryDelay: -100 })).toThrow(RangeError);
    });

    it('should reject zero requestTimeout', () => {
      expect(() => validateConnectionConfig({ requestTimeout: 0 })).toThrow(RangeError);
    });

    it('should reject negative raceNodes', () => {
      expect(() => validateConnectionConfig({ raceNodes: -1 })).toThrow(RangeError);
    });

    it('should reject zero maxSlotLag', () => {
      expect(() => validateConnectionConfig({ maxSlotLag: 0 })).toThrow(RangeError);
    });

    it('should reject invalid fallback URLs', () => {
      expect(() =>
        validateConnectionConfig({ fallbacks: ['not-a-url'] })
      ).toThrow(TypeError);
    });

    it('should accept valid fallback URLs', () => {
      expect(() =>
        validateConnectionConfig({
          fallbacks: ['https://fallback1.solana.com', 'https://fallback2.solana.com'],
        })
      ).not.toThrow();
    });
  });

  describe('validateClientConfig', () => {
    it('should accept an empty config', () => {
      expect(() => validateClientConfig({})).not.toThrow();
    });

    it('should delegate connection config validation', () => {
      expect(() =>
        validateClientConfig({ connection: { maxRetries: -1 } })
      ).toThrow(RangeError);
    });

    it('should accept a valid full config', () => {
      expect(() =>
        validateClientConfig({
          connection: {
            maxRetries: 3,
            retryDelay: 500,
            fallbacks: ['https://fallback.solana.com'],
          },
          enableLogging: true,
        })
      ).not.toThrow();
    });
  });
});
