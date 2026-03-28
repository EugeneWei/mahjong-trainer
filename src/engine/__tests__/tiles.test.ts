import { describe, it, expect } from 'vitest';
import {
  TILE_INFO,
  NUM_TILE_TYPES,
  createEmptyTileCounts,
  totalTileCount,
  getSuit,
  Suit,
  isTerminalOrHonor,
  isSuitTile,
  isWindTile,
  isDragonTile,
  THIRTEEN_ORPHAN_INDICES,
} from '../tiles';

describe('TILE_INFO', () => {
  it('has 34 entries', () => {
    expect(TILE_INFO).toHaveLength(NUM_TILE_TYPES);
  });

  it('bamboo tiles are indices 0-8', () => {
    for (let i = 0; i < 9; i++) {
      expect(TILE_INFO[i].suit).toBe(Suit.Bamboo);
      expect(TILE_INFO[i].rank).toBe(i + 1);
    }
  });

  it('character tiles are indices 9-17', () => {
    for (let i = 9; i < 18; i++) {
      expect(TILE_INFO[i].suit).toBe(Suit.Characters);
      expect(TILE_INFO[i].rank).toBe(i - 8);
    }
  });

  it('dot tiles are indices 18-26', () => {
    for (let i = 18; i < 27; i++) {
      expect(TILE_INFO[i].suit).toBe(Suit.Dots);
      expect(TILE_INFO[i].rank).toBe(i - 17);
    }
  });

  it('winds are indices 27-30', () => {
    expect(TILE_INFO[27].name).toBe('East');
    expect(TILE_INFO[28].name).toBe('South');
    expect(TILE_INFO[29].name).toBe('West');
    expect(TILE_INFO[30].name).toBe('North');
  });

  it('dragons are indices 31-33', () => {
    expect(TILE_INFO[31].name).toBe('Red');
    expect(TILE_INFO[32].name).toBe('Green');
    expect(TILE_INFO[33].name).toBe('White');
  });

  it('terminals are 1s and 9s', () => {
    expect(TILE_INFO[0].isTerminal).toBe(true);  // 1b
    expect(TILE_INFO[8].isTerminal).toBe(true);  // 9b
    expect(TILE_INFO[4].isTerminal).toBe(false); // 5b
  });
});

describe('utility functions', () => {
  it('createEmptyTileCounts returns 34 zeros', () => {
    const counts = createEmptyTileCounts();
    expect(counts).toHaveLength(34);
    expect(totalTileCount(counts)).toBe(0);
  });

  it('getSuit returns correct suit', () => {
    expect(getSuit(0)).toBe(Suit.Bamboo);
    expect(getSuit(8)).toBe(Suit.Bamboo);
    expect(getSuit(9)).toBe(Suit.Characters);
    expect(getSuit(18)).toBe(Suit.Dots);
    expect(getSuit(27)).toBe(Suit.Honor);
    expect(getSuit(33)).toBe(Suit.Honor);
  });

  it('isTerminalOrHonor works', () => {
    expect(isTerminalOrHonor(0)).toBe(true);   // 1b
    expect(isTerminalOrHonor(8)).toBe(true);   // 9b
    expect(isTerminalOrHonor(4)).toBe(false);  // 5b
    expect(isTerminalOrHonor(27)).toBe(true);  // East
    expect(isTerminalOrHonor(31)).toBe(true);  // Red Dragon
  });

  it('isSuitTile, isWindTile, isDragonTile', () => {
    expect(isSuitTile(0)).toBe(true);
    expect(isSuitTile(26)).toBe(true);
    expect(isSuitTile(27)).toBe(false);
    expect(isWindTile(27)).toBe(true);
    expect(isWindTile(30)).toBe(true);
    expect(isWindTile(31)).toBe(false);
    expect(isDragonTile(31)).toBe(true);
    expect(isDragonTile(33)).toBe(true);
  });

  it('THIRTEEN_ORPHAN_INDICES has 13 entries', () => {
    expect(THIRTEEN_ORPHAN_INDICES).toHaveLength(13);
  });
});
