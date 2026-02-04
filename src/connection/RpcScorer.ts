import { RPCHealth } from '../types/SteroidWalletTypes.js';

export class RpcScorer {
  private latencyHistory: Map<string, number[]> = new Map();
  private errorHistory: Map<string, number[]> = new Map();
  private readonly windowSize: number;
  private readonly alpha = 0.3; // Smoothing factor for EMA (0.3 = 30% weight to new value)

  constructor(windowSize: number = 20) {
    this.windowSize = windowSize;
  }

  /**
   * Records a successful request latency for a given URL.
   */
  public recordSuccess(url: string, latency: number): void {
    let history = this.latencyHistory.get(url) || [];
    history.push(latency);
    if (history.length > this.windowSize) {
      history.shift();
    }
    this.latencyHistory.set(url, history);

    // Also record a 0 in error history for success
    let errHistory = this.errorHistory.get(url) || [];
    errHistory.push(0);
    if (errHistory.length > this.windowSize) {
      errHistory.shift();
    }
    this.errorHistory.set(url, errHistory);
  }

  /**
   * Records a failed request for a given URL.
   */
  public recordFailure(url: string): void {
    let errHistory = this.errorHistory.get(url) || [];
    errHistory.push(1);
    if (errHistory.length > this.windowSize) {
      errHistory.shift();
    }
    this.errorHistory.set(url, errHistory);
  }

  /**
   * Calculates the score for all URLs and returns the best one.
   * Score = (1 / EMA_Latency) * (SuccessRate^2)
   */
  public getScore(url: string): number {
    const latencyHistory = this.latencyHistory.get(url) || [];
    const errorHistory = this.errorHistory.get(url) || [];

    if (latencyHistory.length === 0) return 0;

    // Calculate Latency EMA
    let ema = latencyHistory[0];
    for (let i = 1; i < latencyHistory.length; i++) {
      ema = this.alpha * latencyHistory[i] + (1 - this.alpha) * ema;
    }

    // Calculate Success Rate
    const failures = errorHistory.reduce((sum, val) => sum + val, 0);
    const successRate = 1 - (failures / (errorHistory.length || 1));

    // Calculate Score
    // We use successRate^2 to heavily penalize nodes with even a few errors
    // We use 1000/ema to normalize latency into a human-readable scale where higher is better
    const score = (1000 / (ema || 1)) * Math.pow(successRate, 2);
    
    return score;
  }

  /**
   * Picks the best healthy RPC node from the list based on scores.
   * If scores are tied or missing, falls back to original order.
   */
  public getBestUrlIndex(urls: string[], healthMap: Map<string, RPCHealth>, excludeIndices: Set<number> = new Set()): number {
    let bestIndex = -1;
    let maxScore = -1;

    for (let i = 0; i < urls.length; i++) {
        if (excludeIndices.has(i)) continue;
        
        const url = urls[i];
        const health = healthMap.get(url);
        
        // Only consider healthy nodes
        if (!health || !health.healthy) continue;

        const score = this.getScore(url);
        
        // If we haven't found any node yet, or this node has a better score
        if (bestIndex === -1 || score > maxScore) {
            bestIndex = i;
            maxScore = score;
        }
    }

    return bestIndex;
  }
}
