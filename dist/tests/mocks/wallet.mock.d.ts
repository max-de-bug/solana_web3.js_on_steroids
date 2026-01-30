import { WalletInterface } from '../../src/types/SteroidWalletTypes.js';
/**
 * Create a mock wallet that behaves correctly
 */
export declare function createMockWallet(publicKeyBase58?: string): WalletInterface;
/**
 * Create a mock wallet that is not connected (null publicKey)
 */
export declare function createDisconnectedWallet(): WalletInterface;
/**
 * Create a mock wallet that simulates user rejection
 */
export declare function createRejectingWallet(): WalletInterface;
/**
 * Create a mock wallet that does not support message signing
 */
export declare function createNoMessageSigningWallet(): WalletInterface;
/**
 * Create a wallet that fails signing with a specific error
 */
export declare function createFailingWallet(errorMessage: string): WalletInterface;
/**
 * Reset all mocks on a mock wallet
 */
export declare function resetWalletMocks(wallet: WalletInterface): void;
