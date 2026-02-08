import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RpcScorer } from '../../src/connection/RpcScorer.js';
import { RPCHealth } from '../../src/types/SteroidWalletTypes.js';

describe('RpcScorer', () => {
    let scorer: RpcScorer;
    const url1 = 'https://api.mainnet-beta.solana.com';
    const url2 = 'https://solana-api.projectserum.com';

    beforeEach(() => {
        scorer = new RpcScorer(10);
    });

    it('should calculate higher score for lower latency', () => {
        scorer.recordSuccess(url1, 100); // 100ms
        scorer.recordSuccess(url2, 500); // 500ms

        const score1 = scorer.getScore(url1);
        const score2 = scorer.getScore(url2);

        expect(score1).toBeGreaterThan(score2);
    });

    it('should heavily penalize errors', () => {
        // url1 is fast but has errors
        scorer.recordSuccess(url1, 100);
        scorer.recordFailure(url1);
        
        // url2 is slower but reliable
        scorer.recordSuccess(url2, 200);
        scorer.recordSuccess(url2, 210);

        const score1 = scorer.getScore(url1);
        const score2 = scorer.getScore(url2);

        // Even though url1 is twice as fast, it has a 50% error rate in this small window
        expect(score2).toBeGreaterThan(score1);
    });

    it('should pick the best healthy node', () => {
        const urls = [url1, url2];
        const healthMap = new Map<string, RPCHealth>([
            [url1, { url: url1, healthy: true, lastChecked: Date.now() }],
            [url2, { url: url2, healthy: true, lastChecked: Date.now() }]
        ]);

        scorer.recordSuccess(url1, 500);
        scorer.recordSuccess(url2, 100);

        const bestIndex = scorer.getBestUrlIndex(urls, healthMap);
        expect(bestIndex).toBe(1); // url2 index
    });

    it('should ignore unhealthy nodes even if they were fast', () => {
        const urls = [url1, url2];
        const healthMap = new Map<string, RPCHealth>([
            [url1, { url: url1, healthy: true, lastChecked: Date.now() }],
            [url2, { url: url2, healthy: false, lastChecked: Date.now() }] // url2 is down
        ]);

        scorer.recordSuccess(url1, 500);
        scorer.recordSuccess(url2, 10); // was super fast before it died

        const bestIndex = scorer.getBestUrlIndex(urls, healthMap);
        expect(bestIndex).toBe(0); // must pick url1
    });

    it('should respect excludeIndices', () => {
        const urls = [url1, url2];
        const healthMap = new Map<string, RPCHealth>([
            [url1, { url: url1, healthy: true, lastChecked: Date.now() }],
            [url2, { url: url2, healthy: true, lastChecked: Date.now() }]
        ]);

        scorer.recordSuccess(url1, 10);
        scorer.recordSuccess(url2, 100);

        // url1 is better but we exclude it (e.g. because it just failed in a specific loop)
        const bestIndex = scorer.getBestUrlIndex(urls, healthMap, new Set([0]));
        expect(bestIndex).toBe(1);
    });

    it('should penalize stalled nodes (slot lag)', () => {
        scorer.recordSuccess(url1, 100);
        scorer.recordSuccess(url2, 200);

        // url1 is twice as fast, but let's say it's stalled
        scorer.recordSlot(url1, 1000); // Stuck at 1000
        scorer.recordSlot(url2, 1100); // Cluster is at 1100

        // With default maxSlotLag=50, 100 slot lag should be penalized
        const score1 = scorer.getScore(url1, 50);
        const score2 = scorer.getScore(url2, 50);

        // url2 should now have a higher score despite being slower because url1 is stalled
        expect(score2).toBeGreaterThan(score1);
    });
});
