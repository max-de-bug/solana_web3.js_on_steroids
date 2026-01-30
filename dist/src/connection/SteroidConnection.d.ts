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
     * Updates health status for a specific URL.
     */
    private updateHealthStatus;
    /**
     * Decides whether to retry or failover based on the error.
     * @returns true if the loop should continue (retry or failover), false if it should throw.
     */
    private handleExecutionError;
    private isTransientError;
    private isNodeFailure;
    private switchToNextRpc;
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
