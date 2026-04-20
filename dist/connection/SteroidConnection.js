import { Connection } from '@solana/web3.js';
import { sleep, Logger, calculateBackoff } from '../utils/index.js';
import { ErrorTranslator } from '../errors/index.js';
import { RpcScorer } from './RpcScorer.js';
import { ClusterDetector } from './ClusterDetector.js';
import { ConnectionPool } from './ConnectionPool.js';
/**
 * SteroidConnection uses a Proxy pattern to wrap a real @solana/web3.js Connection.
 * This allows swapping the underlying connection (and its internal state/websockets)
 * transparently when a failover occurs.
 */
export class SteroidConnection {
    static DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 5000;
    static MAX_BACKOFF_DELAY_MS = 30000;
    static CIRCUIT_BREAKER_THRESHOLD = 3;
    static JITTER_FACTOR = 0.2;
    activeConnection;
    urls;
    currentUrlIndex = 0;
    config;
    steroidConfig;
    healthStatus = new Map();
    healthCheckTimer;
    failoverCount = 0;
    lastFailoverTime = 0;
    logger;
    emitter;
    scorer;
    connectionPool;
    detectedCluster = 'unknown';
    genesisHash = '';
    constructor(endpoint, config = {}, emitter) {
        this.urls = [endpoint, ...(config.fallbacks || [])];
        this.config = config;
        this.emitter = emitter;
        this.steroidConfig = {
            maxRetries: config.maxRetries ?? 5,
            retryDelay: config.retryDelay ?? 500,
            healthCheckInterval: config.healthCheckInterval ?? 30000,
            requestTimeout: config.requestTimeout ?? 30000,
            enableLogging: config.enableLogging ?? false,
            latencyScoring: config.latencyScoring ?? false,
            scoringWindow: config.scoringWindow ?? 20,
            raceNodes: config.raceNodes ?? 0,
            maxSlotLag: config.maxSlotLag ?? 50,
            unhealthyCooldownMs: config.unhealthyCooldownMs ?? 60000,
        };
        this.logger = new Logger('SteroidConnection', this.steroidConfig.enableLogging);
        this.connectionPool = new ConnectionPool(config);
        if (this.steroidConfig.latencyScoring) {
            this.scorer = new RpcScorer(this.steroidConfig.scoringWindow);
        }
        // Initialize health status
        this.urls.forEach((url) => {
            this.healthStatus.set(url, {
                url,
                healthy: true,
                lastChecked: Date.now(),
            });
        });
        this.activeConnection = new Connection(endpoint, config);
        // Initial cluster detection
        this.detectCluster().catch((err) => {
            this.logger.warn('Initial cluster detection failed:', err.message);
        });
        // Start health checks if enabled
        if (this.steroidConfig.healthCheckInterval > 0) {
            this.startHealthChecks();
        }
        // Return a Proxy so the user can treat it as a standard Connection object
        return new Proxy(this, {
            get(target, prop, receiver) {
                // 1. If the property exists on our wrapper, use it.
                const targetValue = Reflect.get(target, prop, receiver);
                if (prop in target && targetValue !== undefined) {
                    return targetValue;
                }
                // 2. Otherwise, forward to the active Connection instance.
                const activeConn = target.activeConnection;
                const value = Reflect.get(activeConn, prop, activeConn);
                // 3. If it's a function, wrap it with retry/failover logic.
                if (typeof value === 'function') {
                    const methodName = prop;
                    return (...args) => {
                        return target.executeWithResilience(methodName, args);
                    };
                }
                return value;
            },
        });
    }
    /**
     * Executes a connection method with intelligent retries and failover.
     */
    async executeWithResilience(methodName, args) {
        // If racing is enabled and we have multiple nodes, use the race strategy
        if (this.steroidConfig.raceNodes > 0 && this.urls.length > 1) {
            return this.executeWithConcurrentRace(methodName, args);
        }
        return this.executeWithResilienceStandard(methodName, args);
    }
    /**
     * Executes a request concurrently against multiple nodes and returns the fastest result.
     */
    async executeWithConcurrentRace(methodName, args) {
        // Pick top N healthy nodes
        const topIndices = [];
        const attempted = new Set();
        for (let i = 0; i < Math.min(this.steroidConfig.raceNodes, this.urls.length); i++) {
            const index = this.findNextAvailableRpcIndex(attempted);
            if (index !== -1) {
                topIndices.push(index);
                attempted.add(index);
            }
        }
        // If we only have one node to race, just use standard execution (though it shouldn't happen with urls.length > 1)
        if (topIndices.length <= 1) {
            return this.executeWithResilienceStandard(methodName, args);
        }
        this.logger.info(`Racing ${topIndices.length} nodes for ${methodName}`);
        const racePromises = topIndices.map(async (idx) => {
            const url = this.urls[idx];
            const tempConn = idx === this.currentUrlIndex ? this.activeConnection : this.connectionPool.get(url);
            const startTime = Date.now();
            try {
                const result = await this.callWithTimeout(methodName, args, tempConn, this.steroidConfig.requestTimeout);
                const latency = Date.now() - startTime;
                this.scorer?.recordSuccess(url, latency);
                this.updateHealthStatus(url, true, latency, undefined);
                return result;
            }
            catch (error) {
                this.scorer?.recordFailure(url);
                throw error;
            }
        });
        try {
            // Promise.any returns the first successfully fulfilled promise
            return await Promise.any(racePromises);
        }
        catch (error) {
            // If all failed, AggregateError is thrown (in modern JS) or we just throw the last one
            this.logger.error(`All concurrent requests failed for ${methodName}`);
            throw this.enhanceError(error, methodName, 1);
        }
    }
    /**
     * Standard execution path without racing.
     */
    async executeWithResilienceStandard(methodName, args) {
        // This is essentially parts of the old executeWithResilience
        const attemptedUrls = new Set();
        let lastError;
        for (let attempt = 0; attempt < this.steroidConfig.maxRetries; attempt++) {
            const startTime = Date.now();
            const currentUrl = this.urls[this.currentUrlIndex];
            try {
                const result = await this.callWithTimeout(methodName, args, this.activeConnection, this.steroidConfig.requestTimeout);
                const latency = Date.now() - startTime;
                this.scorer?.recordSuccess(currentUrl, latency);
                this.updateHealthStatus(currentUrl, true, latency, undefined);
                return result;
            }
            catch (error) {
                this.scorer?.recordFailure(currentUrl);
                lastError = error.name === 'AbortError' ? new Error('Request timeout') : error;
                this.logger.warn(`Method ${methodName} failed (attempt ${attempt + 1}/${this.steroidConfig.maxRetries}):`, lastError.message);
                const shouldRetry = await this.handleExecutionError(lastError, methodName, attempt, attemptedUrls);
                if (!shouldRetry)
                    throw this.enhanceError(lastError, methodName, attempt + 1);
            }
        }
        throw this.enhanceError(lastError, methodName, this.steroidConfig.maxRetries);
    }
    /**
     * Internal helper to execute a method with a promise-based timeout and AbortController.
     * This effectively cancels the underlying network request on timeout.
     */
    async callWithTimeout(methodName, args, target, timeoutMs) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const method = target[methodName];
            if (typeof method !== 'function') {
                throw new Error(`Method ${methodName} not found on target`);
            }
            // 1. Check if the method likely accepts a config object with an AbortSignal
            // Many web3.js methods take an optional config as the last argument
            const lastArg = args[args.length - 1];
            const methodWithSignal = (typeof lastArg === 'object' && lastArg !== null && !Array.isArray(lastArg))
                ? method.apply(target, [...args.slice(0, -1), { ...lastArg, signal: controller.signal }])
                : method.apply(target, [...args, { signal: controller.signal }]);
            return await methodWithSignal;
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    /**
     * Updates health status for a specific URL.
     */
    updateHealthStatus(url, healthy, latency, slot) {
        const health = this.healthStatus.get(url);
        if (health) {
            health.healthy = healthy;
            health.lastChecked = Date.now();
            if (!healthy) {
                health.lastUnhealthy = Date.now();
            }
            if (latency !== undefined) {
                health.latency = latency;
            }
            if (slot !== undefined) {
                health.lastSlot = slot;
            }
            if (this.scorer) {
                health.score = this.scorer.getScore(url, this.steroidConfig.maxSlotLag);
            }
            // Track consecutive failures for circuit breaker
            if (healthy) {
                health.consecutiveFailures = 0;
            }
            else {
                health.consecutiveFailures = (health.consecutiveFailures || 0) + 1;
            }
        }
    }
    /**
     * Decides whether to retry or failover based on the error.
     * @returns true if the loop should continue (retry or failover), false if it should throw.
     */
    async handleExecutionError(error, methodName, attempt, attemptedUrls) {
        // 1. Transient Error (Rate limit, etc.) -> Just retry
        if (this.isTransientError(error)) {
            const delay = calculateBackoff(attempt + 1, 1000, SteroidConnection.MAX_BACKOFF_DELAY_MS, SteroidConnection.MAX_BACKOFF_DELAY_MS * SteroidConnection.JITTER_FACTOR);
            this.logger.info(`Retrying after ${delay.toFixed(0)}ms due to transient error (with jitter)`);
            await sleep(delay);
            return true;
        }
        // 2. Node Failure -> Mark unhealthy and try next if available
        if (this.isNodeFailure(error)) {
            this.logger.error(`Node failure detected during ${methodName} at ${this.getActiveEndpoint()}:`, error.message);
            this.updateHealthStatus(this.urls[this.currentUrlIndex], false, undefined, undefined);
            if (this.urls.length <= 1) {
                return false;
            }
            attemptedUrls.add(this.currentUrlIndex);
            if (attemptedUrls.size >= this.urls.length) {
                return false;
            }
            await this.switchToNextRpc(attemptedUrls);
            return true;
        }
        return false;
    }
    parseErrorContext(error) {
        return {
            message: error.message?.toLowerCase() || '',
            statusCode: error.statusCode || error.status || 0,
        };
    }
    /**
     * Identifies transient errors that should be retried on the same node (e.g. rate limits).
     */
    isTransientError(error) {
        const { message, statusCode } = this.parseErrorContext(error);
        const TRANSIENT_MESSAGES = ['retry', '429', 'too many requests', 'rate limit'];
        const TRANSIENT_STATUS_CODES = [429, 408];
        const matchedMessage = TRANSIENT_MESSAGES.some((msg) => message.includes(msg));
        const matchedCode = TRANSIENT_STATUS_CODES.includes(statusCode);
        const isRpcTimeout = message.includes('timeout') && !message.includes('transaction');
        return matchedMessage || matchedCode || isRpcTimeout;
    }
    /**
     * Identifies node-level failures that should trigger a failover to a different RPC.
     */
    isNodeFailure(error) {
        const { message, statusCode } = this.parseErrorContext(error);
        const FAILURE_MESSAGES = [
            'fetch failed',
            'network error',
            'econnrefused',
            'enotfound',
            'etimedout',
            '503',
            '504',
            '502',
            'connection reset',
        ];
        const FAILURE_STATUS_CODES = [502, 503, 504];
        const matchedMessage = FAILURE_MESSAGES.some((msg) => message.includes(msg));
        const matchedCode = FAILURE_STATUS_CODES.includes(statusCode);
        return matchedMessage || matchedCode;
    }
    /**
     * Switches to the next available RPC node.
     */
    async switchToNextRpc(attemptedUrls) {
        const nextIndex = this.findNextAvailableRpcIndex(attemptedUrls);
        const previousUrl = this.urls[this.currentUrlIndex];
        const nextUrl = this.urls[nextIndex];
        this.currentUrlIndex = nextIndex;
        this.failoverCount++;
        this.lastFailoverTime = Date.now();
        this.logger.warn(`Failover triggered (#${this.failoverCount}). Switching from ${previousUrl} to ${nextUrl}`);
        this.emitter?.emit('connection:failover', {
            from: previousUrl,
            to: nextUrl,
            reason: 'Node failure detected'
        });
        // Recreate the connection to clear internal state/websockets
        this.activeConnection = new Connection(nextUrl, this.config);
    }
    /**
     * Finds the index of the next healthy RPC, or the very next one if all are unhealthy.
     */
    findNextAvailableRpcIndex(attemptedUrls) {
        const now = Date.now();
        // 1. If latency scoring is enabled, pick the best node
        if (this.scorer) {
            const bestIndex = this.scorer.getBestUrlIndex(this.urls, this.healthStatus, attemptedUrls, this.steroidConfig.maxSlotLag);
            if (bestIndex !== -1)
                return bestIndex;
        }
        const startIndex = (this.currentUrlIndex + 1) % this.urls.length;
        // 2. Try to find the next healthy RPC starting from the next in line
        for (let i = 0; i < this.urls.length; i++) {
            const index = (startIndex + i) % this.urls.length;
            const url = this.urls[index];
            const health = this.healthStatus.get(url);
            // Only consider URLs not yet attempted in the current resilience loop
            if (!attemptedUrls.has(index)) {
                // Circuit Breaker: check if node is in cooldown or has too many failures
                const isCooldown = health?.lastUnhealthy && (now - health.lastUnhealthy < this.steroidConfig.unhealthyCooldownMs);
                const isCircuitOpen = (health?.consecutiveFailures ?? 0) >= SteroidConnection.CIRCUIT_BREAKER_THRESHOLD;
                if (health?.healthy && !isCooldown && !isCircuitOpen) {
                    return index;
                }
            }
        }
        // 3. Fallback: round-robin
        return startIndex;
    }
    enhanceError(error, methodName, attempts) {
        // Use ErrorTranslator to get a user-friendly error
        const translatedError = ErrorTranslator.translate(error, {
            methodName,
            attempts,
            currentUrl: this.urls[this.currentUrlIndex],
            component: 'SteroidConnection',
        });
        return translatedError;
    }
    /**
     * Get the underlying Connection instance for typed access.
     * Avoids the need for `as any` casts in downstream code.
     */
    getConnection() {
        return this.activeConnection;
    }
    /**
     * Perform health checks on all RPC endpoints.
     */
    async performHealthCheck() {
        const checks = this.urls.map((url) => this.checkNodeHealth(url));
        await Promise.allSettled(checks);
    }
    /**
     * Internal helper to check the health of a single RPC node.
     */
    async checkNodeHealth(url) {
        const startTime = Date.now();
        try {
            const tempConn = this.connectionPool.get(url);
            // We use getSlot as a lightweight "ping"
            const slot = await this.callWithTimeout('getSlot', [], tempConn, SteroidConnection.DEFAULT_HEALTH_CHECK_TIMEOUT_MS);
            const latency = Date.now() - startTime;
            this.scorer?.recordSlot(url, slot);
            this.scorer?.recordSuccess(url, latency);
            this.updateHealthStatus(url, true, latency, slot);
            this.emitter?.emit('connection:health', { endpoint: url, healthy: true, latency, slot });
            this.logger.info(`Health check passed for ${url} (Slot: ${slot}, ${latency}ms)`);
        }
        catch (error) {
            this.updateHealthStatus(url, false, undefined, undefined);
            this.scorer?.recordFailure(url);
            this.emitter?.emit('connection:health', { endpoint: url, healthy: false });
            this.logger.warn(`Health check failed for ${url}:`, error.message);
        }
    }
    startHealthChecks() {
        this.healthCheckTimer = setInterval(() => {
            this.performHealthCheck().catch((err) => {
                this.logger.error('Health check error:', err);
            });
        }, this.steroidConfig.healthCheckInterval);
    }
    /**
     * Clean up resources when done.
     */
    destroy() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = undefined;
        }
        this.connectionPool.clear();
    }
    /**
     * Get all endpoints for multi-node verification.
     */
    getEndpoints() {
        return [...this.urls];
    }
    /**
     * Get current active endpoint.
     */
    getActiveEndpoint() {
        return this.urls[this.currentUrlIndex];
    }
    /**
     * Get health status of all endpoints.
     */
    getHealthStatus() {
        return Array.from(this.healthStatus.values());
    }
    /**
     * Get failover statistics.
     */
    getFailoverStats() {
        return {
            count: this.failoverCount,
            lastTime: this.lastFailoverTime,
        };
    }
    /**
     * Manually trigger a health check.
     */
    async checkHealth() {
        await this.performHealthCheck();
        return this.getHealthStatus();
    }
    /**
     * Detects the cluster type and genesis hash.
     */
    async detectCluster() {
        const { cluster, genesisHash } = await ClusterDetector.detectFromConnection(this.activeConnection);
        this.detectedCluster = cluster;
        this.genesisHash = genesisHash;
        this.logger.info(`Detected cluster: ${ClusterDetector.getClusterName(cluster)} (${genesisHash.slice(0, 8)}...)`);
        this.emitter?.emit('connection:cluster-detected', { cluster, genesisHash });
        // Validate against expected cluster if configured
        if (this.config.expectedCluster && cluster !== 'unknown' && cluster !== this.config.expectedCluster) {
            this.logger.error(`Cluster mismatch! Detected ${cluster}, expected ${this.config.expectedCluster}`);
            this.emitter?.emit('connection:cluster-mismatch', {
                detected: cluster,
                expected: this.config.expectedCluster
            });
        }
    }
    /**
     * Gets the detected cluster type.
     */
    getCluster() {
        return this.detectedCluster;
    }
    /**
     * Gets the network genesis hash.
     */
    getGenesisHash() {
        return this.genesisHash;
    }
}
//# sourceMappingURL=SteroidConnection.js.map