import { describe, it, expect, vi } from 'vitest';
import { ClusterDetector, CLUSTER_GENESIS_HASHES } from '../../src/connection/ClusterDetector.js';

describe('ClusterDetector', () => {
  const MAINNET_HASH = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
  const DEVNET_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
  const TESTNET_HASH = '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY';

  describe('detectCluster', () => {
    it('should identify mainnet-beta', () => {
      expect(ClusterDetector.detectCluster(MAINNET_HASH)).toBe('mainnet-beta');
    });

    it('should identify devnet', () => {
      expect(ClusterDetector.detectCluster(DEVNET_HASH)).toBe('devnet');
    });

    it('should identify testnet', () => {
      expect(ClusterDetector.detectCluster(TESTNET_HASH)).toBe('testnet');
    });

    it('should return unknown for unrecognized hash', () => {
      expect(ClusterDetector.detectCluster('random-hash')).toBe('unknown');
    });
  });

  describe('isMainnet', () => {
    it('should return true for mainnet hash', () => {
      expect(ClusterDetector.isMainnet(MAINNET_HASH)).toBe(true);
    });

    it('should return false for other hashes', () => {
      expect(ClusterDetector.isMainnet(DEVNET_HASH)).toBe(false);
      expect(ClusterDetector.isMainnet('random')).toBe(false);
    });
  });

  describe('getClusterName', () => {
    it('should return friendly names', () => {
      expect(ClusterDetector.getClusterName('mainnet-beta')).toBe('Mainnet Beta');
      expect(ClusterDetector.getClusterName('devnet')).toBe('Devnet');
      expect(ClusterDetector.getClusterName('unknown')).toBe('Unknown Cluster');
    });
  });

  describe('detectFromConnection', () => {
    it('should detect cluster from connection object', async () => {
      const mockConn = {
        getGenesisHash: vi.fn().mockResolvedValue(MAINNET_HASH),
      } as any;

      const result = await ClusterDetector.detectFromConnection(mockConn);
      expect(result.cluster).toBe('mainnet-beta');
      expect(result.genesisHash).toBe(MAINNET_HASH);
    });

    it('should handle errors gracefully', async () => {
      const mockConn = {
        getGenesisHash: vi.fn().mockRejectedValue(new Error('RPC Error')),
      } as any;

      const result = await ClusterDetector.detectFromConnection(mockConn);
      expect(result.cluster).toBe('unknown');
      expect(result.genesisHash).toBe('');
    });
  });
});
