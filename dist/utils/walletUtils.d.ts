import { WalletErrorType } from '../types/SteroidWalletTypes.js';
/**
 * Normalizes various wallet/adapter errors into a consistent format.
 *
 * @param error - The raw error caught from a wallet operation
 * @returns An object containing the normalized error type and message
 */
export declare function normalizeWalletError(error: any): {
    type: WalletErrorType;
    message: string;
};
