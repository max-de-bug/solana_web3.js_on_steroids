import { Connection } from '@solana/web3.js';
/**
 * SteroidConnection uses a Proxy pattern to wrap a real @solana/web3.js Connection.
 * This allows swapping the underlying connection (and its internal state/websockets)
 * transparently when a failover occurs.
 */
export class SteroidConnection {
    activeConnection;
    urls;
    currentUrlIndex = 0;
    config;
    steroidConfig;
    healthStatus = new Map();
    healthCheckTimer;
    failoverCount = 0;
    lastFailoverTime = 0;
    constructor(endpoint, config = {}) {
        this.urls = [endpoint, ...(config.fallbacks || [])];
        this.config = config;
        this.steroidConfig = {
            maxRetries: config.maxRetries ?? 5,
            retryDelay: config.retryDelay ?? 500,
            healthCheckInterval: config.healthCheckInterval ?? 30000,
            requestTimeout: config.requestTimeout ?? 30000,
            enableLogging: config.enableLogging ?? false,
        };
        // Initialize health status
        this.urls.forEach((url) => {
            this.healthStatus.set(url, {
                url,
                healthy: true,
                lastChecked: Date.now(),
            });
        });
        this.activeConnection = new Connection(endpoint, config);
        // Start health checks if enabled
        if (this.steroidConfig.healthCheckInterval > 0) {
            this.startHealthChecks();
        }
        // Return a Proxy so the user can treat it as a standard Connection object
        return new Proxy(this, {
            get(target, prop, receiver) {
                // 1. If the property exists on our wrapper, use it.
                if (prop in target) {
                    return Reflect.get(target, prop, receiver);
                }
                // 2. Otherwise, forward to the active Connection instance.
                const value = Reflect.get(target.activeConnection, prop, target.activeConnection);
                // 3. If it's a function, wrap it with retry/failover logic.
                if (typeof value === 'function') {
                    return (...args) => target.executeWithResilience(prop, value, args);
                }
                return value;
            },
        });
    }
    /**
     * Executes a connection method with intelligent retries and failover.
     */
    async executeWithResilience(methodName, method, args) {
        const attemptedUrls = new Set();
        let lastError;
        for (let attempt = 0; attempt < this.steroidConfig.maxRetries; attempt++) {
            try {
                const result = await this.callWithTimeout(method, args);
                this.updateHealthStatus(this.getActiveEndpoint(), true);
                return result;
            }
            catch (error) {
                lastError = error;
                attemptedUrls.add(this.currentUrlIndex);
                this.log('warn', `Method ${methodName} failed (attempt ${attempt + 1}/${this.steroidConfig.maxRetries}):`, error.message);
                const shouldRetry = await this.handleExecutionError(error, methodName, attempt, attemptedUrls);
                if (!shouldRetry) {
                    throw this.enhanceError(error, methodName, attempt + 1);
                }
            }
        }
        throw this.enhanceError(lastError, methodName, this.steroidConfig.maxRetries);
    }
    /**
     * Internal helper to execute a method with a promise-based timeout.
     */
    async callWithTimeout(method, args) {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), this.steroidConfig.requestTimeout));
        return Promise.race([method.apply(this.activeConnection, args), timeoutPromise]);
    }
    /**
     * Updates health status for a specific URL.
     */
    updateHealthStatus(url, healthy, latency) {
        const health = this.healthStatus.get(url);
        if (health) {
            health.healthy = healthy;
            health.lastChecked = Date.now();
            if (latency !== undefined)
                health.latency = latency;
        }
    }
    /**
     * Decides whether to retry or failover based on the error.
     * @returns true if the loop should continue (retry or failover), false if it should throw.
     */
    async handleExecutionError(error, methodName, attempt, attemptedUrls) {
        // 1. Transient Error (Rate limit, etc.) -> Just retry
        if (this.isTransientError(error)) {
            const delay = this.calculateBackoff(attempt + 1);
            this.log('info', `Retrying after ${delay}ms due to transient error`);
            await this.sleep(delay);
            return true;
        }
        // 2. Node Failure -> Mark unhealthy and try next if available
        if (this.isNodeFailure(error)) {
            this.updateHealthStatus(this.urls[this.currentUrlIndex], false);
            if (this.urls.length > 1 && attemptedUrls.size < this.urls.length) {
                this.switchToNextRpc();
                return true;
            }
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
    switchToNextRpc() {
        const nextIndex = this.findNextAvailableRpcIndex();
        const previousUrl = this.urls[this.currentUrlIndex];
        const nextUrl = this.urls[nextIndex];
        this.currentUrlIndex = nextIndex;
        this.failoverCount++;
        this.lastFailoverTime = Date.now();
        this.log('warn', `Failover triggered (#${this.failoverCount}). Switching from ${previousUrl} to ${nextUrl}`);
        // Recreate the connection to clear internal state/websockets
        this.activeConnection = new Connection(nextUrl, this.config);
    }
    /**
     * Finds the index of the next healthy RPC, or the very next one if all are unhealthy.
     */
    findNextAvailableRpcIndex() {
        const startIndex = (this.currentUrlIndex + 1) % this.urls.length;
        // 1. Try to find the next healthy RPC starting from the next in line
        for (let i = 0; i < this.urls.length; i++) {
            const index = (startIndex + i) % this.urls.length;
            if (this.healthStatus.get(this.urls[index])?.healthy) {
                return index;
            }
        }
        // 2. Fallback: if all are unhealthy, just try the very next one in the list
        return startIndex;
    }
    calculateBackoff(attempt) {
        const baseDelay = this.steroidConfig.retryDelay;
        const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 100;
        return Math.min(exponentialDelay + jitter, 10000); // Cap at 10 seconds
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    enhanceError(error, methodName, attempts) {
        const enhancedError = new Error(`[SteroidConnection] ${methodName} failed after ${attempts} attempts. Last error: ${error.message}`);
        enhancedError.originalError = error;
        enhancedError.methodName = methodName;
        enhancedError.attempts = attempts;
        enhancedError.currentUrl = this.urls[this.currentUrlIndex];
        return enhancedError;
    }
    log(level, ...args) {
        if (!this.steroidConfig.enableLogging)
            return;
        const prefix = '[SteroidConnection]';
        const finalArgs = [...args];
        if (typeof finalArgs[0] === 'string') {
            finalArgs[0] = `${prefix} ${finalArgs[0]}`;
        }
        else {
            finalArgs.unshift(prefix);
        }
        switch (level) {
            case 'info':
                console.log(...finalArgs);
                break;
            case 'warn':
                console.warn(...finalArgs);
                break;
            case 'error':
                console.error(...finalArgs);
                break;
        }
    }
    /**
     * Perform health checks on all RPC endpoints.
     */
    async performHealthCheck() {
        const checks = this.urls.map(async (url) => {
            const startTime = Date.now();
            try {
                const tempConn = new Connection(url, { commitment: 'confirmed' });
                await Promise.race([
                    tempConn.getSlot(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Health check timeout')), 5000))
                ]);
                const latency = Date.now() - startTime;
                this.updateHealthStatus(url, true, latency);
                this.log('info', `Health check passed for ${url} (${latency}ms)`);
            }
            catch (error) {
                this.updateHealthStatus(url, false);
                this.log('warn', `Health check failed for ${url}:`, error.message);
            }
        });
        await Promise.allSettled(checks);
    }
    startHealthChecks() {
        this.healthCheckTimer = setInterval(() => {
            this.performHealthCheck().catch((err) => {
                this.log('error', 'Health check error:', err);
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
}
//# sourceMappingURL=SteroidConnection.js.map