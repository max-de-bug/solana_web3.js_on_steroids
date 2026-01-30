import { Connection } from '@solana/web3.js';
/**
 * Mock Connection class for testing RPC behavior
 */
export declare function createMockConnection(overrides?: Partial<Connection>): Connection;
/**
 * Create a mock connection that fails on first N attempts then succeeds
 */
export declare function createFailingMockConnection(failCount: number, errorMessage?: string): Connection;
/**
 * Create a mock connection that simulates rate limiting
 */
export declare function createRateLimitedMockConnection(rateLimitUntilAttempt: number): Connection;
/**
 * Create a mock connection that simulates node failure
 */
export declare function createNodeFailureMockConnection(): Connection;
/**
 * Reset all mocks on a mock connection
 */
export declare function resetConnectionMocks(connection: Connection): void;
