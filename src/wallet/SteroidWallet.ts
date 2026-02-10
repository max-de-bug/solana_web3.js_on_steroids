import {
  PublicKey,
  Transaction,
  VersionedTransaction,
  TransactionSignature,
} from '@solana/web3.js';
import { SteroidTransaction } from '../transaction/SteroidTransaction.js';
import { SteroidConnection } from '../connection/SteroidConnection.js';
import { 
  WalletInterface, 
  WalletErrorType, 
  SteroidWalletConfig,
  SteroidSendOptions 
} from '../types/SteroidWalletTypes.js';
import { Logger, normalizeWalletError, getTransactionBlockhash, setTransactionBlockhash } from '../utils/index.js';
import { ClusterDetector } from '../connection/ClusterDetector.js';
import { SteroidError, ErrorTranslator, ErrorCode, ErrorCategory } from '../errors/index.js';
import { SteroidEventEmitter } from '../events/SteroidEventEmitter.js';

/**
 * Wallet-specific error that extends SteroidError for unified error handling.
 */
export class WalletError extends SteroidError {
  public readonly type: WalletErrorType;

  constructor(
    type: WalletErrorType,
    message: string,
    originalError?: any
  ) {
    // Map WalletErrorType to ErrorCode
    const code = WalletError.mapTypeToCode(type);
    super({
      code,
      category: ErrorCategory.WALLET,
      userMessage: message,
      suggestion: WalletError.getSuggestionForType(type),
      originalError,
    });
    this.type = type;
    this.name = 'WalletError';
  }

  private static mapTypeToCode(type: WalletErrorType): ErrorCode {
    switch (type) {
      case WalletErrorType.USER_REJECTED:
        return ErrorCode.USER_REJECTED;
      case WalletErrorType.NOT_CONNECTED:
        return ErrorCode.NOT_CONNECTED;
      case WalletErrorType.NETWORK_MISMATCH:
        return ErrorCode.NETWORK_MISMATCH;
      case WalletErrorType.UNSUPPORTED_OPERATION:
        return ErrorCode.UNSUPPORTED_OPERATION;
      default:
        return ErrorCode.UNKNOWN;
    }
  }

  private static getSuggestionForType(type: WalletErrorType): string {
    switch (type) {
      case WalletErrorType.USER_REJECTED:
        return 'Click approve in your wallet to confirm the transaction';
      case WalletErrorType.NOT_CONNECTED:
        return 'Connect your wallet to continue';
      case WalletErrorType.NETWORK_MISMATCH:
        return 'Switch to the correct network in your wallet';
      case WalletErrorType.UNSUPPORTED_OPERATION:
        return 'This wallet does not support the requested operation';
      default:
        return 'Please try again or use a different wallet';
    }
  }
}

/**
 * SteroidWallet wraps any Solana wallet adapter and provides:
 * - Normalized error handling across different wallet implementations
 * - Network consistency validation
 * - Automatic transaction retry and confirmation
 * - Graceful degradation for missing wallet features
 */
export class SteroidWallet {
  private wallet: WalletInterface;
  private connection: SteroidConnection;
  private txEngine: SteroidTransaction;
  private config: Required<SteroidWalletConfig>;
  private logger: Logger;
  private emitter?: SteroidEventEmitter;
  private networkValidated: boolean = false;
  private genesisHash?: string;

  constructor(
    wallet: WalletInterface,
    connection: SteroidConnection,
    config: SteroidWalletConfig = {},
    emitter?: SteroidEventEmitter
  ) {
    this.wallet = wallet;
    this.connection = connection;
    this.emitter = emitter;
    this.txEngine = new SteroidTransaction(connection, emitter);
    this.config = {
      validateNetwork: config.validateNetwork ?? true,
      expectedGenesisHash: config.expectedGenesisHash ?? '',
      enableLogging: config.enableLogging ?? false,
      autoRefreshBlockhash: config.autoRefreshBlockhash ?? true,
      maxBlockhashAge: config.maxBlockhashAge ?? 60,
    };
    this.logger = new Logger('SteroidWallet', this.config.enableLogging);
  }

  /**
   * Get the wallet's public key.
   */
  get publicKey(): PublicKey | null {
    return this.wallet.publicKey;
  }

  /**
   * Signs and sends a transaction with full reliability guarantees.
   * Handles blockhash refresh, retries, and multi-node confirmation.
   */
  async signAndSend(
    transaction: Transaction | VersionedTransaction,
    options: SteroidSendOptions = {}
  ): Promise<TransactionSignature> {
    // Pre-flight checks
    await this.guardState();

    try {
      // Refresh blockhash if needed
      if (this.config.autoRefreshBlockhash) {
        transaction = await this.ensureFreshBlockhash(transaction) as typeof transaction;
      }

      // Sign transaction
      this.logger.info('Requesting signature from wallet...');
      const signedTx = await this.signTransactionSafe(transaction);
      this.logger.info('Transaction signed successfully');

      // Send with Steroid reliability
      // Note: compute budget is applied by SteroidTransaction.sendAndConfirm()
      return await this.txEngine.sendAndConfirm(signedTx, {
        enableLogging: this.config.enableLogging,
        ...options,
        // Automatic re-signing callback
        onBlockhashRefresh: async (tx) => {
          this.logger.info('Re-signing transaction after blockhash refresh...');
          return await this.signTransactionSafe(tx);
        }
      });
    } catch (error: any) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Sign a transaction safely with normalized error handling.
   */
  async signTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T
  ): Promise<T> {
    await this.guardState();

    try {
      this.logger.info('Requesting signature from wallet...');
      const signed = await this.wallet.signTransaction(transaction);
      this.logger.info('Transaction signed successfully');
      return signed;
    } catch (error: any) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Sign multiple transactions safely.
   */
  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    transactions: T[]
  ): Promise<T[]> {
    await this.guardState();

    if (transactions.length === 0) {
      return [];
    }

    try {
      this.logger.info(`Requesting signatures for ${transactions.length} transactions...`);
      const signed = await this.wallet.signAllTransactions(transactions);
      this.logger.info(`Successfully signed ${signed.length} transactions`);
      return signed;
    } catch (error: any) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Sign a message with standardized error handling.
   */
  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    await this.guardState();

    const signMessage = this.wallet.signMessage;
    if (!signMessage) {
      throw new WalletError(
        WalletErrorType.UNSUPPORTED_OPERATION,
        'Wallet does not support message signing'
      );
    }

    try {
      this.logger.info('Requesting message signature from wallet...');
      const signature = await signMessage.call(this.wallet, message);
      this.logger.info('Message signed successfully');
      return signature;
    } catch (error: any) {
      throw this.normalizeError(error);
    }
  }

  /**
   * System-level state validation before operations.
   */
  private async guardState(): Promise<void> {
    // Check wallet connection
    if (!this.wallet.publicKey) {
      throw new WalletError(
        WalletErrorType.NOT_CONNECTED,
        'Wallet is not connected or public key is missing'
      );
    }

    // Validate network if enabled and not yet validated
    if (this.config.validateNetwork && !this.networkValidated) {
      await this.validateNetwork();
    }
  }

  /**
   * Validates that the wallet and connection are on the same network.
   */
  private async validateNetwork(): Promise<void> {
    try {
      // Get genesis hash and detected cluster to uniquely identify the network
      const genesisHash = await this.connection.getConnection().getGenesisHash();
      this.genesisHash = genesisHash;
      
      const cluster = ClusterDetector.detectCluster(genesisHash);
      const clusterName = ClusterDetector.getClusterName(cluster);

      this.logger.info(`Network validation - Cluster: ${clusterName}, Genesis hash: ${genesisHash.slice(0, 16)}...`);

      // If expected genesis hash is configured, verify it matches
      if (this.config.expectedGenesisHash) {
        if (genesisHash !== this.config.expectedGenesisHash) {
          const expectedCluster = ClusterDetector.detectCluster(this.config.expectedGenesisHash);
          const expectedName = ClusterDetector.getClusterName(expectedCluster);
          
          throw new WalletError(
            WalletErrorType.NETWORK_MISMATCH,
            `Network mismatch: Expected ${expectedName} (${this.config.expectedGenesisHash.slice(0, 8)}...), got ${clusterName} (${genesisHash.slice(0, 8)}...)`
          );
        }
        this.logger.info('Network validation passed - Genesis hash matches expected value');
      }

      this.networkValidated = true;
    } catch (error: any) {
      if (error instanceof WalletError) {
        throw error;
      }
      this.logger.warn('Network validation failed:', error.message);
      // Don't throw - some wallets/networks might not support genesis hash
      // Just log and continue
    }
  }

  /**
   * Ensures transaction has a fresh blockhash.
   */
  private async ensureFreshBlockhash<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    const existingBlockhash = getTransactionBlockhash(transaction);

    if (!existingBlockhash) {
      // No blockhash set, fetch a fresh one
      const { blockhash, lastValidBlockHeight } = await this.connection.getConnection().getLatestBlockhash('confirmed');
      const updatedTx = setTransactionBlockhash(transaction, blockhash, lastValidBlockHeight);
      this.logger.info('Set fresh blockhash on transaction');
      return updatedTx as T;
    }

    // Check if existing blockhash might be stale
    // Note: This is a best-effort check - we can't know the exact age
    // The transaction layer will refresh if needed during retry
    this.logger.info('Transaction already has blockhash, will validate during send');
    return transaction;
  }

  /**
   * Safely sign a transaction with proper error handling.
   */
  private async signTransactionSafe<T extends Transaction | VersionedTransaction>(
    transaction: T
  ): Promise<T> {
    try {
      return await this.wallet.signTransaction(transaction);
    } catch (error: any) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Normalizes different wallet errors into a consistent format.
   */
  private normalizeError(error: any): WalletError {
    if (error instanceof WalletError) {
      return error;
    }

    const { type, message } = normalizeWalletError(error);
    return new WalletError(type, message, error);
  }

  /**
   * Get network information.
   */
  public getNetworkInfo(): { genesisHash?: string; validated: boolean } {
    return {
      genesisHash: this.genesisHash,
      validated: this.networkValidated,
    };
  }

  /**
   * Force re-validation of network on next operation.
   */
  public invalidateNetwork(): void {
    this.networkValidated = false;
    this.logger.info('Network validation invalidated, will re-validate on next operation');
  }

  /**
   * Check if wallet supports message signing.
   */
  public supportsMessageSigning(): boolean {
    return typeof this.wallet.signMessage === 'function';
  }
}