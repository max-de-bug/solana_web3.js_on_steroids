import { SteroidWallet } from '../wallet/SteroidWallet.js';
import { SteroidTransaction } from '../transaction/SteroidTransaction.js';
import { SteroidClientConfig, SteroidWalletConfig, ClientStats, RPCHealth, WalletInterface } from '../types/SteroidWalletTypes.js';
/**
 * SteroidClient is the main entry point for the Wallet UX Reliability Layer.
 *
 * Features:
 * - Resilient RPC connections with automatic failover
 * - Smart transaction handling with retries and blockhash refresh
 * - Normalized wallet error handling
 * - Production-grade reliability out of the box
 */
export declare class SteroidClient {
    private connection;
    private transactionEngine;
    private config;
    private isDestroyed;
    /**
     * Initialize a new SteroidClient.
     *
     * @param endpoint The primary Solana RPC endpoint (or array of endpoints)
     * @param config Optional configuration for connection and wallet behavior
     */
    constructor(endpoint: string | string[], config?: SteroidClientConfig);
    /**
     * Connect a wallet to the Steroid reliability layer.
     *
     * @param wallet A standard Solana wallet adapter
     * @param walletConfig Optional overrides for this specific wallet
     * @returns A SteroidWallet instance with enhanced reliability
     */
    connectWallet(wallet: WalletInterface, walletConfig?: SteroidWalletConfig): SteroidWallet;
    /**
     * Get the underlying transaction engine for advanced use cases.
     */
    getTransactionEngine(): SteroidTransaction;
    /**
     * Trigger a manual health check across all RPC nodes.
     */
    checkAllHealth(): Promise<RPCHealth[]>;
    /**
     * Get detailed statistics about RPC performance and failovers.
     */
    getStats(): ClientStats;
    /**
     * Cleanup resources and stop background monitors.
     */
    destroy(): void;
    private ensureNotDestroyed;
}
/**
 * Convenience factory function to create a SteroidClient.
 */
export declare function createSteroidClient(endpoint: string | string[], config?: SteroidClientConfig): SteroidClient;
