import { PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';

/**
 * Create a test transaction for testing purposes
 */
export function createTestTransaction(feePayer?: PublicKey): Transaction {
  const payer = feePayer ?? Keypair.generate().publicKey;
  const recipient = Keypair.generate().publicKey;
  
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: recipient,
      lamports: 1000000,
    })
  );
  
  tx.feePayer = payer;
  tx.recentBlockhash = '5eykt4UsFv8P8NJdTREpY1vzqBUfSmRciL826HUBRkEA';
  
  return tx;
}

/**
 * Create a transaction without blockhash for testing auto-fetch
 */
export function createTransactionWithoutBlockhash(feePayer?: PublicKey): Transaction {
  const payer = feePayer ?? Keypair.generate().publicKey;
  const recipient = Keypair.generate().publicKey;
  
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: recipient,
      lamports: 1000000,
    })
  );
  
  tx.feePayer = payer;
  // Intentionally not setting recentBlockhash
  
  return tx;
}

/**
 * Create a signed test transaction (mock signature)
 */
export function createSignedTestTransaction(feePayer?: PublicKey): Transaction {
  const tx = createTestTransaction(feePayer);
  // Add a mock signature to simulate signing
  const mockKeypair = Keypair.generate();
  tx.feePayer = mockKeypair.publicKey;
  tx.sign(mockKeypair);
  return tx;
}

/**
 * Wait for a specified time (useful for testing async behavior)
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait until a condition is true or timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 5000,
  intervalMs: number = 100
): Promise<void> {
  const start = Date.now();
  
  while (Date.now() - start < timeoutMs) {
    if (await condition()) {
      return;
    }
    await delay(intervalMs);
  }
  
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

/**
 * Measure execution time of an async function
 */
export async function measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = Date.now();
  const result = await fn();
  return {
    result,
    durationMs: Date.now() - start,
  };
}

/**
 * Assert that a promise rejects with a specific error type or message
 */
export async function expectToReject(
  promise: Promise<any>,
  expectedMessage?: string | RegExp
): Promise<Error> {
  try {
    await promise;
    throw new Error('Expected promise to reject but it resolved');
  } catch (error: any) {
    if (expectedMessage) {
      const message = error.message || '';
      if (typeof expectedMessage === 'string') {
        if (!message.includes(expectedMessage)) {
          throw new Error(`Expected error message to include "${expectedMessage}" but got "${message}"`);
        }
      } else {
        if (!expectedMessage.test(message)) {
          throw new Error(`Expected error message to match ${expectedMessage} but got "${message}"`);
        }
      }
    }
    return error;
  }
}

/**
 * Generate a random public key for testing
 */
export function randomPublicKey(): PublicKey {
  return Keypair.generate().publicKey;
}
