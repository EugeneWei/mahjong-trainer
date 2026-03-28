import { describe, it, expect } from 'vitest';
import { analyzeHand, describeHandStrategy } from '../analysis';
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

describe('analyzeHand', () => {
  it('analyzes a 14-tile hand and returns sorted discards', () => {
    // 14-tile tenpai hand: 123m 456p 789s 123m 5p + drawn 5p → 55p pair
    const tiles = parseNotation('123m456p789s123m55p')!; // 14 tiles
    const ctx = defaultCtx();
    const result = analyzeHand(tiles, ctx);

    expect(result.discards.length).toBeGreaterThan(0);
    // Discards should be sorted by shanten (ascending)
    for (let i = 1; i < result.discards.length; i++) {
      expect(result.discards[i].shanten).toBeGreaterThanOrEqual(result.discards[i - 1].shanten);
    }
  });

  it('identifies winning hand (shanten = -1) as complete', () => {
    const tiles = parseNotation('123m456p789s123m55p')!;
    const ctx = defaultCtx();
    const result = analyzeHand(tiles, ctx);
    // This is a 14-tile winning hand, so some discards should leave tenpai
    expect(result.currentShanten).toBe(-1);
  });

  it('provides explanations for each discard', () => {
    const tiles = parseNotation('12m456p789s123m55p3m')!; // 14 tiles
    const ctx = defaultCtx();
    const result = analyzeHand(tiles, ctx);

    for (const d of result.discards) {
      expect(d.explanation).toBeTruthy();
    }
  });
});

describe('describeHandStrategy', () => {
  it('describes a flush-potential hand', () => {
    const tiles = parseNotation('123m456m789m12m5m')!; // mostly bamboo
    const ctx = defaultCtx();
    const desc = describeHandStrategy(tiles, ctx);
    expect(desc).toContain('Bamboo');
  });

  it('describes thirteen orphans potential', () => {
    const tiles = parseNotation('19m19p19sESWNRG1m')!; // 12 orphan tiles
    const ctx = defaultCtx();
    const desc = describeHandStrategy(tiles, ctx);
    expect(desc).toContain('orphan');
  });
});
