import { Transaction, SendOptions, TransactionSignature, VersionedTransaction, Commitment } from '@solana/web3.js';
import { SteroidConnection } from '../connection/SteroidConnection.js';
export interface SteroidSendOptions extends SendOptions {
    /**
     * Maximum number of seconds to retry sending.
     * @default 60
     */
    timeoutSeconds?: number;
    /**
     * Delay between re-broadcasts in milliseconds.
     * @default 2000
     */
    retryInterval?: number;
    /**
     * Commitment level for confirmation.
     * @default 'confirmed'
     */
    confirmationCommitment?: Commitment;
    /**
     * Maximum age of blockhash in seconds before refreshing.
     * @default 60
     */
    maxBlockhashAge?: number;
    /**
     * Enable detailed logging.
     * @default false
     */
    enableLogging?: boolean;
    /**
     * Number of nodes to check for confirmation.
     * @default 3
     */
    confirmationNodes?: number;
}
export declare enum TransactionState {
    PENDING = "PENDING",
    SIMULATED = "SIMULATED",
    SIGNED = "SIGNED",
    SENT = "SENT",
    CONFIRMED = "CONFIRMED",
    FINALIZED = "FINALIZED",
    FAILED = "FAILED",
    EXPIRED = "EXPIRED"
}
export interface TransactionStateInfo {
    state: TransactionState;
    signature?: string;
    error?: string;
    attempts: number;
    startTime: number;
    lastAttemptTime?: number;
    confirmedAt?: number;
}
/**
 * Enhanced transaction handling with state management, automatic retries,
 * blockhash refresh, and multi-node confirmation.
 */
export declare class SteroidTransaction {
    private connection;
    private transactionStates;
    constructor(connection: SteroidConnection);
    /**
     * Sends a transaction with continuous re-broadcasting and multi-node monitoring.
     * Includes automatic blockhash refresh and comprehensive error handling.
     */
    sendAndConfirm(transaction: Transaction | VersionedTransaction, options?: SteroidSendOptions): Promise<TransactionSignature>;
    /**
     * Simulates a transaction and provides detailed error information.
     */
    private simulateTransaction;
    /**
     * Polls multiple RPC endpoints for signature status to bypass node lag.
     */
    private pollForConfirmation;
    /**
     * Get fresh blockhash with retry logic.
     */
    private getFreshBlockhash;
    /**
     * Parse simulation errors into human-readable format.
     */
    private parseSimulationError;
    /**
     * Type guard for legacy transactions.
     */
    private isLegacyTransaction;
    /**
     * Serialize transaction to bytes.
     */
    private serializeTransaction;
    private generateStateId;
    private updateState;
    private log;
    private sleep;
    /**
     * Get the current state of a transaction.
     */
    getTransactionState(stateId: string): TransactionStateInfo | undefined;
    /**
     * Get all transaction states (useful for debugging).
     */
    getAllTransactionStates(): Map<string, TransactionStateInfo>;
    /**
     * Clear old transaction states (cleanup).
     */
    clearOldStates(olderThanMs?: number): void;
}
