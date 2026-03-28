// Chinese Official Competition Rules (MCR) pattern detection
// Each function returns true if the pattern is present in the hand.
// Patterns are checked against decompositions (melds + pair) and/or raw tile counts.

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
import type { Decomposition, DecomposedMeld } from './scoring';
import type { GameContext } from './hand';

// ===== Helper functions =====

function suitOf(idx: TileIndex): number {
  return Math.floor(idx / 9);
}

function rankOf(idx: TileIndex): number {
  if (idx >= 27) return -1;
  return (idx % 9) + 1; // 1-9
}

function isSuitTile(idx: TileIndex): boolean {
  return idx < 27;
}

/** Count how many suits have at least one tile */
function countSuitsUsed(tiles: TileCounts): number {
  let count = 0;
  for (let s = 0; s < 3; s++) {
    for (let r = 0; r < 9; r++) {
      if (tiles[s * 9 + r] > 0) { count++; break; }
    }
  }
  return count;
}

function hasHonors(tiles: TileCounts): boolean {
  for (let i = WINDS_START; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] > 0) return true;
  }
  return false;
}

function hasWinds(tiles: TileCounts): boolean {
  for (let i = WINDS_START; i < DRAGONS_START; i++) {
    if (tiles[i] > 0) return true;
  }
  return false;
}

function hasDragons(tiles: TileCounts): boolean {
  for (let i = DRAGONS_START; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] > 0) return true;
  }
  return false;
}

function getPongs(decomp: Decomposition): DecomposedMeld[] {
  return decomp.melds.filter(m => m.type === 'pong');
}

function getChows(decomp: Decomposition): DecomposedMeld[] {
  return decomp.melds.filter(m => m.type === 'chow');
}

function windPongCount(decomp: Decomposition): number {
  return decomp.melds.filter(
    m => m.type === 'pong' && m.startTile >= WINDS_START && m.startTile < DRAGONS_START
  ).length;
}

function dragonPongCount(decomp: Decomposition): number {
  return decomp.melds.filter(m => m.type === 'pong' && m.startTile >= DRAGONS_START).length;
}

// ===== Chinese Scoring Pattern Interface =====

export interface ChinesePattern {
  name: string;
  points: number;
  /** Check if this pattern is present. Some patterns only need tiles, some need decomposition. */
  check: (decomp: Decomposition | null, tiles: TileCounts, ctx: GameContext) => boolean;
  /** If true, this pattern doesn't need a standard decomposition (e.g., Seven Pairs, Thirteen Orphans) */
  specialHand?: boolean;
  /** If true, this is a situational pattern that requires game state we may not track */
  situational?: boolean;
}

// ===== Seven Pairs check (non-decomposition hand) =====

export function isSevenPairs(tiles: TileCounts): boolean {
  let pairs = 0;
  let total = 0;
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    total += tiles[i];
    if (tiles[i] === 2) pairs++;
    else if (tiles[i] !== 0) return false;
  }
  return pairs === 7 && total === 14;
}

// ===== Seven Shifted Pairs: 7 consecutive pairs in one suit =====
export function isSevenShiftedPairs(tiles: TileCounts): boolean {
  if (!isSevenPairs(tiles)) return false;
  for (let s = 0; s < 3; s++) {
    const start = s * 9;
    // Check for 7 consecutive pairs starting at rank r (r=0..2)
    for (let r = 0; r <= 2; r++) {
      let found = true;
      for (let i = 0; i < 7; i++) {
        if (tiles[start + r + i] !== 2) { found = false; break; }
      }
      if (found) {
        // All other tiles must be 0
        let otherTiles = false;
        for (let i = 0; i < NUM_TILE_TYPES; i++) {
          if (i >= start + r && i < start + r + 7) continue;
          if (tiles[i] > 0) { otherTiles = true; break; }
        }
        if (!otherTiles) return true;
      }
    }
  }
  return false;
}

// ===== Thirteen Orphans =====
function isThirteenOrphans(tiles: TileCounts): boolean {
  for (const idx of THIRTEEN_ORPHAN_INDICES) {
    if (tiles[idx] < 1) return false;
  }
  let total = 0;
  for (const idx of THIRTEEN_ORPHAN_INDICES) total += tiles[idx];
  return total === 14;
}

// ===== Nine Gates =====
function isNineGates(tiles: TileCounts): boolean {
  for (const suitStart of SUIT_STARTS) {
    const base = [3, 1, 1, 1, 1, 1, 1, 1, 3];
    let suitTotal = 0;
    let matchesBase = true;
    for (let i = 0; i < 9; i++) {
      suitTotal += tiles[suitStart + i];
      if (tiles[suitStart + i] < base[i]) matchesBase = false;
    }
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

// ===== Pure Terminal Chows: 123x2, 789x2, pair of 5, one suit =====
function isPureTerminalChows(decomp: Decomposition, tiles: TileCounts): boolean {
  // Must be single suit
  const suitsUsed = countSuitsUsed(tiles);
  if (suitsUsed !== 1 || hasHonors(tiles)) return false;

  // Find which suit
  let theSuit = -1;
  for (let s = 0; s < 3; s++) {
    for (let r = 0; r < 9; r++) {
      if (tiles[s * 9 + r] > 0) { theSuit = s; break; }
    }
    if (theSuit >= 0) break;
  }
  if (theSuit < 0) return false;

  const start = theSuit * 9;
  const chows = getChows(decomp);
  if (chows.length !== 4) return false;

  // Pair must be 5 of that suit
  if (decomp.pair !== start + 4) return false; // rank 5 = index 4 within suit

  // Must have exactly 2 chows starting at start+0 (123) and 2 at start+6 (789)
  let low = 0, high = 0;
  for (const c of chows) {
    if (c.startTile === start) low++;
    else if (c.startTile === start + 6) high++;
  }
  return low === 2 && high === 2;
}

// ===== Quadruple Chow: 4 identical chows =====
function isQuadrupleChow(decomp: Decomposition): boolean {
  const chows = getChows(decomp);
  if (chows.length < 4) return false;
  // Check if all 4 start at same tile
  const first = chows[0].startTile;
  return chows.every(c => c.startTile === first);
}

// ===== Four Pure Shifted Pungs: 4 consecutive pongs in one suit =====
function isFourPureShiftedPungs(decomp: Decomposition): boolean {
  const pongs = getPongs(decomp).filter(m => isSuitTile(m.startTile));
  if (pongs.length < 4) return false;
  const starts = pongs.map(m => m.startTile).sort((a, b) => a - b);
  // All same suit, consecutive
  if (suitOf(starts[0]) !== suitOf(starts[3])) return false;
  for (let i = 1; i < 4; i++) {
    if (starts[i] !== starts[i - 1] + 1) return false;
  }
  return true;
}

// ===== Four Shifted Chows: 4 chows shifted by 1 or 2, same suit =====
function isFourShiftedChows(decomp: Decomposition): boolean {
  const chows = getChows(decomp);
  if (chows.length < 4) return false;
  const starts = chows.map(c => c.startTile).sort((a, b) => a - b);
  // All same suit
  if (suitOf(starts[0]) !== suitOf(starts[3])) return false;
  // Check shift by 1: e.g., 1,2,3,4
  const d1 = starts[1] - starts[0];
  if ((d1 === 1 || d1 === 2) &&
      starts[2] - starts[1] === d1 &&
      starts[3] - starts[2] === d1) {
    return true;
  }
  return false;
}

// ===== Three Kongs: can't detect from our model (no kong tracking) =====
// Will be marked as situational

// ===== All Terminals and Honors =====
function isAllTerminalsAndHonors(tiles: TileCounts): boolean {
  let hasTerminal = false;
  let hasHonor = false;
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] > 0) {
      const info = TILE_INFO[i];
      if (info.isTerminal) hasTerminal = true;
      else if (info.isHonor) hasHonor = true;
      else return false;
    }
  }
  return hasTerminal && hasHonor;
}

// ===== All Even Pungs =====
function isAllEvenPungs(decomp: Decomposition, tiles: TileCounts): boolean {
  if (!decomp.melds.every(m => m.type === 'pong')) return false;
  // All tiles must be even-numbered suit tiles (2,4,6,8)
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] > 0) {
      if (!isSuitTile(i)) return false;
      const rank = rankOf(i);
      if (rank % 2 !== 0) return false;
    }
  }
  return true;
}

// ===== Pure Triple Chow: 3 identical chows in one suit =====
function isPureTripleChow(decomp: Decomposition): boolean {
  const chows = getChows(decomp);
  if (chows.length < 3) return false;
  // Count occurrences of each chow start
  const counts = new Map<number, number>();
  for (const c of chows) {
    counts.set(c.startTile, (counts.get(c.startTile) || 0) + 1);
  }
  for (const count of counts.values()) {
    if (count >= 3) return true;
  }
  return false;
}

// ===== Pure Shifted Pungs (3): 3 consecutive pongs in one suit =====
function isPureShiftedPungs3(decomp: Decomposition): boolean {
  const pongs = getPongs(decomp).filter(m => isSuitTile(m.startTile));
  if (pongs.length < 3) return false;
  const starts = pongs.map(m => m.startTile).sort((a, b) => a - b);
  // Check all triples
  for (let i = 0; i <= starts.length - 3; i++) {
    if (suitOf(starts[i]) === suitOf(starts[i + 2]) &&
        starts[i + 1] === starts[i] + 1 &&
        starts[i + 2] === starts[i] + 2) {
      return true;
    }
  }
  return false;
}

// ===== Upper/Middle/Lower Tiles =====
function isUpperTiles(tiles: TileCounts): boolean {
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] > 0) {
      if (!isSuitTile(i)) return false;
      if (rankOf(i) < 7) return false;
    }
  }
  return true;
}

function isMiddleTiles(tiles: TileCounts): boolean {
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] > 0) {
      if (!isSuitTile(i)) return false;
      const r = rankOf(i);
      if (r < 4 || r > 6) return false;
    }
  }
  return true;
}

function isLowerTiles(tiles: TileCounts): boolean {
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] > 0) {
      if (!isSuitTile(i)) return false;
      if (rankOf(i) > 3) return false;
    }
  }
  return true;
}

// ===== Pure Straight: 123, 456, 789 in one suit =====
function isPureStraight(decomp: Decomposition): boolean {
  const chows = getChows(decomp);
  for (let s = 0; s < 3; s++) {
    const start = s * 9;
    const has123 = chows.some(c => c.startTile === start);
    const has456 = chows.some(c => c.startTile === start + 3);
    const has789 = chows.some(c => c.startTile === start + 6);
    if (has123 && has456 && has789) return true;
  }
  return false;
}

// ===== Three-Suited Terminal Chows: 123+789 in two suits, pair of 5 in third =====
function isThreeSuitedTerminalChows(decomp: Decomposition): boolean {
  const chows = getChows(decomp);
  if (chows.length !== 4) return false;

  // Group chows by suit
  const bySuit = [[] as number[], [] as number[], [] as number[]];
  for (const c of chows) {
    if (!isSuitTile(c.startTile)) return false;
    const s = suitOf(c.startTile);
    const r = c.startTile - s * 9; // 0-based rank of start
    bySuit[s].push(r);
  }

  // Need 123+789 in two suits, pair of 5 in the third
  // 123 starts at rank 0, 789 starts at rank 6
  let suitsWithTerminalChows = 0;
  let suitWith123789: number[] = [];
  for (let s = 0; s < 3; s++) {
    const has123 = bySuit[s].includes(0);
    const has789 = bySuit[s].includes(6);
    if (has123 && has789) {
      suitsWithTerminalChows++;
      suitWith123789.push(s);
    }
  }

  if (suitsWithTerminalChows !== 2) return false;

  // The pair must be 5 in the remaining suit
  const remainingSuit = [0, 1, 2].find(s => !suitWith123789.includes(s));
  if (remainingSuit === undefined) return false;
  return decomp.pair === remainingSuit * 9 + 4; // 5 = index 4 in suit
}

// ===== All Fives: every meld contains a 5 =====
function isAllFives(decomp: Decomposition, _tiles: TileCounts): boolean {
  // Check pair contains 5
  if (!isSuitTile(decomp.pair) || rankOf(decomp.pair) !== 5) return false;

  for (const m of decomp.melds) {
    if (m.type === 'pong') {
      if (!isSuitTile(m.startTile) || rankOf(m.startTile) !== 5) return false;
    } else {
      // Chow must contain 5: start tile rank must be 3, 4, or 5
      if (!isSuitTile(m.startTile)) return false;
      const r = rankOf(m.startTile);
      if (r < 3 || r > 5) return false;
    }
  }
  return true;
}

// ===== Triple Pung: same-number pong in all 3 suits =====
function isTriplePung(decomp: Decomposition): boolean {
  const pongs = getPongs(decomp).filter(m => isSuitTile(m.startTile));
  if (pongs.length < 3) return false;
  // Group by rank
  const byRank = new Map<number, number>();
  for (const p of pongs) {
    const r = rankOf(p.startTile);
    byRank.set(r, (byRank.get(r) || 0) + 1);
  }
  for (const count of byRank.values()) {
    if (count >= 3) return true;
  }
  return false;
}

// ===== Three Concealed Pungs =====
function isThreeConcealedPungs(decomp: Decomposition, _tiles: TileCounts, ctx: GameContext): boolean {
  // In our model, if hand is concealed, all pongs are concealed
  if (!ctx.isConcealed) return false;
  return getPongs(decomp).length >= 3;
}

// ===== Upper Four: only tiles 6-9 =====
function isUpperFour(tiles: TileCounts): boolean {
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] > 0) {
      if (!isSuitTile(i)) return false;
      if (rankOf(i) < 6) return false;
    }
  }
  return true;
}

// ===== Lower Four: only tiles 1-4 =====
function isLowerFour(tiles: TileCounts): boolean {
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] > 0) {
      if (!isSuitTile(i)) return false;
      if (rankOf(i) > 4) return false;
    }
  }
  return true;
}

// ===== Big Three Winds: 3 wind pongs =====
function isBigThreeWinds(decomp: Decomposition): boolean {
  return windPongCount(decomp) === 3;
}

// ===== Mixed Straight: 123, 456, 789 across 3 different suits =====
function isMixedStraight(decomp: Decomposition): boolean {
  const chows = getChows(decomp);
  // Need one chow starting at rank 1 (index 0 in suit), one at rank 4, one at rank 7
  // All in different suits
  const has = { 0: [] as number[], 3: [] as number[], 6: [] as number[] };
  for (const c of chows) {
    if (!isSuitTile(c.startTile)) continue;
    const s = suitOf(c.startTile);
    const r = c.startTile - s * 9;
    if (r === 0) has[0].push(s);
    else if (r === 3) has[3].push(s);
    else if (r === 6) has[6].push(s);
  }
  // Check if we can pick one suit from each that are all different
  for (const s1 of has[0]) {
    for (const s2 of has[3]) {
      if (s2 === s1) continue;
      for (const s3 of has[6]) {
        if (s3 !== s1 && s3 !== s2) return true;
      }
    }
  }
  return false;
}

// ===== Reversible Tiles =====
// Tiles that look the same upside-down. In standard sets:
// Bamboo: 2,4,5,6,8,9; Dots: 1,2,3,4,5,8,9; Characters: none
// Honors: none (though sometimes White Dragon is considered symmetric)
// Using playmahjong.io definition for MCR: specific set of tiles
// Standard MCR reversible: 1,2,3,4,5,8,9 of Dots (suit 2) + 2,4,5,6,8,9 of Bamboo (suit 0)
// + White Dragon (index 33)
const REVERSIBLE_TILES = new Set<number>([
  // Bamboo (suit 0): 2,4,5,6,8,9
  1, 3, 4, 5, 7, 8,
  // Dots (suit 2): 1,2,3,4,5,8,9
  18, 19, 20, 21, 22, 25, 26,
  // White Dragon
  33,
]);

function isReversibleTiles(tiles: TileCounts): boolean {
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] > 0 && !REVERSIBLE_TILES.has(i)) return false;
  }
  return true;
}

// ===== Mixed Triple Chow: same numbers in all 3 suits =====
function isMixedTripleChow(decomp: Decomposition): boolean {
  const chows = getChows(decomp);
  // Group by rank (start position within suit)
  const byRank = new Map<number, Set<number>>();
  for (const c of chows) {
    if (!isSuitTile(c.startTile)) continue;
    const s = suitOf(c.startTile);
    const r = c.startTile - s * 9;
    if (!byRank.has(r)) byRank.set(r, new Set());
    byRank.get(r)!.add(s);
  }
  for (const suits of byRank.values()) {
    if (suits.size >= 3) return true;
  }
  return false;
}

// ===== Mixed Shifted Pungs: 3 pongs of consecutive numbers in 3 different suits =====
function isMixedShiftedPungs(decomp: Decomposition): boolean {
  const pongs = getPongs(decomp).filter(m => isSuitTile(m.startTile));
  if (pongs.length < 3) return false;

  const entries = pongs.map(m => ({ suit: suitOf(m.startTile), rank: rankOf(m.startTile) }));

  // Try all triples
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      for (let k = j + 1; k < entries.length; k++) {
        const three = [entries[i], entries[j], entries[k]].sort((a, b) => a.rank - b.rank);
        // All different suits
        const suits = new Set([three[0].suit, three[1].suit, three[2].suit]);
        if (suits.size !== 3) continue;
        // Consecutive ranks
        if (three[1].rank === three[0].rank + 1 && three[2].rank === three[1].rank + 1) return true;
      }
    }
  }
  return false;
}

// ===== All Pungs =====
function isAllPungs(decomp: Decomposition): boolean {
  return decomp.melds.every(m => m.type === 'pong');
}

// ===== Half Flush =====
function isHalfFlush(tiles: TileCounts): boolean {
  const suitsUsed = countSuitsUsed(tiles);
  return suitsUsed === 1 && hasHonors(tiles);
}

// ===== Mixed Shifted Chows: 3 chows across 3 suits, shifted by 1 =====
function isMixedShiftedChows(decomp: Decomposition): boolean {
  const chows = getChows(decomp);
  if (chows.length < 3) return false;

  const entries = chows.filter(c => isSuitTile(c.startTile)).map(c => ({
    suit: suitOf(c.startTile),
    rank: c.startTile - suitOf(c.startTile) * 9,
  }));

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      for (let k = j + 1; k < entries.length; k++) {
        const three = [entries[i], entries[j], entries[k]].sort((a, b) => a.rank - b.rank);
        const suits = new Set([three[0].suit, three[1].suit, three[2].suit]);
        if (suits.size !== 3) continue;
        if (three[1].rank === three[0].rank + 1 && three[2].rank === three[1].rank + 1) return true;
      }
    }
  }
  return false;
}

// ===== All Types: hand has all 5 types (3 suits + wind + dragon) =====
function isAllTypes(tiles: TileCounts): boolean {
  const suitsUsed = countSuitsUsed(tiles);
  return suitsUsed === 3 && hasWinds(tiles) && hasDragons(tiles);
}

// ===== Melded Hand =====
function isMeldedHand(_decomp: Decomposition, _tiles: TileCounts, ctx: GameContext): boolean {
  return !ctx.isConcealed && !ctx.isSelfDrawn;
}

// ===== Two Dragon Pungs =====
function isTwoDragonPungs(decomp: Decomposition): boolean {
  return dragonPongCount(decomp) === 2;
}

// ===== Outside Hand: every meld includes a terminal or honor =====
function isOutsideHand(decomp: Decomposition): boolean {
  // Check pair
  const pairInfo = TILE_INFO[decomp.pair];
  if (!pairInfo.isTerminal && !pairInfo.isHonor) return false;

  for (const m of decomp.melds) {
    if (m.type === 'pong') {
      const info = TILE_INFO[m.startTile];
      if (!info.isTerminal && !info.isHonor) return false;
    } else {
      // Chow: must include a terminal. Only 123 (starts at 1) or 789 (starts at 7) include terminals
      if (!isSuitTile(m.startTile)) return false;
      const r = rankOf(m.startTile);
      if (r !== 1 && r !== 7) return false;
    }
  }
  return true;
}

// ===== Fully Concealed Hand: concealed + self-drawn =====
function isFullyConcealedHand(_decomp: Decomposition, _tiles: TileCounts, ctx: GameContext): boolean {
  return ctx.isConcealed && ctx.isSelfDrawn;
}

// ===== Dragon Pong (single) =====
function hasDragonPong(decomp: Decomposition): boolean {
  return dragonPongCount(decomp) >= 1;
}

// ===== Prevalent Wind =====
function isPrevalentWind(decomp: Decomposition, _tiles: TileCounts, ctx: GameContext): boolean {
  const windTile = WINDS_START + ctx.prevailingWind;
  return decomp.melds.some(m => m.type === 'pong' && m.startTile === windTile);
}

// ===== Seat Wind =====
function isSeatWind(decomp: Decomposition, _tiles: TileCounts, ctx: GameContext): boolean {
  const windTile = WINDS_START + ctx.seatWind;
  return decomp.melds.some(m => m.type === 'pong' && m.startTile === windTile);
}

// ===== Concealed Hand =====
function isConcealedHand(_decomp: Decomposition, _tiles: TileCounts, ctx: GameContext): boolean {
  return ctx.isConcealed && !ctx.isSelfDrawn;
}

// ===== All Chows =====
function isAllChows(decomp: Decomposition): boolean {
  return decomp.melds.every(m => m.type === 'chow');
}

// ===== Double Pung: 2 pongs of same number, different suits =====
function isDoublePung(decomp: Decomposition): boolean {
  const pongs = getPongs(decomp).filter(m => isSuitTile(m.startTile));
  if (pongs.length < 2) return false;
  const byRank = new Map<number, number>();
  for (const p of pongs) {
    const r = rankOf(p.startTile);
    byRank.set(r, (byRank.get(r) || 0) + 1);
  }
  for (const count of byRank.values()) {
    if (count >= 2) return true;
  }
  return false;
}

// ===== Two Concealed Pungs =====
function isTwoConcealedPungs(decomp: Decomposition, _tiles: TileCounts, ctx: GameContext): boolean {
  if (!ctx.isConcealed) return false;
  return getPongs(decomp).length >= 2;
}

// ===== All Simples: no terminals, no honors =====
function isAllSimples(tiles: TileCounts): boolean {
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] > 0) {
      const info = TILE_INFO[i];
      if (info.isTerminal || info.isHonor) return false;
    }
  }
  return true;
}

// ===== Pure Double Chow: 2 identical chows in same suit =====
function isPureDoubleChow(decomp: Decomposition): boolean {
  const chows = getChows(decomp);
  const counts = new Map<number, number>();
  for (const c of chows) {
    counts.set(c.startTile, (counts.get(c.startTile) || 0) + 1);
  }
  for (const count of counts.values()) {
    if (count >= 2) return true;
  }
  return false;
}

// ===== Mixed Double Chow: 2 chows same numbers, different suits =====
function isMixedDoubleChow(decomp: Decomposition): boolean {
  const chows = getChows(decomp).filter(c => isSuitTile(c.startTile));
  // Group by rank within suit
  const byRank = new Map<number, Set<number>>();
  for (const c of chows) {
    const s = suitOf(c.startTile);
    const r = c.startTile - s * 9;
    if (!byRank.has(r)) byRank.set(r, new Set());
    byRank.get(r)!.add(s);
  }
  for (const suits of byRank.values()) {
    if (suits.size >= 2) return true;
  }
  return false;
}

// ===== Short Straight: 2 chows forming 6-tile sequence (e.g., 123+456) =====
function isShortStraight(decomp: Decomposition): boolean {
  const chows = getChows(decomp);
  for (let i = 0; i < chows.length; i++) {
    for (let j = i + 1; j < chows.length; j++) {
      if (!isSuitTile(chows[i].startTile) || !isSuitTile(chows[j].startTile)) continue;
      if (suitOf(chows[i].startTile) !== suitOf(chows[j].startTile)) continue;
      const diff = Math.abs(chows[i].startTile - chows[j].startTile);
      if (diff === 3) return true;
    }
  }
  return false;
}

// ===== Two Terminal Chows: 123 and 789 in same suit =====
function isTwoTerminalChows(decomp: Decomposition): boolean {
  const chows = getChows(decomp);
  for (let s = 0; s < 3; s++) {
    const start = s * 9;
    const has123 = chows.some(c => c.startTile === start);
    const has789 = chows.some(c => c.startTile === start + 6);
    if (has123 && has789) return true;
  }
  return false;
}

// ===== Pung of Terminals or Honors =====
function hasPungOfTerminalsOrHonors(decomp: Decomposition): boolean {
  return decomp.melds.some(m => {
    if (m.type !== 'pong') return false;
    const info = TILE_INFO[m.startTile];
    return info.isTerminal || info.isHonor;
  });
}

// ===== One Voided Suit: missing one entire suit =====
function isOneVoidedSuit(tiles: TileCounts): boolean {
  const suitsUsed = countSuitsUsed(tiles);
  return suitsUsed === 2; // exactly 2 of 3 suits used
}

// ===== No Honor Tiles =====
function isNoHonorTiles(tiles: TileCounts): boolean {
  return !hasHonors(tiles);
}

// ===== Self-Drawn =====
function isSelfDrawn(_decomp: Decomposition, _tiles: TileCounts, ctx: GameContext): boolean {
  return ctx.isSelfDrawn;
}

// ===== All Terminals =====
function isAllTerminals(tiles: TileCounts): boolean {
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] > 0 && !TILE_INFO[i].isTerminal) return false;
  }
  return true;
}

// ===== All Honors =====
function isAllHonors(tiles: TileCounts): boolean {
  for (let i = 0; i < WINDS_START; i++) {
    if (tiles[i] > 0) return false;
  }
  return true;
}

// ===== Little Four Winds: 3 wind pongs + wind pair =====
function isLittleFourWinds(decomp: Decomposition): boolean {
  const wPongs = windPongCount(decomp);
  const windPair = decomp.pair >= WINDS_START && decomp.pair < DRAGONS_START;
  return wPongs === 3 && windPair;
}

// ===== Little Three Dragons: 2 dragon pongs + dragon pair =====
function isLittleThreeDragons(decomp: Decomposition): boolean {
  const dPongs = dragonPongCount(decomp);
  const dragonPair = decomp.pair >= DRAGONS_START;
  return dPongs === 2 && dragonPair;
}

// ===== Four Concealed Pungs =====
function isFourConcealedPungs(decomp: Decomposition, _tiles: TileCounts, ctx: GameContext): boolean {
  if (!ctx.isConcealed) return false;
  return getPongs(decomp).length === 4;
}

// ===== Big Four Winds: 4 wind pongs =====
function isBigFourWinds(decomp: Decomposition): boolean {
  return windPongCount(decomp) === 4;
}

// ===== Full Flush (Chinese): one suit only, no honors =====
function isFullFlush(tiles: TileCounts): boolean {
  return countSuitsUsed(tiles) === 1 && !hasHonors(tiles);
}

// ===== Greater Honors and Knitted Tiles =====
// 7 honor tiles (one of each wind + one of each dragon) + specific knitted tiles
// from the three suits. This is a special hand type.
function isGreaterHonorsAndKnitted(tiles: TileCounts): boolean {
  // Must have all 7 honors exactly once
  for (let i = WINDS_START; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] !== 1) return false;
  }
  // Remaining 7 tiles must be from 3 suits in "knitted" pattern:
  // One of {1,4,7}, one of {2,5,8}, one of {3,6,9} from each of three suits
  // But only 7 suited tiles among 3 suits
  let suitedCount = 0;
  for (let i = 0; i < 27; i++) {
    suitedCount += tiles[i];
    if (tiles[i] > 1) return false; // each tile at most once
  }
  if (suitedCount !== 7) return false;

  // Check knitted pattern: tiles must come from 3 different "knitted" groups
  // Group A: {1,4,7} of some suit, Group B: {2,5,8} of some suit, Group C: {3,6,9} of some suit
  // Each group from a different suit
  const groups = [
    [0, 3, 6],  // ranks 1,4,7 (0-indexed within suit)
    [1, 4, 7],  // ranks 2,5,8
    [2, 5, 8],  // ranks 3,6,9
  ];

  // Try all 6 permutations of suit assignment to groups
  const perms = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  for (const perm of perms) {
    let count = 0;
    for (let g = 0; g < 3; g++) {
      const suit = perm[g];
      for (const r of groups[g]) {
        if (tiles[suit * 9 + r] === 1) count++;
        // It's ok if some are 0 — we just need exactly 7 total
      }
    }
    // Check that all suited tiles come from these positions
    if (count === 7) {
      // Verify no suited tiles outside these positions
      let allMatch = true;
      for (let i = 0; i < 27; i++) {
        if (tiles[i] > 0) {
          const s = Math.floor(i / 9);
          const r = i % 9;
          const expectedGroup = perm.indexOf(s);
          if (expectedGroup < 0 || !groups[expectedGroup].includes(r)) {
            allMatch = false;
            break;
          }
        }
      }
      if (allMatch) return true;
    }
  }
  return false;
}

// ===== Chicken Hand: MCR hand worth 0 pattern points =====
// This is actually scored as "8 points" minimum in Chinese rules via the Chicken Hand bonus
// if the hand has no other patterns. We detect it as a fallback.

// ===== Wait patterns =====
// These need the winning tile context which we don't always have.
// We'll provide these as detection helpers for when we do have the winning tile.

export function isEdgeWait(tiles13: TileCounts, winTile: TileIndex): boolean {
  // Edge wait: waiting on 3 to complete 1-2-3, or waiting on 7 to complete 7-8-9
  if (!isSuitTile(winTile)) return false;
  const r = rankOf(winTile);
  const s = suitOf(winTile);
  const base = s * 9;
  if (r === 3) {
    // Check if we have 1-2 in this suit
    return tiles13[base + 0] > 0 && tiles13[base + 1] > 0;
  }
  if (r === 7) {
    // Check if we have 8-9 in this suit
    return tiles13[base + 7] > 0 && tiles13[base + 8] > 0;
  }
  return false;
}

export function isClosedWait(tiles13: TileCounts, winTile: TileIndex): boolean {
  // Closed wait: middle tile of a sequence
  if (!isSuitTile(winTile)) return false;
  const r = rankOf(winTile);
  if (r < 2 || r > 8) return false;
  const s = suitOf(winTile);
  const base = s * 9;
  const rIdx = r - 1; // 0-indexed
  return tiles13[base + rIdx - 1] > 0 && tiles13[base + rIdx + 1] > 0;
}

export function isSingleWait(tiles13: TileCounts, winTile: TileIndex): boolean {
  // Single wait: waiting on the pair tile
  return tiles13[winTile] === 1; // Had one, waiting for the second
}

// ===== Master pattern list =====

export const CHINESE_PATTERNS: ChinesePattern[] = [
  // === 88 points ===
  {
    name: 'Big Four Winds',
    points: 88,
    check: (d, _t, _c) => d !== null && isBigFourWinds(d),
  },
  {
    name: 'Nine Gates',
    points: 88,
    check: (_d, t, _c) => isNineGates(t),
  },
  // Four Kongs: situational (can't detect kongs)
  {
    name: 'Four Kongs',
    points: 88,
    check: () => false,
    situational: true,
  },
  {
    name: 'Seven Shifted Pairs',
    points: 88,
    check: (_d, t, _c) => isSevenShiftedPairs(t),
    specialHand: true,
  },
  {
    name: 'Thirteen Orphans',
    points: 88,
    check: (_d, t, _c) => isThirteenOrphans(t),
    specialHand: true,
  },

  // === 64 points ===
  {
    name: 'All Terminals',
    points: 64,
    check: (_d, t, _c) => isAllTerminals(t),
  },
  {
    name: 'All Honors',
    points: 64,
    check: (_d, t, _c) => isAllHonors(t),
  },
  {
    name: 'Little Four Winds',
    points: 64,
    check: (d, _t, _c) => d !== null && isLittleFourWinds(d),
  },
  {
    name: 'Little Three Dragons',
    points: 64,
    check: (d, _t, _c) => d !== null && isLittleThreeDragons(d),
  },
  {
    name: 'Four Concealed Pungs',
    points: 64,
    check: (d, t, c) => d !== null && isFourConcealedPungs(d, t, c),
  },
  {
    name: 'Pure Terminal Chows',
    points: 64,
    check: (d, t, _c) => d !== null && isPureTerminalChows(d, t),
  },

  // === 48 points ===
  {
    name: 'Quadruple Chow',
    points: 48,
    check: (d, _t, _c) => d !== null && isQuadrupleChow(d),
  },
  {
    name: 'Four Pure Shifted Pungs',
    points: 48,
    check: (d, _t, _c) => d !== null && isFourPureShiftedPungs(d),
  },

  // === 32 points ===
  {
    name: 'Four Shifted Chows',
    points: 32,
    check: (d, _t, _c) => d !== null && isFourShiftedChows(d),
  },
  {
    name: 'Three Kongs',
    points: 32,
    check: () => false,
    situational: true,
  },
  {
    name: 'All Terminals and Honors',
    points: 32,
    check: (_d, t, _c) => isAllTerminalsAndHonors(t),
  },

  // === 24 points ===
  {
    name: 'Seven Pairs',
    points: 24,
    check: (_d, t, _c) => isSevenPairs(t) && !isSevenShiftedPairs(t),
    specialHand: true,
  },
  {
    name: 'Greater Honors and Knitted Tiles',
    points: 24,
    check: (_d, t, _c) => isGreaterHonorsAndKnitted(t),
    specialHand: true,
  },
  {
    name: 'All Even Pungs',
    points: 24,
    check: (d, t, _c) => d !== null && isAllEvenPungs(d, t),
  },
  {
    name: 'Full Flush',
    points: 24,
    check: (_d, t, _c) => isFullFlush(t),
  },
  {
    name: 'Pure Triple Chow',
    points: 24,
    check: (d, _t, _c) => d !== null && isPureTripleChow(d),
  },
  {
    name: 'Pure Shifted Pungs',
    points: 24,
    check: (d, _t, _c) => d !== null && isPureShiftedPungs3(d),
  },
  {
    name: 'Upper Tiles',
    points: 24,
    check: (_d, t, _c) => isUpperTiles(t),
  },
  {
    name: 'Middle Tiles',
    points: 24,
    check: (_d, t, _c) => isMiddleTiles(t),
  },
  {
    name: 'Lower Tiles',
    points: 24,
    check: (_d, t, _c) => isLowerTiles(t),
  },

  // === 16 points ===
  {
    name: 'Pure Straight',
    points: 16,
    check: (d, _t, _c) => d !== null && isPureStraight(d),
  },
  {
    name: 'Three-Suited Terminal Chows',
    points: 16,
    check: (d, _t, _c) => d !== null && isThreeSuitedTerminalChows(d),
  },
  {
    name: 'All Fives',
    points: 16,
    check: (d, t, _c) => d !== null && isAllFives(d, t),
  },
  {
    name: 'Triple Pung',
    points: 16,
    check: (d, _t, _c) => d !== null && isTriplePung(d),
  },
  {
    name: 'Three Concealed Pungs',
    points: 16,
    check: (d, t, c) => d !== null && isThreeConcealedPungs(d, t, c),
  },

  // === 12 points ===
  {
    name: 'Upper Four',
    points: 12,
    check: (_d, t, _c) => isUpperFour(t),
  },
  {
    name: 'Lower Four',
    points: 12,
    check: (_d, t, _c) => isLowerFour(t),
  },
  {
    name: 'Big Three Winds',
    points: 12,
    check: (d, _t, _c) => d !== null && isBigThreeWinds(d),
  },

  // === 8 points ===
  {
    name: 'Mixed Straight',
    points: 8,
    check: (d, _t, _c) => d !== null && isMixedStraight(d),
  },
  {
    name: 'Reversible Tiles',
    points: 8,
    check: (_d, t, _c) => isReversibleTiles(t),
  },
  {
    name: 'Mixed Triple Chow',
    points: 8,
    check: (d, _t, _c) => d !== null && isMixedTripleChow(d),
  },
  {
    name: 'Mixed Shifted Pungs',
    points: 8,
    check: (d, _t, _c) => d !== null && isMixedShiftedPungs(d),
  },
  {
    name: 'Two Concealed Kongs',
    points: 8,
    check: () => false,
    situational: true,
  },
  {
    name: 'Last Tile Draw',
    points: 8,
    check: () => false,
    situational: true,
  },
  {
    name: 'Last Tile Claim',
    points: 8,
    check: () => false,
    situational: true,
  },
  {
    name: 'Out with Replacement Tile',
    points: 8,
    check: () => false,
    situational: true,
  },
  {
    name: 'Robbing the Kong',
    points: 8,
    check: () => false,
    situational: true,
  },

  // === 6 points ===
  {
    name: 'All Pungs',
    points: 6,
    check: (d, _t, _c) => d !== null && isAllPungs(d),
  },
  {
    name: 'Half Flush',
    points: 6,
    check: (_d, t, _c) => isHalfFlush(t),
  },
  {
    name: 'Mixed Shifted Chows',
    points: 6,
    check: (d, _t, _c) => d !== null && isMixedShiftedChows(d),
  },
  {
    name: 'All Types',
    points: 6,
    check: (_d, t, _c) => isAllTypes(t),
  },
  {
    name: 'Melded Hand',
    points: 6,
    check: (d, t, c) => d !== null && isMeldedHand(d, t, c),
  },
  {
    name: 'Two Dragon Pungs',
    points: 6,
    check: (d, _t, _c) => d !== null && isTwoDragonPungs(d),
  },

  // === 4 points ===
  {
    name: 'Outside Hand',
    points: 4,
    check: (d, _t, _c) => d !== null && isOutsideHand(d),
  },
  {
    name: 'Fully Concealed Hand',
    points: 4,
    check: (d, t, c) => d !== null && isFullyConcealedHand(d, t, c),
  },
  {
    name: 'Two Melded Kongs',
    points: 4,
    check: () => false,
    situational: true,
  },
  {
    name: 'Last of its Kind',
    points: 4,
    check: () => false,
    situational: true,
  },

  // === 2 points ===
  {
    name: 'Dragon Pung',
    points: 2,
    check: (d, _t, _c) => d !== null && hasDragonPong(d),
  },
  {
    name: 'Prevalent Wind',
    points: 2,
    check: (d, t, c) => d !== null && isPrevalentWind(d, t, c),
  },
  {
    name: 'Seat Wind',
    points: 2,
    check: (d, t, c) => d !== null && isSeatWind(d, t, c),
  },
  {
    name: 'Concealed Hand',
    points: 2,
    check: (d, t, c) => d !== null && isConcealedHand(d, t, c),
  },
  {
    name: 'All Chows',
    points: 2,
    check: (d, _t, _c) => d !== null && isAllChows(d),
  },
  {
    name: 'Double Pung',
    points: 2,
    check: (d, _t, _c) => d !== null && isDoublePung(d),
  },
  {
    name: 'Two Concealed Pungs',
    points: 2,
    check: (d, t, c) => d !== null && isTwoConcealedPungs(d, t, c),
  },
  {
    name: 'Concealed Kong',
    points: 2,
    check: () => false,
    situational: true,
  },
  {
    name: 'All Simples',
    points: 2,
    check: (_d, t, _c) => isAllSimples(t),
  },

  // === 1 point ===
  {
    name: 'Pure Double Chow',
    points: 1,
    check: (d, _t, _c) => d !== null && isPureDoubleChow(d),
  },
  {
    name: 'Mixed Double Chow',
    points: 1,
    check: (d, _t, _c) => d !== null && isMixedDoubleChow(d),
  },
  {
    name: 'Short Straight',
    points: 1,
    check: (d, _t, _c) => d !== null && isShortStraight(d),
  },
  {
    name: 'Two Terminal Chows',
    points: 1,
    check: (d, _t, _c) => d !== null && isTwoTerminalChows(d),
  },
  {
    name: 'Pung of Terminals or Honors',
    points: 1,
    check: (d, _t, _c) => d !== null && hasPungOfTerminalsOrHonors(d),
  },
  {
    name: 'Melded Kong',
    points: 1,
    check: () => false,
    situational: true,
  },
  {
    name: 'One Voided Suit',
    points: 1,
    check: (_d, t, _c) => isOneVoidedSuit(t),
  },
  {
    name: 'No Honor Tiles',
    points: 1,
    check: (_d, t, _c) => isNoHonorTiles(t),
  },
  {
    name: 'Self-Drawn',
    points: 1,
    check: (d, t, c) => d !== null && isSelfDrawn(d, t, c),
  },
  // Flowers: situational
  {
    name: 'Flowers',
    points: 1,
    check: () => false,
    situational: true,
  },
];

// MCR exclusion rules: when a higher pattern is scored, certain implied lower
// patterns should NOT be scored separately. This implements the "exclusion principle."
// Key: pattern that, when present, excludes the listed patterns.
export const MCR_EXCLUSIONS: Record<string, string[]> = {
  // 88-point hands exclude everything beneath them
  'Big Four Winds': ['Big Three Winds', 'Little Four Winds', 'All Pungs', 'Prevalent Wind', 'Seat Wind', 'Pung of Terminals or Honors'],
  'Nine Gates': ['Full Flush', 'Concealed Hand', 'One Voided Suit', 'No Honor Tiles'],
  'Seven Shifted Pairs': ['Full Flush', 'Concealed Hand', 'One Voided Suit', 'No Honor Tiles'],
  'Thirteen Orphans': ['All Types', 'Concealed Hand'],

  // 64-point
  'All Terminals': ['All Pungs', 'No Honor Tiles', 'Pung of Terminals or Honors', 'Outside Hand'],
  'All Honors': ['All Pungs', 'Pung of Terminals or Honors'],
  'Little Four Winds': ['Big Three Winds', 'Prevalent Wind', 'Seat Wind', 'Pung of Terminals or Honors'],
  'Little Three Dragons': ['Two Dragon Pungs', 'Dragon Pung', 'Pung of Terminals or Honors'],
  'Four Concealed Pungs': ['All Pungs', 'Concealed Hand', 'Fully Concealed Hand', 'Two Concealed Pungs', 'Three Concealed Pungs'],
  'Pure Terminal Chows': ['Full Flush', 'All Chows', 'Two Terminal Chows', 'Pure Double Chow', 'One Voided Suit', 'No Honor Tiles'],

  // 48-point
  'Quadruple Chow': ['Pure Triple Chow', 'Pure Double Chow', 'All Chows'],
  'Four Pure Shifted Pungs': ['Pure Shifted Pungs', 'All Pungs', 'Pung of Terminals or Honors'],

  // 32-point
  'Four Shifted Chows': ['Short Straight', 'Two Terminal Chows'],
  'All Terminals and Honors': ['All Pungs', 'Outside Hand', 'Pung of Terminals or Honors'],

  // 24-point
  'Seven Pairs': ['Concealed Hand'],
  'All Even Pungs': ['All Pungs', 'All Simples', 'No Honor Tiles'],
  'Full Flush': ['One Voided Suit', 'No Honor Tiles'],
  'Pure Triple Chow': ['Pure Double Chow'],
  'Upper Tiles': ['One Voided Suit', 'No Honor Tiles', 'Upper Four'],
  'Middle Tiles': ['All Simples', 'One Voided Suit', 'No Honor Tiles'],
  'Lower Tiles': ['One Voided Suit', 'No Honor Tiles', 'Lower Four'],

  // 16-point
  'Pure Straight': ['Short Straight', 'Two Terminal Chows'],
  'Three-Suited Terminal Chows': ['Mixed Double Chow', 'Two Terminal Chows', 'All Chows'],
  'All Fives': ['All Simples'],
  'Three Concealed Pungs': ['Two Concealed Pungs'],

  // 12-point
  'Big Three Winds': ['Prevalent Wind', 'Seat Wind', 'Pung of Terminals or Honors'],

  // 8-point
  'Mixed Straight': ['Short Straight'],

  // 6-point
  'Half Flush': ['One Voided Suit'],
  'All Pungs': ['Double Pung'],
  'Two Dragon Pungs': ['Dragon Pung'],

  // 4-point
  'Fully Concealed Hand': ['Concealed Hand', 'Self-Drawn'],

  // 2-point
  'All Chows': ['No Honor Tiles'],
};

/**
 * Score a hand under Chinese Official rules.
 * Returns total points and matched patterns (with exclusions applied).
 */
export function scoreChinese(
  decomp: Decomposition | null,
  tiles: TileCounts,
  ctx: GameContext
): { points: number; patterns: { name: string; points: number }[] } {
  const matched: { name: string; points: number }[] = [];

  for (const pattern of CHINESE_PATTERNS) {
    if (pattern.situational) continue; // skip undetectable patterns
    try {
      if (pattern.check(decomp, tiles, ctx)) {
        matched.push({ name: pattern.name, points: pattern.points });
      }
    } catch {
      // Skip patterns that fail (e.g., null decomp for decomp-requiring patterns)
    }
  }

  // Apply exclusion rules: remove lower patterns implied by higher ones
  const excluded = new Set<string>();
  for (const m of matched) {
    const excl = MCR_EXCLUSIONS[m.name];
    if (excl) {
      for (const e of excl) excluded.add(e);
    }
  }

  const filtered = matched.filter(m => !excluded.has(m.name));

  // Handle Dragon Pong multiplicity: count each dragon pong separately
  // The pattern check only returns true once, but MCR scores each dragon pong
  if (decomp) {
    const dragonCount = dragonPongCount(decomp);
    const hasDragonPongEntry = filtered.find(m => m.name === 'Dragon Pung');
    if (hasDragonPongEntry && dragonCount > 1) {
      // Add extra copies
      for (let i = 1; i < dragonCount; i++) {
        filtered.push({ name: 'Dragon Pung', points: 2 });
      }
    }
  }

  // Similarly handle Double Pung multiplicity
  if (decomp) {
    const pongs = getPongs(decomp).filter(m => isSuitTile(m.startTile));
    const byRank = new Map<number, number>();
    for (const p of pongs) {
      const r = rankOf(p.startTile);
      byRank.set(r, (byRank.get(r) || 0) + 1);
    }
    let doublePungCount = 0;
    for (const count of byRank.values()) {
      if (count >= 2) doublePungCount += Math.floor(count * (count - 1) / 2);
    }
    const hasDP = filtered.find(m => m.name === 'Double Pung');
    if (hasDP && doublePungCount > 1) {
      for (let i = 1; i < doublePungCount; i++) {
        filtered.push({ name: 'Double Pung', points: 2 });
      }
    }
  }

  // Handle Pung of Terminals or Honors multiplicity
  if (decomp) {
    const pthCount = decomp.melds.filter(m => {
      if (m.type !== 'pong') return false;
      const info = TILE_INFO[m.startTile];
      return info.isTerminal || info.isHonor;
    }).length;
    const hasPTH = filtered.find(m => m.name === 'Pung of Terminals or Honors');
    if (hasPTH && pthCount > 1) {
      for (let i = 1; i < pthCount; i++) {
        filtered.push({ name: 'Pung of Terminals or Honors', points: 1 });
      }
    }
  }

  const totalPoints = filtered.reduce((sum, m) => sum + m.points, 0);

  return { points: totalPoints, patterns: filtered };
}

// Export individual checks for testing
export {
  isSevenPairs as _isSevenPairs,
  isThirteenOrphans as _isThirteenOrphans,
  isNineGates as _isNineGates,
  isAllTerminals as _isAllTerminals,
  isAllHonors as _isAllHonors,
  isPureStraight as _isPureStraight,
  isAllPungs as _isAllPungs,
  isFullFlush as _isFullFlush,
  isHalfFlush as _isHalfFlush,
  isAllSimples as _isAllSimples,
  isReversibleTiles as _isReversibleTiles,
};
