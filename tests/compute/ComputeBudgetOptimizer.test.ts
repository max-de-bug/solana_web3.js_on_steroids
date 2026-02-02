import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Transaction, PublicKey, SystemProgram } from '@solana/web3.js';
import { ComputeBudgetOptimizer } from '../../src/compute/ComputeBudgetOptimizer.js';
import { createMockConnection } from '../mocks/connection.mock.js';

describe('ComputeBudgetOptimizer', () => {
  let mockConnection: any;
  let optimizer: ComputeBudgetOptimizer;

  beforeEach(() => {
    mockConnection = createMockConnection();
    optimizer = new ComputeBudgetOptimizer(mockConnection as any);
  });

  function createTestTx() {
    const tx = new Transaction();
    tx.add(
      SystemProgram.transfer({
        fromPubkey: PublicKey.unique(),
        toPubkey: PublicKey.unique(),
        lamports: 1000,
      })
    );
    tx.recentBlockhash = '5eykt4UsFv8P8NJdTREpY1vzqBUfSmRciL826HUBRkEA';
    return tx;
  }

  it('should estimate compute budget correctly', async () => {
    mockConnection.simulateTransaction.mockResolvedValue({
      value: { unitsConsumed: 1000, err: null }
    });
    mockConnection.getRecentPrioritizationFees.mockResolvedValue([
      { prioritizationFee: 100 },
      { prioritizationFee: 500 },
      { prioritizationFee: 1000 },
    ]);

    const estimate = await optimizer.estimateComputeBudget(createTestTx(), {
      unitMargin: 1.5,
      feePercentile: 50
    });

    expect(estimate.computeUnits).toBe(1500); // 1000 * 1.5
    expect(estimate.priorityFee).toBe(500); // 50th percentile of [100, 500, 1000]
  });

  it('should apply compute budget instructions to legacy transactions', async () => {
    mockConnection.simulateTransaction.mockResolvedValue({
      value: { unitsConsumed: 1000, err: null }
    });
    mockConnection.getRecentPrioritizationFees.mockResolvedValue([
      { prioritizationFee: 1000 }
    ]);

    const tx = createTestTx();
    const originalIxCount = tx.instructions.length;
    
    const optimizedTx = await optimizer.applyComputeBudget(tx);
    
    // Should add 2 instructions (CU limit and Price)
    expect(optimizedTx.instructions.length).toBe(originalIxCount + 2);
    expect(optimizedTx.instructions[0].programId.toBase58()).toBe('ComputeBudget111111111111111111111111111111');
  });

  it('should use default CU if simulation fails', async () => {
    mockConnection.simulateTransaction.mockResolvedValue({
      value: { err: { InstructionError: [0, 'fail'] } }
    });

    const estimate = await optimizer.estimateComputeBudget(createTestTx());
    expect(estimate.computeUnits).toBe(240000); // Default 200k * 1.2 margin
  });

  it('should respect maxPriorityFee cap', async () => {
    mockConnection.getRecentPrioritizationFees.mockResolvedValue([
      { prioritizationFee: 5000000 }
    ]);

    const estimate = await optimizer.estimateComputeBudget(createTestTx(), {
      maxPriorityFee: 100000
    });

    expect(estimate.priorityFee).toBe(100000);
  });
});
