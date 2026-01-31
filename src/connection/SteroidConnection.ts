import { Connection } from '@solana/web3.js';
import { SteroidConnectionConfig, RPCHealth } from '../types/SteroidWalletTypes.js';
import { sleep, Logger, calculateBackoff } from '../utils/index.js';

/**
 * SteroidConnection uses a Proxy pattern to wrap a real @solana/web3.js Connection.
 * This allows swapping the underlying connection (and its internal state/websockets)
 * transparently when a failover occurs.
 */
export class SteroidConnection {
  private static readonly DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 5000;
  private static readonly MAX_BACKOFF_DELAY_MS = 30000;
  private static readonly JITTER_MS = 100;

  private activeConnection: Connection;
  private urls: string[];
  private currentUrlIndex: number = 0;
  private config: SteroidConnectionConfig;
  private steroidConfig: Required<
    Pick<SteroidConnectionConfig, 'maxRetries' | 'retryDelay' | 'healthCheckInterval' | 'requestTimeout' | 'enableLogging'>
  >;
  private healthStatus: Map<string, RPCHealth> = new Map();
  private healthCheckTimer?: NodeJS.Timeout;
  private failoverCount: number = 0;
  private lastFailoverTime: number = 0;
  private logger: Logger;

  constructor(endpoint: string, config: SteroidConnectionConfig = {}) {
    this.urls = [endpoint, ...(config.fallbacks || [])];
    this.config = config;
    this.steroidConfig = {
      maxRetries: config.maxRetries ?? 5,
      retryDelay: config.retryDelay ?? 500,
      healthCheckInterval: config.healthCheckInterval ?? 30000,
      requestTimeout: config.requestTimeout ?? 30000,
      enableLogging: config.enableLogging ?? false,
    };
    this.logger = new Logger('SteroidConnection', this.steroidConfig.enableLogging);

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
          const methodName = prop as string;
          
          return (...args: any[]) => {
            // Optimization: skip resilience for methods we know don't need it or are standard
            if (['rpcEndpoint', 'commitment'].includes(methodName)) {
              return value.apply(target.activeConnection, args);
            }
            
            return target.executeWithResilience(methodName, value, args);
          };
        }

        return value;
      },
    }) as any as SteroidConnection & Connection;
  }

  /**
   * Executes a connection method with intelligent retries and failover.
   */
  private async executeWithResilience(methodName: string, method: Function, args: any[]): Promise<any> {
    const attemptedUrls = new Set<number>();
    let lastError: any;

    for (let attempt = 0; attempt < this.steroidConfig.maxRetries; attempt++) {
      try {
        const result = await this.callWithTimeout(
          method, 
          args, 
          this.activeConnection, 
          this.steroidConfig.requestTimeout
        );
        this.updateHealthStatus(this.getActiveEndpoint(), true);
        return result;
      } catch (error: any) {
        // Map AbortError from our controller to a "Request timeout" message for consistency
        lastError = error.name === 'AbortError' ? new Error('Request timeout') : error;
        attemptedUrls.add(this.currentUrlIndex);
        
        this.logger.warn(`Method ${methodName} failed (attempt ${attempt + 1}/${this.steroidConfig.maxRetries}):`, lastError.message);

        const shouldRetry = await this.handleExecutionError(lastError, methodName, attempt, attemptedUrls);
        if (!shouldRetry) {
          throw this.enhanceError(lastError, methodName, attempt + 1);
        }
      }
    }

    throw this.enhanceError(lastError, methodName, this.steroidConfig.maxRetries);
  }

  /**
   * Internal helper to execute a method with a promise-based timeout and AbortController.
   * This effectively cancels the underlying network request on timeout.
   */
  private async callWithTimeout(
    method: Function, 
    args: any[], 
    target: any, 
    timeoutMs: number
  ): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // 1. Check if the method likely accepts a config object with an AbortSignal
      // Many web3.js methods take an optional config as the last argument
      const lastArg = args[args.length - 1];
      const methodWithSignal = (typeof lastArg === 'object' && lastArg !== null && !Array.isArray(lastArg))
        ? method.apply(target, [...args.slice(0, -1), { ...lastArg, signal: controller.signal }])
        : method.apply(target, [...args, { signal: controller.signal }]);

      return await methodWithSignal;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Updates health status for a specific URL.
   */
  private updateHealthStatus(url: string, healthy: boolean, latency?: number): void {
    const health = this.healthStatus.get(url);
    if (health) {
      health.healthy = healthy;
      health.lastChecked = Date.now();
      if (latency !== undefined) health.latency = latency;
    }
  }

  /**
   * Decides whether to retry or failover based on the error.
   * @returns true if the loop should continue (retry or failover), false if it should throw.
   */
  private async handleExecutionError(error: any, methodName: string, attempt: number, attemptedUrls: Set<number>): Promise<boolean> {
    // 1. Transient Error (Rate limit, etc.) -> Just retry
    if (this.isTransientError(error)) {
      const delay = calculateBackoff(attempt + 1, 1000, SteroidConnection.MAX_BACKOFF_DELAY_MS);
      this.logger.info(`Retrying after ${delay.toFixed(0)}ms due to transient error`);
      await sleep(delay);
      return true; 
    }

    // 2. Node Failure -> Mark unhealthy and try next if available
    if (this.isNodeFailure(error)) {
      this.logger.error(`Node failure detected at ${this.getActiveEndpoint()}:`, error.message);
      this.updateHealthStatus(this.urls[this.currentUrlIndex], false);

      if (this.urls.length > 1 && attemptedUrls.size < this.urls.length) {
        await this.switchToNextRpc(attemptedUrls);
        return true;
      }
    }

    return false;
  }

  private parseErrorContext(error: any) {
    return {
      message: error.message?.toLowerCase() || '',
      statusCode: error.statusCode || error.status || 0,
    };
  }

  /**
   * Identifies transient errors that should be retried on the same node (e.g. rate limits).
   */
  private isTransientError(error: any): boolean {
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
  private isNodeFailure(error: any): boolean {
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
  private async switchToNextRpc(attemptedUrls: Set<number>): Promise<void> {
    const nextIndex = this.findNextAvailableRpcIndex(attemptedUrls);
    const previousUrl = this.urls[this.currentUrlIndex];
    const nextUrl = this.urls[nextIndex];

    this.currentUrlIndex = nextIndex;
    this.failoverCount++;
    this.lastFailoverTime = Date.now();
    
    this.logger.warn(`Failover triggered (#${this.failoverCount}). Switching from ${previousUrl} to ${nextUrl}`);

    // Recreate the connection to clear internal state/websockets
    this.activeConnection = new Connection(nextUrl, this.config);
  }

  /**
   * Finds the index of the next healthy RPC, or the very next one if all are unhealthy.
   */
  private findNextAvailableRpcIndex(attemptedUrls: Set<number>): number {
    const startIndex = (this.currentUrlIndex + 1) % this.urls.length;
    
    // 1. Try to find the next healthy RPC starting from the next in line
    for (let i = 0; i < this.urls.length; i++) {
      const index = (startIndex + i) % this.urls.length;
      // Only consider URLs not yet attempted in the current resilience loop
      if (!attemptedUrls.has(index) && this.healthStatus.get(this.urls[index])?.healthy) {
        return index;
      }
    }
    
    // 2. Fallback: if all healthy nodes have been attempted or none are healthy,
    // just try the very next one in the list (round-robin)
    return startIndex;
  }

  private enhanceError(error: any, methodName: string, attempts: number): Error {
    const enhancedError = new Error(
      `[SteroidConnection] ${methodName} failed after ${attempts} attempts. Last error: ${error.message}`
    );
    (enhancedError as any).originalError = error;
    (enhancedError as any).methodName = methodName;
    (enhancedError as any).attempts = attempts;
    (enhancedError as any).currentUrl = this.urls[this.currentUrlIndex];
    return enhancedError;
  }

  private log(level: 'info' | 'warn' | 'error', ...args: any[]): void {
    this.logger.log(level, ...args);
  }

  /**
   * Perform health checks on all RPC endpoints.
   */
  private async performHealthCheck(): Promise<void> {
    const checks = this.urls.map((url) => this.checkNodeHealth(url));
    await Promise.allSettled(checks);
  }

  /**
   * Internal helper to check the health of a single RPC node.
   */
  private async checkNodeHealth(url: string): Promise<void> {
    const startTime = Date.now();
    try {
      const tempConn = new Connection(url, { commitment: 'confirmed' });
      
      // We use getSlot as a lightweight "ping"
      await this.callWithTimeout(
        tempConn.getSlot,
        [],
        tempConn,
        SteroidConnection.DEFAULT_HEALTH_CHECK_TIMEOUT_MS
      );
      
      const latency = Date.now() - startTime;
      this.updateHealthStatus(url, true, latency);
      this.log('info', `Health check passed for ${url} (${latency}ms)`);
    } catch (error: any) {
      this.updateHealthStatus(url, false);
      this.log('warn', `Health check failed for ${url}:`, error.message);
    }
  }

  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck().catch((err) => {
        this.log('error', 'Health check error:', err);
      });
    }, this.steroidConfig.healthCheckInterval);
  }

  /**
   * Clean up resources when done.
   */
  public destroy(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * Get all endpoints for multi-node verification.
   */
  public getEndpoints(): string[] {
    return [...this.urls];
  }

  /**
   * Get current active endpoint.
   */
  public getActiveEndpoint(): string {
    return this.urls[this.currentUrlIndex];
  }

  /**
   * Get health status of all endpoints.
   */
  public getHealthStatus(): RPCHealth[] {
    return Array.from(this.healthStatus.values());
  }

  /**
   * Get failover statistics.
   */
  public getFailoverStats(): { count: number; lastTime: number } {
    return {
      count: this.failoverCount,
      lastTime: this.lastFailoverTime,
    };
  }

  /**
   * Manually trigger a health check.
   */
  public async checkHealth(): Promise<RPCHealth[]> {
    await this.performHealthCheck();
    return this.getHealthStatus();
  }
}