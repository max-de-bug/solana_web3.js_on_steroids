# Solana web3.js on Steroids ⚙️🧱

**A systems-grade resilience layer for `@solana/web3.js`**

Solana UX today is fragile: wallet adapters leak abstractions, RPC behavior is inconsistent, and many integrations fall short of production-grade reliability. **Solana on Steroids** treats crypto UX correctness as a systems problem, making network instability and RPC variability invisible to your users.

[![NPM Version](https://img.shields.io/npm/v/solana-web3.js-on_steroids)](https://www.npmjs.com/package/solana-web3.js-on_steroids)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🌩 The Problem: The "Fragile UX" Trap

Standard Solana dApps often suffer from:
- **Node Lag**: Node A says "confirmed," but Node B (used by the app) says "not found."
- **Ghost Transactions**: Transactions dropped during congestion with no clear recovery path.
- **RPC Single-Point-of-Failure**: If your primary RPC provider hiccups, your entire app freezes.
- **Cryptic Errors**: Raw hex logs and "Simulation failed" messages that confuse users.

## 💊 The Solution: Systems-Grade Resilience

This library wraps `@solana/web3.js` in a robust, automated engine that handles the edge cases of a high-performance blockchain.

### 1. Transparent RPC Failover (Proxy Pattern)
Uses a JS `Proxy` to wrap the `Connection` object. If a node failure (5xx, network error) is detected, it automatically swaps to a healthy fallback node mid-request. **Your app code stays "dumb" while the infra stays smart.**

### 2. Multi-Node Confirmation Polling
Doesn't trust a single node's word. It polls multiple RPC providers simultaneously for signature status to bypass node lag and ensure the fastest possible confirmation UI.

### 3. Continuous Re-broadcasting Loop
Transactions are "babysat" by an engine that refreshes blockhashes and re-broadcasts automatically until a definitive landing or expiration occurs.

### 4. Intelligent Simulation Parsing
Intercepts simulation logs and translates raw program errors into human-readable insights *before* the user even signs.

---

## 🚀 Installation

```bash
npm install solana-web3.js-on_steroids
```

## 🛠 Quick Start

```typescript
import { SteroidClient } from 'solana-web3.js-on_steroids';

const client = new SteroidClient('https://api.mainnet-beta.solana.com', {
  fallbacks: [
    'https://solana-mainnet.rpc.extrnode.com',
    'https://api.alchemy.com/v2/your-key'
  ],
  maxRetries: 5,
  enableLogging: true
});

// Use it exactly like a standard @solana/web3.js Connection
const balance = await client.connection.getBalance(myPublicKey);

// Connect a wallet adapter for steroidal transactions
const steroidWallet = client.connectWallet(walletAdapter);
const signature = await steroidWallet.signAndSend(transaction);
```

## 🧬 Core Architecture

### `SteroidConnection`
A resilient proxy for `web3.js.Connection`.
- **Health Heartbeat**: Background pings monitor latency and uptime across all fallbacks.
- **Error classification**: Distinguishes between **Transient** errors (retry same node) and **Node Failures** (failover to next node).

### `SteroidTransaction`
The heavy-duty engine for submission and confirmation.
- **Signature Polling**: Parallel checks across `confirmationNodes`.
- **Blockhash Refresh**: Automatically re-fetches `recentBlockhash` if the transaction has been pending too long, preventing expiration before signing.

---

## 📜 License

MIT License. See [LICENSE](LICENSE) for details.

## 🤝 Contributing

We treat reliability as a first-class citizen. If you find an edge case where a transaction could be lost or an RPC error could be better handled, please open an issue or PR.
