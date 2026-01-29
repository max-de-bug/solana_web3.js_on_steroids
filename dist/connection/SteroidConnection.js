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
        let lastError;
        let attempt = 0;
        const attemptedUrls = new Set();
        while (attempt < this.steroidConfig.maxRetries) {
            try {
                // Add timeout wrapper
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), this.steroidConfig.requestTimeout));
                const methodPromise = method.apply(this.activeConnection, args);
                const result = await Promise.race([methodPromise, timeoutPromise]);
                // Mark current URL as healthy on success
                const currentUrl = this.urls[this.currentUrlIndex];
                const health = this.healthStatus.get(currentUrl);
                if (health) {
                    health.healthy = true;
                    health.lastChecked = Date.now();
                }
                return result;
            }
            catch (error) {
                lastError = error;
                attemptedUrls.add(this.currentUrlIndex);
                this.log('warn', `Method ${methodName} failed (attempt ${attempt + 1}/${this.steroidConfig.maxRetries}):`, error.message);
                // Check if this is a transient error (rate limit, temporary issue)
                if (this.isTransientError(error)) {
                    attempt++;
                    const delay = this.calculateBackoff(attempt);
                    this.log('info', `Retrying after ${delay}ms due to transient error`);
                    await this.sleep(delay);
                    continue;
                }
                // Check if this is a node failure
                if (this.isNodeFailure(error)) {
                    // Mark current node as unhealthy
                    const currentUrl = this.urls[this.currentUrlIndex];
                    const health = this.healthStatus.get(currentUrl);
                    if (health) {
                        health.healthy = false;
                        health.lastChecked = Date.now();
                    }
                    // Try to switch to next RPC if we have fallbacks and haven't tried all URLs
                    if (this.urls.length > 1 && attemptedUrls.size < this.urls.length) {
                        this.switchToNextRpc();
                        attempt++; // Count as an attempt
                        continue;
                    }
                }
                // If it's a non-retryable error or we've exhausted options, throw
                throw this.enhanceError(error, methodName, attempt);
            }
        }
        throw this.enhanceError(lastError, methodName, this.steroidConfig.maxRetries);
    }
    isTransientError(error) {
        const message = error.message?.toLowerCase() || '';
        const statusCode = error.statusCode || error.status;
        return (message.includes('retry') ||
            message.includes('429') ||
            message.includes('too many requests') ||
            message.includes('rate limit') ||
            statusCode === 429 ||
            statusCode === 408 || // Request timeout
            message.includes('timeout') && !message.includes('transaction') // RPC timeout, not tx timeout
        );
    }
    isNodeFailure(error) {
        const message = error.message?.toLowerCase() || '';
        const statusCode = error.statusCode || error.status;
        return (message.includes('fetch failed') ||
            message.includes('network error') ||
            message.includes('econnrefused') ||
            message.includes('enotfound') ||
            message.includes('etimedout') ||
            message.includes('503') ||
            message.includes('504') ||
            message.includes('502') ||
            message.includes('connection reset') ||
            statusCode === 502 ||
            statusCode === 503 ||
            statusCode === 504);
    }
    switchToNextRpc() {
        const previousIndex = this.currentUrlIndex;
        // Find next healthy RPC, or cycle through all if none are healthy
        let attempts = 0;
        do {
            this.currentUrlIndex = (this.currentUrlIndex + 1) % this.urls.length;
            attempts++;
            const nextUrl = this.urls[this.currentUrlIndex];
            const health = this.healthStatus.get(nextUrl);
            // If we find a healthy one, use it
            if (health?.healthy) {
                break;
            }
            // If we've tried all URLs, just use the next one regardless of health
            if (attempts >= this.urls.length) {
                break;
            }
        } while (this.currentUrlIndex !== previousIndex);
        const nextUrl = this.urls[this.currentUrlIndex];
        this.failoverCount++;
        this.lastFailoverTime = Date.now();
        this.log('warn', `Failover triggered (#${this.failoverCount}). Switching from ${this.urls[previousIndex]} to ${nextUrl}`);
        // Completely recreate the connection to clear internal state/websockets
        this.activeConnection = new Connection(nextUrl, this.config);
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
        switch (level) {
            case 'info':
                console.log(prefix, ...args);
                break;
            case 'warn':
                console.warn(prefix, ...args);
                break;
            case 'error':
                console.error(prefix, ...args);
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
                this.healthStatus.set(url, {
                    url,
                    healthy: true,
                    lastChecked: Date.now(),
                    latency,
                });
                this.log('info', `Health check passed for ${url} (${latency}ms)`);
            }
            catch (error) {
                this.healthStatus.set(url, {
                    url,
                    healthy: false,
                    lastChecked: Date.now(),
                });
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