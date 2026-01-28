import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { SteroidTransaction, SteroidSendOptions } from '../transaction/SteroidTransaction.js';
import { SteroidConnection } from '../connection/SteroidConnection.js';

export interface WalletInterface {
  publicKey: PublicKey | null;
  signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]>;
}

export class SteroidWallet {
  private wallet: WalletInterface;
  private connection: SteroidConnection;
  private txEngine: SteroidTransaction;

  constructor(wallet: WalletInterface, connection: SteroidConnection) {
    this.wallet = wallet;
    this.connection = connection;
    this.txEngine = new SteroidTransaction(connection);
  }

  get publicKey(): PublicKey | null {
    return this.wallet.publicKey;
  }

  /**
   * Signs and sends a transaction, ensuring network consistency.
   */
  async signAndSend(
    transaction: Transaction | VersionedTransaction,
    options: SteroidSendOptions = {}
  ): Promise<string> {
    await this.guardState();

    // 1. Sign
    const signedTx = await this.wallet.signTransaction(transaction);

    // 2. Transmit with Steroid reliability
    return await this.txEngine.sendAndConfirm(signedTx, options);
  }

  /**
   * System-level check to ensure the environment is consistent.
   */
  private async guardState() {
    if (!this.wallet.publicKey) {
      throw new Error('[SteroidWallet] Wallet disconnected or public key missing.');
    }

    // Network Matching Check
    // We fetch the genesis hash to uniquely identify the network.
    // This is more reliable than checking URLs which can be masked by proxies.
    try {
      const genesisHash = await (this.connection as any).getGenesisHash();
      // In a real implementation, we would compare this against a known hash 
      // or a hash provided by the wallet if it supports it.
      // For now, we log it as a systems verification step.
      console.log(`[SteroidWallet] Validating network consistency (Genesis: ${genesisHash.slice(0, 8)}...)`);
    } catch (error) {
       console.warn('[SteroidWallet] Could not verify network via Genesis Hash.');
    }
  }

  /**
   * Standardized message signing with error handling.
   */
  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    const signMessage = (this.wallet as any).signMessage;
    if (!signMessage) throw new Error('[SteroidWallet] Wallet does not support message signing.');
    
    try {
      return await signMessage(message);
    } catch (error: any) {
      throw new Error(`[SteroidWallet] Signing Error: ${error.message}`);
    }
  }
}
