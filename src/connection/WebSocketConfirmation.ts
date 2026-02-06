import { Connection, TransactionSignature, Commitment } from '@solana/web3.js';

/**
 * WebSocketConfirmation provides real-time transaction confirmation via Solana's WebSocket API.
 * This is generally faster than HTTP polling as results are pushed by the RPC node.
 */
export class WebSocketConfirmation {
  /**
   * Confirms a transaction signature using WebSocket subscriptions.
   * 
   * @param connection The Solana connection instance
   * @param signature The transaction signature to monitor
   * @param commitment The desired commitment level
   * @param timeoutMs Maximum time to wait for confirmation
   * @returns Promise resolving to true if confirmed, false on timeout or error
   */
  static async confirmSignature(
    connection: Connection,
    signature: TransactionSignature,
    commitment: Commitment,
    timeoutMs: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      let subscriptionId: number | undefined;
      
      const timeoutId = setTimeout(() => {
        if (subscriptionId !== undefined) {
          connection.removeSignatureListener(subscriptionId);
        }
        resolve(false);
      }, timeoutMs);

      try {
        subscriptionId = connection.onSignature(
          signature,
          (result) => {
            clearTimeout(timeoutId);
            if (subscriptionId !== undefined) {
              connection.removeSignatureListener(subscriptionId);
            }

            if (result.err) {
              // Transaction failed definitively
              resolve(false);
            } else {
              // Success
              // We resolve true when it reaches the desired commitment
              resolve(true);
            }
          },
          commitment
        );
      } catch (error) {
        clearTimeout(timeoutId);
        if (subscriptionId !== undefined) {
          try {
            connection.removeSignatureListener(subscriptionId);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
        resolve(false);
      }
    });
  }
}
