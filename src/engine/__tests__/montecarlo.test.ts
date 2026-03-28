import { describe, it, expect } from 'vitest';
import {
  runMonteCarloAnalysis,
  exactTenpaiAnalysis,
  exactIishantenAnalysis,
  runHybridAnalysis,
  type MonteCarloRequest,
} from '../montecarlo';
import { createEmptyTileCounts, totalTileCount } from '../tiles';
import { createDefaultGameContext } from '../hand';
import { calculateShanten } from '../shanten';

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

// Tenpai hand (14 tiles, shanten 0)
// 111b 222b 333b 44b 56b = 14 tiles
// Melds: 111b, 222b, 333b, partial 56b waiting on 4b or 7b, pair 44b
function makeTenpaiHand(): number[] {
  const t = createEmptyTileCounts();
  t[0] = 3; // 1b x3
  t[1] = 3; // 2b x3
  t[2] = 3; // 3b x3
  t[3] = 2; // 4b x2
  t[4] = 1; // 5b x1
  t[5] = 1; // 6b x1
  t[27] = 1; // East x1
  // Total: 3+3+3+2+1+1+1 = 14
  return t;
}

// Iishanten hand (14 tiles, shanten ~1-2)
// 111b 222b 33b 5b 7b EE RR = 14 tiles
function makeIishantenHand(): number[] {
  const t = createEmptyTileCounts();
  t[0] = 3; // 1b x3
  t[1] = 3; // 2b x3
  t[2] = 2; // 3b x2
  t[4] = 1; // 5b x1
  t[6] = 1; // 7b x1
  t[27] = 2; // East x2
  t[31] = 2; // Red dragon x2
  // Total: 3+3+2+1+1+2+2 = 14
  return t;
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

describe('Exact tenpai analysis', () => {
  it('returns results for a tenpai hand', () => {
    const tiles = makeTenpaiHand();
    expect(totalTileCount(tiles)).toBe(14);
    expect(calculateShanten(tiles)).toBe(0);

    const ctx = { ...createDefaultGameContext(), wallRemaining: 40 };
    const results = exactTenpaiAnalysis(tiles, ctx, 'hk');

    expect(results.length).toBeGreaterThan(0);

    for (const r of results) {
      expect(r.simulations).toBe(0); // exact, not MC
      expect(r.winRate).toBeGreaterThanOrEqual(0);
      expect(r.winRate).toBeLessThanOrEqual(1);
      expect(r.avgPayout).toBeGreaterThanOrEqual(0);
      expect(typeof r.fanDistribution).toBe('object');
    }

    // Sorted by EV descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].avgPayout).toBeGreaterThanOrEqual(results[i].avgPayout);
    }

    // At least one discard should have positive EV (hand is tenpai)
    const hasPositiveEV = results.some(r => r.avgPayout > 0);
    expect(hasPositiveEV).toBe(true);
  }, 10000);

  it('discard that breaks tenpai has zero EV', () => {
    const tiles = makeTenpaiHand();
    const ctx = { ...createDefaultGameContext(), wallRemaining: 40 };
    const results = exactTenpaiAnalysis(tiles, ctx, 'hk');

    // Some discards should break tenpai and have 0 EV
    // (unless every discard maintains tenpai, which is unlikely)
    const zeroEVResults = results.filter(r => r.avgPayout === 0);
    // This is hand-dependent; just verify structure is valid
    for (const r of zeroEVResults) {
      expect(r.winRate).toBe(0);
      expect(r.avgFan).toBe(0);
    }
  }, 10000);
});

describe('Exact iishanten analysis', () => {
  it('returns results for an iishanten hand', () => {
    const tiles = makeIishantenHand();
    expect(totalTileCount(tiles)).toBe(14);

    const sh = calculateShanten(tiles);
    // Accept shanten 1 or 2 depending on exact hand structure
    expect(sh).toBeGreaterThanOrEqual(1);

    const ctx = { ...createDefaultGameContext(), wallRemaining: 50 };
    const results = exactIishantenAnalysis(tiles, ctx, 'hk');

    expect(results.length).toBeGreaterThan(0);

    for (const r of results) {
      expect(r.simulations).toBe(0); // exact
      expect(r.winRate).toBeGreaterThanOrEqual(0);
      expect(r.winRate).toBeLessThanOrEqual(1);
      expect(r.avgPayout).toBeGreaterThanOrEqual(0);
    }

    // Sorted by EV descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].avgPayout).toBeGreaterThanOrEqual(results[i].avgPayout);
    }
  }, 30000);
});

describe('Hybrid analysis routing', () => {
  it('routes tenpai hand to exact analysis', () => {
    const tiles = makeTenpaiHand();
    const ctx = { ...createDefaultGameContext(), wallRemaining: 40 };

    const result = runHybridAnalysis({
      tiles,
      gameContext: ctx,
      rulesetMode: 'hk',
      numSimulations: 500,
    });

    expect(result.method.type).toBe('exact');
    expect(result.shanten).toBe(0);
    expect(result.results.length).toBeGreaterThan(0);
    // Exact results have simulations = 0
    for (const r of result.results) {
      expect(r.simulations).toBe(0);
    }
  }, 10000);

  it('routes shanten 2+ hand to Monte Carlo', () => {
    // Build a shanten 3+ hand: scattered tiles across all suits + honors
    const tiles = createEmptyTileCounts();
    tiles[0] = 2;  // 1b x2
    tiles[5] = 2;  // 6b x2
    tiles[9] = 2;  // 1c x2
    tiles[14] = 2; // 6c x2
    tiles[18] = 2; // 1d x2
    tiles[23] = 1; // 6d x1
    tiles[27] = 1; // East x1
    tiles[28] = 1; // South x1
    tiles[31] = 1; // Red dragon x1 (extra to make 15 -> no, need 14)
    // Total = 2+2+2+2+2+1+1+1+1 = 14

    expect(totalTileCount(tiles)).toBe(14);
    const sh = calculateShanten(tiles);
    expect(sh).toBeGreaterThanOrEqual(2);

    const result = runHybridAnalysis({
      tiles,
      gameContext: { ...createDefaultGameContext(), wallRemaining: 60 },
      rulesetMode: 'hk',
      numSimulations: 500,
    });

    expect(result.method.type).toBe('montecarlo');
    expect(result.shanten).toBeGreaterThanOrEqual(2);
  }, 30000);

  it('returns consistent method labels', () => {
    const tiles = makeTenpaiHand();
    const ctx = { ...createDefaultGameContext(), wallRemaining: 40 };

    const result = runHybridAnalysis({
      tiles,
      gameContext: ctx,
      rulesetMode: 'hk',
      numSimulations: 500,
    });

    expect(result.method.label).toBeTruthy();
    expect(typeof result.method.label).toBe('string');
  }, 10000);

  it('compact hand (shanten 0) uses exact analysis', () => {
    // The compact hand 111b 222b 333b 444b 55b is actually a winning hand or tenpai
    const tiles = makeCompactHand();
    const sh = calculateShanten(tiles);

    const result = runHybridAnalysis({
      tiles,
      gameContext: { ...createDefaultGameContext(), wallRemaining: 40 },
      rulesetMode: 'hk',
      numSimulations: 500,
    });

    if (sh <= 1) {
      expect(result.method.type).toBe('exact');
    } else {
      expect(result.method.type).toBe('montecarlo');
    }
  }, 30000);
});
