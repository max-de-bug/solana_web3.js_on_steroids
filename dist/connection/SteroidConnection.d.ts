import { Connection } from '@solana/web3.js';
import { SteroidConnectionConfig, RPCHealth, ClusterType } from '../types/SteroidWalletTypes.js';
import { SteroidEventEmitter } from '../events/SteroidEventEmitter.js';
/**
 * SteroidConnection uses a Proxy pattern to wrap a real @solana/web3.js Connection.
 * This allows swapping the underlying connection (and its internal state/websockets)
 * transparently when a failover occurs.
 */
export declare class SteroidConnection {
    private static readonly DEFAULT_HEALTH_CHECK_TIMEOUT_MS;
    private static readonly MAX_BACKOFF_DELAY_MS;
    private static readonly CIRCUIT_BREAKER_THRESHOLD;
    private static readonly JITTER_FACTOR;
    private activeConnection;
    private urls;
    private currentUrlIndex;
    private config;
    private steroidConfig;
    private healthStatus;
    private healthCheckTimer?;
    private failoverCount;
    private lastFailoverTime;
    private logger;
    private emitter?;
    private scorer?;
    private connectionPool;
    private detectedCluster;
    private genesisHash;
    constructor(endpoint: string, config?: SteroidConnectionConfig, emitter?: SteroidEventEmitter);
    /**
     * Executes a connection method with intelligent retries and failover.
     */
    private executeWithResilience;
    /**
     * Executes a request concurrently against multiple nodes and returns the fastest result.
     */
    private executeWithConcurrentRace;
    /**
     * Standard execution path without racing.
     */
    private executeWithResilienceStandard;
    /**
     * Internal helper to execute a method with a promise-based timeout and AbortController.
     * This effectively cancels the underlying network request on timeout.
     */
    private callWithTimeout;
    /**
     * Updates health status for a specific URL.
     */
    private updateHealthStatus;
    /**
     * Decides whether to retry or failover based on the error.
     * @returns true if the loop should continue (retry or failover), false if it should throw.
     */
    private handleExecutionError;
    private parseErrorContext;
    /**
     * Identifies transient errors that should be retried on the same node (e.g. rate limits).
     */
    private isTransientError;
    /**
     * Identifies node-level failures that should trigger a failover to a different RPC.
     */
    private isNodeFailure;
    /**
     * Switches to the next available RPC node.
     */
    private switchToNextRpc;
    /**
     * Finds the index of the next healthy RPC, or the very next one if all are unhealthy.
     */
    private findNextAvailableRpcIndex;
    private enhanceError;
    /**
     * Get the underlying Connection instance for typed access.
     * Avoids the need for `as any` casts in downstream code.
     */
    getConnection(): Connection;
    /**
     * Perform health checks on all RPC endpoints.
     */
    private performHealthCheck;
    /**
     * Internal helper to check the health of a single RPC node.
     */
    private checkNodeHealth;
    private startHealthChecks;
    /**
     * Clean up resources when done.
     */
    destroy(): void;
    /**
     * Get all endpoints for multi-node verification.
     */
    getEndpoints(): string[];
    /**
     * Get current active endpoint.
     */
    getActiveEndpoint(): string;
    /**
     * Get health status of all endpoints.
     */
    getHealthStatus(): RPCHealth[];
    /**
     * Get failover statistics.
     */
    getFailoverStats(): {
        count: number;
        lastTime: number;
    };
    /**
     * Manually trigger a health check.
     */
    checkHealth(): Promise<RPCHealth[]>;
    /**
     * Detects the cluster type and genesis hash.
     */
    private detectCluster;
    /**
     * Gets the detected cluster type.
     */
    getCluster(): ClusterType;
    /**
     * Gets the network genesis hash.
     */
    getGenesisHash(): string;
}
