import { Transaction, VersionedTransaction } from '@solana/web3.js';
/**
 * Type guard for legacy transactions.
 */
export declare function isLegacyTransaction(transaction: Transaction | VersionedTransaction): transaction is Transaction;
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
