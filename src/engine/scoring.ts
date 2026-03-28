// Hong Kong Mahjong scoring (fan calculation)
// Now with support for Chinese Official (MCR) and Blended modes via rulesets
//
// Standard HK tournament fan table with 3-fan minimum to win

import {
  type TileCounts,
  type TileIndex,
  NUM_TILE_TYPES,
  SUIT_STARTS,
  WINDS_START,
  DRAGONS_START,
  THIRTEEN_ORPHAN_INDICES,
  TILE_INFO,
} from './tiles';
import type { GameContext } from './hand';
import type { RulesetMode } from './rulesets';
import { scoreChinese, isSevenPairs } from './chinese-patterns';

// A decomposition of a winning hand into melds + pair
export interface Decomposition {
  melds: DecomposedMeld[];
  pair: TileIndex; // tile index of the pair
}

export interface DecomposedMeld {
  type: 'chow' | 'pong';
  startTile: TileIndex; // for chow: lowest tile; for pong: the tile
}

export interface ScoreResult {
  fan: number;
  patterns: string[];
  points: number;
  isLimit: boolean;
  /** MCR points (only populated in chinese/blended mode) */
  mcrPoints?: number;
  /** The unit label: 'fan' or 'pts' */
  unit?: string;
}

export interface FanPattern {
  name: string;
  fan: number;
  check: (decomp: Decomposition, tiles: TileCounts, ctx: GameContext) => boolean;
}

const LIMIT_FAN = 10;
const BASE_POINTS = 8; // Base payment unit

// Enumerate all valid decompositions of a 14-tile hand into 4 melds + 1 pair
export function enumerateDecompositions(tiles: TileCounts): Decomposition[] {
  const results: Decomposition[] = [];
  const working = tiles.slice();

  // Try each possible pair
  for (let p = 0; p < NUM_TILE_TYPES; p++) {
    if (working[p] < 2) continue;
    working[p] -= 2;

    const melds: DecomposedMeld[] = [];
    findMelds(working, 0, melds, results, p);

    working[p] += 2;
  }

  return results;
}

function findMelds(
  tiles: number[],
  startFrom: number,
  melds: DecomposedMeld[],
  results: Decomposition[],
  pair: TileIndex
): void {
  if (melds.length === 4) {
    // Check all tiles consumed
    let remaining = 0;
    for (let i = 0; i < NUM_TILE_TYPES; i++) remaining += tiles[i];
    if (remaining === 0) {
      results.push({ melds: [...melds], pair });
    }
    return;
  }

  // Find first tile with count > 0
  let pos = startFrom;
  while (pos < NUM_TILE_TYPES && tiles[pos] === 0) pos++;
  if (pos >= NUM_TILE_TYPES) return;

  // Try pong at this position
  if (tiles[pos] >= 3) {
    tiles[pos] -= 3;
    melds.push({ type: 'pong', startTile: pos });
    findMelds(tiles, pos, melds, results, pair);
    melds.pop();
    tiles[pos] += 3;
  }

  // Try chow at this position (only for suit tiles)
  if (pos < 27) {
    const suitStart = Math.floor(pos / 9) * 9;
    const rank = pos - suitStart;
    if (rank + 2 < 9 && tiles[pos] >= 1 && tiles[pos + 1] >= 1 && tiles[pos + 2] >= 1) {
      tiles[pos]--;
      tiles[pos + 1]--;
      tiles[pos + 2]--;
      melds.push({ type: 'chow', startTile: pos });
      findMelds(tiles, pos, melds, results, pair);
      melds.pop();
      tiles[pos]++;
      tiles[pos + 1]++;
      tiles[pos + 2]++;
    }
  }
}

// Check if tiles form Thirteen Orphans
function isThirteenOrphans(tiles: TileCounts): boolean {
  for (const idx of THIRTEEN_ORPHAN_INDICES) {
    if (tiles[idx] < 1) return false;
  }
  // Must have exactly one pair among them (total = 14)
  let total = 0;
  for (const idx of THIRTEEN_ORPHAN_INDICES) total += tiles[idx];
  return total === 14;
}

// Check if tiles form Nine Gates (1112345678999 of one suit + any of that suit)
function isNineGates(tiles: TileCounts): boolean {
  for (const suitStart of SUIT_STARTS) {
    // Check base pattern: 1112345678999
    const base = [3, 1, 1, 1, 1, 1, 1, 1, 3];
    let suitTotal = 0;
    let matchesBase = true;
    for (let i = 0; i < 9; i++) {
      suitTotal += tiles[suitStart + i];
      if (tiles[suitStart + i] < base[i]) matchesBase = false;
    }
    // Must have exactly 14 tiles in this suit and 0 elsewhere
    if (suitTotal !== 14) continue;
    let otherTotal = 0;
    for (let i = 0; i < NUM_TILE_TYPES; i++) {
      if (i < suitStart || i >= suitStart + 9) otherTotal += tiles[i];
    }
    if (otherTotal !== 0) continue;
    if (matchesBase) return true;
  }
  return false;
}

// Fan pattern definitions
const FAN_PATTERNS: FanPattern[] = [
  // --- 1 fan patterns ---
  {
    name: 'Concealed Hand',
    fan: 1,
    check: (_d, _t, ctx) => ctx.isConcealed && !ctx.isSelfDrawn,
  },
  {
    name: 'Self-Drawn',
    fan: 1,
    check: (_d, _t, ctx) => ctx.isSelfDrawn,
  },
  {
    name: 'All Chows',
    fan: 1,
    check: (d, _t, ctx) => {
      // All 4 melds must be chows
      if (!d.melds.every(m => m.type === 'chow')) return false;
      // Pair must not be a value tile (dragon, seat wind, prevailing wind)
      const pairInfo = TILE_INFO[d.pair];
      if (pairInfo.isHonor) {
        if (d.pair >= DRAGONS_START) return false; // dragon pair
        if (d.pair === WINDS_START + ctx.seatWind) return false;
        if (d.pair === WINDS_START + ctx.prevailingWind) return false;
      }
      return true;
    },
  },
  {
    name: 'Seat Wind',
    fan: 1,
    check: (d, _t, ctx) => {
      const windTile = WINDS_START + ctx.seatWind;
      return d.melds.some(m => m.type === 'pong' && m.startTile === windTile);
    },
  },
  {
    name: 'Prevailing Wind',
    fan: 1,
    check: (d, _t, ctx) => {
      const windTile = WINDS_START + ctx.prevailingWind;
      return d.melds.some(m => m.type === 'pong' && m.startTile === windTile);
    },
  },
  {
    name: 'Dragon Pong',
    fan: 1,
    // Note: each dragon pong is worth 1 fan, can stack
    check: (d) => d.melds.some(m => m.type === 'pong' && m.startTile >= DRAGONS_START),
  },
  // No Flowers removed — not tracking bonus tiles in training mode

  // --- 3 fan patterns ---
  {
    name: 'All Pongs',
    fan: 3,
    check: (d) => d.melds.every(m => m.type === 'pong'),
  },
  {
    name: 'Half Flush',
    fan: 3,
    check: (_d, tiles) => {
      // All tiles from one suit + honors, must have both
      let suitCount = 0;
      let hasHonors = false;

      for (let s = 0; s < 3; s++) {
        let hasSuit = false;
        for (let r = 0; r < 9; r++) {
          if (tiles[s * 9 + r] > 0) { hasSuit = true; break; }
        }
        if (hasSuit) suitCount++;
      }

      for (let i = WINDS_START; i < NUM_TILE_TYPES; i++) {
        if (tiles[i] > 0) { hasHonors = true; break; }
      }

      // Exactly one suit + honors (if no honors, it's Full Flush instead)
      return suitCount === 1 && hasHonors;
    },
  },

  // --- 4 fan ---
  {
    name: 'Mixed Terminals',
    fan: 4,
    check: (_d, tiles) => {
      // Every tile is a terminal (1 or 9) or honor. Must have both.
      let hasTerminal = false;
      let hasHonor = false;
      for (let i = 0; i < NUM_TILE_TYPES; i++) {
        if (tiles[i] > 0) {
          const info = TILE_INFO[i];
          if (info.isTerminal) hasTerminal = true;
          else if (info.isHonor) hasHonor = true;
          else return false; // middle tile found
        }
      }
      return hasTerminal && hasHonor;
    },
  },
  // --- 5 fan ---
  {
    name: 'Small Three Dragons',
    fan: 5,
    check: (d) => {
      // 2 dragon pongs + dragon pair
      const dragonPongs = d.melds.filter(m => m.type === 'pong' && m.startTile >= DRAGONS_START).length;
      const dragonPair = d.pair >= DRAGONS_START;
      return dragonPongs === 2 && dragonPair;
    },
  },
  // --- 6 fan ---
  {
    name: 'Small Four Winds',
    fan: 6,
    check: (d) => {
      // 3 wind pongs + wind pair
      const windPongs = d.melds.filter(m => m.type === 'pong' && m.startTile >= WINDS_START && m.startTile < DRAGONS_START).length;
      const windPair = d.pair >= WINDS_START && d.pair < DRAGONS_START;
      return windPongs === 3 && windPair;
    },
  },
  // --- 7 fan ---
  {
    name: 'Full Flush',
    fan: 7,
    check: (_d, tiles) => {
      // All tiles from exactly one suit, no honors
      let suitCount = 0;
      for (let s = 0; s < 3; s++) {
        let hasSuit = false;
        for (let r = 0; r < 9; r++) {
          if (tiles[s * 9 + r] > 0) { hasSuit = true; break; }
        }
        if (hasSuit) suitCount++;
      }

      let hasHonors = false;
      for (let i = WINDS_START; i < NUM_TILE_TYPES; i++) {
        if (tiles[i] > 0) { hasHonors = true; break; }
      }

      return suitCount === 1 && !hasHonors;
    },
  },
];

// Count dragon pongs (can have multiple, each worth 1 fan)
function countDragonPongFan(decomp: Decomposition): number {
  let count = 0;
  for (const m of decomp.melds) {
    if (m.type === 'pong' && m.startTile >= DRAGONS_START) count++;
  }
  return count;
}

// Calculate fan for a specific decomposition
function calculateDecompositionFan(
  decomp: Decomposition,
  tiles: TileCounts,
  ctx: GameContext
): { fan: number; patterns: string[] } {
  let fan = 0;
  const patterns: string[] = [];

  for (const pattern of FAN_PATTERNS) {
    if (pattern.name === 'Dragon Pong') {
      // Special: count each dragon pong separately
      const dragonFan = countDragonPongFan(decomp);
      if (dragonFan > 0) {
        fan += dragonFan;
        for (let i = 0; i < dragonFan; i++) patterns.push('Dragon Pong');
      }
    } else if (pattern.check(decomp, tiles, ctx)) {
      fan += pattern.fan;
      patterns.push(pattern.name);
    }
  }

  return { fan, patterns };
}

// Check and score limit hands
function checkLimitHands(
  tiles: TileCounts,
  decomps: Decomposition[],
  _ctx: GameContext
): ScoreResult | null {
  // Thirteen Orphans
  if (isThirteenOrphans(tiles)) {
    return {
      fan: LIMIT_FAN,
      patterns: ['Thirteen Orphans'],
      points: calculatePoints(LIMIT_FAN),
      isLimit: true,
    };
  }

  // Nine Gates
  if (isNineGates(tiles)) {
    return {
      fan: LIMIT_FAN,
      patterns: ['Nine Gates'],
      points: calculatePoints(LIMIT_FAN),
      isLimit: true,
    };
  }

  for (const decomp of decomps) {
    // All Honors
    if (isAllHonors(tiles)) {
      return {
        fan: LIMIT_FAN,
        patterns: ['All Honors'],
        points: calculatePoints(LIMIT_FAN),
        isLimit: true,
      };
    }

    // All Terminals
    if (isAllTerminals(tiles)) {
      return {
        fan: LIMIT_FAN,
        patterns: ['All Terminals'],
        points: calculatePoints(LIMIT_FAN),
        isLimit: true,
      };
    }

    // Great Winds (pong of all 4 winds)
    if (decomp.melds.filter(m => m.type === 'pong' && m.startTile >= WINDS_START && m.startTile < DRAGONS_START).length === 4) {
      return {
        fan: LIMIT_FAN,
        patterns: ['Great Winds'],
        points: calculatePoints(LIMIT_FAN),
        isLimit: true,
      };
    }

    // Great Dragons (pong of all 3 dragons)
    if (decomp.melds.filter(m => m.type === 'pong' && m.startTile >= DRAGONS_START).length === 3) {
      return {
        fan: LIMIT_FAN,
        patterns: ['Great Dragons'],
        points: calculatePoints(LIMIT_FAN),
        isLimit: true,
      };
    }

    // All Kongs — not applicable in our model since we don't track kongs separately
  }

  return null;
}

function isAllHonors(tiles: TileCounts): boolean {
  for (let i = 0; i < WINDS_START; i++) {
    if (tiles[i] > 0) return false;
  }
  return true;
}

function isAllTerminals(tiles: TileCounts): boolean {
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] > 0) {
      const info = TILE_INFO[i];
      if (!info.isTerminal) return false;
    }
  }
  return true;
}

function calculatePoints(fan: number): number {
  if (fan >= LIMIT_FAN) return BASE_POINTS * Math.pow(2, LIMIT_FAN - 3);
  if (fan < 3) return 0; // Below minimum
  return BASE_POINTS * Math.pow(2, fan - 3);
}

// ===== Unified scoring entry point =====

/**
 * Score a hand using the specified ruleset.
 * Defaults to 'hk' for backward compatibility.
 */
export function scoreHand(tiles: TileCounts, ctx: GameContext, mode: RulesetMode = 'hk'): ScoreResult | null {
  if (mode === 'chinese') {
    return scoreHandChinese(tiles, ctx);
  }
  if (mode === 'blended') {
    return scoreHandBlended(tiles, ctx);
  }
  return scoreHandHK(tiles, ctx);
}

// Original HK scoring
function scoreHandHK(tiles: TileCounts, ctx: GameContext): ScoreResult | null {
  const decomps = enumerateDecompositions(tiles);

  // Check limit hands first
  const limitResult = checkLimitHands(tiles, decomps, ctx);
  if (limitResult) return { ...limitResult, unit: 'fan' };

  if (decomps.length === 0) {
    return null;
  }

  // Find best scoring decomposition
  let bestFan = 0;
  let bestPatterns: string[] = [];

  for (const decomp of decomps) {
    const { fan, patterns } = calculateDecompositionFan(decomp, tiles, ctx);
    if (fan > bestFan) {
      bestFan = fan;
      bestPatterns = patterns;
    }
  }

  if (bestFan < 3) {
    return {
      fan: bestFan,
      patterns: bestPatterns,
      points: 0,
      isLimit: false,
      unit: 'fan',
    };
  }

  const points = calculatePoints(bestFan);
  return {
    fan: bestFan,
    patterns: bestPatterns,
    points,
    isLimit: bestFan >= LIMIT_FAN,
    unit: 'fan',
  };
}

// Chinese Official (MCR) scoring
function scoreHandChinese(tiles: TileCounts, ctx: GameContext): ScoreResult | null {
  const decomps = enumerateDecompositions(tiles);

  // Also check special hand structures
  const isSpecialSP = isSevenPairs(tiles);
  const isSpecialTO = isThirteenOrphans(tiles);

  if (decomps.length === 0 && !isSpecialSP && !isSpecialTO) {
    return null;
  }

  let bestPoints = 0;
  let bestPatterns: { name: string; points: number }[] = [];

  // Try each standard decomposition
  for (const decomp of decomps) {
    const result = scoreChinese(decomp, tiles, ctx);
    if (result.points > bestPoints) {
      bestPoints = result.points;
      bestPatterns = result.patterns;
    }
  }

  // Try special hands (Seven Pairs, Thirteen Orphans) — pass null decomp
  if (isSpecialSP || isSpecialTO) {
    const result = scoreChinese(null, tiles, ctx);
    if (result.points > bestPoints) {
      bestPoints = result.points;
      bestPatterns = result.patterns;
    }
  }

  // MCR: need at least 8 points
  const patternNames = bestPatterns.map(p => `${p.name} (${p.points})`);
  if (bestPoints < 8) {
    // Chicken hand: 8 points minimum but hand scored as 8 with "Chicken Hand" label
    return {
      fan: bestPoints,
      patterns: bestPoints === 0 ? ['Chicken Hand (8 pts minimum)'] : patternNames,
      points: bestPoints,
      isLimit: false,
      mcrPoints: bestPoints,
      unit: 'pts',
    };
  }

  return {
    fan: bestPoints, // Using fan field to hold point value for display
    patterns: patternNames,
    points: bestPoints,
    isLimit: bestPoints >= 88,
    mcrPoints: bestPoints,
    unit: 'pts',
  };
}

// Blended mode: HK fan system as base, but also check Chinese-only patterns
function scoreHandBlended(tiles: TileCounts, ctx: GameContext): ScoreResult | null {
  // Score via HK first
  const hkResult = scoreHandHK(tiles, ctx);

  // Also score via Chinese for additional patterns
  const chineseResult = scoreHandChinese(tiles, ctx);

  if (!hkResult && !chineseResult) return null;

  // In blended mode, use HK fan as primary score, but annotate with Chinese patterns
  if (hkResult) {
    const result = { ...hkResult };
    // If Chinese found patterns HK didn't, note them
    if (chineseResult && chineseResult.mcrPoints) {
      result.mcrPoints = chineseResult.mcrPoints;
    }
    result.unit = 'fan';
    return result;
  }

  // If HK returned null but Chinese found something (e.g., Seven Pairs)
  if (chineseResult) {
    return {
      fan: 0,
      patterns: chineseResult.patterns,
      points: 0,
      isLimit: false,
      mcrPoints: chineseResult.mcrPoints,
      unit: 'fan',
    };
  }

  return null;
}

// Quick check: can this 14-tile hand form a valid winning pattern?
export function isWinningHand(tiles: TileCounts, mode: RulesetMode = 'hk'): boolean {
  if (isThirteenOrphans(tiles)) return true;
  if (enumerateDecompositions(tiles).length > 0) return true;
  // In Chinese/blended mode, Seven Pairs is also a winning hand structure
  if (mode !== 'hk' && isSevenPairs(tiles)) return true;
  return false;
}

// Calculate score for a specific winning tile added to a 13-tile hand
export function scoreWithWinningTile(
  tiles: TileCounts,
  winningTile: TileIndex,
  ctx: GameContext,
  mode: RulesetMode = 'hk'
): ScoreResult | null {
  tiles[winningTile]++;
  const result = scoreHand(tiles, ctx, mode);
  tiles[winningTile]--;
  return result;
}
