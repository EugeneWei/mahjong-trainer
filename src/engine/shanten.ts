// Shanten calculator for Hong Kong Mahjong
// Shanten = minimum number of tile swaps to reach tenpai
// -1 = complete (winning hand), 0 = tenpai, 1 = iishanten, etc.
//
// Algorithm: Suit decomposition with recursive backtracking.
// Each of the three numbered suits is decomposed independently,
// then honors are handled separately (only triplets/pairs, no sequences).
// The formula is: shanten = 8 - 2*melds - max(partials, 4-melds) - hasPair
// We try all possible pair assignments and take the minimum.

import {
  type TileCounts,
  type TileIndex,
  NUM_TILE_TYPES,
  SUIT_STARTS,
  SUIT_SIZE,
  WINDS_START,
  THIRTEEN_ORPHAN_INDICES,
} from './tiles';

interface DecompResult {
  melds: number;
  partials: number;
  hasPair: boolean;
}

// Calculate shanten number for a hand (13 or 14 tiles)
// When includeSevenPairs is true, also considers Seven Pairs hand structure
export function calculateShanten(tiles: TileCounts, includeSevenPairs: boolean = false): number {
  const regular = calculateRegularShanten(tiles);
  const orphans = calculateThirteenOrphansShanten(tiles);
  if (!includeSevenPairs) return Math.min(regular, orphans);
  const sevenPairs = calculateSevenPairsShanten(tiles);
  return Math.min(regular, orphans, sevenPairs);
}

// Seven Pairs shanten: need 7 pairs (14 tiles)
export function calculateSevenPairsShanten(tiles: TileCounts): number {
  let pairs = 0;
  let types = 0; // unique tile types in hand
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] >= 2) pairs++;
    if (tiles[i] >= 1) types++;
  }
  // Need 7 pairs. If we have fewer than 7 different tile types, we can't form 7 pairs.
  // shanten = 6 - pairs (need 7 pairs, each pair found reduces by 1)
  // But also need at least 7 unique types to form 7 pairs
  // If types < 7, we need extra swaps to get new types: shanten = 6 - pairs + max(0, 7 - types)
  // Simplified: shanten = 6 - pairs
  // The unique-types constraint is already handled since pairs <= types
  return 6 - pairs;
}

// Regular hand: 4 melds + 1 pair
function calculateRegularShanten(tiles: TileCounts): number {
  let bestShanten = 8; // worst case: 8 shanten (empty hand)

  // Extract suit slices for independent decomposition
  const suits: number[][] = [];
  for (const start of SUIT_STARTS) {
    suits.push(tiles.slice(start, start + SUIT_SIZE));
  }

  // Honor tiles (indices 27-33): only triplets and pairs
  const honors = tiles.slice(WINDS_START, NUM_TILE_TYPES);

  // Try with no pair assigned, then try pair in each position
  // No pair case
  bestShanten = Math.min(bestShanten, tryDecompose(suits, honors, false));

  // Try pair in each suit tile
  for (let s = 0; s < 3; s++) {
    for (let i = 0; i < SUIT_SIZE; i++) {
      if (suits[s][i] >= 2) {
        suits[s][i] -= 2;
        bestShanten = Math.min(bestShanten, tryDecompose(suits, honors, true));
        suits[s][i] += 2;
      }
    }
  }

  // Try pair in each honor tile
  for (let i = 0; i < honors.length; i++) {
    if (honors[i] >= 2) {
      honors[i] -= 2;
      bestShanten = Math.min(bestShanten, tryDecompose(suits, honors, true));
      honors[i] += 2;
    }
  }

  return bestShanten;
}

function tryDecompose(suits: number[][], honors: number[], hasPair: boolean): number {
  let totalMelds = 0;
  let totalPartials = 0;

  // Decompose each suit
  for (let s = 0; s < 3; s++) {
    const result = decomposeSuit(suits[s], 0, 0, 0);
    totalMelds += result.melds;
    totalPartials += result.partials;
  }

  // Decompose honors (no sequences)
  const honorResult = decomposeHonors(honors);
  totalMelds += honorResult.melds;
  totalPartials += honorResult.partials;

  // Cap: melds + partials can't exceed 4 (since we need exactly 4 melds + 1 pair)
  const usablePartials = Math.min(totalPartials, 4 - totalMelds);
  const shanten = 8 - 2 * totalMelds - Math.max(usablePartials, 0) - (hasPair ? 1 : 0);

  return shanten;
}

// Recursively decompose a single suit (9 tiles) into melds and partials
// Returns the best (most melds, then most partials) decomposition
function decomposeSuit(tiles: number[], pos: number, melds: number, partials: number): DecompResult {
  // Skip positions with no tiles
  while (pos < SUIT_SIZE && tiles[pos] === 0) pos++;
  if (pos >= SUIT_SIZE) {
    return { melds, partials, hasPair: false };
  }

  let best: DecompResult = { melds, partials, hasPair: false };

  // Try extracting a triplet (pong)
  if (tiles[pos] >= 3) {
    tiles[pos] -= 3;
    const result = decomposeSuit(tiles, pos, melds + 1, partials);
    if (isBetter(result, best)) best = result;
    tiles[pos] += 3;
  }

  // Try extracting a sequence (chow) starting at pos
  if (pos + 2 < SUIT_SIZE && tiles[pos] >= 1 && tiles[pos + 1] >= 1 && tiles[pos + 2] >= 1) {
    tiles[pos]--;
    tiles[pos + 1]--;
    tiles[pos + 2]--;
    const result = decomposeSuit(tiles, pos, melds + 1, partials);
    if (isBetter(result, best)) best = result;
    tiles[pos]++;
    tiles[pos + 1]++;
    tiles[pos + 2]++;
  }

  // Try extracting a pair (partial)
  if (tiles[pos] >= 2) {
    tiles[pos] -= 2;
    const result = decomposeSuit(tiles, pos, melds, partials + 1);
    if (isBetter(result, best)) best = result;
    tiles[pos] += 2;
  }

  // Try extracting a two-sided partial sequence (pos, pos+1)
  if (pos + 1 < SUIT_SIZE && tiles[pos] >= 1 && tiles[pos + 1] >= 1) {
    tiles[pos]--;
    tiles[pos + 1]--;
    const result = decomposeSuit(tiles, pos, melds, partials + 1);
    if (isBetter(result, best)) best = result;
    tiles[pos]++;
    tiles[pos + 1]++;
  }

  // Try extracting a gap partial sequence (pos, pos+2)
  if (pos + 2 < SUIT_SIZE && tiles[pos] >= 1 && tiles[pos + 2] >= 1) {
    tiles[pos]--;
    tiles[pos + 2]--;
    const result = decomposeSuit(tiles, pos, melds, partials + 1);
    if (isBetter(result, best)) best = result;
    tiles[pos]++;
    tiles[pos + 2]++;
  }

  // Try not using this tile in any group at this position — just skip
  // But we must consume at least one tile to avoid infinite recursion
  // Move to next position after all tiles at this position are "orphaned"
  {
    const saved = tiles[pos];
    tiles[pos] = 0;
    const result = decomposeSuit(tiles, pos + 1, melds, partials);
    if (isBetter(result, best)) best = result;
    tiles[pos] = saved;
  }

  return best;
}

function decomposeHonors(honors: number[]): DecompResult {
  let melds = 0;
  let partials = 0;
  for (let i = 0; i < honors.length; i++) {
    if (honors[i] >= 3) {
      melds++;
      // Remaining tiles after triplet
      const remainder = honors[i] - 3;
      if (remainder >= 2) partials++;
    } else if (honors[i] === 2) {
      partials++;
    }
    // count of 1 = isolated tile, doesn't contribute
  }
  return { melds, partials, hasPair: false };
}

function isBetter(a: DecompResult, b: DecompResult): boolean {
  // More melds is always better
  if (a.melds !== b.melds) return a.melds > b.melds;
  // Then more partials
  return a.partials > b.partials;
}

// Thirteen Orphans: one each of all 13 terminals/honors + one duplicate
export function calculateThirteenOrphansShanten(tiles: TileCounts): number {
  let unique = 0;
  let hasPair = false;

  for (const idx of THIRTEEN_ORPHAN_INDICES) {
    if (tiles[idx] >= 1) {
      unique++;
      if (tiles[idx] >= 2) hasPair = true;
    }
  }

  // Need all 13 unique + 1 pair among them = 14 tiles
  // shanten = 13 - unique - (hasPair ? 1 : 0)
  return 13 - unique - (hasPair ? 1 : 0);
}

// Calculate which tiles would reduce shanten if drawn
export function getAcceptanceTiles(
  tiles: TileCounts,
  currentShanten: number,
  seenTiles?: TileCounts,
  includeSevenPairs: boolean = false
): { tiles: TileIndex[]; count: number } {
  const accepting: TileIndex[] = [];
  let totalCount = 0;

  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    // Can we draw this tile? (must have copies remaining)
    const inHand = tiles[i];
    const seen = seenTiles ? seenTiles[i] : 0;
    const remaining = 4 - inHand - seen;
    if (remaining <= 0) continue;

    // Try adding this tile
    tiles[i]++;
    const newShanten = calculateShanten(tiles, includeSevenPairs);
    tiles[i]--;

    if (newShanten < currentShanten) {
      accepting.push(i);
      totalCount += remaining;
    }
  }

  return { tiles: accepting, count: totalCount };
}
