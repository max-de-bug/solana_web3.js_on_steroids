import { Connection, ConnectionConfig } from '@solana/web3.js';

export interface SteroidConnectionConfig extends ConnectionConfig {
  /**
   * List of fallback RPC URLs to use if the primary one fails.
   */
  fallbacks?: string[];
  /**
   * Maximum number of retries for rate-limited or transient errors.
   */
  maxRetries?: number;
  /**
   * Initial delay for exponential backoff in milliseconds.
   */
  retryDelay?: number;
}

/**
 * SteroidConnection uses a Proxy pattern to wrap a real @solana/web3.js Connection.
 * This allows swapping the underlying connection (and its internal state/websockets)
 * transparently when a failover occurs.
 */
export class SteroidConnection {
  private activeConnection: Connection;
  private urls: string[];
  private currentUrlIndex: number = 0;
  private config: SteroidConnectionConfig;
  private steroidConfig: Required<Pick<SteroidConnectionConfig, 'maxRetries' | 'retryDelay'>>;

  constructor(endpoint: string, config: SteroidConnectionConfig = {}) {
    this.urls = [endpoint, ...(config.fallbacks || [])];
    this.config = config;
    this.steroidConfig = {
      maxRetries: config.maxRetries ?? 5,
      retryDelay: config.retryDelay ?? 500,
    };
    this.activeConnection = new Connection(endpoint, config);

    // Return a Proxy so the user can treat it as a standard Connection object
    return new Proxy(this, {
      get(target, prop, receiver) {
        // 1. If the property exists on our wrapper (like 'switchToNextRpc'), use it.
        if (prop in target) {
          return Reflect.get(target, prop, receiver);
        }

        // 2. Otherwise, forward to the active Connection instance.
        const value = Reflect.get(target.activeConnection, prop, target.activeConnection);

        // 3. If it's a function (like 'getAccountInfo'), wrap it with retry/failover logic.
        if (typeof value === 'function') {
          return (...args: any[]) => target.executeWithResilience(prop as string, value, args);
        }

        return value;
      },
    }) as any as SteroidConnection & Connection;
  }

  /**
   * Executes a connection method with intelligent retries and failover.
   */
  private async executeWithResilience(methodName: string, method: Function, args: any[]): Promise<any> {
    let lastError: any;
    let attempt = 0;

    while (attempt < this.steroidConfig.maxRetries) {
      try {
        return await method.apply(this.activeConnection, args);
      } catch (error: any) {
        lastError = error;

        if (this.isTransientError(error)) {
          attempt++;
          const delay = this.steroidConfig.retryDelay * Math.pow(2, attempt) + Math.random() * 100;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        if (this.isNodeFailure(error) && this.urls.length > 1) {
          this.switchToNextRpc();
          // After switching, the next iteration will use the new this.activeConnection
          continue;
        }

        throw error;
      }
    }
    throw lastError;
  }

  private isTransientError(error: any): boolean {
    const message = error.message?.toLowerCase() || '';
    return message.includes('retry') || message.includes('429') || message.includes('too many requests');
  }

  private isNodeFailure(error: any): boolean {
    const message = error.message?.toLowerCase() || '';
    return message.includes('fetch failed') || message.includes('network error') || message.includes('503') || message.includes('504');
  }

  private switchToNextRpc() {
    this.currentUrlIndex = (this.currentUrlIndex + 1) % this.urls.length;
    const nextUrl = this.urls[this.currentUrlIndex];
    console.warn(`[SteroidConnection] Failover triggered. Swapping to RPC: ${nextUrl}`);
    
    // Completely recreate the connection to clear internal state/websockets
    this.activeConnection = new Connection(nextUrl, this.config);
  }

  /**
   * Expose all endpoints for multi-node verification
   */
  public getEndpoints(): string[] {
    return this.urls;
  }
}
