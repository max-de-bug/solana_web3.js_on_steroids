import { VersionedTransaction, TransactionExpiredBlockheightExceededError, MessageV0 } from '@solana/web3.js';
/**
 * Type guard for legacy transactions.
 */
export function isLegacyTransaction(transaction) {
    return 'recentBlockhash' in transaction;
}
/**
 * Type guard for versioned transactions.
 */
export function isVersionedTransaction(transaction) {
    return 'version' in transaction;
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
/**
 * Get blockhash from either Legacy or Versioned transaction.
 */
export function getTransactionBlockhash(transaction) {
    if (isLegacyTransaction(transaction)) {
        return transaction.recentBlockhash;
    }
    // For VersionedTransaction, blockhash is in the message
    return transaction.message.recentBlockhash;
}
/**
 * Set blockhash on either Legacy or Versioned transaction.
 * For Versioned transactions, creates a new transaction with updated message.
 */
export function setTransactionBlockhash(transaction, blockhash, lastValidBlockHeight) {
    if (isLegacyTransaction(transaction)) {
        transaction.recentBlockhash = blockhash;
        if (lastValidBlockHeight !== undefined) {
            transaction.lastValidBlockHeight = lastValidBlockHeight;
        }
        return transaction;
    }
    // For VersionedTransaction, create a new MessageV0 with updated blockhash
    const oldMessage = transaction.message;
    const newMessage = new MessageV0({
        header: oldMessage.header,
        staticAccountKeys: oldMessage.staticAccountKeys,
        recentBlockhash: blockhash,
        compiledInstructions: oldMessage.compiledInstructions,
        addressTableLookups: oldMessage.addressTableLookups,
    });
    return new VersionedTransaction(newMessage);
}
/**
 * Check if a transaction has been signed.
 */
export function isTransactionSigned(transaction) {
    if (isLegacyTransaction(transaction)) {
        return transaction.signatures.some(sig => sig.signature !== null);
    }
    // For versioned, check if there's any non-zero signature
    return transaction.signatures.length > 0 &&
        transaction.signatures.some(sig => sig.some(byte => byte !== 0));
}
/**
 * Get last valid block height from transaction if available.
 */
export function getLastValidBlockHeight(transaction) {
    if (isLegacyTransaction(transaction)) {
        return transaction.lastValidBlockHeight;
    }
    // VersionedTransaction doesn't store lastValidBlockHeight directly
    return undefined;
}
//# sourceMappingURL=solanaUtils.js.map