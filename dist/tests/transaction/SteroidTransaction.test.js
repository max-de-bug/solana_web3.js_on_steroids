import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockConnection } from '../mocks/connection.mock.js';
// shared mock state that all mocked Connection instances will use
let sharedMock = createMockConnection();
// Mock the Connection class to ensure SteroidConnection and internal temp connections use our mocks
vi.mock('@solana/web3.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        Connection: vi.fn().mockImplementation(function (url) {
            const mock = { ...sharedMock };
            mock._url = url;
            return mock;
        }),
    };
});
import { Transaction, Keypair, SystemProgram } from '@solana/web3.js';
import { SteroidTransaction } from '../../src/transaction/SteroidTransaction.js';
function createTestTransaction() {
    const payer = Keypair.generate();
    const recipient = Keypair.generate();
    const tx = new Transaction().add(SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: recipient.publicKey,
        lamports: 1000000,
    }));
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = '5eykt4UsFv8P8NJdTREpY1vzqBUfSmRciL826HUBRkEA';
    tx.sign(payer);
    return tx;
}
describe('SteroidTransaction', () => {
    let mockConnection;
    let transactionEngine;
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset shared mock and wrap it in a SteroidConnection
        sharedMock = createMockConnection({
            getEndpoints: vi.fn().mockReturnValue(['https://mock.solana.com']),
            getActiveEndpoint: vi.fn().mockReturnValue('https://mock.solana.com'),
        });
        mockConnection = sharedMock;
        transactionEngine = new SteroidTransaction(mockConnection);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });
    describe('Transaction State Management', () => {
        it('should track transaction states', () => {
            const states = transactionEngine.getAllTransactionStates();
            expect(states).toBeInstanceOf(Map);
        });
        it('should clear old transaction states', () => {
            transactionEngine.clearOldStates(0); // Clear all states
            const states = transactionEngine.getAllTransactionStates();
            expect(states.size).toBe(0);
        });
    });
    describe('sendAndConfirm', () => {
        it('should successfully send and confirm a transaction', async () => {
            const tx = createTestTransaction();
            const signature = await transactionEngine.sendAndConfirm(tx, {
                timeoutSeconds: 5,
                retryInterval: 100,
                skipPreflight: true,
            });
            expect(signature).toBe('2z7vAnS1uh1981S88mnyfFp72R1X54D2t7S1vC9S2mnyfFp72R1X54D2t7S1vC9S2mnyfFp72R1X54D2t7S1vC9S2mnyfFp72R1X');
            expect(mockConnection.sendRawTransaction).toHaveBeenCalled();
        });
        it('should simulate transaction before sending when skipPreflight is false', async () => {
            const tx = createTestTransaction();
            await transactionEngine.sendAndConfirm(tx, {
                timeoutSeconds: 5,
                retryInterval: 100,
                skipPreflight: false,
            });
            expect(mockConnection.simulateTransaction).toHaveBeenCalled();
        });
        it('should skip simulation when skipPreflight is true', async () => {
            const tx = createTestTransaction();
            await transactionEngine.sendAndConfirm(tx, {
                timeoutSeconds: 5,
                retryInterval: 100,
                skipPreflight: true,
            });
            expect(mockConnection.simulateTransaction).not.toHaveBeenCalled();
        });
        it('should refresh blockhash for legacy transactions', async () => {
            const tx = createTestTransaction();
            await transactionEngine.sendAndConfirm(tx, {
                timeoutSeconds: 5,
                retryInterval: 100,
                skipPreflight: true,
            });
            expect(mockConnection.getLatestBlockhash).toHaveBeenCalled();
        });
        it('should throw on simulation failure', async () => {
            mockConnection.simulateTransaction = vi.fn().mockResolvedValue({
                value: {
                    err: { InstructionError: [0, 'CustomError'] },
                    logs: ['Program log: Error: insufficient funds'],
                },
            });
            const tx = createTestTransaction();
            await expect(transactionEngine.sendAndConfirm(tx, {
                timeoutSeconds: 5,
                retryInterval: 100,
                skipPreflight: false,
            })).rejects.toThrow('Simulation failed');
        });
        it('should throw on timeout', async () => {
            // Mock confirmation to never confirm
            mockConnection.getSignatureStatus = vi.fn().mockResolvedValue({
                value: null,
            });
            const tx = createTestTransaction();
            await expect(transactionEngine.sendAndConfirm(tx, {
                timeoutSeconds: 1,
                retryInterval: 200,
                skipPreflight: true,
            })).rejects.toThrow(/not confirmed within/);
        }, 10000);
    });
    describe('Multi-node Confirmation', () => {
        it('should check confirmation across multiple endpoints', async () => {
            mockConnection.getEndpoints = vi.fn().mockReturnValue([
                'https://node1.solana.com',
                'https://node2.solana.com',
                'https://node3.solana.com',
            ]);
            const tx = createTestTransaction();
            const signature = await transactionEngine.sendAndConfirm(tx, {
                timeoutSeconds: 5,
                retryInterval: 100,
                skipPreflight: true,
                confirmationNodes: 3,
            });
            expect(signature).toBe('2z7vAnS1uh1981S88mnyfFp72R1X54D2t7S1vC9S2mnyfFp72R1X54D2t7S1vC9S2mnyfFp72R1X54D2t7S1vC9S2mnyfFp72R1X');
        });
    });
    describe('Logging', () => {
        it('should log when enableLogging is true', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
            const tx = createTestTransaction();
            await transactionEngine.sendAndConfirm(tx, {
                timeoutSeconds: 5,
                retryInterval: 100,
                skipPreflight: true,
                enableLogging: true,
            });
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
        it('should not log when enableLogging is false', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
            const tx = createTestTransaction();
            await transactionEngine.sendAndConfirm(tx, {
                timeoutSeconds: 5,
                retryInterval: 100,
                skipPreflight: true,
                enableLogging: false,
            });
            // Filter out any non-SteroidTransaction logs
            const steroidLogs = consoleSpy.mock.calls.filter((call) => call[0]?.includes?.('[SteroidTransaction]'));
            expect(steroidLogs).toHaveLength(0);
            consoleSpy.mockRestore();
        });
    });
});
//# sourceMappingURL=SteroidTransaction.test.js.map