import { RPCHealth } from '../types/SteroidWalletTypes.js';

/**
 * Tracks per-node RPC metrics: latency (via running EMA), success rate, and slot lag.
 * Provides a composite score for intelligent node selection.
 *
 * Key optimization: latency EMA is updated incrementally on each `recordSuccess()` call
 * instead of being recalculated from the full history window every time `getScore()` is invoked.
 */
export class RpcScorer {
  /** Running EMA latency per URL */
  private emaLatency: Map<string, number> = new Map();
  /** Sliding window of success/failure flags (0 = success, 1 = failure) */
  private errorHistory: Map<string, number[]> = new Map();
  /** Latest reported slot per URL */
  private slotHistory: Map<string, number> = new Map();
  /** Maximum slot observed across all URLs */
  private maxClusterSlot: number = 0;
  /** Number of successful request samples recorded per URL */
  private sampleCount: Map<string, number> = new Map();

  private readonly windowSize: number;
  /** Smoothing factor for EMA (0.3 = 30% weight to new value) */
  private readonly alpha = 0.3;

  constructor(windowSize: number = 20) {
    this.windowSize = windowSize;
  }

  /**
   * Records the current slot for a given URL and updates the cluster-wide maximum.
   */
  public recordSlot(url: string, slot: number): void {
    this.slotHistory.set(url, slot);
    if (slot > this.maxClusterSlot) {
      this.maxClusterSlot = slot;
    }
  }

  /**
   * Records a successful request latency for a given URL.
   * Updates the running EMA incrementally — O(1) per call.
   */
  public recordSuccess(url: string, latency: number): void {
    const currentEma = this.emaLatency.get(url);
    const newEma = currentEma === undefined
      ? latency
      : this.alpha * latency + (1 - this.alpha) * currentEma;
    this.emaLatency.set(url, newEma);

    this.sampleCount.set(url, (this.sampleCount.get(url) ?? 0) + 1);

    // Record a 0 (success) in the error sliding window
    this.pushErrorSample(url, 0);
  }

  /**
   * Records a failed request for a given URL.
   */
  public recordFailure(url: string): void {
    this.pushErrorSample(url, 1);
  }

  /**
   * Calculates the composite score for a specific URL.
   *
   * Formula: `(1000 / EMA_Latency) × SuccessRate² × LagPenalty`
   *
   * - **1000 / EMA_Latency**: Normalises latency so higher is better.
   * - **SuccessRate²**: Heavily penalises nodes with even a few recent errors.
   * - **LagPenalty**: Exponential decay when slot lag exceeds the threshold.
   */
  public getScore(url: string, maxSlotLag: number = 50): number {
    const ema = this.emaLatency.get(url);
    const samples = this.sampleCount.get(url) ?? 0;

    // No data yet — unable to score
    if (ema === undefined || samples === 0) return 0;

    // Success rate from sliding window
    const errorWindow = this.errorHistory.get(url) ?? [];
    const failures = errorWindow.reduce((sum, val) => sum + val, 0);
    const successRate = 1 - (failures / (errorWindow.length || 1));

    // Slot lag penalty
    const lastSlot = this.slotHistory.get(url) ?? 0;
    const lag = Math.max(0, this.maxClusterSlot - lastSlot);
    const lagPenalty = lag > maxSlotLag ? Math.pow(0.5, (lag - maxSlotLag) / 10) : 1;

    return (1000 / (ema || 1)) * Math.pow(successRate, 2) * lagPenalty;
  }

  /**
   * Picks the best healthy RPC node from the list based on scores.
   * If scores are tied or missing, falls back to the original order.
   */
  public getBestUrlIndex(
    urls: string[],
    healthMap: Map<string, RPCHealth>,
    excludeIndices: Set<number> = new Set(),
    maxSlotLag: number = 50
  ): number {
    let bestIndex = -1;
    let maxScore = -1;

    for (let i = 0; i < urls.length; i++) {
      if (excludeIndices.has(i)) continue;

      const url = urls[i];
      const health = healthMap.get(url);

      // Only consider healthy nodes
      if (!health || !health.healthy) continue;

      const score = this.getScore(url, maxSlotLag);

      if (bestIndex === -1 || score > maxScore) {
        bestIndex = i;
        maxScore = score;
      }
    }

    return bestIndex;
  }

  // ── Private helpers ──────────────────────────────────────────────

  /**
   * Pushes a sample into the sliding error window, evicting the oldest entry when full.
   */
  private pushErrorSample(url: string, value: number): void {
    let history = this.errorHistory.get(url);
    if (!history) {
      history = [];
      this.errorHistory.set(url, history);
    }
    history.push(value);
    if (history.length > this.windowSize) {
      history.shift();
    }
  }
}
