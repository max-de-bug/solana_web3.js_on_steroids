# Changelog

All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/).

## [1.1.1] — 2026-06-10

### Changed
- **Updated documentation** — README.md overhaul with complete up-to-date API reference, new `docs/api-reference.md` and `docs/upgrading.md` guides.
- Removed outdated architecture diagram from README (diagram still available in `docs/assets/`).

## [1.1.0] — 2026-04-20

### Added
- **`ConnectionPool`** — Reusable connection cache that eliminates redundant `new Connection()` calls during health checks and concurrent races.
- **`WsConfirmationResult`** — Discriminated union type (`'confirmed' | 'error' | 'timeout'`) for WebSocket confirmations, enabling callers to distinguish definitive on-chain failures from timeouts.
- **Config validation** — `SteroidClient` now validates constructor config at creation time (negative timeouts, invalid URLs, etc.) with clear `RangeError`/`TypeError` messages.
- **`VERSION` export** — Library version is now exported as a constant from the main entrypoint.
- **Logger improvements** — Added ISO timestamps, configurable log levels (`debug`/`info`/`warn`/`error`), and a `debug()` method.
- **`CHANGELOG.md`** — This file.

### Changed
- **Fixed double-simulation performance bug** — `sendAndConfirm()` was calling *both* `estimateComputeBudget()` and `applyComputeBudget()`, each performing a separate simulation RPC call. Now only `applyComputeBudget()` is called, and the CU estimate is retrieved via `ComputeBudgetOptimizer.lastEstimate`.
- **Optimised `RpcScorer`** — Replaced full-window EMA recalculation on every `getScore()` with an incrementally maintained running EMA. Scoring is now O(1).
- **SteroidTransaction WebSocket path** — Now fast-fails on definitive on-chain errors instead of falling through to polling.

### Fixed
- **`.gitignore`** previously contained a self-ignore entry and was missing `dist/`, IDE, and OS files.

## [1.0.18] — Previous Release

### Features
- Transparent RPC failover via Proxy pattern
- Low-latency WebSocket confirmation
- Automatic cluster detection & safety
- Multi-node confirmation polling
- Continuous re-broadcasting loop
- Dynamic priority fee optimization
