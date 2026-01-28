import {
  Connection,
  Transaction,
  SendOptions,
  TransactionSignature,
  VersionedTransaction,
  SignatureStatus,
} from '@solana/web3.js';
import { SteroidConnection } from '../connection/SteroidConnection.js';

export interface SteroidSendOptions extends SendOptions {
  /**
   * Maximum number of seconds to retry sending.
   */
  timeoutSeconds?: number;
  /**
   * Delay between re-broadcasts in milliseconds.
   */
  retryInterval?: number;
}

export class SteroidTransaction {
  private connection: SteroidConnection;

  constructor(connection: SteroidConnection) {
    this.connection = connection;
  }

  /**
   * Sends a transaction with continuous re-broadcasting and multi-node monitoring.
   */
  async sendAndConfirm(
    transaction: Transaction | VersionedTransaction,
    options: SteroidSendOptions = {}
  ): Promise<TransactionSignature> {
    const {
      timeoutSeconds = 60,
      retryInterval = 2000,
      skipPreflight = false,
      preflightCommitment = 'processed',
    } = options;

    // 1. Simulation with log parsing
    if (!skipPreflight) {
      const simulation = await (this.connection as any).simulateTransaction(transaction as any, {
        commitment: preflightCommitment,
      });

      if (simulation.value.err) {
        throw new Error(`[SteroidTransaction] Simulation Failed: ${this.parseSimulationError(simulation.value)}`);
      }
    }

    const rawTransaction = (transaction as Transaction).serialize 
      ? (transaction as Transaction).serialize() 
      : (transaction as VersionedTransaction).serialize();

    const startTime = Date.now();
    let signature: TransactionSignature = '';

    while (Date.now() - startTime < timeoutSeconds * 1000) {
      try {
        // Broadcast on active connection
        signature = await (this.connection as any).sendRawTransaction(rawTransaction, {
          skipPreflight: true,
        });

        // 2. Multi-node confirmation check
        const confirmed = await this.pollForConfirmation(signature);
        if (confirmed) return signature;

      } catch (error: any) {
        console.warn(`[SteroidTransaction] Broadcast attempt failed: ${error.message}`);
      }

      await new Promise((r) => setTimeout(r, retryInterval));
    }

    throw new Error(`[SteroidTransaction] Exceeded ${timeoutSeconds}s without confirmation.`);
  }

  /**
   * Polls multiple RPC endpoints for signature status to bypass node lag.
   */
  private async pollForConfirmation(signature: string): Promise<boolean> {
    const endpoints = this.connection.getEndpoints();
    
    // Check multiple nodes in parallel to find the one that saw the tx
    const checks = endpoints.slice(0, 3).map(async (url) => {
      try {
        const tempConn = new Connection(url);
        const status = await tempConn.getSignatureStatus(signature);
        if (status.value?.err) throw new Error(JSON.stringify(status.value.err));
        
        const valid = status.value?.confirmationStatus === 'confirmed' || status.value?.confirmationStatus === 'finalized';
        return valid;
      } catch {
        return false;
      }
    });

    const results = await Promise.all(checks);
    return results.some((r) => r === true);
  }

  private parseSimulationError(simulationValue: any): string {
    const logs = simulationValue.logs || [];
    const errorLog = logs.find((l: string) => l.includes('Error:'));
    return errorLog || JSON.stringify(simulationValue.err);
  }
}
