import { describe, it, expect } from 'vitest';
import { ConnectionPool } from '../../src/connection/ConnectionPool.js';

describe('ConnectionPool', () => {
  it('should create and return a connection for a URL', () => {
    const pool = new ConnectionPool({ commitment: 'confirmed' });
    const conn = pool.get('https://api.mainnet-beta.solana.com');
    
    expect(conn).toBeDefined();
    expect(pool.size).toBe(1);
  });

  it('should return the same connection for the same URL', () => {
    const pool = new ConnectionPool();
    const conn1 = pool.get('https://api.mainnet-beta.solana.com');
    const conn2 = pool.get('https://api.mainnet-beta.solana.com');
    
    expect(conn1).toBe(conn2);
    expect(pool.size).toBe(1);
  });

  it('should create separate connections for different URLs', () => {
    const pool = new ConnectionPool();
    const conn1 = pool.get('https://api.mainnet-beta.solana.com');
    const conn2 = pool.get('https://api.devnet.solana.com');
    
    expect(conn1).not.toBe(conn2);
    expect(pool.size).toBe(2);
  });

  it('should evict a specific connection', () => {
    const pool = new ConnectionPool();
    const conn = pool.get('https://api.mainnet-beta.solana.com');
    
    const evicted = pool.evict('https://api.mainnet-beta.solana.com');
    
    expect(evicted).toBe(conn);
    expect(pool.size).toBe(0);
  });

  it('should return undefined when evicting a non-existent URL', () => {
    const pool = new ConnectionPool();
    
    const evicted = pool.evict('https://nonexistent.solana.com');
    
    expect(evicted).toBeUndefined();
  });

  it('should clear all connections', () => {
    const pool = new ConnectionPool();
    pool.get('https://api.mainnet-beta.solana.com');
    pool.get('https://api.devnet.solana.com');
    
    expect(pool.size).toBe(2);
    
    pool.clear();
    
    expect(pool.size).toBe(0);
  });

  it('should create a new connection after eviction for the same URL', () => {
    const pool = new ConnectionPool();
    const conn1 = pool.get('https://api.mainnet-beta.solana.com');
    pool.evict('https://api.mainnet-beta.solana.com');
    const conn2 = pool.get('https://api.mainnet-beta.solana.com');
    
    expect(conn1).not.toBe(conn2);
  });
});
