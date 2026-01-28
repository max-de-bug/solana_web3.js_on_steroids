# Solana web3.js on Steroids 🚀

A high-level, production-grade wrapper around `@solana/web3.js` designed for extreme reliability and developer experience.

## Features

- **RPC Resilience**: Automatic failover to fallback RPCs and intelligent retries with exponential backoff.
- **Transaction Reliability**: Continuous re-broadcasting until confirmation, preventing "dropped" transactions.
- **Detailed Simulation**: Better error reporting by parsing simulation logs before sending.
- **Unified Wallet Interface**: Simplifies wallet-adapter interactions with a consistent API.

## Installation

```bash
npm install solana-web3.js-on_steroids
```

## Quick Start

```typescript
import { SteroidClient } from 'solana-web3.js-on_steroids';

const client = new SteroidClient('https://api.mainnet-beta.solana.com', {
  fallbacks: ['https://solana-api.projectserum.com'],
  maxRetries: 10
});

// Use with any wallet adapter
const steroidWallet = client.connectWallet(walletAdapter);

// Sign and Send with automatic retries and simulation
const signature = await steroidWallet.signAndSend(transaction);
console.log(`Transaction successful: ${signature}`);
```

## Advanced Usage

### Custom Connection
```typescript
import { SteroidConnection } from 'solana-web3.js-on_steroids';

const connection = new SteroidConnection('ENDPOINT', {
  commitment: 'confirmed',
  maxRetries: 5
});
```

### Direct Transaction Engine
```typescript
import { SteroidTransaction } from 'solana-web3.js-on_steroids';

const txEngine = new SteroidTransaction(connection);
await txEngine.sendAndConfirm(signedTx, {
  timeoutSeconds: 120,
  retryInterval: 1000
});
```
