import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Connection } from '@solana/web3.js';
import { SteroidConnection } from '../../src/connection/SteroidConnection.js';
import { sleep } from '../../src/utils/index.js';

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

describe('SteroidConnection Enhanced Resilience', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Concurrent Race Strategy', () => {
        it('should race multiple nodes when raceNodes > 0', async () => {
            const connection = new SteroidConnection('https://node1.com', {
                fallbacks: ['https://node2.com', 'https://node3.com'],
                raceNodes: 3,
                latencyScoring: true,
                healthCheckInterval: 0,
            }) as any;

            // Spy on callWithTimeout
            const spy = vi.spyOn(connection, 'callWithTimeout');

            await connection.getSlot();

            // Total 3 nodes should be raced
            expect(spy).toHaveBeenCalledTimes(3);
        });

        it('should return the fastest result during a race', async () => {
             // Mock Connection to return different values/latencies based on URL
             (Connection as any).mockImplementation(function(url: string) {
                return {
                    _url: url,
                    getSlot: async () => {
                        if (url.includes('node1')) {
                            // node1 is slow
                            await new Promise(r => setTimeout(r, 200));
                            return 1;
                        } else if (url.includes('node2')) {
                            // node2 is very fast
                            await new Promise(r => setTimeout(r, 10));
                            return 2;
                        }
                        return 12345;
                    },
                    getGenesisHash: vi.fn().mockResolvedValue('hash'),
                };
             });

             const connection = new SteroidConnection('https://node1.com', {
                fallbacks: ['https://node2.com'],
                raceNodes: 2,
                latencyScoring: true,
                healthCheckInterval: 0,
            }) as any;

            const result = await connection.getSlot();
            // Should return 2 (the faster one from node2)
            expect(result).toBe(2);
        });
    });

    describe('Circuit Breaker (Unhealthy Cooldown)', () => {
        beforeEach(() => {
            // Restore default mock for these tests
            (Connection as any).mockImplementation(function(url: string) {
                return {
                    _url: url,
                    getSlot: vi.fn().mockResolvedValue(12345),
                    getGenesisHash: vi.fn().mockResolvedValue('hash'),
                };
            });
        });

        it('should avoid picking unhealthy nodes during cooldown', async () => {
            const connection = new SteroidConnection('https://node1.com', {
                fallbacks: ['https://node2.com', 'https://node3.com'],
                unhealthyCooldownMs: 1000,
                healthCheckInterval: 0,
            }) as any;

            // Mark node1 as unhealthy
            connection.updateHealthStatus('https://node1.com', false, undefined, undefined);
            
            // findNextAvailableRpcIndex should now return node2 (index 1)
            const nextIndex = connection.findNextAvailableRpcIndex(new Set());
            expect(nextIndex).toBe(1);
            
            // Mark it 'healthy' but keep lastUnhealthy within window
            const status = connection.healthStatus.get('https://node1.com');
            status.healthy = true;
            status.lastUnhealthy = Date.now();
            
            const nextIndexStillCooldown = connection.findNextAvailableRpcIndex(new Set());
            expect(nextIndexStillCooldown).toBe(1); // still picks node2 (index 1) because it's the next in round-robin and node1 is in cooldown
            
            // Move time forward
            status.lastUnhealthy = Date.now() - 2000;
            // Now if we check next index, it starts at (0+1)%3 = 1.
            // Node 2 (index 1) is healthy. So it returns 1.
            // If we want to verify node 1 is available, we can exclude index 1 and 2.
            const nextIndexAfterCooldown = connection.findNextAvailableRpcIndex(new Set([1, 2]));
            expect(nextIndexAfterCooldown).toBe(0); // node1 is available and picked because others are excluded
        });
    });

    describe('Slot Lag Detection', () => {
        it('should update scorer with slots during health check', async () => {
            // Setup mock BEFORE creating connection
            (Connection as any).mockImplementation(function(url: string) {
                return {
                    _url: url,
                    getSlot: vi.fn().mockResolvedValue(99999),
                    getGenesisHash: vi.fn().mockResolvedValue('hash'),
                };
            });

            const connection = new SteroidConnection('https://node1.com', {
                latencyScoring: true,
                healthCheckInterval: 0,
            }) as any;

            const scorerSpy = vi.spyOn(connection.scorer, 'recordSlot');
            
            await connection.checkNodeHealth('https://node1.com');

            expect(scorerSpy).toHaveBeenCalledWith('https://node1.com', 99999);
            expect(connection.getHealthStatus()[0].lastSlot).toBe(99999);
        });
    });
});
