import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Connection } from '@solana/web3.js';
import { SteroidConnection } from '../../src/connection/SteroidConnection.js';

// Mock the Connection class
vi.mock('@solana/web3.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@solana/web3.js')>();
  return {
    ...actual,
    Connection: vi.fn().mockImplementation(function (url: string) {
      return {
        _url: url,
        getSlot: vi.fn().mockResolvedValue(12345),
        getLatestBlockhash: vi.fn().mockResolvedValue({
          blockhash: '5eykt4UsFv8P8NJdTREpY1vzqBUfSmRciL826HUBRkEA',
          lastValidBlockHeight: 100000,
        }),
        getGenesisHash: vi.fn().mockResolvedValue('5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      };
    }),
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
      expect(result.blockhash).toBe('5eykt4UsFv8P8NJdTREpY1vzqBUfSmRciL826HUBRkEA');
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

  describe('Latency Scoring', () => {
    it('should initialize scorer when latencyScoring is enabled', () => {
      const connection = new SteroidConnection('https://primary.solana.com', {
        latencyScoring: true,
        healthCheckInterval: 0,
      });
      
      expect(connection).toBeDefined();
      expect((connection as any).scorer).toBeDefined();
    });

    it('should record latency on successful calls', async () => {
      const connection = new SteroidConnection('https://primary.solana.com', {
        latencyScoring: true,
        healthCheckInterval: 0,
      }) as any;
      
      const scorerSpy = vi.spyOn(connection.scorer, 'recordSuccess');
      
      await connection.getSlot();
      
      expect(scorerSpy).toHaveBeenCalled();
      const health = connection.getHealthStatus()[0];
      expect(health.latency).toBeDefined();
      expect(health.score).toBeGreaterThan(0);
    });

    it('should record failure on failed calls', async () => {
      const connection = new SteroidConnection('https://primary.solana.com', {
        latencyScoring: true,
        healthCheckInterval: 0,
        maxRetries: 1,
      }) as any;
      
      const scorerSpy = vi.spyOn(connection.scorer, 'recordFailure');
      
      // Force a failure by mocking the method to throw
      vi.spyOn(connection.activeConnection, 'getSlot').mockRejectedValueOnce(new Error('Mock failure'));
      
      try {
        await connection.getSlot();
      } catch (e) {
        // Expected
      }
      
      expect(scorerSpy).toHaveBeenCalled();
    });

    it('should pick the best available node during failover if scoring is enabled', async () => {
      const connection = new SteroidConnection('https://primary.solana.com', {
        fallbacks: ['https://fast.solana.com', 'https://slow.solana.com'],
        latencyScoring: true,
        healthCheckInterval: 0,
        maxRetries: 3,
      }) as any;
      
      // record some scores. 
      // index 1: fast. index 2: slow.
      connection.scorer.recordSuccess('https://fast.solana.com', 50);
      connection.scorer.recordSuccess('https://slow.solana.com', 500);
      
      // Force first node to fail with a node failure error
      vi.spyOn(connection.activeConnection, 'getSlot').mockRejectedValueOnce(new Error('fetch failed'));
      
      await connection.getSlot();
      
      // Should have switched to index 1 (fast)
      expect(connection.getActiveEndpoint()).toBe('https://fast.solana.com');
    });
  });

  describe('Cluster Detection', () => {
    it('should detect cluster on initialization', async () => {
      const connection = new SteroidConnection('https://api.mainnet-beta.solana.com', {
        healthCheckInterval: 0,
      });

      // Wait a bit for the async detection to complete or trigger it manually
      await (connection as any).detectCluster();

      expect(connection.getCluster()).toBe('mainnet-beta');
      expect(connection.getGenesisHash()).toBe('5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
    });

    it('should emit mismatch event when cluster does not match expected', async () => {
      const emitter = { emit: vi.fn() } as any;
      const connection = new SteroidConnection('https://api.mainnet-beta.solana.com', {
        expectedCluster: 'devnet',
        healthCheckInterval: 0,
      }, emitter);

      await (connection as any).detectCluster();

      expect(emitter.emit).toHaveBeenCalledWith('connection:cluster-mismatch', expect.objectContaining({
        detected: 'mainnet-beta',
        expected: 'devnet',
      }));
    });
  });
});
