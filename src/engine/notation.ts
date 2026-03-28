import {
  type TileCounts,
  type TileIndex,
  createEmptyTileCounts,
  NUM_TILE_TYPES,
  TILE_INFO,
  BAMBOO_START,
  CHARACTERS_START,
  DOTS_START,
  WINDS_START,
  DRAGONS_START,
} from './tiles';

// Shorthand notation format:
// Suit tiles: digits followed by suit letter
//   m/b = bamboo (man), p/c = characters (pin), s/d = dots (sou)
// Honor tiles: two-letter codes
//   Ew/E = East, Sw/S = South, Ww/W = West, Nw/N = North
//   Dr/R = Red Dragon, Dg/G = Green Dragon, Dw/B = White Dragon
//
// Examples:
//   "123m456p789sEEENw" = 1-2-3 bamboo, 4-5-6 characters, 7-8-9 dots, 3x East, 1x North
//   "123b 456c 789d EEE N" = same hand with alternate suit codes

const SUIT_LETTER_MAP: Record<string, number> = {
  m: BAMBOO_START,
  b: BAMBOO_START,
  p: CHARACTERS_START,
  c: CHARACTERS_START,
  s: DOTS_START,
  d: DOTS_START,
};

const HONOR_MAP: Record<string, TileIndex> = {
  E: WINDS_START,
  S: WINDS_START + 1,
  W: WINDS_START + 2,
  N: WINDS_START + 3,
  R: DRAGONS_START,
  G: DRAGONS_START + 1,
  B: DRAGONS_START + 2,
};

// Extended honor codes (two-letter)
const HONOR_MAP_EXTENDED: Record<string, TileIndex> = {
  Ew: WINDS_START,
  Sw: WINDS_START + 1,
  Ww: WINDS_START + 2,
  Nw: WINDS_START + 3,
  Dr: DRAGONS_START,
  Dg: DRAGONS_START + 1,
  Dw: DRAGONS_START + 2,
};

export function parseNotation(input: string): TileCounts | null {
  const counts = createEmptyTileCounts();
  const cleaned = input.trim();
  if (!cleaned) return null;

  let i = 0;
  const pendingDigits: number[] = [];

  while (i < cleaned.length) {
    const ch = cleaned[i];

    // Skip whitespace
    if (ch === ' ' || ch === ',') {
      i++;
      continue;
    }

    // Check for two-letter honor code
    if (i + 1 < cleaned.length) {
      const twoChar = cleaned.slice(i, i + 2);
      if (HONOR_MAP_EXTENDED[twoChar] !== undefined) {
        // Flush any pending digits — they shouldn't exist before honor codes
        if (pendingDigits.length > 0) return null;
        const idx = HONOR_MAP_EXTENDED[twoChar];
        counts[idx]++;
        if (counts[idx] > 4) return null;
        i += 2;
        continue;
      }
    }

    // Check for single-letter honor code
    if (HONOR_MAP[ch] !== undefined && !isDigit(ch)) {
      // Flush pending digits if any — invalid
      if (pendingDigits.length > 0) return null;
      const idx = HONOR_MAP[ch];
      counts[idx]++;
      if (counts[idx] > 4) return null;
      i++;
      continue;
    }

    // Digit: accumulate
    if (isDigit(ch)) {
      const digit = parseInt(ch);
      if (digit < 1 || digit > 9) return null;
      pendingDigits.push(digit);
      i++;
      continue;
    }

    // Suit letter: apply pending digits
    const lowerCh = ch.toLowerCase();
    if (SUIT_LETTER_MAP[lowerCh] !== undefined) {
      if (pendingDigits.length === 0) return null;
      const suitStart = SUIT_LETTER_MAP[lowerCh];
      for (const d of pendingDigits) {
        const idx = suitStart + (d - 1);
        counts[idx]++;
        if (counts[idx] > 4) return null;
      }
      pendingDigits.length = 0;
      i++;
      continue;
    }

    // Unknown character
    return null;
  }

  // If we have leftover digits, invalid
  if (pendingDigits.length > 0) return null;

  return counts;
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

export function tilesToNotation(counts: TileCounts): string {
  const parts: string[] = [];
  const suitLetters = ['m', 'p', 's'];

  // Suited tiles
  for (let s = 0; s < 3; s++) {
    const start = s * 9;
    let digits = '';
    for (let r = 0; r < 9; r++) {
      const c = counts[start + r];
      for (let k = 0; k < c; k++) {
        digits += (r + 1).toString();
      }
    }
    if (digits) {
      parts.push(digits + suitLetters[s]);
    }
  }

  // Honor tiles
  const honorCodes = ['E', 'S', 'W', 'N', 'R', 'G', 'B'];
  for (let h = 0; h < 7; h++) {
    const idx = WINDS_START + h;
    const c = counts[idx];
    for (let k = 0; k < c; k++) {
      parts.push(honorCodes[h]);
    }
  }

  return parts.join('');
}

export function tileIndexToNotation(index: TileIndex): string {
  if (index < 0 || index >= NUM_TILE_TYPES) return '?';
  return TILE_INFO[index].name;
}
