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
import { Logger } from '../utils/index.js';
import { validateClientConfig, validateEndpointUrl } from '../utils/validation.js';
import { SteroidEventEmitter, SteroidEventMap } from '../events/SteroidEventEmitter.js';
import { SteroidError, ErrorCode, ErrorCategory } from '../errors/index.js';
import type { Connection } from '@solana/web3.js';

/**
 * SteroidClient is the main entry point for the Wallet UX Reliability Layer.
 *
 * Features:
 * - Resilient RPC connections with automatic failover
 * - Smart transaction handling with retries and blockhash refresh
 * - Normalized wallet error handling
 * - Production-grade reliability out of the box
 *
 * @example
 * ```ts
 * const client = new SteroidClient('https://api.mainnet-beta.solana.com', {
 *   connection: { fallbacks: ['https://solana-mainnet.rpc.extrnode.com'], raceNodes: 2 },
 *   enableLogging: true,
 * });
 *
 * const balance = await client.connection.getBalance(myPublicKey);
 * ```
 */
export class SteroidClient {
  /**
   * Resilient RPC handle: forwards `Connection` methods via an internal Proxy (see SteroidConnection).
   */
  public readonly connection: SteroidConnection & Connection;
  private transactionEngine: SteroidTransaction;
  private config: SteroidClientConfig;
  private logger: Logger;
  private events: SteroidEventEmitter;
  private isDestroyed: boolean = false;

  /**
   * Initialize a new SteroidClient.
   * 
   * @param endpoint The primary Solana RPC endpoint (or array of endpoints)
   * @param config Optional configuration for connection and wallet behavior
   */
  constructor(endpoint: string | string[], config: SteroidClientConfig = {}) {
    // Validate config at construction time
    validateClientConfig(config);

    this.config = config;
    
    // Initialize resilient connection
    const endpoints = Array.isArray(endpoint) ? endpoint : [endpoint];
    if (endpoints.length === 0) {
      throw new TypeError('At least one endpoint URL must be provided');
    }
    endpoints.forEach(validateEndpointUrl);

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

    this.logger = new Logger('SteroidClient', config.enableLogging ?? false);
    this.events = new SteroidEventEmitter();
    
    this.connection = new SteroidConnection(primary, connectionConfig, this.events) as SteroidConnection & Connection;
    this.transactionEngine = new SteroidTransaction(this.connection, this.events);
    
    this.logger.info('Initialized with endpoint(s):', endpoint);
  }

  /**
   * Connect a wallet to the Steroid reliability layer.
   *
   * @param wallet A standard Solana wallet adapter
   * @param walletConfig Optional overrides for this specific wallet
   * @returns A SteroidWallet instance with enhanced reliability
   *
   * @example
   * ```ts
   * const steroidWallet = client.connectWallet(walletAdapter);
   * const sig = await steroidWallet.signAndSend(transaction);
   * ```
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

    return new SteroidWallet(wallet, this.connection, mergedConfig, this.events);
  }

  /**
   * Get the underlying transaction engine for advanced use cases.
   */
  public getTransactionEngine(): SteroidTransaction {
    this.ensureNotDestroyed();
    return this.transactionEngine;
  }

  /**
   * Subscribe to client events (transactions, connection, health).
   *
   * @example
   * ```ts
   * client.on('transaction:confirmed', ({ signature, durationMs }) => {
   *   console.log(`Landed in ${durationMs}ms!`);
   * });
   * ```
   */
  public on<K extends keyof SteroidEventMap>(
    event: K,
    listener: (data: SteroidEventMap[K]) => void
  ): this {
    this.events.on(event, listener);
    return this;
  }

  /**
   * Unsubscribe from client events.
   */
  public off<K extends keyof SteroidEventMap>(
    event: K,
    listener: (data: SteroidEventMap[K]) => void
  ): this {
    this.events.off(event, listener);
    return this;
  }

  /**
   * Subscribe to a client event once.
   */
  public once<K extends keyof SteroidEventMap>(
    event: K,
    listener: (data: SteroidEventMap[K]) => void
  ): this {
    this.events.once(event, listener);
    return this;
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
      detectedCluster: this.connection.getCluster(),
    };
  }

  /**
   * Cleanup resources and stop background monitors.
   */
  public destroy(): void {
    if (this.isDestroyed) return;

    this.connection.destroy();
    this.events.removeAllListeners();
    this.isDestroyed = true;

    this.logger.info('Destroyed');
  }

  private ensureNotDestroyed(): void {
    if (this.isDestroyed) {
      throw new SteroidError({
        code: ErrorCode.INTERNAL_ERROR,
        category: ErrorCategory.SYSTEM,
        userMessage: 'Client instance is destroyed',
        suggestion: 'Create a new SteroidClient instance to continue',
      });
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