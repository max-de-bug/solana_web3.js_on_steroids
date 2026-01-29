import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Transaction, Keypair, SystemProgram, Connection } from '@solana/web3.js';
import { SteroidTransaction, TransactionState } from '../../src/transaction/SteroidTransaction.js';
import { SteroidConnection } from '../../src/connection/SteroidConnection.js';

// Create a mock SteroidConnection
function createMockSteroidConnection(overrides: Partial<any> = {}) {
  const mockConnection = {
    getLatestBlockhash: vi.fn().mockResolvedValue({
      blockhash: 'mockBlockhash123456789',
      lastValidBlockHeight: 100000,
    }),
    simulateTransaction: vi.fn().mockResolvedValue({
      value: {
        err: null,
        logs: ['Program log: success'],
      },
    }),
    sendRawTransaction: vi.fn().mockResolvedValue('mockSignature123456789'),
    getSignatureStatus: vi.fn().mockResolvedValue({
      value: {
        confirmationStatus: 'confirmed',
        err: null,
      },
    }),
    getEndpoints: vi.fn().mockReturnValue(['https://mock.solana.com']),
    getActiveEndpoint: vi.fn().mockReturnValue('https://mock.solana.com'),
    ...overrides,
  };

  return mockConnection as unknown as SteroidConnection;
}

function createTestTransaction(): Transaction {
  const payer = Keypair.generate();
  const recipient = Keypair.generate();
  
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipient.publicKey,
      lamports: 1000000,
    })
  );
  
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = 'mockBlockhash123456789';
  tx.sign(payer);
  
  return tx;
}

describe('SteroidTransaction', () => {
  let mockConnection: ReturnType<typeof createMockSteroidConnection>;
  let transactionEngine: SteroidTransaction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnection = createMockSteroidConnection();
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
      
      expect(signature).toBe('mockSignature123456789');
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
      
      await expect(
        transactionEngine.sendAndConfirm(tx, {
          timeoutSeconds: 5,
          retryInterval: 100,
          skipPreflight: false,
        })
      ).rejects.toThrow('Simulation failed');
    });

    it('should throw on timeout', async () => {
      // Mock confirmation to never confirm
      mockConnection.getSignatureStatus = vi.fn().mockResolvedValue({
        value: null,
      });

      const tx = createTestTransaction();
      
      await expect(
        transactionEngine.sendAndConfirm(tx, {
          timeoutSeconds: 1,
          retryInterval: 200,
          skipPreflight: true,
        })
      ).rejects.toThrow(/not confirmed within/);
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
      
      expect(signature).toBe('mockSignature123456789');
    });
  });

  describe('Logging', () => {
    it('should log when enableLogging is true', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
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
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const tx = createTestTransaction();
      
      await transactionEngine.sendAndConfirm(tx, {
        timeoutSeconds: 5,
        retryInterval: 100,
        skipPreflight: true,
        enableLogging: false,
      });
      
      // Filter out any non-SteroidTransaction logs
      const steroidLogs = consoleSpy.mock.calls.filter(
        (call) => call[0]?.includes?.('[SteroidTransaction]')
      );
      expect(steroidLogs).toHaveLength(0);
      
      consoleSpy.mockRestore();
    });
  });
});
