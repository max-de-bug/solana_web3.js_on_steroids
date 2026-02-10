import {
  Transaction,
  VersionedTransaction,
  ComputeBudgetProgram,
  TransactionInstruction,
  MessageV0
} from '@solana/web3.js';
import { SteroidConnection } from '../connection/SteroidConnection.js';
import { isLegacyTransaction, isVersionedTransaction, Logger } from '../utils/index.js';

/**
 * Compute budget estimation result.
 */
export interface ComputeBudgetEstimate {
  /** Estimated compute units required (including safety margin) */
  computeUnits: number;
  /** Priority fee in microLamports per compute unit */
  priorityFee: number;
  /** Total additional fee in lamports */
  totalFee: number;
}

/**
 * Configuration for compute budget optimization.
 */
export interface ComputeBudgetConfig {
  /** Safety margin multiplier for compute units (default: 1.2 = 20% buffer) */
  unitMargin?: number;
  /** Percentile of recent priority fees to use (default: 75) */
  feePercentile?: number;
  /** Maximum priority fee in microLamports (default: 1_000_000 = 1 lamport/CU) */
  maxPriorityFee?: number;
  /** Enable priority fee injection (default: true) */
  enablePriorityFees?: boolean;
  /** Enable compute unit limit injection (default: true) */
  enableComputeUnitLimit?: boolean;
}

const DEFAULT_COMPUTE_CONFIG: Required<ComputeBudgetConfig> = {
  unitMargin: 1.2,
  feePercentile: 75,
  maxPriorityFee: 1_000_000, // 1 lamport per CU max
  enablePriorityFees: true,
  enableComputeUnitLimit: true,
};

/**
 * ComputeBudgetOptimizer - Automatically estimates and injects optimal compute budgets.
 * 
 * Solves the common UX problem of transactions failing due to:
 * 1. Insufficient compute units (program complexity underestimated)
 * 2. Low priority fees during network congestion
 * 
 * Uses simulation to measure actual CU consumption and fetches recent
 * priority fees from the network to determine optimal values.
 */
export class ComputeBudgetOptimizer {
  private static readonly DEFAULT_COMPUTE_UNITS = 200_000;
  private static readonly MAX_COMPUTE_UNITS = 1_400_000;
  
  private connection: SteroidConnection;
  private logger: Logger;
  private feeCache: { fee: number; timestamp: number } | null = null;
  private static readonly FEE_CACHE_TTL_MS = 10000; // 10 seconds cache

  constructor(connection: SteroidConnection, enableLogging: boolean = false) {
    this.connection = connection;
    this.logger = new Logger('ComputeBudgetOptimizer', enableLogging);
  }

  /**
   * Estimate optimal compute budget for a transaction.
   * 
   * @param transaction - Transaction to analyze
   * @param config - Optional configuration overrides
   * @returns Estimated compute units and priority fee
   */
  async estimateComputeBudget(
    transaction: Transaction | VersionedTransaction,
    config: ComputeBudgetConfig = {}
  ): Promise<ComputeBudgetEstimate> {
    const mergedConfig = { ...DEFAULT_COMPUTE_CONFIG, ...config };

    // 1. Simulate to get actual compute units used
    const simulatedUnits = await this.simulateForComputeUnits(transaction);
    
    // 2. Apply safety margin
    const computeUnitsWithMargin = Math.min(
      Math.ceil(simulatedUnits * mergedConfig.unitMargin),
      ComputeBudgetOptimizer.MAX_COMPUTE_UNITS
    );

    // 3. Get priority fee from network
    let priorityFee = 0;
    if (mergedConfig.enablePriorityFees) {
      priorityFee = await this.fetchPriorityFee(mergedConfig.feePercentile);
      priorityFee = Math.min(priorityFee, mergedConfig.maxPriorityFee);
    }

    // 4. Calculate total fee
    const totalFee = Math.ceil((computeUnitsWithMargin * priorityFee) / 1_000_000);

    this.logger.info(
      `Estimated: ${computeUnitsWithMargin} CU (simulated: ${simulatedUnits}), ` +
      `priority: ${priorityFee} microLamports/CU, total fee: ${totalFee} lamports`
    );

    return {
      computeUnits: computeUnitsWithMargin,
      priorityFee,
      totalFee,
    };
  }

  /**
   * Apply compute budget instructions to a legacy transaction.
   * 
   * Injects SetComputeUnitLimit and SetComputeUnitPrice instructions
   * at the beginning of the transaction.
   * 
   * @param transaction - Legacy transaction to modify
   * @param config - Optional configuration overrides
   * @returns Modified transaction with compute budget instructions
   */
  async applyComputeBudget<T extends Transaction | VersionedTransaction>(
    transaction: T,
    config: ComputeBudgetConfig = {}
  ): Promise<T> {
    const isLegacy = isLegacyTransaction(transaction);
    const isVersioned = isVersionedTransaction(transaction);

    if (!isLegacy && !isVersioned) {
      this.logger.warn('applyComputeBudget: Unknown transaction type');
      return transaction;
    }

    const mergedConfig = { ...DEFAULT_COMPUTE_CONFIG, ...config };

    // Check if compute budget instructions already exist
    if (this.hasComputeBudgetInstructions(transaction)) {
      this.logger.info('Transaction already has compute budget instructions, skipping');
      return transaction;
    }

    const estimate = await this.estimateComputeBudget(transaction, config);
    const newInstructions: TransactionInstruction[] = [];

    // Add compute unit limit instruction
    if (mergedConfig.enableComputeUnitLimit) {
      newInstructions.push(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: estimate.computeUnits,
        })
      );
    }

    // Add priority fee instruction
    if (mergedConfig.enablePriorityFees && estimate.priorityFee > 0) {
      newInstructions.push(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: estimate.priorityFee,
        })
      );
    }

    // Prepend compute budget instructions
    if (newInstructions.length > 0) {
      if (isLegacy) {
        const legacyTx = transaction as Transaction;
        legacyTx.instructions = [...newInstructions, ...legacyTx.instructions];
      } else {
        const versionedTx = transaction as VersionedTransaction;
        // Reconstruct MessageV0 manually for maximum compatibility
        const oldMessage = versionedTx.message;
        const newMessage = new MessageV0({
          header: oldMessage.header,
          staticAccountKeys: oldMessage.staticAccountKeys,
          recentBlockhash: oldMessage.recentBlockhash,
          compiledInstructions: [
            ...newInstructions.map(ix => {
              const programIdIndex = oldMessage.staticAccountKeys.findIndex(key => key.equals(ix.programId));
              return {
                programIdIndex,
                accountKeyIndexes: ix.keys.map(key => oldMessage.staticAccountKeys.findIndex(k => k.equals(key.pubkey))),
                data: ix.data,
              };
            }).filter(ix => ix.programIdIndex !== -1),
            ...oldMessage.compiledInstructions
          ],
          addressTableLookups: oldMessage.addressTableLookups,
        });
        
        return new VersionedTransaction(newMessage) as any as T;
      }
      this.logger.info(`Injected ${newInstructions.length} compute budget instruction(s)`);
    }

    return transaction;
  }

  /**
   * Simulate transaction to measure compute unit consumption.
   */
  private async simulateForComputeUnits(
    transaction: Transaction | VersionedTransaction
  ): Promise<number> {
    try {
      const simulation = await (this.connection.getConnection() as any).simulateTransaction(transaction, {
        replaceRecentBlockhash: true,
        sigVerify: false,
      });

      if (simulation.value.err) {
        this.logger.warn('Simulation failed, using default compute units');
        return ComputeBudgetOptimizer.DEFAULT_COMPUTE_UNITS;
      }

      const unitsConsumed = simulation.value.unitsConsumed;
      if (typeof unitsConsumed === 'number' && unitsConsumed > 0) {
        this.logger.info(`Simulation consumed ${unitsConsumed} compute units`);
        return unitsConsumed;
      }

      return ComputeBudgetOptimizer.DEFAULT_COMPUTE_UNITS;
    } catch (error: any) {
      this.logger.warn(`Simulation error: ${error.message}, using default CU`);
      return ComputeBudgetOptimizer.DEFAULT_COMPUTE_UNITS;
    }
  }

  /**
   * Fetch recent priority fees from the network.
   * 
   * @param percentile - Percentile to use (0-100)
   * @returns Priority fee in microLamports per compute unit
   */
  private async fetchPriorityFee(percentile: number): Promise<number> {
    const now = Date.now();
    if (this.feeCache && now - this.feeCache.timestamp < ComputeBudgetOptimizer.FEE_CACHE_TTL_MS) {
      this.logger.info(`Using cached priority fee: ${this.feeCache.fee} microLamports/CU`);
      return this.feeCache.fee;
    }

    try {
      // getRecentPrioritizationFees returns fees for recent slots
      const fees = await this.connection.getConnection().getRecentPrioritizationFees();

      if (!Array.isArray(fees) || fees.length === 0) {
        this.logger.info('No recent priority fees available, using 0');
        return 0;
      }

      // Extract priority fees and sort
      const sortedFees = fees
        .map((f: any) => f.prioritizationFee)
        .filter((f: number) => typeof f === 'number')
        .sort((a: number, b: number) => a - b);

      if (sortedFees.length === 0) {
        return 0;
      }

      // Calculate percentile
      const index = Math.min(
        Math.floor((percentile / 100) * sortedFees.length),
        sortedFees.length - 1
      );
      
      const fee = sortedFees[index];
      this.feeCache = { fee, timestamp: now };
      this.logger.info(`Priority fee at ${percentile}th percentile: ${fee} microLamports/CU`);
      
      return fee;
    } catch (error: any) {
      this.logger.warn(`Failed to fetch priority fees: ${error.message}`);
      return 0;
    }
  }

  /**
   * Check if transaction already has compute budget instructions.
   */
  private hasComputeBudgetInstructions(transaction: Transaction | VersionedTransaction): boolean {
    const computeBudgetProgramId = ComputeBudgetProgram.programId.toBase58();
    
    if (isLegacyTransaction(transaction)) {
      return transaction.instructions.some(
        (ix) => ix.programId.toBase58() === computeBudgetProgramId
      );
    } else {
      const message = transaction.message;
      return message.compiledInstructions.some(
        (ix) => message.staticAccountKeys[ix.programIdIndex].toBase58() === computeBudgetProgramId
      );
    }
  }

  /**
   * Update logger state.
   */
  setLogging(enabled: boolean): void {
    this.logger.setEnabled(enabled);
  }
}
