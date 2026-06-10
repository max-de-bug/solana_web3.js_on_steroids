# Upgrading from v1.0.x to v1.1.x

## Overview

v1.1 introduces performance optimizations, new utility classes, better developer experience, and config validation — while maintaining full backward compatibility for the public API.

## New Features

### `ConnectionPool` (reusable connection cache)

**Impact:** Health checks and concurrent races no longer create new `Connection` instances for every operation. This reduces WebSocket setup overhead and memory churn with zero API changes on your end.

### `WsConfirmationResult` (discriminated union)

`WebSocketConfirmation.confirmSignature()` now returns `'confirmed' | 'error' | 'timeout'` instead of `boolean`. Callers can distinguish definitive on-chain failures from timeouts.

```typescript
// v1.0.x — boolean only
const ok = await WebSocketConfirmation.isConfirmed(...);

// v1.1.x — discriminated union
const result = await WebSocketConfirmation.confirmSignature(...);
if (result === 'confirmed') { /* ... */ }
if (result === 'error') { /* Transaction failed on-chain */ }
if (result === 'timeout') { /* Retry or fall back */ }
```

The old `isConfirmed()` boolean wrapper is still available for backward compatibility.

### Config Validation

`SteroidClient` and `SteroidConnection` now validate configuration at construction time. Previously, invalid values (e.g., negative timeouts) would only surface at runtime.

```typescript
// v1.1.x — fails fast at construction
new SteroidClient('https://...', {
  connection: { requestTimeout: -1 }  // RangeError immediately
});
```

### `VERSION` Export

```typescript
import { VERSION } from 'solana-resilience';
console.log(VERSION); // '1.1.0'
```

### Logger Improvements

- ISO timestamps in log output
- Configurable log levels: `debug`, `info`, `warn`, `error`
- New `debug()` method for verbose diagnostics

## Performance Improvements

### Fixed Double Simulation Bug

`sendAndConfirm()` no longer calls both `estimateComputeBudget()` and `applyComputeBudget()` — each of which performed a separate simulation RPC call. Now only `applyComputeBudget()` is used, and the CU estimate is retrieved via `ComputeBudgetOptimizer.lastEstimate`.

**If you customised this flow,** review your code to ensure you're not calling both methods redundantly.

### O(1) RPC Scoring

`RpcScorer` previously recalculated the full-window EMA on every `getScore()` call. Scoring is now updated incrementally on each `recordSuccess()` — O(1) per call regardless of window size.

### WebSocket Fast-Fail

`SteroidTransaction` now fast-fails on definitive on-chain errors from WebSocket subscriptions instead of falling through to HTTP polling. This reduces latency for users when transactions land with errors.

## Backward Compatibility

- **All public APIs remain unchanged** — you can upgrade without modifying your code.
- `SteroidClient` constructor signature is unchanged.
- `sendAndConfirm()` options are unchanged.
- All event payloads are unchanged.
- `WebSocketConfirmation.isConfirmed()` is still available.

## Breaking Changes

There are **no breaking changes** in v1.1.0.

## Changelog

See [CHANGELOG.md](../CHANGELOG.md) for the complete list of changes.
