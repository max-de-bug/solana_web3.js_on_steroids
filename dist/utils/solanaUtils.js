import { TransactionExpiredBlockheightExceededError } from '@solana/web3.js';
/**
 * Type guard for legacy transactions.
 */
export function isLegacyTransaction(transaction) {
    return 'recentBlockhash' in transaction;
}
/**
 * Parse simulation errors into a human-readable format.
 */
export function parseSimulationError(simulationValue) {
    const logs = simulationValue.logs || [];
    const errorLog = logs.find((l) => l.includes('Error:') || l.includes('failed') || l.includes('custom program error'));
    if (errorLog)
        return errorLog;
    if (simulationValue.err) {
        if (typeof simulationValue.err === 'string')
            return simulationValue.err;
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
export function isBlockhashExpiredError(error) {
    return (error instanceof TransactionExpiredBlockheightExceededError ||
        error.message?.includes('block height exceeded') ||
        error.message?.includes('blockhash not found'));
}
/**
 * Serialize transaction to bytes consistently.
 */
export function serializeTransaction(transaction) {
    if (isLegacyTransaction(transaction)) {
        return transaction.serialize();
    }
    return Buffer.from(transaction.serialize());
}
//# sourceMappingURL=solanaUtils.js.map