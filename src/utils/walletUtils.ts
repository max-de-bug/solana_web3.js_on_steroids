import { WalletErrorType } from '../types/SteroidWalletTypes.js';

/**
 * Normalizes various wallet/adapter errors into a consistent format.
 * 
 * @param error - The raw error caught from a wallet operation
 * @returns An object containing the normalized error type and message
 */
export function normalizeWalletError(error: any): { type: WalletErrorType; message: string } {
  const message = error.message?.toLowerCase() || '';
  const code = error.code || error.name || '';

  // User rejection patterns
  if (
    message.includes('user rejected') ||
    message.includes('user denied') ||
    message.includes('user cancelled') ||
    message.includes('rejected by user') ||
    code === 'USER_REJECTED' ||
    code === 4001
  ) {
    return {
      type: WalletErrorType.USER_REJECTED,
      message: 'User rejected the request'
    };
  }

  // Connection issues
  if (
    message.includes('not connected') ||
    message.includes('wallet not found') ||
    message.includes('no wallet')
  ) {
    return {
      type: WalletErrorType.NOT_CONNECTED,
      message: 'Wallet is not connected'
    };
  }

  // Signing failures
  if (
    message.includes('signing failed') ||
    message.includes('signature failed') ||
    message.includes('failed to sign')
  ) {
    return {
      type: WalletErrorType.SIGNING_FAILED,
      message: `Signing failed: ${error.message}`
    };
  }

  // Default
  return {
    type: WalletErrorType.UNKNOWN,
    message: error.message || 'Unknown wallet error'
  };
}
