import { vi } from 'vitest';
/**
 * Mock Connection class for testing RPC behavior
 */
export function createMockConnection(overrides = {}) {
    const mockConnection = {
        getSlot: vi.fn().mockResolvedValue(12345),
        getLatestBlockhash: vi.fn().mockResolvedValue({
            blockhash: '5eykt4UsFv8P8NJdTREpY1vzqBUfSmRciL826HUBRkEA',
            lastValidBlockHeight: 100000,
        }),
        getGenesisHash: vi.fn().mockResolvedValue('5eykt4UsFv8P8NJdTREpY1vzqBUfSmRciL826HUBRkEA'),
        simulateTransaction: vi.fn().mockResolvedValue({
            value: {
                err: null,
                logs: ['Log: success'],
            },
        }),
        sendRawTransaction: vi.fn().mockResolvedValue('2z7vAnS1uh1981S88mnyfFp72R1X54D2t7S1vC9S2mnyfFp72R1X54D2t7S1vC9S2mnyfFp72R1X54D2t7S1vC9S2mnyfFp72R1X'),
        getSignatureStatus: vi.fn().mockResolvedValue({
            value: {
                confirmationStatus: 'confirmed',
                err: null,
            },
        }),
        confirmTransaction: vi.fn().mockResolvedValue({
            value: { err: null },
        }),
        ...overrides,
    };
    return mockConnection;
}
/**
 * Create a mock connection that fails on first N attempts then succeeds
 */
export function createFailingMockConnection(failCount, errorMessage = 'Connection failed') {
    let attempts = 0;
    return {
        getSlot: vi.fn().mockImplementation(() => {
            attempts++;
            if (attempts <= failCount) {
                return Promise.reject(new Error(errorMessage));
            }
            return Promise.resolve(12345);
        }),
        getLatestBlockhash: vi.fn().mockResolvedValue({
            blockhash: '5eykt4UsFv8P8NJdTREpY1vzqBUfSmRciL826HUBRkEA',
            lastValidBlockHeight: 100000,
        }),
        getGenesisHash: vi.fn().mockResolvedValue('mockGenesisHash123456789'),
        simulateTransaction: vi.fn().mockResolvedValue({
            value: { err: null, logs: [] },
        }),
        sendRawTransaction: vi.fn().mockResolvedValue('mockSignature123456789'),
        getSignatureStatus: vi.fn().mockResolvedValue({
            value: { confirmationStatus: 'confirmed', err: null },
        }),
    };
}
/**
 * Create a mock connection that simulates rate limiting
 */
export function createRateLimitedMockConnection(rateLimitUntilAttempt) {
    let attempts = 0;
    return {
        getSlot: vi.fn().mockImplementation(() => {
            attempts++;
            if (attempts <= rateLimitUntilAttempt) {
                const error = new Error('Too many requests - 429');
                error.statusCode = 429;
                return Promise.reject(error);
            }
            return Promise.resolve(12345);
        }),
        getLatestBlockhash: vi.fn().mockResolvedValue({
            blockhash: '5eykt4UsFv8P8NJdTREpY1vzqBUfSmRciL826HUBRkEA',
            lastValidBlockHeight: 100000,
        }),
    };
}
/**
 * Create a mock connection that simulates node failure
 */
export function createNodeFailureMockConnection() {
    return {
        getSlot: vi.fn().mockRejectedValue(new Error('fetch failed')),
        getLatestBlockhash: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
        sendRawTransaction: vi.fn().mockRejectedValue(new Error('503 Service Unavailable')),
    };
}
/**
 * Reset all mocks on a mock connection
 */
export function resetConnectionMocks(connection) {
    Object.values(connection).forEach((value) => {
        if (typeof value === 'function' && 'mockClear' in value) {
            value.mockClear();
        }
    });
}
//# sourceMappingURL=connection.mock.js.map