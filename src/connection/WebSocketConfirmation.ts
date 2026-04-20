import { Connection, TransactionSignature, Commitment } from '@solana/web3.js';

/**
 * Result of a WebSocket confirmation attempt.
 *
 * - `'confirmed'` — Transaction reached the desired commitment level.
 * - `'error'`     — Transaction landed on-chain but failed (e.g., InstructionError).
 * - `'timeout'`   — No definitive result within the allotted time.
 */
export type WsConfirmationResult = 'confirmed' | 'error' | 'timeout';

/**
 * WebSocketConfirmation provides real-time transaction confirmation via Solana's WebSocket API.
 * This is generally faster than HTTP polling as results are pushed by the RPC node.
 */
export class WebSocketConfirmation {
  /**
   * Confirms a transaction signature using WebSocket subscriptions.
   *
   * @param connection - The Solana connection instance
   * @param signature  - The transaction signature to monitor
   * @param commitment - The desired commitment level
   * @param timeoutMs  - Maximum time to wait for confirmation
   * @returns Promise resolving to a `WsConfirmationResult`
   *
   * @example
   * ```ts
   * const result = await WebSocketConfirmation.confirmSignature(conn, sig, 'confirmed', 5000);
   * if (result === 'confirmed') { /* success *\/ }
   * ```
   */
  static async confirmSignature(
    connection: Connection,
    signature: TransactionSignature,
    commitment: Commitment,
    timeoutMs: number
  ): Promise<WsConfirmationResult> {
    return new Promise((resolve) => {
      let subscriptionId: number | undefined;

      const timeoutId = setTimeout(() => {
        if (subscriptionId !== undefined) {
          connection.removeSignatureListener(subscriptionId);
        }
        resolve('timeout');
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
              // Transaction landed but failed on-chain
              resolve('error');
            } else {
              resolve('confirmed');
            }
          },
          commitment
        );
      } catch (error) {
        clearTimeout(timeoutId);
        if (subscriptionId !== undefined) {
          try {
            connection.removeSignatureListener(subscriptionId);
          } catch (_) {
            // Ignore cleanup errors
          }
        }
        resolve('timeout');
      }
    });
  }

  // ── Backwards-compatible convenience method ──────────────────────

  /**
   * Boolean wrapper for callers that only care about "confirmed or not".
   * Preserves API compatibility with older code that expected `boolean`.
   */
  static async isConfirmed(
    connection: Connection,
    signature: TransactionSignature,
    commitment: Commitment,
    timeoutMs: number
  ): Promise<boolean> {
    const result = await this.confirmSignature(connection, signature, commitment, timeoutMs);
    return result === 'confirmed';
  }
}
