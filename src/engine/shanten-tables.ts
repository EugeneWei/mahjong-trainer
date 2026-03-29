// Pre-computed shanten lookup tables for O(1) suit decomposition.
//
// Instead of running recursive backtracking on every call, we enumerate all
// valid 9-position suit patterns (each position 0-4, total tiles <= 14) once
// at startup, compute the best decomposition for each using memoized recursion,
// and store results in a Map keyed by a base-5 encoded integer.
//
// This replaces the hot-path recursive decomposeSuit with a single Map.get(),
// giving 10-50x speedup for Monte Carlo simulations.

import { SUIT_SIZE } from './tiles';

export interface SuitDecomp {
  melds: number;
  partials: number;
}

// ---- Base-5 encoding ----
// Pattern: 9 values each 0-4, encoded as key = t[0] + t[1]*5 + ... + t[8]*5^8

const BASE5_POWERS: number[] = [];
{
  let p = 1;
  for (let i = 0; i < SUIT_SIZE; i++) {
    BASE5_POWERS.push(p);
    p *= 5;
  }
}

export function encodeSuitPattern(pattern: number[]): number {
  let key = 0;
  for (let i = 0; i < SUIT_SIZE; i++) {
    key += pattern[i] * BASE5_POWERS[i];
  }
  return key;
}

// ---- Packed melds/partials representation ----
// melds: 0-4, partials: 0-7 => pack as (melds << 3) | partials

function pack(melds: number, partials: number): number {
  return (melds << 3) | partials;
}

function unpackMelds(packed: number): number {
  return packed >> 3;
}

function unpackPartials(packed: number): number {
  return packed & 7;
}

function isBetterPacked(a: number, b: number): boolean {
  // Melds in higher bits, so a > b gives correct priority (more melds first, then more partials)
  return a > b;
}

// ---- Memoized suit decomposition ----
// Computes the best (melds, partials) decomposition for a tile pattern.
// Results are cached in the map by full-pattern key. Returns packed value
// representing the BASE decomposition (starting from melds=0, partials=0).

let suitTable: Map<number, number> | null = null;

function decomposeMemoized(
  tiles: number[],
  pos: number,
  cache: Map<number, number>,
): number {
  // Skip positions with no tiles
  while (pos < SUIT_SIZE && tiles[pos] === 0) pos++;
  if (pos >= SUIT_SIZE) {
    return pack(0, 0);
  }

  const key = encodeSuitPattern(tiles);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let best = pack(0, 0);

  // Try extracting a triplet (pong)
  if (tiles[pos] >= 3) {
    tiles[pos] -= 3;
    const r = decomposeMemoized(tiles, pos, cache);
    const rr = pack(unpackMelds(r) + 1, unpackPartials(r));
    if (isBetterPacked(rr, best)) best = rr;
    tiles[pos] += 3;
  }

  // Try extracting a sequence (chow) starting at pos
  if (pos + 2 < SUIT_SIZE && tiles[pos] >= 1 && tiles[pos + 1] >= 1 && tiles[pos + 2] >= 1) {
    tiles[pos]--;
    tiles[pos + 1]--;
    tiles[pos + 2]--;
    const r = decomposeMemoized(tiles, pos, cache);
    const rr = pack(unpackMelds(r) + 1, unpackPartials(r));
    if (isBetterPacked(rr, best)) best = rr;
    tiles[pos]++;
    tiles[pos + 1]++;
    tiles[pos + 2]++;
  }

  // Try extracting a pair (partial)
  if (tiles[pos] >= 2) {
    tiles[pos] -= 2;
    const r = decomposeMemoized(tiles, pos, cache);
    const rr = pack(unpackMelds(r), unpackPartials(r) + 1);
    if (isBetterPacked(rr, best)) best = rr;
    tiles[pos] += 2;
  }

  // Try extracting a two-sided partial sequence (pos, pos+1)
  if (pos + 1 < SUIT_SIZE && tiles[pos] >= 1 && tiles[pos + 1] >= 1) {
    tiles[pos]--;
    tiles[pos + 1]--;
    const r = decomposeMemoized(tiles, pos, cache);
    const rr = pack(unpackMelds(r), unpackPartials(r) + 1);
    if (isBetterPacked(rr, best)) best = rr;
    tiles[pos]++;
    tiles[pos + 1]++;
  }

  // Try extracting a gap partial sequence (pos, pos+2)
  if (pos + 2 < SUIT_SIZE && tiles[pos] >= 1 && tiles[pos + 2] >= 1) {
    tiles[pos]--;
    tiles[pos + 2]--;
    const r = decomposeMemoized(tiles, pos, cache);
    const rr = pack(unpackMelds(r), unpackPartials(r) + 1);
    if (isBetterPacked(rr, best)) best = rr;
    tiles[pos]++;
    tiles[pos + 2]++;
  }

  // Skip — don't use any tile at this position
  {
    const saved = tiles[pos];
    tiles[pos] = 0;
    const r = decomposeMemoized(tiles, pos + 1, cache);
    if (isBetterPacked(r, best)) best = r;
    tiles[pos] = saved;
  }

  cache.set(key, best);
  return best;
}

// ---- Table generation ----

function generateSuitTable(): Map<number, number> {
  const cache = new Map<number, number>();

  // Seed the cache with the empty pattern
  cache.set(0, pack(0, 0));

  // Enumerate all valid patterns (each position 0-4, total <= 14)
  // and ensure each is in the cache via memoized decomposition.
  const pattern = new Array(SUIT_SIZE).fill(0);

  function enumerate(pos: number, totalSoFar: number): void {
    if (pos === SUIT_SIZE) {
      const key = encodeSuitPattern(pattern);
      if (!cache.has(key)) {
        const working = pattern.slice();
        decomposeMemoized(working, 0, cache);
      }
      return;
    }

    const maxAtPos = Math.min(4, 14 - totalSoFar);
    for (let count = 0; count <= maxAtPos; count++) {
      pattern[pos] = count;
      enumerate(pos + 1, totalSoFar + count);
    }
    pattern[pos] = 0;
  }

  enumerate(0, 0);
  return cache;
}

// ---- Public API ----

/** Ensure the lookup table has been generated. Call once before lookups. */
export function ensureSuitTableGenerated(): void {
  if (suitTable === null) {
    suitTable = generateSuitTable();
  }
}

/** O(1) lookup of suit decomposition for a 9-element pattern (each 0-4). */
export function lookupSuitDecomp(pattern: number[]): SuitDecomp {
  if (suitTable === null) {
    suitTable = generateSuitTable();
  }
  const key = encodeSuitPattern(pattern);
  const packed = suitTable.get(key)!;
  return { melds: unpackMelds(packed), partials: unpackPartials(packed) };
}
