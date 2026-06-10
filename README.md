# Solana Resilience ⚙️🧱

**A systems-grade resilience layer for `@solana/web3.js`** — v1.1.1

[![NPM Version](https://img.shields.io/npm/v/solana-resilience)](https://www.npmjs.com/package/solana-resilience)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%23007acc)](https://www.typescriptlang.org/)

Solana UX today is fragile: wallet adapters leak abstractions, RPC behavior is inconsistent, and many integrations fall short of production-grade reliability. **Solana Resilience** treats crypto UX correctness as a systems problem, making network instability and RPC variability invisible to your users.

---

## 🌩 The Problem

Standard Solana dApps suffer from:
- **Node Lag**: Node A says confirmed, but Node B says not found.
- **Ghost Transactions**: Dropped during congestion with no recovery path.
- **RPC Single-Point-of-Failure**: One hiccup freezes the entire app.
- **Cryptic Errors**: Raw hex logs confuse users.

## 💊 The Solution

### 1. Transparent RPC Failover (Proxy Pattern)
A JS `Proxy` wraps the `Connection` object. If a node failure is detected, it automatically swaps to a healthy fallback mid-request.

### 2. Low-Latency WebSocket Confirmation
Prioritizes `onSignature` WebSocket subscriptions for real-time push, with multi-node HTTP polling as fallback.

### 3. Automatic Cluster Detection & Safety
Identifies the network via genesis hash and validates wallet/RPC are on the same cluster.

### 4. Multi-Node Confirmation Polling
Polls multiple RPC providers simultaneously to bypass node lag.

### 5. Continuous Re-broadcasting Loop
Refreshes blockhashes and re-broadcasts until definitive landing or expiration.

### 6. Dynamic Priority Fee Optimization
Measures CU consumption via simulation and injects optimal `ComputeBudget` instructions.

---

## 🗺 Architecture

![Technical Flow](docs/assets/architecture-diagram.svg)

---

## 📦 Installation

```bash
npm install solana-resilience
```

## 🛠 Quick Start

```typescript
import { SteroidClient, VERSION } from 'solana-resilience';

const client = new SteroidClient('https://api.mainnet-beta.solana.com', {
  connection: {
    fallbacks: ['https://solana-mainnet.rpc.extrnode.com'],
    latencyScoring: true,
    raceNodes: 2,
    maxSlotLag: 50,
    expectedCluster: 'mainnet-beta',
  },
  enableLogging: true,
});

// Use exactly like a standard Connection
const balance = await client.connection.getBalance(myPublicKey);

// Connect a wallet
const steroidWallet = client.connectWallet(walletAdapter);

// Listen to events
client.on('connection:failover', ({ from, to, reason }) => {
  console.warn(`Failover: ${reason}`);
});
client.on('transaction:confirmed', ({ signature, durationMs }) => {
  console.log(`Landed in ${durationMs}ms`);
});

// Sign and send — the engine does the rest
const signature = await steroidWallet.signAndSend(transaction, {
  computeBudget: { feePercentile: 75 },
  useWebSocket: true,
});

// Inspect stats
const stats = client.getStats();
// { activeEndpoint, allEndpoints, failoverStats, healthStatus, detectedCluster }
```

---

## 🔧 API Reference

### `SteroidClient`

Main entry point. Creates a resilient RPC connection and optional wallet layer.

```typescript
const client = new SteroidClient(endpoint, config?);
// or
const client = createSteroidClient(endpoint, config?);
```

| Param | Type | Description |
|-------|------|-------------|
| `endpoint` | `string \| string[]` | Primary RPC URL (or array — first is primary, rest are fallbacks) |
| `config` | `SteroidClientConfig` | Optional configuration |

**Config (`SteroidClientConfig`):**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `connection` | `SteroidConnectionConfig` | — | Connection resilience settings |
| `wallet` | `SteroidWalletConfig` | — | Wallet behavior settings |
| `enableLogging` | `boolean` | `false` | Enable diagnostic logging |

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `connection` | `SteroidConnection & Connection` | Resilient RPC handle (drop-in for `Connection`) |
| `connectWallet(wallet, config?)` | `SteroidWallet` | Wrap a wallet adapter with reliability |
| `getTransactionEngine()` | `SteroidTransaction` | Access the raw transaction engine |
| `on(event, listener)` | `this` | Subscribe to events |
| `off(event, listener)` | `this` | Unsubscribe |
| `once(event, listener)` | `this` | One-time subscription |
| `checkAllHealth()` | `Promise<RPCHealth[]>` | Manual health check across all nodes |
| `getStats()` | `ClientStats` | RPC stats, failover count, health status |
| `destroy()` | `void` | Cleanup resources |

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `connection` | `SteroidConnection & Connection` | Proxied Connection object with transparent failover |

---

### `SteroidConnection`

Resilient `Connection` proxy with automatic failover, health monitoring, and scoring.

**Options (`SteroidConnectionConfig`):**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `fallbacks` | `string[]` | `[]` | Additional RPC URLs for failover |
| `maxRetries` | `number` | `5` | Max retries per request |
| `retryDelay` | `number` | `500` | Base delay between retries (ms) |
| `healthCheckInterval` | `number` | `30000` | Background health check interval (ms); `0` = disabled |
| `requestTimeout` | `number` | `30000` | Per-request timeout (ms) |
| `latencyScoring` | `boolean` | `false` | Enable EMA-based RPC scoring |
| `scoringWindow` | `number` | `20` | Sliding window size for scoring |
| `raceNodes` | `number` | `0` | Concurrent race N nodes; `0` = disabled |
| `maxSlotLag` | `number` | `50` | Max slot lag before penalty |
| `unhealthyCooldownMs` | `number` | `60000` | Cooldown for unhealthy nodes |
| `expectedCluster` | `ClusterType` | — | Emit warning on cluster mismatch |

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `getConnection()` | `Connection` | Get raw underlying `Connection` |
| `getEndpoints()` | `string[]` | All configured endpoints |
| `getActiveEndpoint()` | `string` | Currently active endpoint |
| `getHealthStatus()` | `RPCHealth[]` | Health status of all endpoints |
| `getFailoverStats()` | `{ count, lastTime }` | Failover counter |
| `checkHealth()` | `Promise<RPCHealth[]>` | Trigger health check |
| `getCluster()` | `ClusterType` | Detected cluster |
| `getGenesisHash()` | `string` | Network genesis hash |
| `destroy()` | `void` | Cleanup |

---

### `SteroidTransaction`

Engine for sending and confirming transactions with automatic retries and blockhash refresh.

```typescript
const txEngine = client.getTransactionEngine();
const signature = await txEngine.sendAndConfirm(transaction, options?);
```

**Options (`SteroidSendOptions`):**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `timeoutSeconds` | `number` | `60` | Max time to wait for confirmation |
| `retryInterval` | `number` | `2000` | Delay between retries (ms) |
| `confirmationCommitment` | `Commitment` | `'confirmed'` | Desired commitment level |
| `confirmationNodes` | `number` | `3` | Nodes to poll during confirmation |
| `maxBlockhashAge` | `number` | `60` | Max blockhash age before refresh (s) |
| `skipPreflight` | `boolean` | `false` | Skip simulation |
| `preflightCommitment` | `Commitment` | `'processed'` | Commitment for simulation |
| `computeBudget` | `boolean \| ComputeBudgetConfig` | `true` | Enable/configure compute budget optimization |
| `useWebSocket` | `boolean` | `true` | Use WS confirmation (falls back to HTTP polling) |
| `abortSignal` | `AbortSignal` | — | Cancellation signal |
| `onBlockhashRefresh` | `(tx) => Promise<Tx>` | — | Re-sign callback after blockhash refresh |
| `enableLogging` | `boolean` | `false` | Logging for this transaction |

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `sendAndConfirm(tx, opts?)` | `Promise<TransactionSignature>` | Submit and confirm |
| `getTransactionState(stateId)` | `TransactionStateInfo \| undefined` | Get state by ID |
| `getAllTransactionStates()` | `Map<string, TransactionStateInfo>` | All tracked states |
| `clearOldStates(olderThanMs?)` | `void` | Cleanup old states |

---

### `SteroidWallet`

Wraps a Solana wallet adapter with error normalization, network validation, and reliability.

```typescript
const steroidWallet = client.connectWallet(walletAdapter, config?);
const sig = await steroidWallet.signAndSend(transaction, options?);
const signed = await steroidWallet.signTransaction(tx);
const signedAll = await steroidWallet.signAllTransactions([tx1, tx2]);
const msgSig = await steroidWallet.signMessage(message);
```

**Config (`SteroidWalletConfig`):**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `validateNetwork` | `boolean` | `true` | Validate wallet vs RPC cluster match |
| `expectedGenesisHash` | `string` | `''` | Expected genesis hash for strict validation |
| `autoRefreshBlockhash` | `boolean` | `true` | Auto-refresh stale blockhash before signing |
| `maxBlockhashAge` | `number` | `60` | Max blockhash age (s) |
| `enableLogging` | `boolean` | `false` | Enable logging |

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `publicKey` | `PublicKey \| null` | Wallet's public key |

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `signAndSend(tx, opts?)` | `Promise<TransactionSignature>` | Sign, send, confirm |
| `signTransaction(tx)` | `Promise<T>` | Sign with normalized errors |
| `signAllTransactions(txs)` | `Promise<T[]>` | Sign all |
| `signMessage(msg)` | `Promise<Uint8Array>` | Sign message |
| `getNetworkInfo()` | `{ genesisHash?, validated }` | Network validation state |
| `invalidateNetwork()` | `void` | Force re-validation on next operation |
| `supportsMessageSigning()` | `boolean` | Check feature support |

---

### `WalletError`

Extends `SteroidError` with wallet-specific error types.

```typescript
import { WalletError, WalletErrorType } from 'solana-resilience';
```

| Error Type | Meaning |
|------------|---------|
| `NOT_CONNECTED` | Wallet not connected |
| `USER_REJECTED` | User denied the request |
| `NETWORK_MISMATCH` | Wallet on different network |
| `SIGNING_FAILED` | Signing error |
| `UNSUPPORTED_OPERATION` | Feature not supported |
| `UNKNOWN` | Unhandled wallet error |

---

### Events

All events are typed via `SteroidEventMap` and accessible through `client.on(...)`.

| Event | Payload | Description |
|-------|---------|-------------|
| `transaction:pending` | `{ stateId }` | Transaction queued |
| `transaction:simulated` | `{ stateId, computeUnits? }` | Simulation passed |
| `transaction:sent` | `{ stateId, signature, attempt }` | Transaction broadcast |
| `transaction:confirmed` | `{ stateId, signature, attempts, durationMs }` | Confirmed on-chain |
| `transaction:failed` | `{ stateId, error, attempts }` | Transaction failed |
| `transaction:expired` | `{ stateId, signature?, attempts }` | Timeout reached |
| `transaction:aborted` | `{ stateId, signature? }` | Cancelled via AbortSignal |
| `connection:failover` | `{ from, to, reason }` | RPC node switched |
| `connection:health` | `{ endpoint, healthy, latency?, slot? }` | Health check result |
| `connection:cluster-detected` | `{ cluster, genesisHash }` | Network identified |
| `connection:cluster-mismatch` | `{ detected, expected }` | Wrong network |

---

### Error Handling

All errors are instances of `SteroidError` with structured fields.

```typescript
import { SteroidError, ErrorCode, ErrorCategory, ErrorTranslator } from 'solana-resilience';

try {
  await steroidWallet.signAndSend(tx);
} catch (error) {
  if (error instanceof SteroidError) {
    console.error(error.userMessage);   // User-friendly
    console.error(error.suggestion);    // Actionable advice
    console.error(error.code);          // Machine-readable: 'INSUFFICIENT_FUNDS'
    console.error(error.category);      // 'TRANSACTION' | 'WALLET' | 'NETWORK' | 'PROGRAM' | 'SYSTEM'
    console.error(error.toDebugString());// Full debug details
  }
}
```

**Error Types:**

| Code | Category | Meaning |
|------|----------|---------|
| `INSUFFICIENT_FUNDS` | TRANSACTION | Not enough SOL |
| `BLOCKHASH_EXPIRED` | TRANSACTION | Transaction expired |
| `SIMULATION_FAILED` | TRANSACTION | Simulation would fail |
| `TRANSACTION_TIMEOUT` | TRANSACTION | Not confirmed in time |
| `USER_REJECTED` | WALLET | User denied |
| `NOT_CONNECTED` | WALLET | Wallet not connected |
| `NETWORK_MISMATCH` | WALLET | Wrong network |
| `RATE_LIMITED` | NETWORK | Too many requests |
| `CONNECTION_FAILED` | NETWORK | Network error |
| `REQUEST_TIMEOUT` | NETWORK | Request timed out |
| `SLIPPAGE_EXCEEDED` | PROGRAM | Price moved too much |
| `PROGRAM_ERROR` | PROGRAM | Program execution failed |
| `ABORTED` | TRANSACTION | Cancelled |
| `UNKNOWN` | SYSTEM | Unclassified error |

---

### `ComputeBudgetOptimizer`

Estimates and injects optimal compute budget instructions.

```typescript
import { ComputeBudgetOptimizer } from 'solana-resilience';

const optimizer = new ComputeBudgetOptimizer(connection);
const estimate = await optimizer.estimateComputeBudget(transaction, {
  feePercentile: 75,        // Use 75th percentile priority fee
  unitMargin: 1.2,          // 20% safety margin on CU
  maxPriorityFee: 1_000_000,// Cap at 1 lamport/CU
  enablePriorityFees: true,
  enableComputeUnitLimit: true,
});

// Or let SteroidTransaction handle it automatically:
const tx = await optimizer.applyComputeBudget(transaction, config);
```

---

### Helper Classes

#### `ConnectionPool`
Reusable `Connection` cache keyed by URL — eliminates redundant `new Connection()`.

```typescript
import { ConnectionPool } from 'solana-resilience';
const pool = new ConnectionPool({ commitment: 'confirmed' });
const conn = pool.get('https://api.mainnet-beta.solana.com'); // cached
pool.evict(url);    // Remove specific
pool.clear();       // Clear all
pool.size;          // Count
```

#### `ClusterDetector`
Identifies Solana clusters from genesis hashes.

```typescript
import { ClusterDetector, CLUSTER_GENESIS_HASHES } from 'solana-resilience';

ClusterDetector.detectCluster(genesisHash);
// → 'mainnet-beta' | 'devnet' | 'testnet' | 'unknown'
ClusterDetector.isMainnet(genesisHash); // boolean
ClusterDetector.detectFromConnection(connection);
// → { cluster, genesisHash }
ClusterDetector.getClusterName(cluster);
// → 'Mainnet Beta' | 'Devnet' | ...
```

#### `RpcScorer`
EMA-based latency/success/slot scoring for RPC selection.

```typescript
import { RpcScorer } from 'solana-resilience';

const scorer = new RpcScorer(20); // window size
scorer.recordSlot(url, slot);
scorer.recordSuccess(url, latencyMs);
scorer.recordFailure(url);
const score = scorer.getScore(url, maxSlotLag);
const best = scorer.getBestUrlIndex(urls, healthMap, excluded, maxSlotLag);
```

#### `WebSocketConfirmation`
Real-time WebSocket signature confirmation.

```typescript
import { WebSocketConfirmation } from 'solana-resilience';

const result = await WebSocketConfirmation.confirmSignature(
  connection, signature, 'confirmed', 5000
);
// → 'confirmed' | 'error' | 'timeout'

const isConfirmed = await WebSocketConfirmation.isConfirmed(
  connection, signature, 'confirmed', 5000
);
```

#### `SteroidEventEmitter`
Lightweight typed event emitter (no Node.js dependency).

```typescript
import { SteroidEventEmitter } from 'solana-resilience';

const emitter = new SteroidEventEmitter();
emitter.on('transaction:confirmed', (data) => { /* ... */ });
emitter.off('transaction:confirmed', listener);
emitter.once('transaction:confirmed', (data) => { /* ... */ });
emitter.removeAllListeners(); // or per-event
emitter.listenerCount('transaction:confirmed');
emitter.eventNames();
```

---

### Validation Utilities

```typescript
import { validateClientConfig, validateConnectionConfig, validateEndpointUrl }
  from 'solana-resilience';

validateClientConfig(config);     // Throws RangeError/TypeError on invalid config
validateConnectionConfig(config);
validateEndpointUrl(url);
```

---

## 📦 Re-exports from `@solana/web3.js`

```typescript
import type {
  Commitment, ConnectionConfig, PublicKey,
  Transaction, VersionedTransaction, TransactionSignature, SendOptions,
} from 'solana-resilience';
```

---

## 📜 License

MIT License. See [LICENSE](LICENSE) for details.

## 🤝 Contributing

If you find an edge case where a transaction could be lost or an error could be better handled, open an issue or PR.
