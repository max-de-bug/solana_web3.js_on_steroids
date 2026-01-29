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
      retrydelay?: number;
      healthCheckInterval?: number;
      requestTimeout?: number;
      enableLogging?: boolean;

}

export interface RPCHealth {
  url: string;
  healthy: boolean;
  lastChecked: number;
  latency?: number;
}

export interface FailoverStats {
count: number;
lastTime: number;

}

export interface SteroidSendOptions extends SendOptions {
  timeoutSeconds?: number;
  retryInterval?: number;
  confirmationCommitment?: Commitment;
  maxBlockhashAge?: number;
  enableLogging?: boolean;
  confirmationNodes?: number;
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  SIMULATED = 'SIMULATED',
  SIGNED = 'SIGNED',
  SENT = 'SENT',
  CONFIRMED = 'CONFIRMED',
  FINALIZED = 'FINALIZED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED'
}

export interface TransactionStateInfo {
  status: TransactionStatus;
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
    signMessage(message: Uint8Array): Promise<Uint8Array>;
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
}

/**
 * Network Types
 */
export type NetworkType = 'mainnet-beta' | 'devnet' | 'testnet';

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
 * Type guards
 */
export function isLegacyTransaction(
  transaction: AnyTransaction
): transaction is Transaction {
  return 'recentBlockhash' in transaction;
}

export function isVersionedTransaction(
  transaction: AnyTransaction
): transaction is VersionedTransaction {
  return 'version' in transaction;
}

/**
 * Helper types for improved DX
 */
export type WithOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type WithRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Event types for potential event emitter implementation
 */
export interface SteroidEvents {
  'transaction:pending': { signature?: string };
  'transaction:simulated': { signature?: string };
  'transaction:sent': { signature: string };
  'transaction:confirmed': { signature: string; attempts: number };
  'transaction:failed': { signature?: string; error: Error };
  'connection:failover': { from: string; to: string };
  'connection:health-check': { health: RPCHealth[] };
  'wallet:connected': { publicKey: PublicKey };
  'wallet:disconnected': {};
}

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

/**
 * Export type for package consumers
 */
export interface SteroidWalletPackage {
  SteroidClient: any;
  SteroidConnection: any;
  SteroidTransaction: any;
  SteroidWallet: any;
  WalletError: any;
  createSteroidClient: any;
}