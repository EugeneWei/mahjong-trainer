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
  DRAGONS_START,
} from './tiles';
import type { GameContext } from './hand';
import { calculateShanten } from './shanten';
import { scoreHand, isWinningHand } from './scoring';
import type { RulesetMode } from './rulesets';
import { getRulesetConfig } from './rulesets';
import { getAcceptanceTiles } from './shanten';
import { SeededRNG } from './generator';

export type AnalysisMethod =
  | { type: 'exact'; label: string }
  | { type: 'montecarlo'; simulations: number; label: string };

export interface MonteCarloResult {
  tile: TileIndex;
  simulations: number;
  winRate: number;
  avgFan: number;
  avgPayout: number; // EV — the key metric
  fanDistribution: Record<number, number>;
  bestHandSeen: { fan: number; patterns: string[] } | null;
}

export interface HybridAnalysisResult {
  results: MonteCarloResult[];
  method: AnalysisMethod;
  shanten: number;
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

// ---- Score-aware discard heuristic for inside simulations ----
// Primary: minimize shanten (non-negotiable)
// Secondary: maximize hand potential score — preserves paths to higher-scoring hands
// This biases simulations toward flush, pong, honor, and other high-value patterns.

export function fastPickDiscard(tiles: TileCounts, includeSevenPairs: boolean, ctx?: GameContext): TileIndex {
  let bestTile = -1;
  let bestShanten = 99;
  let bestPotential = -999;

  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] <= 0) continue;
    tiles[i]--;
    const sh = calculateShanten(tiles, includeSevenPairs);
    if (sh < bestShanten) {
      bestShanten = sh;
      bestPotential = handPotential(tiles, ctx);
      bestTile = i;
    } else if (sh === bestShanten) {
      const potential = handPotential(tiles, ctx);
      if (potential > bestPotential) {
        bestPotential = potential;
        bestTile = i;
      }
    }
    tiles[i]++;
  }

  return bestTile >= 0 ? bestTile : 0;
}

// Evaluate the scoring potential of a 13-tile hand (after discarding).
// Higher = more likely to lead to a high-scoring win.
// This is designed to be fast: one scan of the 34-element array, no recursion.
function handPotential(tiles: TileCounts, ctx?: GameContext): number {
  let score = 0;

  // --- Suit concentration (flush potential) ---
  // Full Flush (7 fan) and Half Flush (3 fan) are huge; reward concentration.
  const suitCounts = [0, 0, 0];
  let honorCount = 0;
  for (let i = 0; i < 27; i++) {
    suitCounts[Math.floor(i / 9)] += tiles[i];
  }
  for (let i = WINDS_START; i < NUM_TILE_TYPES; i++) {
    honorCount += tiles[i];
  }

  const totalSuitTiles = suitCounts[0] + suitCounts[1] + suitCounts[2];
  const maxSuit = Math.max(suitCounts[0], suitCounts[1], suitCounts[2]);

  if (totalSuitTiles > 0) {
    const concentration = maxSuit / (totalSuitTiles + honorCount);
    // concentration of 1.0 = pure flush, 0.33 = evenly split
    // Scale: 0.5 concentration = 0 bonus, 1.0 = 40 bonus
    if (concentration > 0.5) {
      score += (concentration - 0.5) * 80; // 0 to 40 points

      // Extra bonus for near-flush hands (very strong signal)
      if (maxSuit >= 10 && honorCount === 0) score += 15; // near Full Flush
      else if (maxSuit >= 10) score += 8; // near Half Flush
    }
  }

  // --- Honor value (Dragon and scoring Wind pongs) ---
  // Each Dragon pong = 1 fan, each scoring Wind pong = 1 fan
  const seatWind = ctx?.seatWind ?? 0;
  const prevWind = ctx?.prevailingWind ?? 0;

  for (let i = DRAGONS_START; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] >= 3) score += 12;      // Dragon pong: guaranteed 1 fan
    else if (tiles[i] === 2) score += 6;  // Dragon pair: could become pong
  }

  const seatWindIdx = WINDS_START + seatWind;
  const prevWindIdx = WINDS_START + prevWind;
  for (let i = WINDS_START; i < DRAGONS_START; i++) {
    const isScoring = (i === seatWindIdx || i === prevWindIdx);
    if (tiles[i] >= 3 && isScoring) score += 12;      // Scoring wind pong
    else if (tiles[i] === 2 && isScoring) score += 6;  // Scoring wind pair
    else if (tiles[i] >= 3) score += 3;                // Non-scoring wind pong (still a meld)
    else if (tiles[i] === 1 && !isScoring) score -= 2; // Isolated non-scoring wind: dead tile
  }

  // --- All Pongs potential ---
  // All Pongs (3 fan) requires 4 pongs + pair. Reward triplet-heavy hands.
  let triplets = 0;
  let pairs = 0;
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] >= 3) triplets++;
    else if (tiles[i] === 2) pairs++;
  }
  if (triplets >= 2) score += triplets * 5; // Pong path viable
  if (triplets >= 3) score += 10;           // Strong pong path

  // --- Hand shape / connectivity ---
  // Reward tiles that form sequences (connected tiles)
  // Penalize isolated tiles
  for (let s = 0; s < 3; s++) {
    const start = s * 9;
    for (let r = 0; r < 9; r++) {
      const idx = start + r;
      if (tiles[idx] === 0) continue;

      // Check if this tile connects to neighbors
      const hasLeft = r > 0 && tiles[idx - 1] > 0;
      const hasRight = r < 8 && tiles[idx + 1] > 0;
      const hasGapLeft = r > 1 && tiles[idx - 2] > 0;
      const hasGapRight = r < 7 && tiles[idx + 2] > 0;

      if (hasLeft && hasRight) score += 3;        // Connected both sides
      else if (hasLeft || hasRight) score += 1.5;  // Connected one side
      else if (hasGapLeft || hasGapRight) score += 0.5; // Gap connection
      else if (tiles[idx] === 1) score -= 2;      // Isolated single: dead weight

      // Terminal penalty (less flexible for sequences)
      if (r === 0 || r === 8) {
        if (tiles[idx] === 1 && !hasRight && !hasLeft) score -= 1;
      }
    }
  }

  // --- Seven Pairs potential (if enabled) ---
  if (pairs + triplets >= 5) {
    score += 5; // Many pairs = Seven Pairs could be viable
  }

  return score;
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

    // Pick best discard using score-aware heuristic
    const discard = fastPickDiscard(tiles, includeSevenPairs, ctx);
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

// ---- Exact Tenpai Analysis (shanten 0) ----
// For each discard from a 14-tile tenpai hand, enumerate all winning tiles
// and calculate exact EV.

export function exactTenpaiAnalysis(
  tiles: TileCounts,
  ctx: GameContext,
  mode: RulesetMode,
): MonteCarloResult[] {
  const config = getRulesetConfig(mode);
  const includeSevenPairs = config.sevenPairsEnabled;
  const results: MonteCarloResult[] = [];

  // Find unique discard options
  for (let d = 0; d < NUM_TILE_TYPES; d++) {
    if (tiles[d] <= 0) continue;

    // Discard tile d -> 13-tile hand
    tiles[d]--;
    const sh = calculateShanten(tiles, includeSevenPairs);

    if (sh === 0) {
      // This 13-tile hand is tenpai — enumerate winning tiles
      let totalWinProb = 0;
      let weightedFan = 0;
      let weightedPayout = 0;
      const fanDist: Record<number, number> = {};
      let bestFan = 0;
      let bestPatterns: string[] = [];

      for (let w = 0; w < NUM_TILE_TYPES; w++) {
        const copiesRemaining = TILES_PER_TYPE - tiles[w] - (w === d ? 1 : 0);
        if (copiesRemaining <= 0) continue;

        // Try adding this tile as the winning tile
        tiles[w]++;
        if (isWinningHand(tiles, mode)) {
          const winCtx: GameContext = { ...ctx, isSelfDrawn: true };
          const score = scoreHand(tiles, winCtx, mode);
          if (score) {
            const fan = score.fan;
            const payout = calculatePayout(fan, mode);
            if (payout > 0) {
              const prob = copiesRemaining / Math.max(ctx.wallRemaining, 1);
              totalWinProb += prob;
              weightedFan += prob * fan;
              weightedPayout += prob * payout;
              fanDist[fan] = (fanDist[fan] || 0) + copiesRemaining;
              if (fan > bestFan) {
                bestFan = fan;
                bestPatterns = score.patterns;
              }
            }
          }
        }
        tiles[w]--;
      }

      results.push({
        tile: d,
        simulations: 0, // exact
        winRate: Math.min(totalWinProb, 1),
        avgFan: totalWinProb > 0 ? weightedFan / totalWinProb : 0,
        avgPayout: weightedPayout,
        fanDistribution: fanDist,
        bestHandSeen: bestFan > 0 ? { fan: bestFan, patterns: bestPatterns } : null,
      });
    } else if (sh === -1) {
      // Already a complete hand after discard (shouldn't happen with 13 tiles, but handle it)
      const score = scoreHand(tiles, { ...ctx, isSelfDrawn: true }, mode);
      if (score) {
        const payout = calculatePayout(score.fan, mode);
        results.push({
          tile: d,
          simulations: 0,
          winRate: 1,
          avgFan: score.fan,
          avgPayout: payout,
          fanDistribution: { [score.fan]: 1 },
          bestHandSeen: { fan: score.fan, patterns: score.patterns },
        });
      } else {
        results.push({
          tile: d,
          simulations: 0,
          winRate: 0,
          avgFan: 0,
          avgPayout: 0,
          fanDistribution: {},
          bestHandSeen: null,
        });
      }
    } else {
      // Discard makes hand worse than tenpai — still include with zero EV
      results.push({
        tile: d,
        simulations: 0,
        winRate: 0,
        avgFan: 0,
        avgPayout: 0,
        fanDistribution: {},
        bestHandSeen: null,
      });
    }

    tiles[d]++;
  }

  results.sort((a, b) => b.avgPayout - a.avgPayout);
  return results;
}

// ---- Exact Iishanten Analysis (shanten 1) ----
// For each discard, do exhaustive 2-ply: try all draws, score tenpai/win states.

export function exactIishantenAnalysis(
  tiles: TileCounts,
  ctx: GameContext,
  mode: RulesetMode,
): MonteCarloResult[] {
  const config = getRulesetConfig(mode);
  const includeSevenPairs = config.sevenPairsEnabled;
  const results: MonteCarloResult[] = [];

  const wallRemaining = Math.max(ctx.wallRemaining, 1);

  for (let d = 0; d < NUM_TILE_TYPES; d++) {
    if (tiles[d] <= 0) continue;

    // Discard tile d -> 13-tile hand
    tiles[d]--;

    let totalWeightedPayout = 0;
    let totalWeightedFan = 0;
    let totalWinWeight = 0;
    let totalWeight = 0;
    const fanDist: Record<number, number> = {};
    let bestFan = 0;
    let bestPatterns: string[] = [];

    // For each possible draw from the wall
    for (let draw = 0; draw < NUM_TILE_TYPES; draw++) {
      const copiesAvail = TILES_PER_TYPE - tiles[draw];
      if (copiesAvail <= 0) continue;

      const drawProb = copiesAvail / wallRemaining;
      totalWeight += drawProb;

      // Add the draw -> 14-tile hand
      tiles[draw]++;

      const sh = calculateShanten(tiles, includeSevenPairs);

      if (sh === -1) {
        // Complete hand! Score it directly.
        const winCtx: GameContext = { ...ctx, isSelfDrawn: true, wallRemaining: wallRemaining - 1 };
        const score = scoreHand(tiles, winCtx, mode);
        if (score) {
          const payout = calculatePayout(score.fan, mode);
          if (payout > 0) {
            totalWinWeight += drawProb;
            totalWeightedFan += drawProb * score.fan;
            totalWeightedPayout += drawProb * payout;
            fanDist[score.fan] = (fanDist[score.fan] || 0) + copiesAvail;
            if (score.fan > bestFan) {
              bestFan = score.fan;
              bestPatterns = score.patterns;
            }
          }
        }
      } else if (sh === 0) {
        // Tenpai! Find the best discard to maximize winning tiles,
        // then estimate probability of completing.
        const tenpaiResult = evaluateTenpaiAfterDraw(tiles, draw, ctx, mode, includeSevenPairs, wallRemaining - 1);
        if (tenpaiResult.payout > 0) {
          const combinedProb = drawProb * tenpaiResult.winProb;
          totalWinWeight += combinedProb;
          totalWeightedFan += combinedProb * tenpaiResult.avgFan;
          totalWeightedPayout += drawProb * tenpaiResult.payout; // payout already accounts for winProb
          // Merge fan distribution (weighted by copies available)
          for (const [fan, count] of Object.entries(tenpaiResult.fanDist)) {
            const f = Number(fan);
            fanDist[f] = (fanDist[f] || 0) + count;
          }
          if (tenpaiResult.bestFan > bestFan) {
            bestFan = tenpaiResult.bestFan;
            bestPatterns = tenpaiResult.bestPatterns;
          }
        }
      }
      // sh >= 1: still far from winning in 2 draws, skip

      tiles[draw]--;
    }

    results.push({
      tile: d,
      simulations: 0, // exact
      winRate: Math.min(totalWinWeight, 1),
      avgFan: totalWinWeight > 0 ? totalWeightedFan / totalWinWeight : 0,
      avgPayout: totalWeightedPayout,
      fanDistribution: fanDist,
      bestHandSeen: bestFan > 0 ? { fan: bestFan, patterns: bestPatterns } : null,
    });

    tiles[d]++;
  }

  results.sort((a, b) => b.avgPayout - a.avgPayout);
  return results;
}

// Helper: given a 14-tile tenpai hand (after drawing), find the best discard
// that maximizes EV from the resulting tenpai wait, then estimate win probability.
function evaluateTenpaiAfterDraw(
  tiles: TileCounts,
  _drawnTile: number,
  ctx: GameContext,
  mode: RulesetMode,
  includeSevenPairs: boolean,
  wallAfterDraw: number,
): { winProb: number; payout: number; avgFan: number; fanDist: Record<number, number>; bestFan: number; bestPatterns: string[] } {
  let bestPayout = 0;
  let bestResult = {
    winProb: 0,
    payout: 0,
    avgFan: 0,
    fanDist: {} as Record<number, number>,
    bestFan: 0,
    bestPatterns: [] as string[],
  };

  // Try each discard from the 14-tile hand to find the best tenpai discard
  for (let disc = 0; disc < NUM_TILE_TYPES; disc++) {
    if (tiles[disc] <= 0) continue;

    tiles[disc]--;
    const sh = calculateShanten(tiles, includeSevenPairs);

    if (sh === 0) {
      // This discard leaves us tenpai — enumerate winning tiles
      let winProb = 0;
      let weightedPayout = 0;
      let weightedFan = 0;
      const fanDist: Record<number, number> = {};
      let bFan = 0;
      let bPatterns: string[] = [];

      for (let w = 0; w < NUM_TILE_TYPES; w++) {
        const copies = TILES_PER_TYPE - tiles[w] - (w === disc ? 1 : 0);
        if (copies <= 0) continue;

        tiles[w]++;
        if (isWinningHand(tiles, mode)) {
          const score = scoreHand(tiles, { ...ctx, isSelfDrawn: true, wallRemaining: wallAfterDraw - 1 }, mode);
          if (score) {
            const payout = calculatePayout(score.fan, mode);
            if (payout > 0) {
              // Probability of drawing this winning tile in remaining turns
              // Approximate: P = 1 - (1 - copies/wall)^(turnsRemaining/2)
              // Use half the remaining wall as a rough estimate of draws available
              const turnsRemaining = Math.max(Math.floor(wallAfterDraw / 2), 1);
              const pDraw = 1 - Math.pow(1 - copies / Math.max(wallAfterDraw, 1), turnsRemaining);
              winProb += pDraw;
              weightedPayout += pDraw * payout;
              weightedFan += pDraw * score.fan;
              fanDist[score.fan] = (fanDist[score.fan] || 0) + copies;
              if (score.fan > bFan) {
                bFan = score.fan;
                bPatterns = score.patterns;
              }
            }
          }
        }
        tiles[w]--;
      }

      winProb = Math.min(winProb, 1);
      if (weightedPayout > bestPayout) {
        bestPayout = weightedPayout;
        bestResult = {
          winProb,
          payout: weightedPayout,
          avgFan: winProb > 0 ? weightedFan / winProb : 0,
          fanDist,
          bestFan: bFan,
          bestPatterns: bPatterns,
        };
      }
    }

    tiles[disc]++;
  }

  return bestResult;
}

// ---- Hybrid Analysis Entry Point ----
// Routes to exact or Monte Carlo analysis based on shanten.

export function runHybridAnalysis(
  request: MonteCarloRequest,
  onProgress?: (progress: MonteCarloProgress) => void,
): HybridAnalysisResult {
  const { tiles, gameContext, rulesetMode } = request;
  const config = getRulesetConfig(rulesetMode);
  const includeSevenPairs = config.sevenPairsEnabled;

  const shanten = calculateShanten(tiles, includeSevenPairs);

  if (shanten === -1) {
    // Hand is already complete — just score it
    const score = scoreHand(tiles, { ...gameContext, isSelfDrawn: true }, rulesetMode);
    const payout = score ? calculatePayout(score.fan, rulesetMode) : 0;
    // No discard needed; return empty results since the hand is won
    return {
      results: [],
      method: { type: 'exact', label: 'Complete hand' },
      shanten: -1,
    };
  }

  if (shanten === 0) {
    // Tenpai — use exact enumeration
    if (onProgress) {
      onProgress({ completed: 0, total: 1, partialResults: [] });
    }
    const results = exactTenpaiAnalysis(tiles, gameContext, rulesetMode);
    if (onProgress) {
      onProgress({ completed: 1, total: 1, partialResults: results });
    }
    return {
      results,
      method: { type: 'exact', label: 'Exact tenpai analysis' },
      shanten: 0,
    };
  }

  if (shanten === 1) {
    // Iishanten — use exhaustive 2-ply search
    if (onProgress) {
      onProgress({ completed: 0, total: 1, partialResults: [] });
    }
    const results = exactIishantenAnalysis(tiles, gameContext, rulesetMode);
    if (onProgress) {
      onProgress({ completed: 1, total: 1, partialResults: results });
    }
    return {
      results,
      method: { type: 'exact', label: 'Exact 2-ply iishanten analysis' },
      shanten: 1,
    };
  }

  // Honor caller's requested sim count; scale down for very far-from-winning
  // hands (shanten 4+) where each sim is slower and precision matters less.
  const requestedSims = request.numSimulations;
  const numSims = shanten <= 3 ? requestedSims : Math.max(1, Math.round(requestedSims * 0.4));
  const adjustedRequest = { ...request, numSimulations: numSims };
  const results = runMonteCarloAnalysis(adjustedRequest, onProgress);
  return {
    results,
    method: {
      type: 'montecarlo',
      simulations: numSims,
      label: `Monte Carlo (${numSims} sims)`,
    },
    shanten,
  };
}
