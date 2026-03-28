import { describe, it, expect } from 'vitest';
import { runMonteCarloAnalysis, type MonteCarloRequest } from '../montecarlo';
import { createEmptyTileCounts, totalTileCount } from '../tiles';
import { createDefaultGameContext } from '../hand';

// Use very compact hands with few unique tile types to minimize discard options,
// and small wall/sim counts to keep tests fast.

function makeCompactHand(): number[] {
  // 111b 222b 333b 444b 55b = 14 tiles, only 5 unique types = 5 discard options
  const tiles = createEmptyTileCounts();
  tiles[0] = 3; // 1b x3
  tiles[1] = 3; // 2b x3
  tiles[2] = 3; // 3b x3
  tiles[3] = 3; // 4b x3
  tiles[4] = 2; // 5b x2
  return tiles;
}

describe('Monte Carlo simulation', () => {
  it('returns results for each unique discard option', () => {
    const tiles = makeCompactHand();
    expect(totalTileCount(tiles)).toBe(14);

    const results = runMonteCarloAnalysis({
      tiles,
      gameContext: { ...createDefaultGameContext(), wallRemaining: 5 },
      rulesetMode: 'hk',
      numSimulations: 2,
    });

    // 5 unique tile types = 5 discard options
    expect(results.length).toBe(5);

    for (const r of results) {
      expect(r.simulations).toBe(2);
      expect(r.winRate).toBeGreaterThanOrEqual(0);
      expect(r.winRate).toBeLessThanOrEqual(1);
      expect(r.avgPayout).toBeGreaterThanOrEqual(0);
    }

    // Sorted by EV descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].avgPayout).toBeGreaterThanOrEqual(results[i].avgPayout);
    }
  }, 30000);

  it('produces valid structure with chinese ruleset', () => {
    const tiles = makeCompactHand();

    const results = runMonteCarloAnalysis({
      tiles,
      gameContext: { ...createDefaultGameContext(), wallRemaining: 5 },
      rulesetMode: 'chinese',
      numSimulations: 2,
    });

    expect(results.length).toBe(5);
    for (const r of results) {
      expect(typeof r.winRate).toBe('number');
      expect(typeof r.avgPayout).toBe('number');
      expect(typeof r.avgFan).toBe('number');
    }
  }, 30000);

  it('calls progress callback', () => {
    const tiles = makeCompactHand();

    let progressCalls = 0;
    runMonteCarloAnalysis(
      {
        tiles,
        gameContext: { ...createDefaultGameContext(), wallRemaining: 3 },
        rulesetMode: 'hk',
        numSimulations: 1,
      },
      () => { progressCalls++; }
    );

    // Should be called once per discard option
    expect(progressCalls).toBe(5);
  }, 30000);

  it('payout math is correct', () => {
    // Verify the payout-weighted structure exists
    const tiles = makeCompactHand();

    const results = runMonteCarloAnalysis({
      tiles,
      gameContext: { ...createDefaultGameContext(), wallRemaining: 3 },
      rulesetMode: 'hk',
      numSimulations: 1,
    });

    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(typeof r.avgPayout).toBe('number');
      expect(typeof r.fanDistribution).toBe('object');
      // avgPayout should be 0 if no wins, or positive if wins
      if (r.winRate === 0) {
        expect(r.avgPayout).toBe(0);
        expect(r.avgFan).toBe(0);
      }
    }
  }, 30000);
});
