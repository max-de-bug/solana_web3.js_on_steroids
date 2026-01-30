import { SteroidConnection } from '../connection/SteroidConnection.js';
import { SteroidWallet } from '../wallet/SteroidWallet.js';
import { SteroidTransaction } from '../transaction/SteroidTransaction.js';
import { 
  SteroidClientConfig, 
  SteroidWalletConfig,
  ClientStats,
  RPCHealth,
  SteroidConnectionConfig,
  WalletInterface,
  DEFAULT_CONFIG
} from '../types/SteroidWalletTypes.js';

/**
 * SteroidClient is the main entry point for the Wallet UX Reliability Layer.
 * 
 * Features:
 * - Resilient RPC connections with automatic failover
 * - Smart transaction handling with retries and blockhash refresh
 * - Normalized wallet error handling
 * - Production-grade reliability out of the box
 */
export class SteroidClient {
  private connection: SteroidConnection;
  private transactionEngine: SteroidTransaction;
  private config: SteroidClientConfig;
  private isDestroyed: boolean = false;

  /**
   * Initialize a new SteroidClient.
   * 
   * @param endpoint The primary Solana RPC endpoint (or array of endpoints)
   * @param config Optional configuration for connection and wallet behavior
   */
  constructor(endpoint: string | string[], config: SteroidClientConfig = {}) {
    this.config = config;
    
    // Initialize resilient connection
    const endpoints = Array.isArray(endpoint) ? endpoint : [endpoint];
    const [primary, ...additionalFallbacks] = endpoints;

    const connectionConfig: SteroidConnectionConfig = {
      ...DEFAULT_CONFIG.CONNECTION,
      ...config.connection,
      fallbacks: [
        ...(config.connection?.fallbacks || []),
        ...additionalFallbacks
      ],
      enableLogging: config.enableLogging ?? config.connection?.enableLogging ?? DEFAULT_CONFIG.CONNECTION.enableLogging,
    };

    this.connection = new SteroidConnection(primary, connectionConfig);
    this.transactionEngine = new SteroidTransaction(this.connection);
    
    this.log('info', 'Initialized with endpoint(s):', endpoint);
  }

  /**
   * Connect a wallet to the Steroid reliability layer.
   * 
   * @param wallet A standard Solana wallet adapter
   * @param walletConfig Optional overrides for this specific wallet
   * @returns A SteroidWallet instance with enhanced reliability
   */
  public connectWallet(
    wallet: WalletInterface,
    walletConfig: SteroidWalletConfig = {}
  ): SteroidWallet {
    this.ensureNotDestroyed();

    const mergedConfig: SteroidWalletConfig = {
      ...DEFAULT_CONFIG.WALLET,
      ...this.config.wallet,
      ...walletConfig,
      enableLogging: this.config.enableLogging ?? walletConfig.enableLogging ?? DEFAULT_CONFIG.WALLET.enableLogging,
    };

    return new SteroidWallet(wallet, this.connection, mergedConfig);
  }

  /**
   * Get the underlying transaction engine for advanced use cases.
   */
  public getTransactionEngine(): SteroidTransaction {
    this.ensureNotDestroyed();
    return this.transactionEngine;
  }

  /**
   * Trigger a manual health check across all RPC nodes.
   */
  public async checkAllHealth(): Promise<RPCHealth[]> {
    this.ensureNotDestroyed();
    return await this.connection.checkHealth();
  }

  /**
   * Get detailed statistics about RPC performance and failovers.
   */
  public getStats(): ClientStats {
    this.ensureNotDestroyed();
    return {
      activeEndpoint: this.connection.getActiveEndpoint(),
      allEndpoints: this.connection.getEndpoints(),
      failoverStats: this.connection.getFailoverStats(),
      healthStatus: this.connection.getHealthStatus(),
    };
  }

  /**
   * Cleanup resources and stop background monitors.
   */
  public destroy(): void {
    if (this.isDestroyed) return;
    
    this.connection.destroy();
    this.isDestroyed = true;
    
    this.log('info', 'Destroyed');
  }

  private ensureNotDestroyed(): void {
    if (this.isDestroyed) {
      throw new Error('[SteroidClient] Cannot execute operation: instance is already destroyed');
    }
  }

  private log(level: 'info' | 'warn' | 'error', ...args: any[]): void {
    if (!this.config.enableLogging) return;

    const prefix = '[SteroidClient]';
    const finalArgs = [...args];
    if (typeof finalArgs[0] === 'string') {
      finalArgs[0] = `${prefix} ${finalArgs[0]}`;
    } else {
      finalArgs.unshift(prefix);
    }

    switch (level) {
      case 'info':
        console.log(...finalArgs);
        break;
      case 'warn':
        console.warn(...finalArgs);
        break;
      case 'error':
        console.error(...finalArgs);
        break;
    }
  }
}

/**
 * Convenience factory function to create a SteroidClient.
 */
export function createSteroidClient(
  endpoint: string | string[],
  config?: SteroidClientConfig
): SteroidClient {
  return new SteroidClient(endpoint, config);
}