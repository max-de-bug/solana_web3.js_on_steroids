import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockConnection } from '../mocks/connection.mock.js';

// shared mock state
let sharedMock = createMockConnection();

vi.mock('@solana/web3.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@solana/web3.js')>();
  return {
    ...actual,
    Connection: vi.fn().mockImplementation(function (url: string) {
      const mock = { ...sharedMock };
      (mock as any)._url = url;
      return mock;
    }),
  };
});

import { 
  VersionedTransaction, 
  TransactionMessage, 
  Keypair, 
  SystemProgram, 
  PublicKey 
} from '@solana/web3.js';
import { SteroidTransaction } from '../../src/transaction/SteroidTransaction.js';
import { SteroidConnection } from '../../src/connection/SteroidConnection.js';
import { getTransactionBlockhash } from '../../src/utils/index.js';

function createTestVersionedTransaction(payer: Keypair): VersionedTransaction {
  const recipient = Keypair.generate();
  const instructions = [
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipient.publicKey,
      lamports: 1000,
    }),
  ];

  const messageV0 = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: '5eykt4UsFv8P8NJdTREpY1vzqBUfSmRciL826HUBRkEA',
    instructions,
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);
  tx.sign([payer]);
  return tx;
}

describe('Versioned Transaction Blockhash Support', () => {
  let mockConnection: any;
  let transactionEngine: SteroidTransaction;
  const payer = Keypair.generate();

  beforeEach(() => {
    vi.clearAllMocks();
    sharedMock = createMockConnection({
      getEndpoints: vi.fn().mockReturnValue(['https://mock.solana.com']),
      getActiveEndpoint: vi.fn().mockReturnValue('https://mock.solana.com'),
      getLatestBlockhash: vi.fn().mockResolvedValue({
        blockhash: '4bt666uThVzR5HUKtXF1SAbH1t4XQzGfNqQ4GqQ4GqQ4', // Valid base58-ish
        lastValidBlockHeight: 123456,
      }),
      sendRawTransaction: vi.fn().mockResolvedValue('test-sig'),
      getSignatureStatus: vi.fn().mockResolvedValue({ value: { confirmationStatus: 'confirmed' } }),
    } as any);
    mockConnection = sharedMock;
    transactionEngine = new SteroidTransaction(mockConnection as unknown as SteroidConnection);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should apply initial blockhash to Versioned Transaction', async () => {
    const tx = createTestVersionedTransaction(payer);
    const initialBlockhash = getTransactionBlockhash(tx);
    
    await transactionEngine.sendAndConfirm(tx, {
      skipPreflight: true,
      maxBlockhashAge: 60,
      useWebSocket: false, // Speed up test
      retryInterval: 100,
      enableLogging: true,
    });

    // We can't easily check the internal updated transaction from here
    // but the test passing would mean the loop finished successfully.
    // To verify blockhash was applied, we'd need to spy on sendRawTransaction
    expect(mockConnection.sendRawTransaction).toHaveBeenCalled();
    const sentBuffer = mockConnection.sendRawTransaction.mock.calls[0][0];
    // If it was a VersionedTransaction, we can de-serialize and check
    const sentTx = VersionedTransaction.deserialize(sentBuffer);
    expect(sentTx.message.recentBlockhash).toBe('4bt666uThVzR5HUKtXF1SAbH1t4XQzGfNqQ4GqQ4GqQ4');
  });

  it('should refresh blockhash for Versioned Transaction during retries', async () => {
    const tx = createTestVersionedTransaction(payer);
    
    let hashCalls = 0;
    mockConnection.getLatestBlockhash = vi.fn().mockImplementation(() => {
        hashCalls++;
        return Promise.resolve({
            blockhash: `4bt666uThVzR5HUKtXF1SAbH1t4XQzGfNqQ4GqQ4Gq${hashCalls}`, // Keep it base58-ish
            lastValidBlockHeight: 300000,
        });
    });

    let statusCalls = 0;
    sharedMock.getSignatureStatus = vi.fn().mockImplementation(() => {
        statusCalls++;
        // Confirm on 2nd poll to keep the test fast
        if (statusCalls >= 2) {
          return Promise.resolve({ value: { confirmationStatus: 'confirmed' } });
        }
        return Promise.resolve({ value: null });
    });
    
    const signature = await transactionEngine.sendAndConfirm(tx, {
      skipPreflight: true,
      maxBlockhashAge: 0.01, // 10ms - guarantees refresh on 2nd attempt
      retryInterval: 50,     // 50ms
      timeoutSeconds: 5,
    });

    expect(hashCalls).toBeGreaterThan(1);
    expect(signature).toBe('test-sig');
  });

  it('should call onBlockhashRefresh during refresh for re-signing', async () => {
    const tx = createTestVersionedTransaction(payer);
    const reSignSpy = vi.fn().mockImplementation(async (t) => {
        t.sign([payer]);
        return t;
    });

    let statusCalls = 0;
    sharedMock.getSignatureStatus = vi.fn().mockImplementation(() => {
        statusCalls++;
        // Confirm on 2nd poll
        if (statusCalls >= 2) {
          return Promise.resolve({ value: { confirmationStatus: 'confirmed' } });
        }
        return Promise.resolve({ value: null });
    });

    await transactionEngine.sendAndConfirm(tx, {
      skipPreflight: true,
      maxBlockhashAge: 0.01,
      retryInterval: 50,
      timeoutSeconds: 5,
      onBlockhashRefresh: reSignSpy
    });

    expect(reSignSpy).toHaveBeenCalled();
  });
});
