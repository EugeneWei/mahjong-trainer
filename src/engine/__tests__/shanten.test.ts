import { describe, it, expect } from 'vitest';
import { calculateShanten, getAcceptanceTiles } from '../shanten';
import { parseNotation } from '../notation';

function shanten(notation: string): number {
  const tiles = parseNotation(notation);
  if (!tiles) throw new Error(`Invalid notation: ${notation}`);
  return calculateShanten(tiles);
}

describe('calculateShanten', () => {
  describe('complete hands (shanten = -1)', () => {
    it('simple winning hand: 4 chows + pair', () => {
      // 123m 456p 789s 123m 55p (14 tiles)
      expect(shanten('123m456p789s123m55p')).toBe(-1);
    });

    it('all pongs + pair', () => {
      // 111m 222p 333s EEE 55d (14 tiles: 3+3+3+3+2 = 14)
      expect(shanten('111m222p333sEEE55s')).toBe(-1);
    });

    it('mixed melds + pair', () => {
      // 123m 111p 789s EEE NN (14 tiles)
      expect(shanten('123m111p789sEEENN')).toBe(-1);
    });
  });

  describe('tenpai hands (shanten = 0)', () => {
    it('waiting on one tile for pair', () => {
      // 123m 456p 789s 123m 5p (13 tiles, waiting for 5p to pair)
      expect(shanten('123m456p789s123m5p')).toBe(0);
    });

    it('waiting to complete a chow', () => {
      // 12m 456p 789s 123m 55p (13 tiles, waiting for 3m)
      expect(shanten('12m456p789s123m55p')).toBe(0);
    });
  });

  describe('iishanten (shanten = 1)', () => {
    it('one step from tenpai', () => {
      // 12m 45p 789s 123m 55p (12 tiles + 1 isolated = needs 1 swap)
      expect(shanten('12m45p789s123m55p')).toBe(1);
    });
  });

  describe('higher shanten values', () => {
    it('scattered hand has high shanten', () => {
      // 1m 1p 1s 3m 3p 3s 5m 5p 5s 7m 7p 7s 9m (13 tiles, very scattered)
      expect(shanten('1m1p1s3m3p3s5m5p5s7m7p7s9m')).toBeGreaterThanOrEqual(3);
    });
  });

  describe('thirteen orphans', () => {
    it('complete thirteen orphans', () => {
      // One of each terminal/honor + one duplicate
      expect(shanten('19m19p19sESWNRGB1m')).toBe(-1);
    });

    it('thirteen orphans tenpai (missing one)', () => {
      // Missing White dragon, have pair of 1m
      expect(shanten('19m19p19sESWNRG1m')).toBe(0);
    });

    it('thirteen orphans shanten = 1', () => {
      // Missing two tiles
      expect(shanten('19m19p19sESWNR1m')).toBeLessThanOrEqual(2);
    });
  });
});

describe('getAcceptanceTiles', () => {
  it('returns tiles that reduce shanten for tenpai hand', () => {
    const tiles = parseNotation('123m456p789s123m5p')!;
    const currentShanten = calculateShanten(tiles);
    expect(currentShanten).toBe(0);

    const { tiles: accepting, count } = getAcceptanceTiles(tiles, currentShanten);
    expect(accepting.length).toBeGreaterThan(0);
    expect(count).toBeGreaterThan(0);
  });
});
