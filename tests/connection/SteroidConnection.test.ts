import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Connection } from '@solana/web3.js';
import { SteroidConnection } from '../../src/connection/SteroidConnection.js';

// Mock the Connection class
vi.mock('@solana/web3.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@solana/web3.js')>();
  return {
    ...actual,
    Connection: vi.fn().mockImplementation((url: string) => ({
      _url: url,
      getSlot: vi.fn().mockResolvedValue(12345),
      getLatestBlockhash: vi.fn().mockResolvedValue({
        blockhash: 'mockBlockhash123456789',
        lastValidBlockHeight: 100000,
      }),
      getGenesisHash: vi.fn().mockResolvedValue('mockGenesisHash123456789'),
    })),
  };
});

describe('SteroidConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should create a connection with default config', () => {
      const connection = new SteroidConnection('https://api.mainnet-beta.solana.com');
      
      expect(connection).toBeDefined();
      expect(connection.getActiveEndpoint()).toBe('https://api.mainnet-beta.solana.com');
    });

    it('should create a connection with fallback endpoints', () => {
      const connection = new SteroidConnection('https://primary.solana.com', {
        fallbacks: ['https://fallback1.solana.com', 'https://fallback2.solana.com'],
      });
      
      const endpoints = connection.getEndpoints();
      expect(endpoints).toHaveLength(3);
      expect(endpoints).toContain('https://primary.solana.com');
      expect(endpoints).toContain('https://fallback1.solana.com');
      expect(endpoints).toContain('https://fallback2.solana.com');
    });

    it('should initialize health status for all endpoints', () => {
      const connection = new SteroidConnection('https://primary.solana.com', {
        fallbacks: ['https://fallback.solana.com'],
        healthCheckInterval: 0, // Disable auto health checks for test
      });
      
      const healthStatus = connection.getHealthStatus();
      expect(healthStatus).toHaveLength(2);
      healthStatus.forEach((status) => {
        expect(status.healthy).toBe(true);
        expect(status.lastChecked).toBeDefined();
      });
    });
  });

  describe('Failover Statistics', () => {
    it('should track failover count', () => {
      const connection = new SteroidConnection('https://primary.solana.com', {
        healthCheckInterval: 0,
      });
      
      const stats = connection.getFailoverStats();
      expect(stats.count).toBe(0);
      expect(stats.lastTime).toBe(0);
    });
  });

  describe('Health Checks', () => {
    it('should perform manual health check', async () => {
      const connection = new SteroidConnection('https://primary.solana.com', {
        healthCheckInterval: 0,
      });
      
      const healthResults = await connection.checkHealth();
      expect(healthResults).toBeInstanceOf(Array);
      expect(healthResults.length).toBeGreaterThan(0);
    });
  });

  describe('Cleanup', () => {
    it('should destroy connection and clean up resources', () => {
      const connection = new SteroidConnection('https://primary.solana.com', {
        healthCheckInterval: 1000,
      });
      
      // Should not throw
      expect(() => connection.destroy()).not.toThrow();
    });

    it('should be idempotent when calling destroy multiple times', () => {
      const connection = new SteroidConnection('https://primary.solana.com', {
        healthCheckInterval: 0,
      });
      
      connection.destroy();
      expect(() => connection.destroy()).not.toThrow();
    });
  });

  describe('Proxy Behavior', () => {
    it('should forward method calls to underlying connection', async () => {
      const connection = new SteroidConnection('https://primary.solana.com', {
        healthCheckInterval: 0,
      }) as any;
      
      // The proxy should forward getSlot to the underlying connection
      const slot = await connection.getSlot();
      expect(slot).toBe(12345);
    });

    it('should forward getLatestBlockhash to underlying connection', async () => {
      const connection = new SteroidConnection('https://primary.solana.com', {
        healthCheckInterval: 0,
      }) as any;
      
      const result = await connection.getLatestBlockhash();
      expect(result.blockhash).toBe('mockBlockhash123456789');
      expect(result.lastValidBlockHeight).toBe(100000);
    });
  });

  describe('Configuration', () => {
    it('should use custom retry settings', () => {
      const connection = new SteroidConnection('https://primary.solana.com', {
        maxRetries: 10,
        retryDelay: 1000,
        requestTimeout: 60000,
        healthCheckInterval: 0,
      });
      
      // Connection should be created without errors
      expect(connection).toBeDefined();
    });

    it('should enable logging when configured', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const connection = new SteroidConnection('https://primary.solana.com', {
        enableLogging: true,
        healthCheckInterval: 0,
      });
      
      expect(connection).toBeDefined();
      consoleSpy.mockRestore();
    });
  });
});
