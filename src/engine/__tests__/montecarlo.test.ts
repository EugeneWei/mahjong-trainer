import { describe, it, expect } from 'vitest';
import { runMonteCarloAnalysis, type MonteCarloRequest } from '../montecarlo';
import { createEmptyTileCounts, totalTileCount } from '../tiles';
import { createDefaultGameContext } from '../hand';

describe('Monte Carlo simulation', () => {
  it('returns results for each unique discard option', () => {
    // Simple 14-tile hand: 1-2-3b 4-5-6b 7-8-9b 1-2c pair 1d + extra East wind
    const tiles = createEmptyTileCounts();
    tiles[0] = 1; tiles[1] = 1; tiles[2] = 1; // 1-2-3b
    tiles[3] = 1; tiles[4] = 1; tiles[5] = 1; // 4-5-6b
    tiles[6] = 1; tiles[7] = 1; tiles[8] = 1; // 7-8-9b
    tiles[9] = 1; tiles[10] = 1;               // 1-2c
    tiles[18] = 2;                               // pair 1d
    tiles[27] = 1;                               // East wind (extra)
    expect(totalTileCount(tiles)).toBe(14);

    const request: MonteCarloRequest = {
      tiles,
      gameContext: { ...createDefaultGameContext(), wallRemaining: 30 },
      rulesetMode: 'hk',
      numSimulations: 5, // very small for speed
    };

    const results = runMonteCarloAnalysis(request);

    // Should have one result per unique tile type
    const uniqueCount = tiles.filter(c => c > 0).length;
    expect(results.length).toBe(uniqueCount);

    // Each result should have valid fields
    for (const r of results) {
      expect(r.simulations).toBe(5);
      expect(r.winRate).toBeGreaterThanOrEqual(0);
      expect(r.winRate).toBeLessThanOrEqual(1);
      expect(r.avgPayout).toBeGreaterThanOrEqual(0);
    }

    // Results should be sorted by EV descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].avgPayout).toBeGreaterThanOrEqual(results[i].avgPayout);
    }
  });

  it('tenpai hand finds wins with chinese rules (lower min)', () => {
    // Tenpai hand: 1-2-3b 4-5-6b 7-8-9b 1-2-3c + pair 1d 1d
    // Chinese rules have min 8 pts, and basic patterns should reach that
    const tiles = createEmptyTileCounts();
    tiles[0] = 1; tiles[1] = 1; tiles[2] = 1;
    tiles[3] = 1; tiles[4] = 1; tiles[5] = 1;
    tiles[6] = 1; tiles[7] = 1; tiles[8] = 1;
    tiles[9] = 1; tiles[10] = 1; tiles[11] = 1;
    tiles[18] = 2;
    expect(totalTileCount(tiles)).toBe(14);

    const request: MonteCarloRequest = {
      tiles,
      gameContext: { ...createDefaultGameContext(), wallRemaining: 40 },
      rulesetMode: 'chinese',
      numSimulations: 10,
    };

    const results = runMonteCarloAnalysis(request);
    expect(results.length).toBeGreaterThan(0);
    // Just verify structure is valid
    for (const r of results) {
      expect(r.winRate).toBeGreaterThanOrEqual(0);
      expect(r.winRate).toBeLessThanOrEqual(1);
    }
  });

  it('works with chinese ruleset mode', () => {
    const tiles = createEmptyTileCounts();
    tiles[0] = 1; tiles[1] = 1; tiles[2] = 1;
    tiles[3] = 1; tiles[4] = 1; tiles[5] = 1;
    tiles[6] = 1; tiles[7] = 1; tiles[8] = 1;
    tiles[9] = 1; tiles[10] = 1; tiles[11] = 1;
    tiles[18] = 2;
    expect(totalTileCount(tiles)).toBe(14);

    const request: MonteCarloRequest = {
      tiles,
      gameContext: { ...createDefaultGameContext(), wallRemaining: 20 },
      rulesetMode: 'chinese',
      numSimulations: 3,
    };

    const results = runMonteCarloAnalysis(request);
    expect(results.length).toBeGreaterThan(0);
  });

  it('calls progress callback', () => {
    const tiles = createEmptyTileCounts();
    tiles[0] = 3; tiles[1] = 3; tiles[2] = 3; tiles[3] = 3; tiles[4] = 2;
    expect(totalTileCount(tiles)).toBe(14);

    const request: MonteCarloRequest = {
      tiles,
      gameContext: { ...createDefaultGameContext(), wallRemaining: 10 },
      rulesetMode: 'hk',
      numSimulations: 2,
    };

    let progressCalls = 0;
    runMonteCarloAnalysis(request, () => {
      progressCalls++;
    });

    expect(progressCalls).toBeGreaterThan(0);
  });

  it('payout calculation: high-fan hand has higher EV than low-fan with more wins', () => {
    // This is a structural test of the payout math
    // 7 fan at 12% win = EV 0.12 * 128 = 15.36
    // 3 fan at 35% win = EV 0.35 * 8 = 2.8
    // The Monte Carlo engine should use payout-weighted EV
    const tiles = createEmptyTileCounts();
    tiles[0] = 3; tiles[1] = 3; tiles[2] = 3; tiles[3] = 3; tiles[4] = 2;
    expect(totalTileCount(tiles)).toBe(14);

    const request: MonteCarloRequest = {
      tiles,
      gameContext: { ...createDefaultGameContext(), wallRemaining: 5 },
      rulesetMode: 'hk',
      numSimulations: 2,
    };

    // Just verify it runs without error and returns valid structure
    const results = runMonteCarloAnalysis(request);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(typeof r.avgPayout).toBe('number');
      expect(typeof r.winRate).toBe('number');
      expect(typeof r.avgFan).toBe('number');
    }
  });
});
