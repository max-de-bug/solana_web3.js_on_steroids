import { Transaction, VersionedTransaction } from '@solana/web3.js';
/**
 * Type guard for legacy transactions.
 */
export declare function isLegacyTransaction(transaction: Transaction | VersionedTransaction): transaction is Transaction;
/**
 * Type guard for versioned transactions.
 */
export declare function isVersionedTransaction(transaction: Transaction | VersionedTransaction): transaction is VersionedTransaction;
/**
 * Parse simulation errors into a human-readable format.
 */
export declare function parseSimulationError(simulationValue: any): string;
/**
 * Checks if an error indicates a blockhash expiration.
 */
export declare function isBlockhashExpiredError(error: any): boolean;
/**
 * Serialize transaction to bytes consistently.
 */
export declare function serializeTransaction(transaction: Transaction | VersionedTransaction): Buffer;
/**
 * Get blockhash from either Legacy or Versioned transaction.
 */
export declare function getTransactionBlockhash(transaction: Transaction | VersionedTransaction): string | undefined;
/**
 * Set blockhash on either Legacy or Versioned transaction.
 * For Versioned transactions, creates a new transaction with updated message.
 */
export declare function setTransactionBlockhash(transaction: Transaction | VersionedTransaction, blockhash: string, lastValidBlockHeight?: number): Transaction | VersionedTransaction;
/**
 * Check if a transaction has been signed.
 */
export declare function isTransactionSigned(transaction: Transaction | VersionedTransaction): boolean;
/**
 * Get last valid block height from transaction if available.
 */
export declare function getLastValidBlockHeight(transaction: Transaction | VersionedTransaction): number | undefined;
