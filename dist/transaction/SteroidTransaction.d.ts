import { Transaction, TransactionSignature, VersionedTransaction } from '@solana/web3.js';
import { SteroidConnection } from '../connection/SteroidConnection.js';
import { SteroidSendOptions, TransactionStateInfo } from '../types/SteroidWalletTypes.js';
import { SteroidEventEmitter } from '../events/SteroidEventEmitter.js';
/**
 * Enhanced transaction handling with state management, automatic retries,
 * blockhash refresh, and multi-node confirmation.
 */
export declare class SteroidTransaction {
    private static readonly DEFAULT_STATE_TTL_MS;
    private connection;
    private transactionStates;
    private logger;
    private emitter?;
    private computeOptimizer;
    constructor(connection: SteroidConnection, emitter?: SteroidEventEmitter);
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
    private updateState;
    /**
     * Checks if the abort signal has been triggered and throws if so.
     * @throws SteroidError with code ABORTED if signal is aborted
     */
    private checkAbortSignal;
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
