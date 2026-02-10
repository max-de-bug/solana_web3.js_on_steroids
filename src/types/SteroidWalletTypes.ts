import type {
  Connection,
  ConnectionConfig,
  Commitment,
  PublicKey,
  Transaction,
  VersionedTransaction,
  TransactionSignature,
  SendOptions,
  BlockhashWithExpiryBlockHeight,
  SignatureStatus,
} from '@solana/web3.js';


export type {
  Connection,
  ConnectionConfig,
  Commitment,
  PublicKey,
  Transaction,
  VersionedTransaction,
  TransactionSignature,
  SendOptions,
  BlockhashWithExpiryBlockHeight,
  SignatureStatus,
};

export interface SteroidConnectionConfig extends ConnectionConfig {
      fallbacks?: string[];
      maxRetries?: number;
      retryDelay?: number;
      healthCheckInterval?: number;
      requestTimeout?: number;
      enableLogging?: boolean;
      /** Enable performance-based RPC selection (default: false) */
      latencyScoring?: boolean;
      /** Number of requests to consider for scoring (default: 20) */
      scoringWindow?: number;
      /** Expected cluster for validation. Emits warning if mismatch. */
      expectedCluster?: ClusterType;
      /** Number of nodes to race for critical requests (default: 0 = disabled) */
      raceNodes?: number;
      /** Maximum allowed slot lag before a node is penalized (default: 50) */
      maxSlotLag?: number;
      /** Cooldown period after a node is marked unhealthy (default: 60000ms) */
      unhealthyCooldownMs?: number;
}

export interface RPCHealth {
  url: string;
  healthy: boolean;
  lastChecked: number;
  latency?: number;
  score?: number;
  lastSlot?: number;
  lastUnhealthy?: number;
  /** Number of consecutive failures for circuit breaker logic */
  consecutiveFailures?: number;
}

export interface FailoverStats {
  count: number;
  lastTime: number;
}

// ComputeBudgetConfig is canonically defined in ../compute/ComputeBudgetOptimizer.ts
import type { ComputeBudgetConfig } from '../compute/ComputeBudgetOptimizer.js';
export type { ComputeBudgetConfig };

export interface SteroidSendOptions extends SendOptions {
  timeoutSeconds?: number;
  retryInterval?: number;
  confirmationCommitment?: Commitment;
  maxBlockhashAge?: number;
  enableLogging?: boolean;
  confirmationNodes?: number;
  /**
   * Optional AbortSignal to cancel the transaction.
   * When aborted, throws SteroidError with code ABORTED.
   */
  abortSignal?: AbortSignal;
  /** 
   * Compute budget optimization config.
   * - true: Enable with defaults
   * - false: Disable
   * - ComputeBudgetConfig: Custom configuration
   */
  computeBudget?: boolean | ComputeBudgetConfig;
  /**
   * Optional callback to re-sign transaction after blockhash refresh.
   * If provided, SteroidTransaction will call this when blockhash is updated.
   */
  onBlockhashRefresh?: (transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>;
  /** Use WebSocket for confirmation (default: true). Falls back to HTTP polling. */
  useWebSocket?: boolean;
}

export enum TransactionState {
  PENDING = 'PENDING',
  SIMULATED = 'SIMULATED',
  SIGNED = 'SIGNED',
  SENT = 'SENT',
  CONFIRMED = 'CONFIRMED',
  FINALIZED = 'FINALIZED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
  ABORTED = 'ABORTED'
}

export interface TransactionStateInfo {
  state: TransactionState;
  signature?: string;
  error?: string;
  attempts: number;
  startTime: number;
  lastAttemptTime?: number;
  confirmedAt?: number;
}



export interface WalletInterface {
    publicKey: PublicKey | null;
    signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
    signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]>;
    signMessage?(message: Uint8Array): Promise<Uint8Array>;
}

export enum WalletErrorType {
  NOT_CONNECTED = 'NOT_CONNECTED',
  USER_REJECTED = 'USER_REJECTED',
  NETWORK_MISMATCH = 'NETWORK_MISMATCH',
  SIGNING_FAILED = 'SIGNING_FAILED',
  UNSUPPORTED_OPERATION = 'UNSUPPORTED_OPERATION',
  UNKNOWN = 'UNKNOWN',
}

export interface SteroidWalletConfig {
  validateNetwork?: boolean;
  expectedGenesisHash?: string;
  enableLogging?: boolean;
  autoRefreshBlockhash?: boolean;
  maxBlockhashAge?: number;
}

export interface NetworkInfo {
  genesisHash?: string;
  validated: boolean;
}

/**
 * Client Types
 */
export interface SteroidClientConfig {
  connection?: SteroidConnectionConfig;
  wallet?: SteroidWalletConfig;
  enableLogging?: boolean;
}

export interface ClientStats {
  activeEndpoint: string;
  allEndpoints: string[];
  failoverStats: FailoverStats;
  healthStatus: RPCHealth[];
  detectedCluster: ClusterType;
}

/**
 * Network Types
 */
export type ClusterType = 'mainnet-beta' | 'devnet' | 'testnet' | 'localnet' | 'unknown';

/**
 * Utility Types
 */
export type AnyTransaction = Transaction | VersionedTransaction;

export type SignedTransaction<T extends AnyTransaction = AnyTransaction> = T;

export type TransactionResult = {
  signature: TransactionSignature;
  confirmedAt: number;
  attempts: number;
};

export type ErrorHandler = (error: Error) => void | Promise<void>;

export type TransactionCallback = (
  signature: TransactionSignature,
  state: TransactionStateInfo
) => void | Promise<void>;

/**
 * Helper types for improved DX
 */
export type WithOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type WithRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};



/**
 * Constants
 */
export const DEFAULT_CONFIG = {
  CONNECTION: {
    maxRetries: 5,
    retryDelay: 500,
    healthCheckInterval: 30000,
    requestTimeout: 30000,
    enableLogging: false,
    latencyScoring: false,
    scoringWindow: 20,
    raceNodes: 0,
    maxSlotLag: 50,
    unhealthyCooldownMs: 60000,
  },
  TRANSACTION: {
    timeoutSeconds: 60,
    retryInterval: 2000,
    confirmationCommitment: 'confirmed' as Commitment,
    maxBlockhashAge: 60,
    confirmationNodes: 3,
    enableLogging: false,
  },
  WALLET: {
    validateNetwork: true,
    enableLogging: false,
    autoRefreshBlockhash: true,
    maxBlockhashAge: 60,
  },
} as const;

