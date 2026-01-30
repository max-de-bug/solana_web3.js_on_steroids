import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Transaction, Keypair, SystemProgram, PublicKey } from '@solana/web3.js';
import { SteroidWallet, WalletError } from '../../src/wallet/SteroidWallet.js';
import { SteroidConnection } from '../../src/connection/SteroidConnection.js';
import { WalletInterface, WalletErrorType } from '../../src/types/SteroidWalletTypes.js';

// Create mock wallet
function createMockWallet(publicKey?: PublicKey): WalletInterface {
  const mockPubKey = publicKey ?? new PublicKey('11111111111111111111111111111111');
  
  return {
    publicKey: mockPubKey,
    signTransaction: vi.fn().mockImplementation((tx) => Promise.resolve(tx)),
    signAllTransactions: vi.fn().mockImplementation((txs) => Promise.resolve(txs)),
    signMessage: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
  };
}

// Create mock connection
function createMockSteroidConnection(): SteroidConnection {
  return {
    getLatestBlockhash: vi.fn().mockResolvedValue({
      blockhash: 'mockBlockhash123456789',
      lastValidBlockHeight: 100000,
    }),
    getGenesisHash: vi.fn().mockResolvedValue('5eykt4UsFv8P8NJdTREpY1vzqBUfSmRciL826HUBRkEA'),
    simulateTransaction: vi.fn().mockResolvedValue({
      value: { err: null, logs: [] },
    }),
    sendRawTransaction: vi.fn().mockResolvedValue('2z7vAnS1uh1981S88mnyfFp72R1X54D2t7S1vC9S2mnyfFp72R1X54D2t7S1vC9S2mnyfFp72R1X54D2t7S1vC9S2mnyfFp72R1X'),
    getSignatureStatus: vi.fn().mockResolvedValue({
      value: { confirmationStatus: 'confirmed', err: null },
    }),
    getEndpoints: vi.fn().mockReturnValue(['https://mock.solana.com']),
  } as unknown as SteroidConnection;
}

function createTestTransaction(): Transaction {
  const payer = Keypair.generate();
  const recipient = Keypair.generate();
  
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipient.publicKey,
      lamports: 1000000,
    })
  );
  
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = '5eykt4UsFv8P8NJdTREpY1vzqBUfSmRciL826HUBRkEA';
  
  return tx;
}

describe('SteroidWallet', () => {
  let mockWallet: WalletInterface;
  let mockConnection: SteroidConnection;
  let steroidWallet: SteroidWallet;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWallet = createMockWallet();
    mockConnection = createMockSteroidConnection();
    steroidWallet = new SteroidWallet(mockWallet, mockConnection, {
      validateNetwork: false,
      enableLogging: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Public Key', () => {
    it('should return wallet public key', () => {
      expect(steroidWallet.publicKey).toBeDefined();
      expect(steroidWallet.publicKey?.toBase58()).toBe('11111111111111111111111111111111');
    });

    it('should return null for disconnected wallet', () => {
      const disconnectedWallet: WalletInterface = {
        publicKey: null,
        signTransaction: vi.fn(),
        signAllTransactions: vi.fn(),
      };
      
      const wallet = new SteroidWallet(disconnectedWallet, mockConnection);
      expect(wallet.publicKey).toBeNull();
    });
  });

  describe('signTransaction', () => {
    it('should sign a transaction successfully', async () => {
      const tx = createTestTransaction();
      
      const signedTx = await steroidWallet.signTransaction(tx);
      
      expect(signedTx).toBe(tx);
      expect(mockWallet.signTransaction).toHaveBeenCalledWith(tx);
    });

    it('should throw NOT_CONNECTED for disconnected wallet', async () => {
      const disconnectedWallet: WalletInterface = {
        publicKey: null,
        signTransaction: vi.fn(),
        signAllTransactions: vi.fn(),
      };
      
      const wallet = new SteroidWallet(disconnectedWallet, mockConnection);
      const tx = createTestTransaction();
      
      await expect(wallet.signTransaction(tx)).rejects.toThrow(WalletError);
      
      try {
        await wallet.signTransaction(tx);
      } catch (error) {
        expect((error as WalletError).type).toBe(WalletErrorType.NOT_CONNECTED);
      }
    });
  });

  describe('signAllTransactions', () => {
    it('should sign multiple transactions successfully', async () => {
      const tx1 = createTestTransaction();
      const tx2 = createTestTransaction();
      
      const signedTxs = await steroidWallet.signAllTransactions([tx1, tx2]);
      
      expect(signedTxs).toHaveLength(2);
      expect(mockWallet.signAllTransactions).toHaveBeenCalledWith([tx1, tx2]);
    });

    it('should return empty array for empty input', async () => {
      const signedTxs = await steroidWallet.signAllTransactions([]);
      
      expect(signedTxs).toHaveLength(0);
    });
  });

  describe('signMessage', () => {
    it('should sign a message successfully', async () => {
      const message = new Uint8Array([1, 2, 3, 4, 5]);
      
      const signature = await steroidWallet.signMessage(message);
      
      expect(signature).toBeInstanceOf(Uint8Array);
      expect(mockWallet.signMessage).toHaveBeenCalledWith(message);
    });

    it('should throw UNSUPPORTED_OPERATION if wallet does not support signMessage', async () => {
      const noSignMessageWallet: WalletInterface = {
        publicKey: new PublicKey('11111111111111111111111111111111'),
        signTransaction: vi.fn(),
        signAllTransactions: vi.fn(),
        signMessage: undefined as any,
      };
      
      const wallet = new SteroidWallet(noSignMessageWallet, mockConnection);
      const message = new Uint8Array([1, 2, 3, 4, 5]);
      
      await expect(wallet.signMessage(message)).rejects.toThrow(WalletError);
      
      try {
        await wallet.signMessage(message);
      } catch (error) {
        expect((error as WalletError).type).toBe(WalletErrorType.UNSUPPORTED_OPERATION);
      }
    });
  });

  describe('Error Normalization', () => {
    it('should normalize user rejection errors', async () => {
      mockWallet.signTransaction = vi.fn().mockRejectedValue(
        new Error('User rejected the request')
      );
      
      const tx = createTestTransaction();
      
      try {
        await steroidWallet.signTransaction(tx);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WalletError);
        expect((error as WalletError).type).toBe(WalletErrorType.USER_REJECTED);
      }
    });

    it('should normalize "user denied" errors', async () => {
      mockWallet.signTransaction = vi.fn().mockRejectedValue(
        new Error('User denied the signature request')
      );
      
      const tx = createTestTransaction();
      
      try {
        await steroidWallet.signTransaction(tx);
      } catch (error) {
        expect((error as WalletError).type).toBe(WalletErrorType.USER_REJECTED);
      }
    });

    it('should normalize connection errors', async () => {
      mockWallet.signTransaction = vi.fn().mockRejectedValue(
        new Error('Wallet not connected')
      );
      
      const tx = createTestTransaction();
      
      try {
        await steroidWallet.signTransaction(tx);
      } catch (error) {
        expect((error as WalletError).type).toBe(WalletErrorType.NOT_CONNECTED);
      }
    });

    it('should normalize signing failure errors', async () => {
      mockWallet.signTransaction = vi.fn().mockRejectedValue(
        new Error('Failed to sign transaction')
      );
      
      const tx = createTestTransaction();
      
      try {
        await steroidWallet.signTransaction(tx);
      } catch (error) {
        expect((error as WalletError).type).toBe(WalletErrorType.SIGNING_FAILED);
      }
    });

    it('should map unknown errors to UNKNOWN type', async () => {
      mockWallet.signTransaction = vi.fn().mockRejectedValue(
        new Error('Some completely random error')
      );
      
      const tx = createTestTransaction();
      
      try {
        await steroidWallet.signTransaction(tx);
      } catch (error) {
        expect((error as WalletError).type).toBe(WalletErrorType.UNKNOWN);
        expect((error as WalletError).originalError).toBeDefined();
      }
    });
  });

  describe('Network Info', () => {
    it('should return network info', () => {
      const networkInfo = steroidWallet.getNetworkInfo();
      
      expect(networkInfo).toHaveProperty('validated');
      expect(networkInfo.validated).toBe(false);
    });

    it('should invalidate network on demand', () => {
      steroidWallet.invalidateNetwork();
      
      const networkInfo = steroidWallet.getNetworkInfo();
      expect(networkInfo.validated).toBe(false);
    });
  });

  describe('Feature Detection', () => {
    it('should detect message signing support', () => {
      expect(steroidWallet.supportsMessageSigning()).toBe(true);
    });

    it('should detect lack of message signing support', () => {
      const noSignMessageWallet: WalletInterface = {
        publicKey: new PublicKey('11111111111111111111111111111111'),
        signTransaction: vi.fn(),
        signAllTransactions: vi.fn(),
        signMessage: undefined as any,
      };
      
      const wallet = new SteroidWallet(noSignMessageWallet, mockConnection);
      expect(wallet.supportsMessageSigning()).toBe(false);
    });
  });

  describe('Logging', () => {
    it('should log when enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const wallet = new SteroidWallet(mockWallet, mockConnection, {
        enableLogging: true,
        validateNetwork: false,
      });
      
      const tx = createTestTransaction();
      await wallet.signTransaction(tx);
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
