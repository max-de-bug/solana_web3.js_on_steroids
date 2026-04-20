import { Connection, ConnectionConfig } from '@solana/web3.js';

/**
 * ConnectionPool maintains a reusable set of `Connection` objects keyed by URL.
 *
 * Creating a new `Connection` for every health check or concurrent race is wasteful:
 * each constructor establishes internal WebSocket state and HTTP agent setup.
 * This pool lazily creates connections and reuses them across the lifetime of
 * the `SteroidConnection`.
 *
 * @example
 * ```ts
 * const pool = new ConnectionPool({ commitment: 'confirmed' });
 * const conn = pool.get('https://api.mainnet-beta.solana.com');
 * // reuse `conn` on subsequent calls — no new allocation
 * ```
 */
export class ConnectionPool {
  private pool: Map<string, Connection> = new Map();
  private config: ConnectionConfig;

  constructor(config: ConnectionConfig = {}) {
    this.config = config;
  }

  /**
   * Returns a cached `Connection` for the given URL, creating one if it doesn't exist.
   */
  get(url: string): Connection {
    let conn = this.pool.get(url);
    if (!conn) {
      conn = new Connection(url, this.config);
      this.pool.set(url, conn);
    }
    return conn;
  }

  /**
   * Removes and returns a specific URL's connection, or undefined.
   * Useful when a connection is deemed permanently unhealthy.
   */
  evict(url: string): Connection | undefined {
    const conn = this.pool.get(url);
    this.pool.delete(url);
    return conn;
  }

  /**
   * Clears all pooled connections.
   */
  clear(): void {
    this.pool.clear();
  }

  /**
   * Returns the number of pooled connections.
   */
  get size(): number {
    return this.pool.size;
  }
}
