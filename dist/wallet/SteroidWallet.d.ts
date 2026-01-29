import { PublicKey, Transaction, VersionedTransaction, TransactionSignature } from '@solana/web3.js';
import { SteroidSendOptions } from '../transaction/SteroidTransaction.js';
import { SteroidConnection } from '../connection/SteroidConnection.js';
/**
 * Minimal wallet interface that most Solana wallets implement.
 * Compatible with @solana/wallet-adapter.
 */
export interface WalletInterface {
    publicKey: PublicKey | null;
    signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
    signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]>;
    signMessage?(message: Uint8Array): Promise<Uint8Array>;
}
/**
 * Normalized wallet error types for consistent error handling.
 */
export declare enum WalletErrorType {
    NOT_CONNECTED = "NOT_CONNECTED",
    USER_REJECTED = "USER_REJECTED",
    NETWORK_MISMATCH = "NETWORK_MISMATCH",
    SIGNING_FAILED = "SIGNING_FAILED",
    UNSUPPORTED_OPERATION = "UNSUPPORTED_OPERATION",
    UNKNOWN = "UNKNOWN"
}
export declare class WalletError extends Error {
    type: WalletErrorType;
    originalError?: any | undefined;
    constructor(type: WalletErrorType, message: string, originalError?: any | undefined);
}
/**
 * Configuration for SteroidWallet behavior.
 */
export interface SteroidWalletConfig {
    /**
     * Validate network consistency before signing transactions.
     * @default true
     */
    validateNetwork?: boolean;
    /**
     * Expected genesis hash for network validation (optional).
     */
    expectedGenesisHash?: string;
    /**
     * Enable detailed logging.
     * @default false
     */
    enableLogging?: boolean;
    /**
     * Automatically refresh blockhash before signing if stale.
     * @default true
     */
    autoRefreshBlockhash?: boolean;
    /**
     * Maximum blockhash age in seconds before refresh.
     * @default 60
     */
    maxBlockhashAge?: number;
}
/**
 * SteroidWallet wraps any Solana wallet adapter and provides:
 * - Normalized error handling across different wallet implementations
 * - Network consistency validation
 * - Automatic transaction retry and confirmation
 * - Graceful degradation for missing wallet features
 */
export declare class SteroidWallet {
    private wallet;
    private connection;
    private txEngine;
    private config;
    private networkValidated;
    private genesisHash?;
    constructor(wallet: WalletInterface, connection: SteroidConnection, config?: SteroidWalletConfig);
    /**
     * Get the wallet's public key.
     */
    get publicKey(): PublicKey | null;
    /**
     * Signs and sends a transaction with full reliability guarantees.
     * Handles blockhash refresh, retries, and multi-node confirmation.
     */
    signAndSend(transaction: Transaction | VersionedTransaction, options?: SteroidSendOptions): Promise<TransactionSignature>;
    /**
     * Sign a transaction safely with normalized error handling.
     */
    signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
    /**
     * Sign multiple transactions safely.
     */
    signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]>;
    /**
     * Sign a message with standardized error handling.
     */
    signMessage(message: Uint8Array): Promise<Uint8Array>;
    /**
     * System-level state validation before operations.
     */
    private guardState;
    /**
     * Validates that the wallet and connection are on the same network.
     */
    private validateNetwork;
    /**
     * Ensures transaction has a fresh blockhash.
     */
    private ensureFreshBlockhash;
    /**
     * Safely sign a transaction with proper error handling.
     */
    private signTransactionSafe;
    /**
     * Normalizes different wallet errors into a consistent format.
     */
    private normalizeError;
    /**
     * Type guard for legacy transactions.
     */
    private isLegacyTransaction;
    private log;
    /**
     * Get network information.
     */
    getNetworkInfo(): {
        genesisHash?: string;
        validated: boolean;
    };
    /**
     * Force re-validation of network on next operation.
     */
    invalidateNetwork(): void;
    /**
     * Check if wallet supports message signing.
     */
    supportsMessageSigning(): boolean;
}
