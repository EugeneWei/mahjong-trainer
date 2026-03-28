// Hand generator for practice drills
// Can generate random hands or hands at specific shanten levels

import {
  type TileCounts,
  type TileIndex,
  NUM_TILE_TYPES,
  TILES_PER_TYPE,
  HAND_SIZE,
  createEmptyTileCounts,
} from './tiles';
import { calculateShanten } from './shanten';

// Simple seeded PRNG (xoshiro128**)
export class SeededRNG {
  private state: number[];

  constructor(seed: number) {
    // Initialize state from seed using SplitMix32
    this.state = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      seed += 0x9e3779b9;
      let t = seed;
      t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
      t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
      this.state[i] = (t ^ (t >>> 15)) >>> 0;
    }
  }

  next(): number {
    const s = this.state;
    const result = Math.imul(s[1] * 5, 7) >>> 0;
    const t = s[1] << 9;

    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = (s[3] << 11) | (s[3] >>> 21);

    return result;
  }

  // Returns float in [0, 1)
  random(): number {
    return this.next() / 4294967296;
  }

  // Returns integer in [0, max)
  randomInt(max: number): number {
    return Math.floor(this.random() * max);
  }

  // Fisher-Yates shuffle
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.randomInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

// Generate a completely random 13-tile hand (as dealt from a shuffled wall)
export function generateRandomHand(seed?: number): TileCounts {
  const rng = new SeededRNG(seed ?? Date.now());

  // Create a wall of 136 tiles (4 copies of each 34 types)
  const wall: TileIndex[] = [];
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    for (let j = 0; j < TILES_PER_TYPE; j++) {
      wall.push(i);
    }
  }

  rng.shuffle(wall);

  // Deal 13 tiles
  const counts = createEmptyTileCounts();
  for (let i = 0; i < HAND_SIZE; i++) {
    counts[wall[i]]++;
  }

  return counts;
}

// Generate a hand at a target shanten level
// Uses rejection sampling: generate random hands and keep ones at the target shanten
export function generateHandAtShanten(
  targetShanten: number,
  maxAttempts: number = 1000,
  seed?: number
): TileCounts | null {
  const rng = new SeededRNG(seed ?? Date.now());

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const wall: TileIndex[] = [];
    for (let i = 0; i < NUM_TILE_TYPES; i++) {
      for (let j = 0; j < TILES_PER_TYPE; j++) {
        wall.push(i);
      }
    }
    rng.shuffle(wall);

    const counts = createEmptyTileCounts();
    for (let i = 0; i < HAND_SIZE; i++) {
      counts[wall[i]]++;
    }

    if (calculateShanten(counts) === targetShanten) {
      return counts;
    }
  }

  return null; // Couldn't find a hand at target shanten
}

export type GamePhase = 'early' | 'mid' | 'late';

export interface GeneratorOptions {
  phase: GamePhase;
  targetShanten?: number;
  seed?: number;
}

// Generate a hand appropriate for the given game phase
export function generateHandForPhase(options: GeneratorOptions): {
  tiles: TileCounts;
  wallRemaining: number;
  shanten: number;
} {
  const { phase, seed } = options;
  const rng = new SeededRNG(seed ?? Date.now());

  let targetShanten: number;
  let wallRemaining: number;

  switch (phase) {
    case 'early':
      // Opening hands: typically shanten 3-6
      targetShanten = options.targetShanten ?? (3 + rng.randomInt(4));
      wallRemaining = 55 + rng.randomInt(20); // 55-74
      break;
    case 'mid':
      // Mid-game: shanten 1-3
      targetShanten = options.targetShanten ?? (1 + rng.randomInt(3));
      wallRemaining = 25 + rng.randomInt(30); // 25-54
      break;
    case 'late':
      // Late game: shanten 0-1
      targetShanten = options.targetShanten ?? rng.randomInt(2);
      wallRemaining = 5 + rng.randomInt(20); // 5-24
      break;
  }

  const tiles = generateHandAtShanten(targetShanten, 2000, rng.next()) ?? generateRandomHand(rng.next());
  const actualShanten = calculateShanten(tiles);

  return { tiles, wallRemaining, shanten: actualShanten };
}
