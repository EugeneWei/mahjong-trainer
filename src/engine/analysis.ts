// Strategy analysis engine

import {
  type TileCounts,
  type TileIndex,
  NUM_TILE_TYPES,
  TILES_PER_TYPE,
  TILE_INFO,
  THIRTEEN_ORPHAN_INDICES,
  WINDS_START,
  DRAGONS_START,
  Suit,
  getSuit,
} from './tiles';
import type { GameContext } from './hand';
import { calculateShanten, getAcceptanceTiles } from './shanten';
import { scoreWithWinningTile, isWinningHand } from './scoring';
import type { RulesetMode } from './rulesets';
import { getRulesetConfig } from './rulesets';

export interface ReachableHand {
  winningTile: TileIndex;
  fanValue: number;
  patterns: string[];
  probability: number;
  ev: number;
  description: string;
}

export interface DiscardOption {
  tile: TileIndex;
  shanten: number;
  acceptance: number;
  acceptanceTiles: TileIndex[];
  reachableHands: ReachableHand[];
  ev: number;
  explanation: string;
}

export interface HandPath {
  name: string;
  fan: number;
  description: string;
  tilesNeeded: TileIndex[];
  probability: number;
}

// A detected group of tiles in the hand
export interface TileGroup {
  type: 'triplet' | 'sequence' | 'pair' | 'partial-seq' | 'isolated';
  tiles: TileIndex[]; // the tile indices in this group
  label: string; // human-readable label
}

export interface AnalysisResult {
  currentShanten: number;
  discards: DiscardOption[];
  bestDiscard: TileIndex;
  handDescription: string;
  handAnalysis: string;
  winningPaths: HandPath[];
  tileGroups: TileGroup[]; // detected melds, partials, pairs, isolated tiles
  monteCarloResults?: import('./montecarlo').MonteCarloResult[]; // optional, populated async
}

const SUIT_NAMES = ['Bamboo', 'Characters', 'Dots'];

export function analyzeHand(tiles: TileCounts, ctx: GameContext, mode: RulesetMode = 'hk'): AnalysisResult {
  const config = getRulesetConfig(mode);
  const includeSevenPairs = config.sevenPairsEnabled;
  const currentShanten = calculateShanten(tiles, includeSevenPairs);
  const discards: DiscardOption[] = [];

  const seen = new Set<number>();
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] > 0 && !seen.has(i)) {
      seen.add(i);
      tiles[i]--;
      const option = analyzeDiscard(tiles, i, ctx, mode, includeSevenPairs);
      discards.push(option);
      tiles[i]++;
    }
  }

  discards.sort((a, b) => {
    if (a.shanten !== b.shanten) return a.shanten - b.shanten;
    if (a.acceptance !== b.acceptance) return b.acceptance - a.acceptance;
    return b.ev - a.ev;
  });

  for (const d of discards) {
    d.explanation = generateExplanation(d, currentShanten, ctx, mode);
  }

  const bestDiscard = discards.length > 0 ? discards[0].tile : 0;
  const tileGroups = detectTileGroups(tiles);

  return {
    currentShanten,
    discards,
    bestDiscard,
    handDescription: describeShanten(currentShanten),
    handAnalysis: generateHandAnalysis(tiles, ctx, currentShanten, discards, tileGroups, mode),
    winningPaths: findWinningPaths(tiles, ctx, mode),
    tileGroups,
  };
}

// Detect melds, partial melds, pairs, and isolated tiles in a hand
function detectTileGroups(tiles: TileCounts): TileGroup[] {
  const groups: TileGroup[] = [];
  const remaining = tiles.slice();

  // Pass 1: Extract triplets (pongs)
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    if (remaining[i] >= 3) {
      groups.push({
        type: 'triplet',
        tiles: [i, i, i],
        label: `Triplet: ${tileFullName(i)} x3`,
      });
      remaining[i] -= 3;
    }
  }

  // Pass 2: Extract sequences (chows) in each suit
  for (let s = 0; s < 3; s++) {
    const start = s * 9;
    for (let r = 0; r < 7; r++) {
      const idx = start + r;
      while (remaining[idx] >= 1 && remaining[idx + 1] >= 1 && remaining[idx + 2] >= 1) {
        groups.push({
          type: 'sequence',
          tiles: [idx, idx + 1, idx + 2],
          label: `Sequence: ${tileFullName(idx)}, ${tileFullName(idx + 1)}, ${tileFullName(idx + 2)}`,
        });
        remaining[idx]--;
        remaining[idx + 1]--;
        remaining[idx + 2]--;
      }
    }
  }

  // Pass 3: Extract pairs
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    if (remaining[i] >= 2) {
      groups.push({
        type: 'pair',
        tiles: [i, i],
        label: `Pair: ${tileFullName(i)} x2`,
      });
      remaining[i] -= 2;
    }
  }

  // Pass 4: Extract partial sequences (two consecutive or one-gap)
  for (let s = 0; s < 3; s++) {
    const start = s * 9;
    for (let r = 0; r < 8; r++) {
      const idx = start + r;
      if (remaining[idx] >= 1 && remaining[idx + 1] >= 1) {
        const neededTiles: string[] = [];
        if (r > 0) neededTiles.push(tileFullName(idx - 1));
        if (r + 1 < 8) neededTiles.push(tileFullName(idx + 2));
        groups.push({
          type: 'partial-seq',
          tiles: [idx, idx + 1],
          label: `Partial: ${tileFullName(idx)}, ${tileFullName(idx + 1)} — need ${neededTiles.join(' or ')}`,
        });
        remaining[idx]--;
        remaining[idx + 1]--;
      }
    }
    // One-gap partials (e.g., 1-3, need 2)
    for (let r = 0; r < 7; r++) {
      const idx = start + r;
      if (remaining[idx] >= 1 && remaining[idx + 2] >= 1) {
        groups.push({
          type: 'partial-seq',
          tiles: [idx, idx + 2],
          label: `Partial: ${tileFullName(idx)}, ${tileFullName(idx + 2)} — need ${tileFullName(idx + 1)}`,
        });
        remaining[idx]--;
        remaining[idx + 2]--;
      }
    }
  }

  // Pass 5: Remaining tiles are isolated
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    for (let j = 0; j < remaining[i]; j++) {
      groups.push({
        type: 'isolated',
        tiles: [i],
        label: `Isolated: ${tileFullName(i)}`,
      });
    }
  }

  return groups;
}

function analyzeDiscard(tiles: TileCounts, discardedTile: TileIndex, ctx: GameContext, mode: RulesetMode = 'hk', includeSevenPairs: boolean = false): DiscardOption {
  const shanten = calculateShanten(tiles, includeSevenPairs);
  const { tiles: acceptTiles, count: acceptance } = getAcceptanceTiles(tiles, shanten, undefined, includeSevenPairs);
  const config = getRulesetConfig(mode);

  const reachableHands: ReachableHand[] = [];
  let totalEV = 0;

  if (shanten === 0) {
    for (let i = 0; i < NUM_TILE_TYPES; i++) {
      const remaining = TILES_PER_TYPE - tiles[i] - (i === discardedTile ? 1 : 0);
      if (remaining <= 0) continue;

      tiles[i]++;
      if (isWinningHand(tiles, mode)) {
        tiles[i]--;
        const score = scoreWithWinningTile(tiles, i, ctx, mode);
        if (score) {
          const probability = remaining / Math.max(ctx.wallRemaining, 1);
          const minScore = config.minimum;
          const ev = score.fan >= minScore ? score.points * probability : 0;
          reachableHands.push({
            winningTile: i,
            fanValue: score.fan,
            patterns: score.patterns,
            probability,
            ev,
            description: describeCompletedHand(tiles, i, score.patterns, score.fan, mode),
          });
          totalEV += ev;
        }
      } else {
        tiles[i]--;
      }
    }

    reachableHands.sort((a, b) => b.ev - a.ev);
    reachableHands.splice(5);
  } else if (shanten === 1) {
    const estimatedFan = estimateReachableFan(tiles, ctx);
    const estimatedProb = acceptance / Math.max(ctx.wallRemaining, 1);
    totalEV = estimatedFan * estimatedProb * BASE_EV_SCALE;
  }

  return {
    tile: discardedTile,
    shanten,
    acceptance,
    acceptanceTiles: acceptTiles,
    reachableHands,
    ev: totalEV,
    explanation: '',
  };
}

const BASE_EV_SCALE = 8;

function describeCompletedHand(_tiles: TileCounts, winTile: TileIndex, patterns: string[], fan: number, mode: RulesetMode = 'hk'): string {
  const tileName = tileFullName(winTile);
  const config = getRulesetConfig(mode);
  const unit = config.unit;
  const min = config.minimum;
  if (fan < min) {
    return `Win with ${tileName} for ${fan} ${unit} — below ${min}-${unit} minimum, cannot declare this win.`;
  }
  return `Win with ${tileName} for ${fan} ${unit} (${patterns.join(' + ')}).`;
}

function generateHandAnalysis(
  tiles: TileCounts,
  ctx: GameContext,
  shanten: number,
  discards: DiscardOption[],
  tileGroups: TileGroup[],
  _mode: RulesetMode = 'hk'
): string {
  const parts: string[] = [];

  parts.push(describeShanten(shanten) + '.');

  // Count groups by type
  const triplets = tileGroups.filter(g => g.type === 'triplet');
  const sequences = tileGroups.filter(g => g.type === 'sequence');
  const pairs = tileGroups.filter(g => g.type === 'pair');
  const partials = tileGroups.filter(g => g.type === 'partial-seq');
  const isolated = tileGroups.filter(g => g.type === 'isolated');

  const completeMelds = triplets.length + sequences.length;

  parts.push('');
  parts.push(`Hand breakdown (need 4 melds + 1 pair to win):`);
  if (completeMelds > 0) {
    parts.push(`Complete melds (${completeMelds}/4):`);
    for (const g of [...triplets, ...sequences]) {
      parts.push(`  ${g.type === 'triplet' ? 'Pong' : 'Chow'}: ${g.tiles.map(tileFullName).join(', ')}`);
    }
  }
  if (pairs.length > 0) {
    parts.push(`Pairs (${pairs.length}):`);
    for (const g of pairs) {
      parts.push(`  ${tileFullName(g.tiles[0])} x2`);
    }
  }
  if (partials.length > 0) {
    parts.push(`Partial melds — one tile away from a complete meld:`);
    for (const g of partials) {
      parts.push(`  ${g.label}`);
    }
  }
  if (isolated.length > 0) {
    parts.push(`Isolated tiles — not connected to melds: ${isolated.map(g => tileFullName(g.tiles[0])).join(', ')}`);
  }

  // Suit distribution
  const comp = analyzeComposition(tiles);
  const suitDist: string[] = [];
  for (let s = 0; s < 3; s++) {
    if (comp.suitCounts[s] > 0) suitDist.push(`${comp.suitCounts[s]} ${SUIT_NAMES[s]}`);
  }
  if (comp.honorCount > 0) suitDist.push(`${comp.honorCount} Honor`);
  parts.push('');
  parts.push(`Suit breakdown: ${suitDist.join(', ')}.`);

  // Strategic direction
  const strategies = identifyStrategies(tiles, comp, ctx);
  if (strategies.length > 0) {
    parts.push('');
    parts.push('Possible directions:');
    for (const s of strategies) {
      parts.push(`  ${s}`);
    }
  }

  // Game phase advice
  parts.push('');
  if (ctx.wallRemaining > 60) {
    parts.push('Early game — focus on building hand shape and keeping flexible. Prioritize tile efficiency over chasing a specific high-scoring hand.');
  } else if (ctx.wallRemaining > 30) {
    parts.push('Mid game — commit to a direction. If far from tenpai, consider whether to play defensively or keep pushing.');
  } else {
    parts.push(`Late game (${ctx.wallRemaining} tiles left). If not close to tenpai, shift toward defensive play.`);
  }

  // Best discard
  if (discards.length > 0) {
    const best = discards[0];
    parts.push('');
    parts.push(`Recommended: discard ${tileFullName(best.tile)}.`);
    if (best.acceptance > 0) {
      parts.push(`This gives ${best.acceptance} improving draws across ${best.acceptanceTiles.length} tile types.`);
    }
    if (discards.length >= 2 && discards[1].shanten === best.shanten && discards[1].acceptance > 0) {
      parts.push(`Alternative: ${tileFullName(discards[1].tile)} also at shanten ${best.shanten} with ${discards[1].acceptance} improving draws.`);
    }
  }

  return parts.join('\n');
}

function findWinningPaths(tiles: TileCounts, ctx: GameContext, _mode: RulesetMode = 'hk'): HandPath[] {
  const paths: HandPath[] = [];
  const comp = analyzeComposition(tiles);

  for (let s = 0; s < 3; s++) {
    if (comp.suitCounts[s] >= 8) {
      let offSuitCount = 0;
      for (let i = 0; i < NUM_TILE_TYPES; i++) {
        if (tiles[i] > 0) {
          const tileSuit = i < 27 ? Math.floor(i / 9) : -1;
          if (tileSuit !== s) offSuitCount += tiles[i];
        }
      }
      if (comp.honorCount > 0) {
        paths.push({
          name: 'Half Flush',
          fan: 3,
          description: `Concentrate on ${SUIT_NAMES[s]} + Honors. Discard other suits. You have ${comp.suitCounts[s]} ${SUIT_NAMES[s]} tiles.`,
          tilesNeeded: [],
          probability: 0.5,
        });
      }
      const suitOnlyOff = offSuitCount;
      if (suitOnlyOff <= 4) {
        paths.push({
          name: 'Full Flush',
          fan: 7,
          description: `Go all-in on ${SUIT_NAMES[s]}. Shed ${suitOnlyOff} off-suit tile${suitOnlyOff !== 1 ? 's' : ''}. 7 fan — very high payoff.`,
          tilesNeeded: [],
          probability: suitOnlyOff <= 2 ? 0.5 : 0.25,
        });
      }
    }
  }

  if (comp.tripletCount >= 2 || comp.pairs >= 3) {
    paths.push({
      name: 'All Pongs',
      fan: 3,
      description: `${comp.tripletCount} triplet${comp.tripletCount !== 1 ? 's' : ''}, ${comp.pairs} pair${comp.pairs !== 1 ? 's' : ''}. Requires all 4 melds as pongs.`,
      tilesNeeded: [],
      probability: comp.tripletCount >= 3 ? 0.5 : 0.2,
    });
  }

  let dragonPongCount = 0;
  let windPongCount = 0;
  let valuePairCount = 0;
  for (let i = WINDS_START; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] >= 3) {
      if (i >= DRAGONS_START) dragonPongCount++;
      else if (i === WINDS_START + ctx.seatWind || i === WINDS_START + ctx.prevailingWind) windPongCount++;
    }
    if (tiles[i] === 2) {
      if (i >= DRAGONS_START || i === WINDS_START + ctx.seatWind || i === WINDS_START + ctx.prevailingWind) {
        valuePairCount++;
      }
    }
  }

  if (dragonPongCount > 0 || windPongCount > 0) {
    const fan = dragonPongCount + windPongCount;
    const desc = [];
    if (dragonPongCount > 0) desc.push(`${dragonPongCount} Dragon pong${dragonPongCount > 1 ? 's' : ''}`);
    if (windPongCount > 0) desc.push(`${windPongCount} scoring Wind pong${windPongCount > 1 ? 's' : ''}`);
    paths.push({
      name: 'Honor Value Hand',
      fan,
      description: `${desc.join(' and ')} = ${fan} fan. Build around these anchors. Concealed + Self-Drawn adds +2 to reach 3-fan.`,
      tilesNeeded: [],
      probability: 0.6,
    });
  }

  if (valuePairCount > 0 && dragonPongCount + windPongCount === 0) {
    paths.push({
      name: 'Value Pair Upgrade',
      fan: 1,
      description: `${valuePairCount} pair${valuePairCount > 1 ? 's' : ''} of value tiles. Drawing a third makes a pong worth 1 fan each.`,
      tilesNeeded: [],
      probability: 0.3,
    });
  }

  let orphanCount = 0;
  let orphanMissing: TileIndex[] = [];
  for (const idx of THIRTEEN_ORPHAN_INDICES) {
    if (tiles[idx] >= 1) orphanCount++;
    else orphanMissing.push(idx);
  }
  if (orphanCount >= 9) {
    paths.push({
      name: 'Thirteen Orphans',
      fan: 10,
      description: `${orphanCount}/13 unique terminals/honors. Need: ${orphanMissing.map(tileFullName).join(', ')}. Limit hand!`,
      tilesNeeded: orphanMissing,
      probability: orphanCount >= 12 ? 0.4 : orphanCount >= 10 ? 0.15 : 0.05,
    });
  }

  if (ctx.isConcealed) {
    paths.push({
      name: 'Concealed + Self-Drawn',
      fan: 2,
      description: 'Keep hand concealed. Win by self-draw = 2 fan. Need 1 more fan to meet 3-fan minimum (e.g., a value pong or All Chows).',
      tilesNeeded: [],
      probability: 0.3,
    });
  }

  paths.sort((a, b) => b.fan - a.fan || b.probability - a.probability);
  return paths.slice(0, 5);
}

interface HandComposition {
  suitCounts: number[];
  honorCount: number;
  completeMelds: number;
  partialMelds: number;
  pairs: number;
  tripletCount: number;
  isolated: number;
}

function analyzeComposition(tiles: TileCounts): HandComposition {
  const suitCounts = [0, 0, 0];
  let honorCount = 0;
  let pairs = 0;
  let tripletCount = 0;
  let isolated = 0;
  let completeMelds = 0;
  let partialMelds = 0;

  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] > 0) {
      if (i < 9) suitCounts[0] += tiles[i];
      else if (i < 18) suitCounts[1] += tiles[i];
      else if (i < 27) suitCounts[2] += tiles[i];
      else honorCount += tiles[i];
    }
    if (tiles[i] >= 3) tripletCount++;
    if (tiles[i] === 2) pairs++;
    if (tiles[i] === 1) {
      const suit = getSuit(i);
      if (suit !== Suit.Honor) {
        const suitStart = Math.floor(i / 9) * 9;
        const rank = i - suitStart;
        const hasNeighbor = (rank > 0 && tiles[i - 1] > 0) || (rank < 8 && tiles[i + 1] > 0);
        if (!hasNeighbor) isolated++;
      } else {
        isolated++;
      }
    }
  }

  for (let s = 0; s < 3; s++) {
    const start = s * 9;
    for (let r = 0; r < 7; r++) {
      if (tiles[start + r] > 0 && tiles[start + r + 1] > 0 && tiles[start + r + 2] > 0) {
        completeMelds++;
      }
    }
  }

  completeMelds = Math.min(completeMelds, 4) + tripletCount;
  partialMelds = pairs;

  return { suitCounts, honorCount, completeMelds, partialMelds, pairs, tripletCount, isolated };
}

function identifyStrategies(tiles: TileCounts, comp: HandComposition, ctx: GameContext): string[] {
  const strategies: string[] = [];
  const nonZeroSuits = comp.suitCounts.filter(c => c > 0).length;
  const maxSuit = Math.max(...comp.suitCounts);
  const dominantSuitIdx = comp.suitCounts.indexOf(maxSuit);

  if (nonZeroSuits === 1 && comp.honorCount === 0) {
    strategies.push(`Full Flush in ${SUIT_NAMES[dominantSuitIdx]} (7 fan) — already there, just complete melds.`);
  } else if (nonZeroSuits === 1 && comp.honorCount > 0) {
    strategies.push(`Half Flush in ${SUIT_NAMES[dominantSuitIdx]} (3 fan) — discard off-suit, keep honors.`);
    strategies.push(`Or push Full Flush (7 fan) by shedding honors too — riskier but much higher payoff.`);
  } else if (maxSuit >= 9) {
    strategies.push(`Strong ${SUIT_NAMES[dominantSuitIdx]} (${maxSuit} tiles). Consider steering toward a flush.`);
  } else {
    strategies.push('Mixed suits — aim for speed. Concealed + Self-Drawn + a value pong = 3 fan.');
  }

  if (comp.tripletCount >= 2) {
    strategies.push(`All Pongs (3 fan) — ${comp.tripletCount} triplets already. Build pongs, avoid chows.`);
  }

  let dragonPongs = 0;
  for (let i = WINDS_START; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] >= 3) {
      if (i >= DRAGONS_START) dragonPongs++;
      else if (i === WINDS_START + ctx.seatWind || i === WINDS_START + ctx.prevailingWind) {
        strategies.push('Wind pong matches seat/round wind — +1 fan.');
      }
    }
  }
  if (dragonPongs > 0) strategies.push(`Dragon pong${dragonPongs > 1 ? 's' : ''} = ${dragonPongs} fan anchor.`);

  return strategies;
}

function estimateReachableFan(tiles: TileCounts, _ctx: GameContext): number {
  let fan = 0;
  let suitCounts = [0, 0, 0];
  let honorCount = 0;
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    if (tiles[i] > 0) {
      if (i < 9) suitCounts[0] += tiles[i];
      else if (i < 18) suitCounts[1] += tiles[i];
      else if (i < 27) suitCounts[2] += tiles[i];
      else honorCount += tiles[i];
    }
  }
  const nonZeroSuits = suitCounts.filter(c => c > 0).length;
  if (nonZeroSuits === 1 && honorCount === 0) fan += 3;
  else if (nonZeroSuits === 1 && honorCount > 0) fan += 2;
  if (fan < 3) fan = 3;
  return fan;
}

function generateExplanation(option: DiscardOption, originalShanten: number, ctx: GameContext, mode: RulesetMode = 'hk'): string {
  const tileName = tileFullName(option.tile);
  const config = getRulesetConfig(mode);
  const unit = config.unit;
  const min = config.minimum;
  const parts: string[] = [];

  if (option.shanten < originalShanten) {
    parts.push(`Discarding ${tileName} reduces shanten to ${option.shanten}.`);
  } else if (option.shanten === originalShanten) {
    parts.push(`Discarding ${tileName} keeps shanten at ${option.shanten}.`);
  } else {
    parts.push(`Discarding ${tileName} increases shanten to ${option.shanten}.`);
  }

  // Acceptance info — tiles are shown graphically, so keep text brief
  if (option.acceptance > 0) {
    parts.push(`${option.acceptance} tiles across ${option.acceptanceTiles.length} types improve your hand.`);
  }

  if (option.reachableHands.length > 0) {
    const scoreable = option.reachableHands.filter(h => h.fanValue >= min);
    const nonScoreable = option.reachableHands.filter(h => h.fanValue < min);
    if (scoreable.length > 0) {
      parts.push(`Winning tiles: ${scoreable.map(h => `${tileFullName(h.winningTile)} (${h.fanValue} ${unit})`).join(', ')}.`);
    }
    if (nonScoreable.length > 0) {
      parts.push(`Warning: ${nonScoreable.map(h => tileFullName(h.winningTile)).join(', ')} completes the hand but below ${min}-${unit} minimum.`);
    }
  }

  if (ctx.wallRemaining > 60) {
    parts.push('Early game: maximize tile efficiency.');
  } else if (ctx.wallRemaining > 30) {
    parts.push('Mid game: balance efficiency with hand value.');
  } else {
    parts.push('Late game: consider defensive play.');
  }

  return parts.join(' ');
}

function describeShanten(shanten: number): string {
  if (shanten === -1) return 'This is a complete winning hand';
  if (shanten === 0) return 'Tenpai — one tile from winning';
  if (shanten === 1) return 'Iishanten — two steps from winning';
  if (shanten === 2) return 'Three steps from winning';
  return `${shanten + 1} steps from winning — developing hand`;
}

export function tileFullName(index: TileIndex): string {
  const info = TILE_INFO[index];
  if (info.isHonor) return info.name;
  return `${info.rank} of ${SUIT_NAMES[info.suit]}`;
}

export function describeHandStrategy(tiles: TileCounts, ctx: GameContext, mode: RulesetMode = 'hk'): string {
  const config = getRulesetConfig(mode);
  const shanten = calculateShanten(tiles, config.sevenPairsEnabled);
  const parts: string[] = [];
  parts.push(describeShanten(shanten) + '.');

  const comp = analyzeComposition(tiles);
  const strategies = identifyStrategies(tiles, comp, ctx);
  for (const s of strategies) parts.push(s);

  let orphanCount = 0;
  for (const idx of THIRTEEN_ORPHAN_INDICES) {
    if (tiles[idx] > 0) orphanCount++;
  }
  if (orphanCount >= 9) {
    parts.push(`${orphanCount}/13 orphan tiles — Thirteen Orphans possible!`);
  }

  return parts.join(' ');
}
