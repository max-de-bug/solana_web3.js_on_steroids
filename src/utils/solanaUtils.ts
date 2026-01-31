import { 
  Transaction, 
  VersionedTransaction, 
  TransactionExpiredBlockheightExceededError 
} from '@solana/web3.js';

/**
 * Type guard for legacy transactions.
 */
export function isLegacyTransaction(
  transaction: Transaction | VersionedTransaction
): transaction is Transaction {
  return 'recentBlockhash' in transaction;
}

/**
 * Parse simulation errors into a human-readable format.
 */
export function parseSimulationError(simulationValue: any): string {
  const logs = simulationValue.logs || [];
  const errorLog = logs.find((l: string) => 
    l.includes('Error:') || l.includes('failed') || l.includes('custom program error')
  );

  if (errorLog) return errorLog;

  if (simulationValue.err) {
    if (typeof simulationValue.err === 'string') return simulationValue.err;
    if (simulationValue.err.InstructionError) {
      const [index, error] = simulationValue.err.InstructionError;
      return `Instruction ${index} failed: ${JSON.stringify(error)}`;
    }
    return JSON.stringify(simulationValue.err);
  }

  return 'Unknown simulation error';
}

/**
 * Checks if an error indicates a blockhash expiration.
 */
export function isBlockhashExpiredError(error: any): boolean {
  return (
    error instanceof TransactionExpiredBlockheightExceededError ||
    error.message?.includes('block height exceeded') ||
    error.message?.includes('blockhash not found')
  );
}

/**
 * Serialize transaction to bytes consistently.
 */
export function serializeTransaction(transaction: Transaction | VersionedTransaction): Buffer {
  if (isLegacyTransaction(transaction)) {
    return transaction.serialize();
  }
  return Buffer.from((transaction as VersionedTransaction).serialize());
}
