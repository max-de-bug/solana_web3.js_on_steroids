# API Reference

Complete reference for all exports from `solana-resilience`.

---

## Constants

### `VERSION`
```typescript
import { VERSION } from 'solana-resilience';
// → '1.1.0'
```
Library version string.

---

## Client

### `SteroidClient`

```typescript
import { SteroidClient, createSteroidClient } from 'solana-resilience';
```

**Constructor:**
```typescript
new SteroidClient(endpoint: string | string[], config?: SteroidClientConfig)
createSteroidClient(endpoint: string | string[], config?: SteroidClientConfig)
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `connection` | `SteroidConnection & Connection` | Proxied Connection with transparent failover |

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `connectWallet(wallet, config?)` | `SteroidWallet` | Wrap a wallet adapter |
| `getTransactionEngine()` | `SteroidTransaction` | Access transaction engine |
| `on(event, listener)` | `this` | Subscribe to event |
| `off(event, listener)` | `this` | Unsubscribe from event |
| `once(event, listener)` | `this` | One-time subscription |
| `checkAllHealth()` | `Promise<RPCHealth[]>` | Health check all nodes |
| `getStats()` | `ClientStats` | RPC and failover stats |
| `destroy()` | `void` | Cleanup resources |

**Events:** See [Events](#events) section.

---

### `SteroidClientConfig`

```typescript
interface SteroidClientConfig {
  connection?: SteroidConnectionConfig;
  wallet?: SteroidWalletConfig;
  enableLogging?: boolean;
}
```

### `ClientStats`

```typescript
interface ClientStats {
  activeEndpoint: string;
  allEndpoints: string[];
  failoverStats: FailoverStats;
  healthStatus: RPCHealth[];
  detectedCluster: ClusterType;
}
```

---

## Connection

### `SteroidConnection`

```typescript
import { SteroidConnection } from 'solana-resilience';
```

A JS `Proxy` wrapper around `@solana/web3.js` `Connection`. Forwards all `Connection` method calls with automatic retry, failover, and optional concurrent racing.

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `getConnection()` | `Connection` | Raw underlying Connection |
| `getEndpoints()` | `string[]` | All configured endpoints |
| `getActiveEndpoint()` | `string` | Currently active endpoint URL |
| `getHealthStatus()` | `RPCHealth[]` | Health data for all endpoints |
| `getFailoverStats()` | `{ count, lastTime }` | Failover count and timestamp |
| `checkHealth()` | `Promise<RPCHealth[]>` | Trigger immediate health check |
| `getCluster()` | `ClusterType` | Detected cluster |
| `getGenesisHash()` | `string` | Network genesis hash |
| `destroy()` | `void` | Stop health checks, clear connection pool |

### `SteroidConnectionConfig`

```typescript
interface SteroidConnectionConfig {
  fallbacks?: string[];
  maxRetries?: number;            // default: 5
  retryDelay?: number;            // default: 500
  healthCheckInterval?: number;   // default: 30000 (0 = disabled)
  requestTimeout?: number;        // default: 30000
  enableLogging?: boolean;        // default: false
  latencyScoring?: boolean;       // default: false
  scoringWindow?: number;         // default: 20
  raceNodes?: number;             // default: 0 (disabled)
  maxSlotLag?: number;            // default: 50
  unhealthyCooldownMs?: number;   // default: 60000
  expectedCluster?: ClusterType;
}
```

### `RPCHealth`

```typescript
interface RPCHealth {
  url: string;
  healthy: boolean;
  lastChecked: number;
  latency?: number;
  score?: number;
  lastSlot?: number;
  lastUnhealthy?: number;
  consecutiveFailures?: number;
}
```

### `FailoverStats`

```typescript
interface FailoverStats {
  count: number;
  lastTime: number;
}
```

---

### `ConnectionPool`

```typescript
import { ConnectionPool } from 'solana-resilience';
const pool = new ConnectionPool(config?: ConnectionConfig);
```

| Method | Returns | Description |
|--------|---------|-------------|
| `get(url)` | `Connection` | Get or create cached Connection |
| `evict(url)` | `Connection \| undefined` | Remove and return connection |
| `clear()` | `void` | Clear all connections |
| `size` | `number` | Number of cached connections |

### `RpcScorer`

```typescript
import { RpcScorer } from 'solana-resilience';
const scorer = new RpcScorer(windowSize?: number); // default: 20
```

| Method | Returns | Description |
|--------|---------|-------------|
| `recordSlot(url, slot)` | `void` | Record node slot height |
| `recordSuccess(url, latency)` | `void` | Record successful request |
| `recordFailure(url)` | `void` | Record failed request |
| `getScore(url, maxSlotLag?)` | `number` | Composite score (higher = better) |
| `getBestUrlIndex(urls, healthMap, excludeIndices?, maxSlotLag?)` | `number` | Index of best node |

Scoring formula: `(1000 / EMA_Latency) × SuccessRate² × LagPenalty`

### `WebSocketConfirmation`

```typescript
import { WebSocketConfirmation, WsConfirmationResult } from 'solana-resilience';
```

**Static Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `confirmSignature(conn, sig, commitment, timeoutMs)` | `Promise<WsConfirmationResult>` | WS-based confirmation |
| `isConfirmed(conn, sig, commitment, timeoutMs)` | `Promise<boolean>` | Boolean wrapper |

**`WsConfirmationResult`:** `'confirmed' | 'error' | 'timeout'`

### `ClusterDetector`

```typescript
import { ClusterDetector, CLUSTER_GENESIS_HASHES } from 'solana-resilience';
```

**Static Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `detectCluster(genesisHash)` | `ClusterType` | Identify cluster from hash |
| `isMainnet(genesisHash)` | `boolean` | Check if mainnet |
| `detectFromConnection(connection)` | `Promise<{ cluster, genesisHash }>` | Detect from Connection |
| `getClusterName(cluster)` | `string` | Human-readable name |

**`CLUSTER_GENESIS_HASHES`:** `Record<string, ClusterType>` mapping known hashes.

---

## Transaction

### `SteroidTransaction`

```typescript
import { SteroidTransaction } from 'solana-resilience';
```

| Method | Returns | Description |
|--------|---------|-------------|
| `sendAndConfirm(tx, opts?)` | `Promise<TransactionSignature>` | Submit with retries, block refresh, multi-node confirm |
| `getTransactionState(stateId)` | `TransactionStateInfo \| undefined` | Current state by ID |
| `getAllTransactionStates()` | `Map<string, TransactionStateInfo>` | All tracked states |
| `clearOldStates(olderThanMs?)` | `void` | Cleanup (default TTL: 1 hour) |

### `SteroidSendOptions`

```typescript
interface SteroidSendOptions {
  timeoutSeconds?: number;          // default: 60
  retryInterval?: number;           // default: 2000
  confirmationCommitment?: Commitment; // default: 'confirmed'
  confirmationNodes?: number;       // default: 3
  maxBlockhashAge?: number;         // default: 60 (seconds)
  skipPreflight?: boolean;          // default: false
  preflightCommitment?: Commitment; // default: 'processed'
  computeBudget?: boolean | ComputeBudgetConfig; // default: true
  useWebSocket?: boolean;           // default: true
  abortSignal?: AbortSignal;
  onBlockhashRefresh?: (tx) => Promise<AnyTransaction>;
  enableLogging?: boolean;
}
```

### `TransactionState`

```typescript
enum TransactionState {
  PENDING, SIMULATED, SIGNED, SENT,
  CONFIRMED, FINALIZED, FAILED, EXPIRED, ABORTED
}
```

### `TransactionStateInfo`

```typescript
interface TransactionStateInfo {
  state: TransactionState;
  signature?: string;
  error?: string;
  attempts: number;
  startTime: number;
  lastAttemptTime?: number;
  confirmedAt?: number;
}
```

### `TransactionResult`

```typescript
type TransactionResult = {
  signature: TransactionSignature;
  confirmedAt: number;
  attempts: number;
};
```

---

## Wallet

### `SteroidWallet`

```typescript
import { SteroidWallet } from 'solana-resilience';
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `publicKey` | `PublicKey \| null` | Wallet's public key |

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `signAndSend(tx, opts?)` | `Promise<TransactionSignature>` | Full reliable send pipeline |
| `signTransaction(tx)` | `Promise<T>` | Sign with normalized errors |
| `signAllTransactions(txs)` | `Promise<T[]>` | Sign all |
| `signMessage(msg)` | `Promise<Uint8Array>` | Sign message |
| `getNetworkInfo()` | `NetworkInfo` | Network validation state |
| `invalidateNetwork()` | `void` | Force re-validation |
| `supportsMessageSigning()` | `boolean` | Feature check |

### `SteroidWalletConfig`

```typescript
interface SteroidWalletConfig {
  validateNetwork?: boolean;       // default: true
  expectedGenesisHash?: string;
  autoRefreshBlockhash?: boolean;  // default: true
  maxBlockhashAge?: number;        // default: 60
  enableLogging?: boolean;
}
```

### `NetworkInfo`

```typescript
interface NetworkInfo {
  genesisHash?: string;
  validated: boolean;
}
```

### `WalletError`

```typescript
class WalletError extends SteroidError {
  type: WalletErrorType;
}
```

### `WalletErrorType`

```typescript
enum WalletErrorType {
  NOT_CONNECTED, USER_REJECTED, NETWORK_MISMATCH,
  SIGNING_FAILED, UNSUPPORTED_OPERATION, UNKNOWN
}
```

### `WalletInterface`

```typescript
interface WalletInterface {
  publicKey: PublicKey | null;
  signTransaction<T>(tx: T): Promise<T>;
  signAllTransactions<T>(txs: T[]): Promise<T[]>;
  signMessage?(message: Uint8Array): Promise<Uint8Array>;
}
```

---

## Compute

### `ComputeBudgetOptimizer`

```typescript
import { ComputeBudgetOptimizer } from 'solana-resilience';
```

| Method | Returns | Description |
|--------|---------|-------------|
| `estimateComputeBudget(tx, config?)` | `Promise<ComputeBudgetEstimate>` | Simulate and estimate CU/fee |
| `applyComputeBudget(tx, config?)` | `Promise<T>` | Inject budget instructions |
| `lastEstimate` (getter) | `ComputeBudgetEstimate \| null` | Last estimate result |
| `setLogging(enabled)` | `void` | Toggle logging |

### `ComputeBudgetEstimate`

```typescript
interface ComputeBudgetEstimate {
  computeUnits: number;    // Estimated CU (with margin)
  priorityFee: number;     // microLamports per CU
  totalFee: number;        // Total additional fee in lamports
}
```

### `ComputeBudgetConfig`

```typescript
interface ComputeBudgetConfig {
  unitMargin?: number;           // default: 1.2
  feePercentile?: number;        // default: 75
  maxPriorityFee?: number;       // default: 1_000_000
  enablePriorityFees?: boolean;  // default: true
  enableComputeUnitLimit?: boolean; // default: true
}
```

---

## Events

### `SteroidEventEmitter`

```typescript
import { SteroidEventEmitter } from 'solana-resilience';
```

| Method | Returns | Description |
|--------|---------|-------------|
| `on(event, listener)` | `this` | Subscribe |
| `off(event, listener)` | `this` | Unsubscribe |
| `once(event, listener)` | `this` | One-time |
| `emit(event, data)` | `boolean` | Emit (has listeners?) |
| `removeAllListeners(event?)` | `this` | Remove listeners |
| `listenerCount(event)` | `number` | Count listeners |
| `eventNames()` | `SteroidEventKey[]` | Active events |

### `SteroidEventMap`

```typescript
type SteroidEventMap = {
  'transaction:pending':      { stateId: string };
  'transaction:simulated':    { stateId: string; computeUnits?: number };
  'transaction:sent':         { stateId: string; signature: string; attempt: number };
  'transaction:confirmed':    { stateId: string; signature: string; attempts: number; durationMs: number };
  'transaction:failed':       { stateId: string; error: Error; attempts: number };
  'transaction:expired':      { stateId: string; signature?: string; attempts: number };
  'transaction:aborted':      { stateId: string; signature?: string };
  'connection:failover':      { from: string; to: string; reason: string };
  'connection:health':        { endpoint: string; healthy: boolean; latency?: number; slot?: number };
  'connection:cluster-detected': { cluster: ClusterType; genesisHash: string };
  'connection:cluster-mismatch': { detected: ClusterType; expected: ClusterType };
};
```

### `SteroidEventKey`

```typescript
type SteroidEventKey = keyof SteroidEventMap;
```

---

## Errors

### `SteroidError`

```typescript
class SteroidError extends Error {
  code: ErrorCode;
  category: ErrorCategory;
  userMessage: string;
  suggestion: string;
  originalError?: unknown;
  context?: Record<string, unknown>;
  
  toUserFriendlyString(): string;
  toDebugString(): string;
  static isSteroidError(error): error is SteroidError;
}
```

### `ErrorCode`

```typescript
enum ErrorCode {
  // Transaction
  INSUFFICIENT_FUNDS, BLOCKHASH_EXPIRED, SIMULATION_FAILED,
  TRANSACTION_TIMEOUT, SIGNATURE_VERIFICATION_FAILED, ABORTED,
  // Wallet
  USER_REJECTED, NOT_CONNECTED, NETWORK_MISMATCH, UNSUPPORTED_OPERATION,
  // Network
  RPC_ERROR, RATE_LIMITED, CONNECTION_FAILED, REQUEST_TIMEOUT,
  // Program
  ACCOUNT_NOT_FOUND, SLIPPAGE_EXCEEDED, PROGRAM_ERROR, CUSTOM_PROGRAM_ERROR,
  // System
  UNKNOWN, INTERNAL_ERROR,
}
```

### `ErrorCategory`

```typescript
enum ErrorCategory {
  TRANSACTION, WALLET, NETWORK, PROGRAM, SYSTEM,
}
```

### `ErrorTranslator`

```typescript
class ErrorTranslator {
  static translate(error, context?): SteroidError;
  static insufficientFunds(requiredAmount?): SteroidError;
  static userRejected(): SteroidError;
  static blockhashExpired(): SteroidError;
  static rateLimited(): SteroidError;
  static simulationFailed(details?): SteroidError;
}
```

---

## Validation

```typescript
import { validateClientConfig, validateConnectionConfig, validateEndpointUrl }
  from 'solana-resilience';

validateClientConfig(config);       // throws RangeError / TypeError
validateConnectionConfig(config);
validateEndpointUrl(url);
```

---

## Default Constants

```typescript
import { DEFAULT_CONFIG } from 'solana-resilience';

DEFAULT_CONFIG.CONNECTION  // { maxRetries: 5, retryDelay: 500, healthCheckInterval: 30000, ... }
DEFAULT_CONFIG.TRANSACTION // { timeoutSeconds: 60, retryInterval: 2000, ... }
DEFAULT_CONFIG.WALLET      // { validateNetwork: true, autoRefreshBlockhash: true, ... }
```

---

## Type Re-exports from `@solana/web3.js`

```typescript
export type {
  ConnectionConfig, Commitment, PublicKey,
  Transaction, VersionedTransaction, TransactionSignature, SendOptions,
} from 'solana-resilience';
```
