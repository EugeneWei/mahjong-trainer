import { describe, it, expect } from 'vitest';
import { parseNotation, tilesToNotation } from '../notation';
import { totalTileCount } from '../tiles';

describe('parseNotation', () => {
  it('parses simple bamboo tiles', () => {
    const counts = parseNotation('123m');
    expect(counts).not.toBeNull();
    expect(counts![0]).toBe(1); // 1b
    expect(counts![1]).toBe(1); // 2b
    expect(counts![2]).toBe(1); // 3b
    expect(totalTileCount(counts!)).toBe(3);
  });

  it('parses using alternate suit codes (b/c/d)', () => {
    const counts = parseNotation('123b');
    expect(counts).not.toBeNull();
    expect(counts![0]).toBe(1); // 1b
    expect(counts![1]).toBe(1); // 2b
    expect(counts![2]).toBe(1); // 3b
  });

  it('parses characters', () => {
    const counts = parseNotation('456p');
    expect(counts).not.toBeNull();
    expect(counts![12]).toBe(1); // 4c
    expect(counts![13]).toBe(1); // 5c
    expect(counts![14]).toBe(1); // 6c
  });

  it('parses dots', () => {
    const counts = parseNotation('789s');
    expect(counts).not.toBeNull();
    expect(counts![24]).toBe(1); // 7d
    expect(counts![25]).toBe(1); // 8d
    expect(counts![26]).toBe(1); // 9d
  });

  it('parses honor tiles', () => {
    const counts = parseNotation('EEE');
    expect(counts).not.toBeNull();
    expect(counts![27]).toBe(3); // East x3
  });

  it('parses mixed hand', () => {
    const counts = parseNotation('123m456p789sEEENw');
    expect(counts).not.toBeNull();
    expect(totalTileCount(counts!)).toBe(13);
  });

  it('parses with spaces', () => {
    const counts = parseNotation('123m 456p 789s EEE Nw');
    expect(counts).not.toBeNull();
    expect(totalTileCount(counts!)).toBe(13);
  });

  it('parses dragons', () => {
    const counts = parseNotation('RRR');
    expect(counts).not.toBeNull();
    expect(counts![31]).toBe(3); // Red Dragon x3
  });

  it('parses two-letter honor codes', () => {
    const counts = parseNotation('Ew Sw Ww Nw Dr Dg Dw');
    expect(counts).not.toBeNull();
    expect(counts![27]).toBe(1); // East
    expect(counts![28]).toBe(1); // South
    expect(counts![29]).toBe(1); // West
    expect(counts![30]).toBe(1); // North
    expect(counts![31]).toBe(1); // Red
    expect(counts![32]).toBe(1); // Green
    expect(counts![33]).toBe(1); // White
  });

  it('rejects more than 4 of same tile', () => {
    const counts = parseNotation('11111m');
    expect(counts).toBeNull();
  });

  it('rejects empty input', () => {
    expect(parseNotation('')).toBeNull();
    expect(parseNotation('  ')).toBeNull();
  });

  it('rejects invalid characters', () => {
    expect(parseNotation('123x')).toBeNull();
  });

  it('handles duplicate tiles across groups', () => {
    const counts = parseNotation('11m11p');
    expect(counts).not.toBeNull();
    expect(counts![0]).toBe(2);  // 1b x2
    expect(counts![9]).toBe(2);  // 1c x2
  });
});

describe('tilesToNotation', () => {
  it('round-trips correctly', () => {
    const original = '123m456p789sEEEN';
    const counts = parseNotation(original)!;
    const output = tilesToNotation(counts);
    const reparsed = parseNotation(output)!;
    // Compare tile counts
    for (let i = 0; i < 34; i++) {
      expect(reparsed[i]).toBe(counts[i]);
    }
  });

  it('outputs in standard format', () => {
    const counts = parseNotation('123m')!;
    expect(tilesToNotation(counts)).toBe('123m');
  });
});
