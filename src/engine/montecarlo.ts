// Monte Carlo simulation engine for payout-weighted discard EV analysis
//
// For each possible discard from a 14-tile hand, simulates N random game
// continuations and tracks win rate, score distribution, and expected value.

import {
  type TileCounts,
  type TileIndex,
  NUM_TILE_TYPES,
  TILES_PER_TYPE,
  cloneTileCounts,
  WINDS_START,
} from './tiles';
import type { GameContext } from './hand';
import { calculateShanten } from './shanten';
import { scoreHand } from './scoring';
import type { RulesetMode } from './rulesets';
import { getRulesetConfig } from './rulesets';
import { SeededRNG } from './generator';

export interface MonteCarloResult {
  tile: TileIndex;
  simulations: number;
  winRate: number;
  avgFan: number;
  avgPayout: number; // EV — the key metric
  fanDistribution: Record<number, number>;
  bestHandSeen: { fan: number; patterns: string[] } | null;
}

export interface MonteCarloProgress {
  completed: number;
  total: number;
  partialResults: MonteCarloResult[];
}

export interface MonteCarloRequest {
  tiles: TileCounts;      // 14-tile hand
  gameContext: GameContext;
  rulesetMode: RulesetMode;
  numSimulations: number;  // per discard option
}

// ---- Payout calculation ----

function calculatePayout(fan: number, mode: RulesetMode): number {
  if (mode === 'chinese') {
    return fan; // MCR: points are additive
  }
  // HK / Blended: exponential payout
  const LIMIT_FAN = 10;
  const BASE_POINTS = 8;
  if (fan < 3) return 0;
  if (fan >= LIMIT_FAN) return BASE_POINTS * Math.pow(2, LIMIT_FAN - 3);
  return BASE_POINTS * Math.pow(2, fan - 3);
}

// ---- Ultra-fast discard heuristic for inside simulations ----
// Only uses shanten (no acceptance calculation). Ties broken by simple
// connectivity heuristic to avoid the expensive getAcceptanceTiles call.

function fastPickDiscard(tiles: TileCounts, includeSevenPairs: boolean): TileIndex {
  let bestTile = -1;
  let bestShanten = 99;
  let bestScore = -999;

  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] <= 0) continue;
    tiles[i]--;
    const sh = calculateShanten(tiles, includeSevenPairs);
    if (sh < bestShanten) {
      bestShanten = sh;
      bestScore = tileConnectivity(tiles, i);
      bestTile = i;
    } else if (sh === bestShanten) {
      // Tie-break: prefer discarding less-connected tiles
      // (tiles with fewer neighbors / lower connectivity keep better tiles)
      const score = tileConnectivity(tiles, i);
      if (score > bestScore) {
        bestScore = score;
        bestTile = i;
      }
    }
    tiles[i]++;
  }

  return bestTile >= 0 ? bestTile : 0;
}

// Quick connectivity score for tie-breaking (higher = worse tile to keep = better to discard)
// Negative of how connected the discarded tile is to the remaining hand
function tileConnectivity(_tiles: TileCounts, discardedTile: TileIndex): number {
  // Isolated honors and terminals are best to discard (high score)
  if (discardedTile >= WINDS_START) return 10; // honor
  const rank = discardedTile % 9;
  if (rank === 0 || rank === 8) return 5; // terminal
  return 0; // middle tile (worse to discard)
}

// ---- Build remaining wall (tiles not in hand) ----

function buildWall(handTiles: TileCounts): TileIndex[] {
  const wall: TileIndex[] = [];
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    const remaining = TILES_PER_TYPE - handTiles[i];
    for (let j = 0; j < remaining; j++) {
      wall.push(i);
    }
  }
  return wall;
}

// ---- Single simulation ----

interface SimResult {
  won: boolean;
  fan: number;
  payout: number;
  patterns: string[];
}

function runOneSim(
  startTiles: TileCounts,
  ctx: GameContext,
  mode: RulesetMode,
  includeSevenPairs: boolean,
  rng: SeededRNG,
  maxTurns: number,
): SimResult {
  const tiles = cloneTileCounts(startTiles);
  const wall = buildWall(tiles);
  rng.shuffle(wall);

  let wallIdx = 0;
  const turnsAvailable = Math.min(maxTurns, wall.length, ctx.wallRemaining);

  for (let turn = 0; turn < turnsAvailable; turn++) {
    if (wallIdx >= wall.length) break;

    // Draw
    const drawn = wall[wallIdx++];
    tiles[drawn]++;

    // Check win (fast: shanten === -1 means complete hand)
    if (calculateShanten(tiles, includeSevenPairs) === -1) {
      const simCtx: GameContext = {
        ...ctx,
        isSelfDrawn: true,
        wallRemaining: ctx.wallRemaining - turn - 1,
      };
      const score = scoreHand(tiles, simCtx, mode);
      if (score) {
        const fan = score.fan;
        const payout = calculatePayout(fan, mode);
        if (payout > 0) {
          return { won: true, fan, payout, patterns: score.patterns };
        }
      }
      // Below minimum — can't declare, discard the drawn tile and continue
      tiles[drawn]--;
      continue;
    }

    // Pick best discard using fast heuristic
    const discard = fastPickDiscard(tiles, includeSevenPairs);
    tiles[discard]--;
  }

  return { won: false, fan: 0, payout: 0, patterns: [] };
}

// ---- Run all simulations for one discard option ----

function simulateDiscard(
  handTiles: TileCounts,
  discardTile: TileIndex,
  ctx: GameContext,
  mode: RulesetMode,
  includeSevenPairs: boolean,
  numSims: number,
  rng: SeededRNG,
): MonteCarloResult {
  const after = cloneTileCounts(handTiles);
  after[discardTile]--;

  let wins = 0;
  let totalFan = 0;
  let totalPayout = 0;
  const fanDist: Record<number, number> = {};
  let bestFan = 0;
  let bestPatterns: string[] = [];

  const maxTurns = Math.min(18, ctx.wallRemaining);

  for (let i = 0; i < numSims; i++) {
    const result = runOneSim(after, ctx, mode, includeSevenPairs, rng, maxTurns);
    if (result.won) {
      wins++;
      totalFan += result.fan;
      totalPayout += result.payout;
      fanDist[result.fan] = (fanDist[result.fan] || 0) + 1;
      if (result.fan > bestFan) {
        bestFan = result.fan;
        bestPatterns = result.patterns;
      }
    }
  }

  return {
    tile: discardTile,
    simulations: numSims,
    winRate: wins / numSims,
    avgFan: wins > 0 ? totalFan / wins : 0,
    avgPayout: totalPayout / numSims,
    fanDistribution: fanDist,
    bestHandSeen: bestFan > 0 ? { fan: bestFan, patterns: bestPatterns } : null,
  };
}

// ---- Main entry point ----

export function runMonteCarloAnalysis(
  request: MonteCarloRequest,
  onProgress?: (progress: MonteCarloProgress) => void,
): MonteCarloResult[] {
  const { tiles, gameContext, rulesetMode, numSimulations } = request;
  const config = getRulesetConfig(rulesetMode);
  const includeSevenPairs = config.sevenPairsEnabled;

  // Find unique discard options
  const discardOptions: TileIndex[] = [];
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] > 0) discardOptions.push(i);
  }

  const rng = new SeededRNG(Date.now());
  const results: MonteCarloResult[] = [];
  const totalSims = discardOptions.length * numSimulations;
  let completedSims = 0;

  for (const discardTile of discardOptions) {
    const result = simulateDiscard(
      tiles,
      discardTile,
      gameContext,
      rulesetMode,
      includeSevenPairs,
      numSimulations,
      rng,
    );
    results.push(result);
    completedSims += numSimulations;

    if (onProgress) {
      onProgress({
        completed: completedSims,
        total: totalSims,
        partialResults: [...results],
      });
    }
  }

  // Sort by EV (avgPayout) descending
  results.sort((a, b) => b.avgPayout - a.avgPayout);

  return results;
}
