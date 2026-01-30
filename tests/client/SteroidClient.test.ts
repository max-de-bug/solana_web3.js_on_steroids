import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PublicKey, Connection } from '@solana/web3.js';
import { SteroidClient, createSteroidClient } from '../../src/client/SteroidClient.js';
import { SteroidWallet } from '../../src/wallet/SteroidWallet.js';
import { WalletInterface } from '../../src/types/SteroidWalletTypes.js';

// Mock the Connection class
vi.mock('@solana/web3.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@solana/web3.js')>();
  return {
    ...actual,
    Connection: vi.fn().mockImplementation(function (url: string) {
      return {
        _url: url,
        getSlot: vi.fn().mockResolvedValue(12345),
        getLatestBlockhash: vi.fn().mockResolvedValue({
          blockhash: '5eykt4UsFv8P8NJdTREpY1vzqBUfSmRciL826HUBRkEA',
          lastValidBlockHeight: 100000,
        }),
        getGenesisHash: vi.fn().mockResolvedValue('5eykt4UsFv8P8NJdTREpY1vzqBUfSmRciL826HUBRkEA'),
        sendRawTransaction: vi.fn().mockResolvedValue('2z7vAnS1uh1981S88mnyfFp72R1X54D2t7S1vC9S2mnyfFp72R1X54D2t7S1vC9S2mnyfFp72R1X54D2t7S1vC9S2mnyfFp72R1X'),
      };
    }),
  };
});

function createMockWallet(): WalletInterface {
  return {
    publicKey: new PublicKey('11111111111111111111111111111111'),
    signTransaction: vi.fn().mockImplementation((tx) => Promise.resolve(tx)),
    signAllTransactions: vi.fn().mockImplementation((txs) => Promise.resolve(txs)),
    signMessage: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
  };
}

describe('SteroidClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should create a client with a single endpoint', () => {
      const client = new SteroidClient('https://api.mainnet-beta.solana.com');
      
      expect(client).toBeDefined();
    });

    it('should create a client with multiple endpoints (array)', () => {
      const client = new SteroidClient([
        'https://primary.solana.com',
        'https://fallback1.solana.com',
        'https://fallback2.solana.com',
      ]);
      
      expect(client).toBeDefined();
    });

    it('should create a client with fallbacks in config', () => {
      const client = new SteroidClient('https://primary.solana.com', {
        connection: {
          fallbacks: ['https://fallback.solana.com'],
        },
      });
      
      expect(client).toBeDefined();
    });

    it('should enable logging when configured', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const client = new SteroidClient('https://api.mainnet-beta.solana.com', {
        enableLogging: true,
      });
      
      expect(client).toBeDefined();
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('Factory Function', () => {
    it('should create a client using the factory function', () => {
      const client = createSteroidClient('https://api.mainnet-beta.solana.com');
      
      expect(client).toBeInstanceOf(SteroidClient);
    });

    it('should accept config in factory function', () => {
      const client = createSteroidClient('https://api.mainnet-beta.solana.com', {
        enableLogging: false,
      });
      
      expect(client).toBeInstanceOf(SteroidClient);
    });
  });

  describe('connectWallet', () => {
    it('should return a SteroidWallet instance', () => {
      const client = new SteroidClient('https://api.mainnet-beta.solana.com');
      const mockWallet = createMockWallet();
      
      const steroidWallet = client.connectWallet(mockWallet);
      
      expect(steroidWallet).toBeInstanceOf(SteroidWallet);
    });

    it('should merge wallet config with client config', () => {
      const client = new SteroidClient('https://api.mainnet-beta.solana.com', {
        wallet: {
          validateNetwork: true,
        },
      });
      const mockWallet = createMockWallet();
      
      const steroidWallet = client.connectWallet(mockWallet, {
        enableLogging: true,
      });
      
      expect(steroidWallet).toBeInstanceOf(SteroidWallet);
    });

    it('should throw if client is destroyed', () => {
      const client = new SteroidClient('https://api.mainnet-beta.solana.com');
      const mockWallet = createMockWallet();
      
      client.destroy();
      
      expect(() => client.connectWallet(mockWallet)).toThrow('destroyed');
    });
  });

  describe('getTransactionEngine', () => {
    it('should return the transaction engine', () => {
      const client = new SteroidClient('https://api.mainnet-beta.solana.com');
      
      const txEngine = client.getTransactionEngine();
      
      expect(txEngine).toBeDefined();
    });

    it('should throw if client is destroyed', () => {
      const client = new SteroidClient('https://api.mainnet-beta.solana.com');
      
      client.destroy();
      
      expect(() => client.getTransactionEngine()).toThrow('destroyed');
    });
  });

  describe('getStats', () => {
    it('should return client statistics', () => {
      const client = new SteroidClient('https://api.mainnet-beta.solana.com');
      
      const stats = client.getStats();
      
      expect(stats).toHaveProperty('activeEndpoint');
      expect(stats).toHaveProperty('allEndpoints');
      expect(stats).toHaveProperty('failoverStats');
      expect(stats).toHaveProperty('healthStatus');
    });

    it('should throw if client is destroyed', () => {
      const client = new SteroidClient('https://api.mainnet-beta.solana.com');
      
      client.destroy();
      
      expect(() => client.getStats()).toThrow('destroyed');
    });
  });

  describe('checkAllHealth', () => {
    it('should return health status array', async () => {
      const client = new SteroidClient('https://api.mainnet-beta.solana.com');
      
      const health = await client.checkAllHealth();
      
      expect(Array.isArray(health)).toBe(true);
    });

    it('should throw if client is destroyed', async () => {
      const client = new SteroidClient('https://api.mainnet-beta.solana.com');
      
      client.destroy();
      
      await expect(client.checkAllHealth()).rejects.toThrow('destroyed');
    });
  });

  describe('destroy', () => {
    it('should destroy the client', () => {
      const client = new SteroidClient('https://api.mainnet-beta.solana.com');
      
      expect(() => client.destroy()).not.toThrow();
    });

    it('should be idempotent', () => {
      const client = new SteroidClient('https://api.mainnet-beta.solana.com');
      
      client.destroy();
      expect(() => client.destroy()).not.toThrow();
    });

    it('should log when logging is enabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const client = new SteroidClient('https://api.mainnet-beta.solana.com', {
        enableLogging: true,
      });
      
      client.destroy();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SteroidClient] Destroyed')
      );
      
      consoleSpy.mockRestore();
    });
  });
});
