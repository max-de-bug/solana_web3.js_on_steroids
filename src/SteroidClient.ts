export * from './connection/SteroidConnection.js';
export * from './transaction/SteroidTransaction.js';
export * from './wallet/SteroidWallet.js';

import { SteroidConnection, SteroidConnectionConfig } from './connection/SteroidConnection.js';
import { SteroidWallet, WalletInterface } from './wallet/SteroidWallet.js';

export class SteroidClient {
  public connection: SteroidConnection;
  public wallet?: SteroidWallet;

  constructor(endpoint: string, config?: SteroidConnectionConfig) {
    this.connection = new SteroidConnection(endpoint, config);
  }

  public connectWallet(wallet: WalletInterface): SteroidWallet {
    this.wallet = new SteroidWallet(wallet, this.connection);
    return this.wallet;
  }
}
