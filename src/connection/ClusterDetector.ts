import { Connection } from '@solana/web3.js';
import { ClusterType } from '../types/SteroidWalletTypes.js';

/**
 * Known genesis hashes for common Solana clusters.
 */
export const CLUSTER_GENESIS_HASHES: Record<string, ClusterType> = {
  '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': 'mainnet-beta',
  'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG': 'devnet',
  '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY': 'testnet',
};

/**
 * ClusterDetector identifies the Solana network based on its unique genesis hash.
 * This helps prevent accidentally sending transactions to the wrong network.
 */
export class ClusterDetector {
  /**
   * Identifies the cluster type based on the provided genesis hash.
   */
  static detectCluster(genesisHash: string): ClusterType {
    return CLUSTER_GENESIS_HASHES[genesisHash] || 'unknown';
  }

  /**
   * Checks if the genesis hash belongs to Mainnet Beta.
   */
  static isMainnet(genesisHash: string): boolean {
    return this.detectCluster(genesisHash) === 'mainnet-beta';
  }

  /**
   * Fetches the genesis hash and detects the cluster for a given connection.
   */
  static async detectFromConnection(connection: Connection): Promise<{ cluster: ClusterType; genesisHash: string }> {
    try {
      const genesisHash = await connection.getGenesisHash();
      const cluster = this.detectCluster(genesisHash);
      return { cluster, genesisHash };
    } catch (error) {
      return { cluster: 'unknown', genesisHash: '' };
    }
  }

  /**
   * Returns a friendly name for the cluster.
   */
  static getClusterName(cluster: ClusterType): string {
    switch (cluster) {
      case 'mainnet-beta': return 'Mainnet Beta';
      case 'devnet': return 'Devnet';
      case 'testnet': return 'Testnet';
      case 'localnet': return 'Localnet';
      default: return 'Unknown Cluster';
    }
  }
}
