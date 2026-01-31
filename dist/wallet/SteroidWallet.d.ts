import { PublicKey, Transaction, VersionedTransaction, TransactionSignature } from '@solana/web3.js';
import { SteroidConnection } from '../connection/SteroidConnection.js';
import { WalletInterface, WalletErrorType, SteroidWalletConfig, SteroidSendOptions } from '../types/SteroidWalletTypes.js';
export declare class WalletError extends Error {
    type: WalletErrorType;
    originalError?: any | undefined;
    constructor(type: WalletErrorType, message: string, originalError?: any | undefined);
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
