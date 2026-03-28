import {
  type TileCounts,
  type TileIndex,
  type Wind,
  createEmptyTileCounts,
  cloneTileCounts,
  totalTileCount,
  NUM_TILE_TYPES,
  TILES_PER_TYPE,
  HAND_SIZE,
} from './tiles';

export interface Meld {
  type: 'chow' | 'pong' | 'kong';
  tiles: TileIndex[];
  isConcealed: boolean;
}

export interface Hand {
  tiles: TileCounts;
  bonusTiles: number[]; // flower/season indices (0-7)
  openMelds: Meld[];
}

export interface GameContext {
  seatWind: Wind;
  prevailingWind: Wind;
  wallRemaining: number;
  isSelfDrawn: boolean;
  isConcealed: boolean;
  bonusTiles: number[];
}

export function createHand(tiles?: TileCounts): Hand {
  return {
    tiles: tiles ? cloneTileCounts(tiles) : createEmptyTileCounts(),
    bonusTiles: [],
    openMelds: [],
  };
}

export function handTileCount(hand: Hand): number {
  return totalTileCount(hand.tiles);
}

export function isValidHand(hand: Hand): boolean {
  const count = handTileCount(hand);
  if (count !== HAND_SIZE && count !== HAND_SIZE + 1) return false;
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    if (hand.tiles[i] < 0 || hand.tiles[i] > TILES_PER_TYPE) return false;
  }
  return true;
}

export function addTile(hand: Hand, tile: TileIndex): boolean {
  if (tile < 0 || tile >= NUM_TILE_TYPES) return false;
  if (hand.tiles[tile] >= TILES_PER_TYPE) return false;
  hand.tiles[tile]++;
  return true;
}

export function removeTile(hand: Hand, tile: TileIndex): boolean {
  if (tile < 0 || tile >= NUM_TILE_TYPES) return false;
  if (hand.tiles[tile] <= 0) return false;
  hand.tiles[tile]--;
  return true;
}

export function getUniqueTiles(hand: Hand): TileIndex[] {
  const tiles: TileIndex[] = [];
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    if (hand.tiles[i] > 0) tiles.push(i);
  }
  return tiles;
}

export function handToTileList(tiles: TileCounts): TileIndex[] {
  const list: TileIndex[] = [];
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    for (let j = 0; j < tiles[i]; j++) {
      list.push(i);
    }
  }
  return list;
}

export function tileListToTileCounts(list: TileIndex[]): TileCounts {
  const counts = createEmptyTileCounts();
  for (const tile of list) {
    counts[tile]++;
  }
  return counts;
}

export function createDefaultGameContext(): GameContext {
  return {
    seatWind: 0, // East
    prevailingWind: 0, // East
    wallRemaining: 70,
    isSelfDrawn: false,
    isConcealed: true,
    bonusTiles: [],
  };
}
