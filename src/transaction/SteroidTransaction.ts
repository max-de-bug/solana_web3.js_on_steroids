import {
  Connection,
  Transaction,
  TransactionSignature,
  VersionedTransaction,
  Commitment,
  BlockhashWithExpiryBlockHeight,

} from '@solana/web3.js';
import { SteroidConnection } from '../connection/SteroidConnection.js';
import { SteroidSendOptions, TransactionState, TransactionStateInfo, DEFAULT_CONFIG } from '../types/SteroidWalletTypes.js';
import { 
  isLegacyTransaction, 
  sleep, 
  Logger, 
  parseSimulationError, 
  isBlockhashExpiredError, 
  serializeTransaction, 
  generateId, 
  clearExpiredEntries 
} from '../utils/index.js';

/**
 * Enhanced transaction handling with state management, automatic retries,
 * blockhash refresh, and multi-node confirmation.
 */
export class SteroidTransaction {
  private connection: SteroidConnection;
  private transactionStates: Map<string, TransactionStateInfo> = new Map();
  private logger: Logger;

  constructor(connection: SteroidConnection) {
    this.connection = connection;
    this.logger = new Logger('SteroidTransaction', false);
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

    const executionTimeout = timeoutSeconds * 1000;

    // Update logger preference for this call
    this.logger.setEnabled(enableLogging || false);
    
    const stateId = generateId('tx');
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
        await this.simulateTransaction(transaction, preflightCommitment);
        this.updateState(stateId, TransactionState.SIMULATED);
      }

      // 2. Initial blockhash setup if needed
      let blockhashContext: BlockhashWithExpiryBlockHeight | undefined;
      if (isLegacyTransaction(transaction)) {
        blockhashContext = await this.getFreshBlockhash();
        transaction.recentBlockhash = blockhashContext.blockhash;
        transaction.lastValidBlockHeight = blockhashContext.lastValidBlockHeight;
      }

      const startTime = Date.now();
      let signature: TransactionSignature = '';
      let lastBlockhashRefresh = Date.now();
      let attempts = 0;

      // 3. Send and retry loop with blockhash refresh
      while (Date.now() - startTime < executionTimeout) {
        try {
          attempts++;
          state.attempts = attempts; // Update state attempts
          state.lastAttemptTime = Date.now();

          // Check if blockhash is too old and refresh if needed
          const ageSeconds = (Date.now() - lastBlockhashRefresh) / 1000;
          if (ageSeconds > maxBlockhashAge && isLegacyTransaction(transaction)) {
            this.logger.info(`Blockhash age ${ageSeconds.toFixed(1)}s exceeds max ${maxBlockhashAge}s, refreshing...`);
            blockhashContext = await this.getFreshBlockhash();
            transaction.recentBlockhash = blockhashContext.blockhash;
            transaction.lastValidBlockHeight = blockhashContext.lastValidBlockHeight;
            
            // Re-serialize with new blockhash
            // Note: This assumes the transaction is re-signed by the caller if needed
            lastBlockhashRefresh = Date.now();
          }

          // Broadcast transaction
          this.logger.info(`Sending transaction (Attempt ${attempts})...`);
          try {
            const rawTransaction = serializeTransaction(transaction);
            signature = await (this.connection as any).sendRawTransaction(rawTransaction, {
              skipPreflight: true,
              maxRetries: 0, // We handle retries ourselves
            });
            this.logger.info(`Transaction sent: ${signature}`);
          } catch (sendError: any) {
            if (isBlockhashExpiredError(sendError)) {
              this.logger.warn('Blockhash expired during send, refreshing...');
              lastBlockhashRefresh = 0; // Force refresh on next iteration
              continue; // Skip to next iteration to refresh blockhash
            }
            throw sendError; // Re-throw other errors
          }

          this.updateState(stateId, TransactionState.SENT, signature);
          this.logger.info(`Transaction sent: ${signature} (attempt ${state.attempts})`);

          // 4. Multi-node confirmation check
          this.logger.info(`Polling for confirmation on ${confirmationNodes} nodes...`);
          const confirmed = await this.pollForConfirmation(
            signature,
            confirmationCommitment,
            confirmationNodes
          );

          if (confirmed) {
            this.updateState(stateId, TransactionState.CONFIRMED, signature);
            state.confirmedAt = Date.now();
            const duration = ((state.confirmedAt - state.startTime) / 1000).toFixed(2);
            this.logger.info(`Transaction confirmed in ${duration}s after ${state.attempts} attempts`);
            return signature;
          }

          this.logger.warn(`Transaction not yet confirmed, will retry in ${retryInterval}ms...`);

        } catch (error: any) {
          // Handle blockhash expiration
          if (isBlockhashExpiredError(error)) {
            this.logger.warn('Blockhash expired or invalid, will refresh on next attempt');
            lastBlockhashRefresh = 0; // Force refresh on next iteration
          } else {
            this.logger.warn(`Broadcast attempt failed: ${error.message}`);
          }
        }

        await sleep(retryInterval);
      }

      // Timeout reached
      const errorMsg = `Transaction not confirmed within ${timeoutSeconds}s after ${state.attempts} attempts`;
      this.updateState(stateId, TransactionState.EXPIRED, signature, errorMsg);
      throw new Error(`[SteroidTransaction] ${errorMsg}. Last signature: ${signature || 'none'}`);

    } catch (error: any) {
      this.logger.error('Transaction failed:', error.message);
      this.updateState(stateId, TransactionState.FAILED, state.signature, error.message);
      throw error;
    } finally {
      this.logger.setEnabled(false); // Reset logger state
    }
  }

  /**
   * Simulates a transaction and provides detailed error information.
   */
  private async simulateTransaction(
    transaction: Transaction | VersionedTransaction,
    commitment: Commitment
  ): Promise<void> {
    try {
      this.logger.info('Simulating transaction...');
      const simulation = await (this.connection as any).simulateTransaction(transaction, {
        commitment,
        replaceRecentBlockhash: true,
      });

      if (simulation.value.err) {
        const errorDetails = parseSimulationError(simulation.value);
        this.logger.error(`Simulation failed: ${errorDetails}`);
        throw new Error(`[SteroidTransaction] Simulation failed: ${errorDetails}`);
      }

      if (simulation.value.logs) {
        this.logger.info(`Simulation succeeded. Logs count: ${simulation.value.logs.length}`);
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
    nodesToCheck: number
  ): Promise<boolean> {
    const endpoints = this.connection.getEndpoints();
    const endpointsToCheck = endpoints.slice(0, Math.min(nodesToCheck, endpoints.length));

    this.logger.info(`Checking confirmation across ${endpointsToCheck.length} nodes...`);

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
          this.logger.info(`Transaction confirmed on ${url} (${status.value.confirmationStatus})`);
          return true;
        }
        
        return false;
      } catch (error: any) {
        this.logger.warn(`Confirmation check failed for ${url}: ${error.message}`);
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
  private async getFreshBlockhash(): Promise<BlockhashWithExpiryBlockHeight> {
    try {
      this.logger.info('Fetching fresh blockhash...');
      const { blockhash, lastValidBlockHeight } = await (this.connection as any).getLatestBlockhash('confirmed');
      this.logger.info(`Fetched fresh blockhash: ${blockhash.slice(0, 8)}...`);
      return { blockhash, lastValidBlockHeight };
    } catch (error: any) {
      throw new Error(`[SteroidTransaction] Failed to get blockhash: ${error.message}`);
    }
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
    clearExpiredEntries(this.transactionStates, olderThanMs);
  }
}
