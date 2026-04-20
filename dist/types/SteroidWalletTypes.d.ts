import type { ConnectionConfig, Commitment, PublicKey, Transaction, VersionedTransaction, TransactionSignature, SendOptions } from '@solana/web3.js';
export type { ConnectionConfig, Commitment, PublicKey, Transaction, VersionedTransaction, TransactionSignature, SendOptions, };
/**
 * Configuration for SteroidConnection resilience behaviour.
 */
export interface SteroidConnectionConfig extends ConnectionConfig {
    /** Additional RPC endpoint URLs to use as fallbacks */
    fallbacks?: string[];
    /** Maximum retry attempts per request (default: 5) */
    maxRetries?: number;
    /** Base delay between retries in ms (default: 500) */
    retryDelay?: number;
    /** Interval between background health checks in ms (default: 30000). 0 = disabled */
    healthCheckInterval?: number;
    /** Per-request timeout in ms (default: 30000) */
    requestTimeout?: number;
    /** Enable internal diagnostic logging (default: false) */
    enableLogging?: boolean;
    /** Enable performance-based RPC selection via EMA latency scoring (default: false) */
    latencyScoring?: boolean;
    /** Number of recent requests to consider for scoring (default: 20) */
    scoringWindow?: number;
    /** Expected cluster for validation. Emits warning on mismatch */
    expectedCluster?: ClusterType;
    /** Number of nodes to race for critical requests (default: 0 = disabled) */
    raceNodes?: number;
    /** Maximum allowed slot lag before a node is penalised (default: 50) */
    maxSlotLag?: number;
    /** Cooldown period after a node is marked unhealthy in ms (default: 60000) */
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
export declare enum TransactionState {
    PENDING = "PENDING",
    SIMULATED = "SIMULATED",
    SIGNED = "SIGNED",
    SENT = "SENT",
    CONFIRMED = "CONFIRMED",
    FINALIZED = "FINALIZED",
    FAILED = "FAILED",
    EXPIRED = "EXPIRED",
    ABORTED = "ABORTED"
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
export declare enum WalletErrorType {
    NOT_CONNECTED = "NOT_CONNECTED",
    USER_REJECTED = "USER_REJECTED",
    NETWORK_MISMATCH = "NETWORK_MISMATCH",
    SIGNING_FAILED = "SIGNING_FAILED",
    UNSUPPORTED_OPERATION = "UNSUPPORTED_OPERATION",
    UNKNOWN = "UNKNOWN"
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
export type TransactionCallback = (signature: TransactionSignature, state: TransactionStateInfo) => void | Promise<void>;
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
export declare const DEFAULT_CONFIG: {
    readonly CONNECTION: {
        readonly maxRetries: 5;
        readonly retryDelay: 500;
        readonly healthCheckInterval: 30000;
        readonly requestTimeout: 30000;
        readonly enableLogging: false;
        readonly latencyScoring: false;
        readonly scoringWindow: 20;
        readonly raceNodes: 0;
        readonly maxSlotLag: 50;
        readonly unhealthyCooldownMs: 60000;
    };
    readonly TRANSACTION: {
        readonly timeoutSeconds: 60;
        readonly retryInterval: 2000;
        readonly confirmationCommitment: Commitment;
        readonly maxBlockhashAge: 60;
        readonly confirmationNodes: 3;
        readonly enableLogging: false;
    };
    readonly WALLET: {
        readonly validateNetwork: true;
        readonly enableLogging: false;
        readonly autoRefreshBlockhash: true;
        readonly maxBlockhashAge: 60;
    };
};
