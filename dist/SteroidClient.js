import { SteroidConnection } from './connection/SteroidConnection.js';
import { SteroidWallet } from './wallet/SteroidWallet.js';
import { SteroidTransaction } from './transaction/SteroidTransaction.js';
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
    connection;
    transactionEngine;
    config;
    isDestroyed = false;
    /**
     * Initialize a new SteroidClient.
     *
     * @param endpoint The primary Solana RPC endpoint (or array of endpoints)
     * @param config Optional configuration for connection and wallet behavior
     */
    constructor(endpoint, config = {}) {
        this.config = config;
        // Initialize resilient connection
        const primary = Array.isArray(endpoint) ? endpoint[0] : endpoint;
        const additionalFallbacks = Array.isArray(endpoint) ? endpoint.slice(1) : [];
        const connectionConfig = {
            enableLogging: config.enableLogging ?? false,
            ...config.connection,
            fallbacks: [...(config.connection?.fallbacks || []), ...additionalFallbacks],
            retrydelay: config.connection?.retrydelay ?? 500,
            healthCheckInterval: config.connection?.healthCheckInterval ?? 30000,
            requestTimeout: config.connection?.requestTimeout ?? 30000,
        };
        this.connection = new SteroidConnection(primary, connectionConfig);
        // Initialize transaction engine
        this.transactionEngine = new SteroidTransaction(this.connection);
        if (this.config.enableLogging) {
            console.log('[SteroidClient] Initialized with endpoint(s):', endpoint);
        }
    }
    /**
     * Connect a wallet to the Steroid reliability layer.
     *
     * @param wallet A standard Solana wallet adapter
     * @param walletConfig Optional overrides for this specific wallet
     * @returns A SteroidWallet instance with enhanced reliability
     */
    connectWallet(wallet, walletConfig = {}) {
        this.ensureNotDestroyed();
        const mergedConfig = {
            enableLogging: this.config.enableLogging,
            ...this.config.wallet,
            ...walletConfig,
        };
        return new SteroidWallet(wallet, this.connection, mergedConfig);
    }
    /**
     * Get the underlying transaction engine for advanced use cases.
     */
    getTransactionEngine() {
        this.ensureNotDestroyed();
        return this.transactionEngine;
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
        };
    }
    /**
     * Cleanup resources and stop background monitors.
     */
    destroy() {
        if (this.isDestroyed)
            return;
        this.connection.destroy();
        this.isDestroyed = true;
        if (this.config.enableLogging) {
            console.log('[SteroidClient] Destroyed');
        }
    }
    ensureNotDestroyed() {
        if (this.isDestroyed) {
            throw new Error('[SteroidClient] Instance is destroyed');
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