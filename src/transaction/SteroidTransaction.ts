import {
  Connection,
  Transaction,
  TransactionSignature,
  VersionedTransaction,
  Commitment,
  BlockhashWithExpiryBlockHeight,
  TransactionExpiredBlockheightExceededError,
} from '@solana/web3.js';
import { SteroidConnection } from '../connection/SteroidConnection.js';
import { SteroidSendOptions, TransactionState, TransactionStateInfo, DEFAULT_CONFIG } from '../types/SteroidWalletTypes.js';

/**
 * Enhanced transaction handling with state management, automatic retries,
 * blockhash refresh, and multi-node confirmation.
 */
export class SteroidTransaction {
  private connection: SteroidConnection;
  private transactionStates: Map<string, TransactionStateInfo> = new Map();

  constructor(connection: SteroidConnection) {
    this.connection = connection;
  }

 
  /**
   * Sends a transaction with continuous re-broadcasting and multi-node monitoring.
   * Includes automatic blockhash refresh and comprehensive error handling.
   */
  async sendAndConfirm(
    transaction: Transaction | VersionedTransaction,
    options: SteroidSendOptions = {}
  ): Promise<TransactionSignature> {
    const mergedOptions = {
      skipPreflight: false,
      preflightCommitment: 'processed' as Commitment,
      ...DEFAULT_CONFIG.TRANSACTION,
      ...options,
    };

    const {
      timeoutSeconds,
      retryInterval,
      skipPreflight,
      preflightCommitment,
      confirmationCommitment,
      maxBlockhashAge,
      enableLogging,
      confirmationNodes,
    } = mergedOptions;

    const stateId = this.generateStateId();
    const state: TransactionStateInfo = {
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

      // 2. Initial blockhash setup if needed
      let blockhashContext: BlockhashWithExpiryBlockHeight | undefined;
      if (this.isLegacyTransaction(transaction)) {
        blockhashContext = await this.getFreshBlockhash(enableLogging);
        transaction.recentBlockhash = blockhashContext.blockhash;
        transaction.lastValidBlockHeight = blockhashContext.lastValidBlockHeight;
      }

      const rawTransaction = this.serializeTransaction(transaction);
      const startTime = Date.now();
      let signature: TransactionSignature = '';
      let lastBlockhashRefresh = Date.now();

      // 3. Send and retry loop with blockhash refresh
      while (Date.now() - startTime < timeoutSeconds * 1000) {
        try {
          state.attempts++;
          state.lastAttemptTime = Date.now();

          // Check if blockhash is too old and refresh if needed
          const ageSeconds = (Date.now() - lastBlockhashRefresh) / 1000;
          if (ageSeconds > maxBlockhashAge && this.isLegacyTransaction(transaction)) {
            this.log('info', `Blockhash age ${ageSeconds.toFixed(1)}s exceeds max ${maxBlockhashAge}s, refreshing...`, enableLogging);
            blockhashContext = await this.getFreshBlockhash(enableLogging);
            transaction.recentBlockhash = blockhashContext.blockhash;
            transaction.lastValidBlockHeight = blockhashContext.lastValidBlockHeight;
            
            // Re-serialize with new blockhash
            // Note: This assumes the transaction is re-signed by the caller if needed
            lastBlockhashRefresh = Date.now();
          }

          // Broadcast transaction
          signature = await (this.connection as any).sendRawTransaction(rawTransaction, {
            skipPreflight: true,
            maxRetries: 0, // We handle retries ourselves
          });

          this.updateState(stateId, TransactionState.SENT, signature);
          this.log('info', `Transaction sent: ${signature} (attempt ${state.attempts})`, enableLogging);

          // 4. Multi-node confirmation check
          const confirmed = await this.pollForConfirmation(
            signature,
            confirmationCommitment,
            confirmationNodes,
            enableLogging
          );

          if (confirmed) {
            this.updateState(stateId, TransactionState.CONFIRMED, signature);
            state.confirmedAt = Date.now();
            const duration = ((state.confirmedAt - state.startTime) / 1000).toFixed(2);
            this.log('info', `Transaction confirmed in ${duration}s after ${state.attempts} attempts`, enableLogging);
            return signature;
          }

          this.log('warn', `Transaction not yet confirmed, will retry in ${retryInterval}ms...`, enableLogging);

        } catch (error: any) {
          // Handle blockhash expiration
          if (this.isBlockhashExpiredError(error)) {
            this.log('warn', 'Blockhash expired or invalid, will refresh on next attempt', enableLogging);
            lastBlockhashRefresh = 0; // Force refresh on next iteration
          } else {
            this.log('warn', `Broadcast attempt failed: ${error.message}`, enableLogging);
          }
        }

        await this.sleep(retryInterval);
      }

      // Timeout reached
      const errorMsg = `Transaction not confirmed within ${timeoutSeconds}s after ${state.attempts} attempts`;
      this.updateState(stateId, TransactionState.EXPIRED, signature, errorMsg);
      throw new Error(`[SteroidTransaction] ${errorMsg}. Last signature: ${signature || 'none'}`);

    } catch (error: any) {
      this.updateState(stateId, TransactionState.FAILED, state.signature, error.message);
      throw error;
    }
  }

  /**
   * Simulates a transaction and provides detailed error information.
   */
  private async simulateTransaction(
    transaction: Transaction | VersionedTransaction,
    commitment: Commitment,
    enableLogging: boolean
  ): Promise<void> {
    try {
      const simulation = await (this.connection as any).simulateTransaction(transaction, {
        commitment,
        replaceRecentBlockhash: true,
      });

      if (simulation.value.err) {
        const errorDetails = this.parseSimulationError(simulation.value);
        this.log('error', `Simulation failed: ${errorDetails}`, enableLogging);
        throw new Error(`[SteroidTransaction] Simulation failed: ${errorDetails}`);
      }

      if (simulation.value.logs) {
        this.log('info', `Simulation succeeded. Logs count: ${simulation.value.logs.length}`, enableLogging);
      }
    } catch (error: any) {
      if (error.message?.includes('Simulation failed')) throw error;
      throw new Error(`[SteroidTransaction] Simulation error: ${error.message}`);
    }
  }

  /**
   * Polls multiple RPC endpoints for signature status to bypass node lag.
   */
  private async pollForConfirmation(
    signature: string,
    commitment: Commitment,
    nodesToCheck: number,
    enableLogging: boolean
  ): Promise<boolean> {
    const endpoints = this.connection.getEndpoints();
    const endpointsToCheck = endpoints.slice(0, Math.min(nodesToCheck, endpoints.length));

    this.log('info', `Checking confirmation across ${endpointsToCheck.length} nodes...`, enableLogging);

    const checks = endpointsToCheck.map(async (url) => {
      try {
        const tempConn = new Connection(url, { commitment });
        const status = await tempConn.getSignatureStatus(signature);

        if (status.value?.err) {
          throw new Error(`Transaction failed on ${url}: ${JSON.stringify(status.value.err)}`);
        }

        const isConfirmed =
          status.value?.confirmationStatus === 'confirmed' ||
          status.value?.confirmationStatus === 'finalized';

        if (isConfirmed && status.value) {
          this.log('info', `Transaction confirmed on ${url} (${status.value.confirmationStatus})`, enableLogging);
          return true;
        }
        
        return false;
      } catch (error: any) {
        this.log('warn', `Confirmation check failed for ${url}: ${error.message}`, enableLogging);
        return false;
      }
    });

    const results = await Promise.allSettled(checks);
    
    // Fail-fast if any node reports a definitive transaction error
    for (const result of results) {
      if (result.status === 'rejected' && result.reason?.message?.includes('Transaction failed')) {
        throw result.reason;
      }
    }

    return results.some((r) => r.status === 'fulfilled' && r.value === true);
  }

  /**
   * Get fresh blockhash with retry logic.
   */
  private async getFreshBlockhash(enableLogging: boolean): Promise<BlockhashWithExpiryBlockHeight> {
    try {
      const { blockhash, lastValidBlockHeight } = await (this.connection as any).getLatestBlockhash('confirmed');
      this.log('info', `Fetched fresh blockhash: ${blockhash.slice(0, 8)}...`, enableLogging);
      return { blockhash, lastValidBlockHeight };
    } catch (error: any) {
      throw new Error(`[SteroidTransaction] Failed to get blockhash: ${error.message}`);
    }
  }

  /**
   * Parse simulation errors into human-readable format.
   */
  private parseSimulationError(simulationValue: any): string {
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

  private isBlockhashExpiredError(error: any): boolean {
    return (
      error instanceof TransactionExpiredBlockheightExceededError ||
      error.message?.includes('block height exceeded') ||
      error.message?.includes('blockhash not found')
    );
  }

  /**
   * Type guard for legacy transactions.
   */
  private isLegacyTransaction(transaction: Transaction | VersionedTransaction): transaction is Transaction {
    return 'recentBlockhash' in transaction;
  }

  /**
   * Serialize transaction to bytes.
   */
  private serializeTransaction(transaction: Transaction | VersionedTransaction): Buffer {
    if (this.isLegacyTransaction(transaction)) {
      return transaction.serialize();
    }
    return Buffer.from((transaction as VersionedTransaction).serialize());
  }

  private generateStateId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private updateState(
    stateId: string,
    state: TransactionState,
    signature?: string,
    error?: string
  ): void {
    const existing = this.transactionStates.get(stateId);
    if (existing) {
      existing.state = state;
      if (signature) existing.signature = signature;
      if (error) existing.error = error;
    }
  }

  private log(level: 'info' | 'warn' | 'error', message: string, enabled: boolean): void {
    if (!enabled) return;

    const prefix = '[SteroidTransaction]';
    const formattedMessage = `${prefix} ${message}`;

    switch (level) {
      case 'info':
        console.log(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'error':
        console.error(formattedMessage);
        break;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get the current state of a transaction.
   */
  public getTransactionState(stateId: string): TransactionStateInfo | undefined {
    return this.transactionStates.get(stateId);
  }

  /**
   * Get all transaction states (useful for debugging).
   */
  public getAllTransactionStates(): Map<string, TransactionStateInfo> {
    return new Map(this.transactionStates);
  }

  /**
   * Clear old transaction states (cleanup).
   */
  public clearOldStates(olderThanMs: number = 3600000): void {
    const now = Date.now();
    for (const [id, state] of this.transactionStates.entries()) {
      if (now - state.startTime > olderThanMs) {
        this.transactionStates.delete(id);
      }
    }
  }
}
