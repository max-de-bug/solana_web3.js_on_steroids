import { SteroidConnectionConfig, RPCHealth } from '../types/SteroidWalletTypes.js';
/**
 * SteroidConnection uses a Proxy pattern to wrap a real @solana/web3.js Connection.
 * This allows swapping the underlying connection (and its internal state/websockets)
 * transparently when a failover occurs.
 */
export declare class SteroidConnection {
    private activeConnection;
    private urls;
    private currentUrlIndex;
    private config;
    private steroidConfig;
    private healthStatus;
    private healthCheckTimer?;
    private failoverCount;
    private lastFailoverTime;
    constructor(endpoint: string, config?: SteroidConnectionConfig);
    /**
     * Executes a connection method with intelligent retries and failover.
     */
    private executeWithResilience;
    /**
     * Internal helper to execute a method with a promise-based timeout.
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
    private calculateBackoff;
    private sleep;
    private enhanceError;
    private log;
    /**
     * Perform health checks on all RPC endpoints.
     */
    private performHealthCheck;
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
}
