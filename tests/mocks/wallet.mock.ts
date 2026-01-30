import { vi } from 'vitest';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { WalletInterface } from '../../src/types/SteroidWalletTypes.js';

/**
 * Create a mock wallet that behaves correctly
 */
export function createMockWallet(publicKeyBase58?: string): WalletInterface {
  const mockPublicKey = publicKeyBase58 
    ? new PublicKey(publicKeyBase58)
    : new PublicKey('11111111111111111111111111111111');

  return {
    publicKey: mockPublicKey,
    signTransaction: vi.fn().mockImplementation(<T extends Transaction | VersionedTransaction>(tx: T) => {
      return Promise.resolve(tx);
    }),
    signAllTransactions: vi.fn().mockImplementation(<T extends Transaction | VersionedTransaction>(txs: T[]) => {
      return Promise.resolve(txs);
    }),
    signMessage: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
  };
}

/**
 * Create a mock wallet that is not connected (null publicKey)
 */
export function createDisconnectedWallet(): WalletInterface {
  return {
    publicKey: null,
    signTransaction: vi.fn().mockRejectedValue(new Error('Wallet not connected')),
    signAllTransactions: vi.fn().mockRejectedValue(new Error('Wallet not connected')),
    signMessage: vi.fn().mockRejectedValue(new Error('Wallet not connected')),
  };
}

/**
 * Create a mock wallet that simulates user rejection
 */
export function createRejectingWallet(): WalletInterface {
  const mockPublicKey = new PublicKey('11111111111111111111111111111111');
  
  return {
    publicKey: mockPublicKey,
    signTransaction: vi.fn().mockRejectedValue(new Error('User rejected the request')),
    signAllTransactions: vi.fn().mockRejectedValue(new Error('User rejected the request')),
    signMessage: vi.fn().mockRejectedValue(new Error('User rejected the request')),
  };
}

/**
 * Create a mock wallet that does not support message signing
 */
export function createNoMessageSigningWallet(): WalletInterface {
  const mockPublicKey = new PublicKey('11111111111111111111111111111111');
  
  return {
    publicKey: mockPublicKey,
    signTransaction: vi.fn().mockImplementation(<T extends Transaction | VersionedTransaction>(tx: T) => {
      return Promise.resolve(tx);
    }),
    signAllTransactions: vi.fn().mockImplementation(<T extends Transaction | VersionedTransaction>(txs: T[]) => {
      return Promise.resolve(txs);
    }),
    // Intentionally undefined to simulate wallets that don't support this
    signMessage: undefined as any,
  };
}

/**
 * Create a wallet that fails signing with a specific error
 */
export function createFailingWallet(errorMessage: string): WalletInterface {
  const mockPublicKey = new PublicKey('11111111111111111111111111111111');
  
  return {
    publicKey: mockPublicKey,
    signTransaction: vi.fn().mockRejectedValue(new Error(errorMessage)),
    signAllTransactions: vi.fn().mockRejectedValue(new Error(errorMessage)),
    signMessage: vi.fn().mockRejectedValue(new Error(errorMessage)),
  };
}

/**
 * Reset all mocks on a mock wallet
 */
export function resetWalletMocks(wallet: WalletInterface): void {
  if (wallet.signTransaction && 'mockClear' in wallet.signTransaction) {
    (wallet.signTransaction as any).mockClear();
  }
  if (wallet.signAllTransactions && 'mockClear' in wallet.signAllTransactions) {
    (wallet.signAllTransactions as any).mockClear();
  }
  if (wallet.signMessage && 'mockClear' in wallet.signMessage) {
    (wallet.signMessage as any).mockClear();
  }
}
