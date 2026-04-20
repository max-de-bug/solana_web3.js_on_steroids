import { SteroidConnection } from '../connection/SteroidConnection.js';
import { SteroidWallet } from '../wallet/SteroidWallet.js';
import { SteroidTransaction } from '../transaction/SteroidTransaction.js';
import { DEFAULT_CONFIG } from '../types/SteroidWalletTypes.js';
import { Logger } from '../utils/index.js';
import { validateClientConfig, validateEndpointUrl } from '../utils/validation.js';
import { SteroidEventEmitter } from '../events/SteroidEventEmitter.js';
import { SteroidError, ErrorCode, ErrorCategory } from '../errors/index.js';
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
    connection;
    transactionEngine;
    config;
    logger;
    events;
    isDestroyed = false;
    /**
     * Initialize a new SteroidClient.
     *
     * @param endpoint The primary Solana RPC endpoint (or array of endpoints)
     * @param config Optional configuration for connection and wallet behavior
     */
    constructor(endpoint, config = {}) {
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
        const connectionConfig = {
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
        this.connection = new SteroidConnection(primary, connectionConfig, this.events);
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
    connectWallet(wallet, walletConfig = {}) {
        this.ensureNotDestroyed();
        const mergedConfig = {
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
    getTransactionEngine() {
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
    on(event, listener) {
        this.events.on(event, listener);
        return this;
    }
    /**
     * Unsubscribe from client events.
     */
    off(event, listener) {
        this.events.off(event, listener);
        return this;
    }
    /**
     * Subscribe to a client event once.
     */
    once(event, listener) {
        this.events.once(event, listener);
        return this;
    }
    /**
     * Trigger a manual health check across all RPC nodes.
     */
    async checkAllHealth() {
        this.ensureNotDestroyed();
        return await this.connection.checkHealth();
    }
    /**
     * Get detailed statistics about RPC performance and failovers.
     */
    getStats() {
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
    destroy() {
        if (this.isDestroyed)
            return;
        this.connection.destroy();
        this.events.removeAllListeners();
        this.isDestroyed = true;
        this.logger.info('Destroyed');
    }
    ensureNotDestroyed() {
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
export function createSteroidClient(endpoint, config) {
    return new SteroidClient(endpoint, config);
}
//# sourceMappingURL=SteroidClient.js.map