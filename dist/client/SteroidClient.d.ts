import { SteroidConnection } from '../connection/SteroidConnection.js';
import { SteroidWallet } from '../wallet/SteroidWallet.js';
import { SteroidTransaction } from '../transaction/SteroidTransaction.js';
import { SteroidClientConfig, SteroidWalletConfig, ClientStats, RPCHealth, WalletInterface } from '../types/SteroidWalletTypes.js';
import { SteroidEventMap } from '../events/SteroidEventEmitter.js';
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
export declare class SteroidClient {
    /**
     * Resilient RPC handle: forwards `Connection` methods via an internal Proxy (see SteroidConnection).
     */
    readonly connection: SteroidConnection & Connection;
    private transactionEngine;
    private config;
    private logger;
    private events;
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
     *
     * @example
     * ```ts
     * const steroidWallet = client.connectWallet(walletAdapter);
     * const sig = await steroidWallet.signAndSend(transaction);
     * ```
     */
    connectWallet(wallet: WalletInterface, walletConfig?: SteroidWalletConfig): SteroidWallet;
    /**
     * Get the underlying transaction engine for advanced use cases.
     */
    getTransactionEngine(): SteroidTransaction;
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
    on<K extends keyof SteroidEventMap>(event: K, listener: (data: SteroidEventMap[K]) => void): this;
    /**
     * Unsubscribe from client events.
     */
    off<K extends keyof SteroidEventMap>(event: K, listener: (data: SteroidEventMap[K]) => void): this;
    /**
     * Subscribe to a client event once.
     */
    once<K extends keyof SteroidEventMap>(event: K, listener: (data: SteroidEventMap[K]) => void): this;
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
