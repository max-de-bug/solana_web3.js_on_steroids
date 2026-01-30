import { Transaction, TransactionSignature, VersionedTransaction } from '@solana/web3.js';
import { SteroidConnection } from '../connection/SteroidConnection.js';
import { SteroidSendOptions, TransactionStateInfo } from '../types/SteroidWalletTypes.js';
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
    private isBlockhashExpiredError;
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
