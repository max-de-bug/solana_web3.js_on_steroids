export { SteroidClient } from './client/SteroidClient.js';
export { SteroidConnection } from './connection/SteroidConnection.js';
export { SteroidTransaction } from './transaction/SteroidTransaction.js';
export { SteroidWallet, WalletError } from './wallet/SteroidWallet.js';
export * from './types/SteroidWalletTypes.js';
import { SteroidClient } from './client/SteroidClient.js';
/**
 * Factory function for creating a new SteroidClient instance.
 */
export declare const createSteroidClient: (url: string, config?: any) => SteroidClient;
