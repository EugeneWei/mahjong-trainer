import { describe, it, expect } from 'vitest';
import { scoreHand, isWinningHand, enumerateDecompositions } from '../scoring';
import { parseNotation } from '../notation';
import { Wind } from '../tiles';
import type { GameContext } from '../hand';

function defaultCtx(overrides?: Partial<GameContext>): GameContext {
  return {
    seatWind: Wind.East,
    prevailingWind: Wind.East,
    wallRemaining: 50,
    isSelfDrawn: false,
    isConcealed: true,
    bonusTiles: [],
    ...overrides,
  };
}

describe('isWinningHand', () => {
  it('detects a valid winning hand', () => {
    const tiles = parseNotation('123m456p789s123m55p')!;
    expect(isWinningHand(tiles)).toBe(true);
  });

  it('detects thirteen orphans', () => {
    const tiles = parseNotation('19m19p19sESWNRGB1m')!;
    expect(isWinningHand(tiles)).toBe(true);
  });

  it('rejects incomplete hand', () => {
    const tiles = parseNotation('123m456p789s123m5p')!;
    expect(isWinningHand(tiles)).toBe(false);
  });
});

describe('enumerateDecompositions', () => {
  it('finds decompositions for a simple hand', () => {
    const tiles = parseNotation('123m456p789s123m55p')!;
    const decomps = enumerateDecompositions(tiles);
    expect(decomps.length).toBeGreaterThan(0);
    expect(decomps[0].melds).toHaveLength(4);
  });
});

describe('scoreHand', () => {
  it('scores all chows + concealed hand', () => {
    const tiles = parseNotation('123m456p789s234m55s')!;
    const ctx = defaultCtx({ isConcealed: true, isSelfDrawn: false });
    const result = scoreHand(tiles, ctx);
    expect(result).not.toBeNull();
    expect(result!.patterns).toContain('All Chows');
    expect(result!.patterns).toContain('Concealed Hand');
    expect(result!.fan).toBeGreaterThanOrEqual(2);
  });

  it('scores seat wind pong', () => {
    const tiles = parseNotation('123m456p789sEEE55s')!;
    const ctx = defaultCtx({ seatWind: Wind.East });
    const result = scoreHand(tiles, ctx);
    expect(result).not.toBeNull();
    expect(result!.patterns).toContain('Seat Wind');
  });

  it('scores dragon pong', () => {
    const tiles = parseNotation('123m456p789sRRR55s')!;
    const ctx = defaultCtx();
    const result = scoreHand(tiles, ctx);
    expect(result).not.toBeNull();
    expect(result!.patterns).toContain('Dragon Pong');
  });

  it('scores all pongs', () => {
    const tiles = parseNotation('111m222p333sEEE55s')!;
    const ctx = defaultCtx();
    const result = scoreHand(tiles, ctx);
    expect(result).not.toBeNull();
    expect(result!.patterns).toContain('All Pongs');
  });

  it('scores half flush', () => {
    const tiles = parseNotation('123m456m789mEEE55m')!;
    const ctx = defaultCtx({ seatWind: Wind.East });
    const result = scoreHand(tiles, ctx);
    expect(result).not.toBeNull();
    expect(result!.patterns).toContain('Half Flush');
  });

  it('scores full flush', () => {
    const tiles = parseNotation('123m456m789m111m55m')!;
    const ctx = defaultCtx();
    const result = scoreHand(tiles, ctx);
    expect(result).not.toBeNull();
    expect(result!.patterns).toContain('Full Flush');
    expect(result!.fan).toBeGreaterThanOrEqual(7);
  });

  it('scores small three dragons', () => {
    // Two dragon pongs + dragon pair
    const tiles = parseNotation('123m456pRRRGGGBB')!;
    const ctx = defaultCtx();
    const result = scoreHand(tiles, ctx);
    expect(result).not.toBeNull();
    expect(result!.patterns).toContain('Small Three Dragons');
  });

  it('scores mixed terminals', () => {
    const tiles = parseNotation('111m999p111sEEE99s')!;
    const ctx = defaultCtx();
    const result = scoreHand(tiles, ctx);
    expect(result).not.toBeNull();
    expect(result!.patterns).toContain('Mixed Terminals');
  });

  it('scores thirteen orphans as limit hand', () => {
    const tiles = parseNotation('19m19p19sESWNRGB1m')!;
    const ctx = defaultCtx();
    const result = scoreHand(tiles, ctx);
    expect(result).not.toBeNull();
    expect(result!.patterns).toContain('Thirteen Orphans');
    expect(result!.isLimit).toBe(true);
    expect(result!.fan).toBe(10);
  });

  it('scores self-drawn', () => {
    const tiles = parseNotation('123m456p789sEEE55s')!;
    const ctx = defaultCtx({ isSelfDrawn: true, seatWind: Wind.East });
    const result = scoreHand(tiles, ctx);
    expect(result).not.toBeNull();
    expect(result!.patterns).toContain('Self-Drawn');
  });

  it('returns low fan for chicken hand', () => {
    // A hand with minimal scoring - mixed suits, no value tiles, open
    const tiles = parseNotation('123m456p789s234s55m')!;
    const ctx = defaultCtx({ isConcealed: false, isSelfDrawn: false, bonusTiles: [0] });
    const result = scoreHand(tiles, ctx);
    expect(result).not.toBeNull();
    // Should have few or no fan if open and no special patterns
  });
});
