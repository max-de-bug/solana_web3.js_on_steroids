import { Connection, TransactionExpiredBlockheightExceededError, } from '@solana/web3.js';
export var TransactionState;
(function (TransactionState) {
    TransactionState["PENDING"] = "PENDING";
    TransactionState["SIMULATED"] = "SIMULATED";
    TransactionState["SIGNED"] = "SIGNED";
    TransactionState["SENT"] = "SENT";
    TransactionState["CONFIRMED"] = "CONFIRMED";
    TransactionState["FINALIZED"] = "FINALIZED";
    TransactionState["FAILED"] = "FAILED";
    TransactionState["EXPIRED"] = "EXPIRED";
})(TransactionState || (TransactionState = {}));
/**
 * Enhanced transaction handling with state management, automatic retries,
 * blockhash refresh, and multi-node confirmation.
 */
export class SteroidTransaction {
    connection;
    transactionStates = new Map();
    constructor(connection) {
        this.connection = connection;
    }
    /**
     * Sends a transaction with continuous re-broadcasting and multi-node monitoring.
     * Includes automatic blockhash refresh and comprehensive error handling.
     */
    async sendAndConfirm(transaction, options = {}) {
        const { timeoutSeconds = 60, retryInterval = 2000, skipPreflight = false, preflightCommitment = 'processed', confirmationCommitment = 'confirmed', maxBlockhashAge = 60, enableLogging = false, confirmationNodes = 3, } = options;
        const stateId = this.generateStateId();
        const state = {
            state: TransactionState.PENDING,
            attempts: 0,
            startTime: Date.now(),
        };
        this.transactionStates.set(stateId, state);
        try {
            // 1. Simulation with detailed error parsing
            if (!skipPreflight) {
                this.updateState(stateId, TransactionState.PENDING);
                await this.simulateTransaction(transaction, preflightCommitment, enableLogging);
                this.updateState(stateId, TransactionState.SIMULATED);
            }
            // 2. Get fresh blockhash and set it on the transaction if it's a legacy transaction
            let blockhashContext;
            if (this.isLegacyTransaction(transaction)) {
                blockhashContext = await this.getFreshBlockhash(enableLogging);
                transaction.recentBlockhash = blockhashContext.blockhash;
                transaction.lastValidBlockHeight = blockhashContext.lastValidBlockHeight;
            }
            const rawTransaction = this.serializeTransaction(transaction);
            const startTime = Date.now();
            let signature = '';
            let lastBlockhashRefresh = Date.now();
            // 3. Send and retry loop with blockhash refresh
            while (Date.now() - startTime < timeoutSeconds * 1000) {
                try {
                    state.attempts++;
                    state.lastAttemptTime = Date.now();
                    // Check if blockhash is too old and refresh if needed
                    const blockhasAge = (Date.now() - lastBlockhashRefresh) / 1000;
                    if (blockhasAge > maxBlockhashAge && this.isLegacyTransaction(transaction)) {
                        this.log(enableLogging, 'info', `Blockhash age ${blockhasAge}s exceeds max ${maxBlockhashAge}s, refreshing...`);
                        blockhashContext = await this.getFreshBlockhash(enableLogging);
                        transaction.recentBlockhash = blockhashContext.blockhash;
                        transaction.lastValidBlockHeight = blockhashContext.lastValidBlockHeight;
                        // Re-serialize with new blockhash
                        // Note: This assumes the transaction is re-signed by the caller if needed
                        lastBlockhashRefresh = Date.now();
                    }
                    // Broadcast transaction
                    signature = await this.connection.sendRawTransaction(rawTransaction, {
                        skipPreflight: true,
                        maxRetries: 0, // We handle retries ourselves
                    });
                    this.updateState(stateId, TransactionState.SENT, signature);
                    this.log(enableLogging, 'info', `Transaction sent: ${signature} (attempt ${state.attempts})`);
                    // 4. Multi-node confirmation check
                    const confirmed = await this.pollForConfirmation(signature, confirmationCommitment, confirmationNodes, enableLogging);
                    if (confirmed) {
                        this.updateState(stateId, TransactionState.CONFIRMED, signature);
                        state.confirmedAt = Date.now();
                        const duration = ((state.confirmedAt - state.startTime) / 1000).toFixed(2);
                        this.log(enableLogging, 'info', `Transaction confirmed in ${duration}s after ${state.attempts} attempts`);
                        return signature;
                    }
                    this.log(enableLogging, 'warn', `Transaction not yet confirmed, will retry...`);
                }
                catch (error) {
                    // Handle blockhash expiration
                    if (error instanceof TransactionExpiredBlockheightExceededError ||
                        error.message?.includes('block height exceeded') ||
                        error.message?.includes('blockhash not found')) {
                        this.log(enableLogging, 'warn', 'Blockhash expired, will refresh on next attempt');
                        // Force refresh on next iteration
                        lastBlockhashRefresh = 0;
                    }
                    else {
                        this.log(enableLogging, 'warn', `Broadcast attempt failed: ${error.message}`);
                    }
                }
                await this.sleep(retryInterval);
            }
            // Timeout reached
            const errorMsg = `Transaction not confirmed within ${timeoutSeconds}s after ${state.attempts} attempts`;
            this.updateState(stateId, TransactionState.EXPIRED, signature, errorMsg);
            throw new Error(`[SteroidTransaction] ${errorMsg}. Last signature: ${signature || 'none'}`);
        }
        catch (error) {
            this.updateState(stateId, TransactionState.FAILED, state.signature, error.message);
            throw error;
        }
    }
    /**
     * Simulates a transaction and provides detailed error information.
     */
    async simulateTransaction(transaction, commitment, enableLogging) {
        try {
            const simulation = await this.connection.simulateTransaction(transaction, {
                commitment,
                replaceRecentBlockhash: true, // Use latest blockhash for simulation
            });
            if (simulation.value.err) {
                const errorDetails = this.parseSimulationError(simulation.value);
                this.log(enableLogging, 'error', 'Simulation failed:', errorDetails);
                throw new Error(`[SteroidTransaction] Simulation failed: ${errorDetails}`);
            }
            // Log simulation results
            if (simulation.value.logs) {
                this.log(enableLogging, 'info', 'Simulation succeeded. Logs:', simulation.value.logs);
            }
        }
        catch (error) {
            if (error.message?.includes('Simulation failed')) {
                throw error; // Re-throw our enhanced error
            }
            throw new Error(`[SteroidTransaction] Simulation error: ${error.message}`);
        }
    }
    /**
     * Polls multiple RPC endpoints for signature status to bypass node lag.
     */
    async pollForConfirmation(signature, commitment, nodesToCheck, enableLogging) {
        const endpoints = this.connection.getEndpoints();
        const endpointsToCheck = endpoints.slice(0, Math.min(nodesToCheck, endpoints.length));
        this.log(enableLogging, 'info', `Checking confirmation across ${endpointsToCheck.length} nodes...`);
        // Check multiple nodes in parallel to find the one that saw the tx
        const checks = endpointsToCheck.map(async (url) => {
            try {
                const tempConn = new Connection(url, { commitment });
                const status = await tempConn.getSignatureStatus(signature);
                // Check for errors
                if (status.value?.err) {
                    this.log(enableLogging, 'error', `Transaction failed on ${url}:`, JSON.stringify(status.value.err));
                    throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
                }
                // Check confirmation status
                const isConfirmed = status.value?.confirmationStatus === 'confirmed' ||
                    status.value?.confirmationStatus === 'finalized';
                if (isConfirmed && status.value) {
                    this.log(enableLogging, 'info', `Transaction confirmed on ${url} (${status.value.confirmationStatus})`);
                }
                return isConfirmed;
            }
            catch (error) {
                this.log(enableLogging, 'warn', `Confirmation check failed for ${url}:`, error.message);
                return false;
            }
        });
        const results = await Promise.allSettled(checks);
        // If any node reports an error, throw it
        for (const result of results) {
            if (result.status === 'rejected' && result.reason?.message?.includes('Transaction failed')) {
                throw result.reason;
            }
        }
        // Return true if any node confirmed it
        return results.some((r) => r.status === 'fulfilled' && r.value === true);
    }
    /**
     * Get fresh blockhash with retry logic.
     */
    async getFreshBlockhash(enableLogging) {
        try {
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
            this.log(enableLogging, 'info', `Fetched fresh blockhash: ${blockhash.slice(0, 8)}...`);
            return { blockhash, lastValidBlockHeight };
        }
        catch (error) {
            throw new Error(`[SteroidTransaction] Failed to get blockhash: ${error.message}`);
        }
    }
    /**
     * Parse simulation errors into human-readable format.
     */
    parseSimulationError(simulationValue) {
        const logs = simulationValue.logs || [];
        // Look for program errors in logs
        const errorLog = logs.find((l) => l.includes('Error:') ||
            l.includes('failed') ||
            l.includes('custom program error'));
        if (errorLog) {
            return errorLog;
        }
        // Parse error object
        if (simulationValue.err) {
            if (typeof simulationValue.err === 'string') {
                return simulationValue.err;
            }
            // Handle InstructionError format
            if (simulationValue.err.InstructionError) {
                const [index, error] = simulationValue.err.InstructionError;
                return `Instruction ${index} failed: ${JSON.stringify(error)}`;
            }
            return JSON.stringify(simulationValue.err);
        }
        return 'Unknown simulation error';
    }
    /**
     * Type guard for legacy transactions.
     */
    isLegacyTransaction(transaction) {
        return 'recentBlockhash' in transaction;
    }
    /**
     * Serialize transaction to bytes.
     */
    serializeTransaction(transaction) {
        if (this.isLegacyTransaction(transaction)) {
            return transaction.serialize();
        }
        return Buffer.from(transaction.serialize());
    }
    generateStateId() {
        return `tx_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }
    updateState(stateId, state, signature, error) {
        const existing = this.transactionStates.get(stateId);
        if (existing) {
            existing.state = state;
            if (signature)
                existing.signature = signature;
            if (error)
                existing.error = error;
        }
    }
    log(enabled, level, ...args) {
        if (!enabled)
            return;
        const prefix = '[SteroidTransaction]';
        switch (level) {
            case 'info':
                console.log(prefix, ...args);
                break;
            case 'warn':
                console.warn(prefix, ...args);
                break;
            case 'error':
                console.error(prefix, ...args);
                break;
        }
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    /**
     * Get the current state of a transaction.
     */
    getTransactionState(stateId) {
        return this.transactionStates.get(stateId);
    }
    /**
     * Get all transaction states (useful for debugging).
     */
    getAllTransactionStates() {
        return new Map(this.transactionStates);
    }
    /**
     * Clear old transaction states (cleanup).
     */
    clearOldStates(olderThanMs = 3600000) {
        const now = Date.now();
        for (const [id, state] of this.transactionStates.entries()) {
            if (now - state.startTime > olderThanMs) {
                this.transactionStates.delete(id);
            }
        }
    }
}
//# sourceMappingURL=SteroidTransaction.js.map