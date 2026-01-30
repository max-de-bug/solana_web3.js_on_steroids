import { PublicKey, Transaction } from '@solana/web3.js';
/**
 * Create a test transaction for testing purposes
 */
export declare function createTestTransaction(feePayer?: PublicKey): Transaction;
/**
 * Create a transaction without blockhash for testing auto-fetch
 */
export declare function createTransactionWithoutBlockhash(feePayer?: PublicKey): Transaction;
/**
 * Create a signed test transaction (mock signature)
 */
export declare function createSignedTestTransaction(feePayer?: PublicKey): Transaction;
/**
 * Wait for a specified time (useful for testing async behavior)
 */
export declare function delay(ms: number): Promise<void>;
/**
 * Wait until a condition is true or timeout
 */
export declare function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs?: number, intervalMs?: number): Promise<void>;
/**
 * Measure execution time of an async function
 */
export declare function measureTime<T>(fn: () => Promise<T>): Promise<{
    result: T;
    durationMs: number;
}>;
/**
 * Assert that a promise rejects with a specific error type or message
 */
export declare function expectToReject(promise: Promise<any>, expectedMessage?: string | RegExp): Promise<Error>;
/**
 * Generate a random public key for testing
 */
export declare function randomPublicKey(): PublicKey;
