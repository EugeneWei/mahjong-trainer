// Tile encoding for Hong Kong Mahjong
// 34 unique tile types, 4 copies each = 136 tiles
// Represented as indices into a 34-element count array

export const Suit = {
  Bamboo: 0,
  Characters: 1,
  Dots: 2,
  Honor: 3,
} as const;
export type Suit = (typeof Suit)[keyof typeof Suit];

export const Wind = {
  East: 0,
  South: 1,
  West: 2,
  North: 3,
} as const;
export type Wind = (typeof Wind)[keyof typeof Wind];

export const Dragon = {
  Red: 0,
  Green: 1,
  White: 2,
} as const;
export type Dragon = (typeof Dragon)[keyof typeof Dragon];

// Tile index ranges:
// 0-8:   Bamboo 1-9
// 9-17:  Characters 1-9
// 18-26: Dots 1-9
// 27-30: Winds (East, South, West, North)
// 31-33: Dragons (Red, Green, White)
export type TileIndex = number;

// 34-element array where each value is the count (0-4) of that tile type
export type TileCounts = number[];

export const NUM_TILE_TYPES = 34;
export const TILES_PER_TYPE = 4;
export const TOTAL_TILES = 136;
export const HAND_SIZE = 13;

// Suit boundaries
export const BAMBOO_START = 0;
export const CHARACTERS_START = 9;
export const DOTS_START = 18;
export const WINDS_START = 27;
export const DRAGONS_START = 31;

export const SUIT_STARTS = [BAMBOO_START, CHARACTERS_START, DOTS_START] as const;
export const SUIT_SIZE = 9;

export interface TileInfo {
  index: TileIndex;
  suit: Suit;
  rank: number; // 1-9 for suits, 0-3 for winds, 0-2 for dragons
  name: string;
  displayName: string; // Chinese character or number
  isTerminal: boolean;
  isHonor: boolean;
}

const WIND_NAMES = ['East', 'South', 'West', 'North'];
const WIND_CHARS = ['東', '南', '西', '北'];
const DRAGON_NAMES = ['Red', 'Green', 'White'];
const DRAGON_CHARS = ['中', '發', '白'];
const SUIT_CODES = ['b', 'c', 'd']; // bamboo, characters, dots
const SUIT_NAMES = ['Bamboo', 'Characters', 'Dots'];

// Precomputed tile info for all 34 tile types
export const TILE_INFO: readonly TileInfo[] = (() => {
  const info: TileInfo[] = [];
  // Suited tiles
  for (let s = 0; s < 3; s++) {
    for (let r = 1; r <= 9; r++) {
      const idx = s * 9 + (r - 1);
      info.push({
        index: idx,
        suit: s as Suit,
        rank: r,
        name: `${r}${SUIT_CODES[s]}`,
        displayName: `${r}`,
        isTerminal: r === 1 || r === 9,
        isHonor: false,
      });
    }
  }
  // Winds
  for (let w = 0; w < 4; w++) {
    info.push({
      index: WINDS_START + w,
      suit: Suit.Honor,
      rank: w,
      name: WIND_NAMES[w],
      displayName: WIND_CHARS[w],
      isTerminal: false,
      isHonor: true,
    });
  }
  // Dragons
  for (let d = 0; d < 3; d++) {
    info.push({
      index: DRAGONS_START + d,
      suit: Suit.Honor,
      rank: d,
      name: DRAGON_NAMES[d],
      displayName: DRAGON_CHARS[d],
      isTerminal: false,
      isHonor: true,
    });
  }
  return Object.freeze(info);
})();

// Terminal and honor tile indices (used for Thirteen Orphans)
export const TERMINAL_INDICES: readonly TileIndex[] = [
  0, 8,   // 1b, 9b
  9, 17,  // 1c, 9c
  18, 26, // 1d, 9d
];

export const HONOR_INDICES: readonly TileIndex[] = [
  27, 28, 29, 30, // E, S, W, N
  31, 32, 33,     // Red, Green, White
];

export const THIRTEEN_ORPHAN_INDICES: readonly TileIndex[] = [
  ...TERMINAL_INDICES,
  ...HONOR_INDICES,
];

export function createEmptyTileCounts(): TileCounts {
  return new Array(NUM_TILE_TYPES).fill(0);
}

export function cloneTileCounts(counts: TileCounts): TileCounts {
  return counts.slice();
}

export function totalTileCount(counts: TileCounts): number {
  let sum = 0;
  for (let i = 0; i < NUM_TILE_TYPES; i++) sum += counts[i];
  return sum;
}

export function getSuit(index: TileIndex): Suit {
  if (index < 9) return Suit.Bamboo;
  if (index < 18) return Suit.Characters;
  if (index < 27) return Suit.Dots;
  return Suit.Honor;
}

export function getSuitName(suit: Suit): string {
  return suit === Suit.Honor ? 'Honor' : SUIT_NAMES[suit];
}

export function isTerminalOrHonor(index: TileIndex): boolean {
  const info = TILE_INFO[index];
  return info.isTerminal || info.isHonor;
}

export function isSuitTile(index: TileIndex): boolean {
  return index < 27;
}

export function isWindTile(index: TileIndex): boolean {
  return index >= WINDS_START && index < DRAGONS_START;
}

export function isDragonTile(index: TileIndex): boolean {
  return index >= DRAGONS_START;
}
