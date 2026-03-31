// 4-player game simulation engine
// Simulates a full Mahjong game with 3 AI opponents and 1 human player.
// AI opponents use the score-aware fastPickDiscard heuristic from montecarlo.ts.

import {
  type TileCounts,
  type TileIndex,
  type Wind,
  NUM_TILE_TYPES,
  TILES_PER_TYPE,
  HAND_SIZE,
  createEmptyTileCounts,
  cloneTileCounts,
} from './tiles';
import type { GameContext } from './hand';
import { calculateShanten } from './shanten';
import { analyzeHand, type AnalysisResult } from './analysis';
import { SeededRNG } from './generator';
import type { RulesetMode } from './rulesets';
import { getRulesetConfig } from './rulesets';
import { fastPickDiscard } from './montecarlo';

// ---- Types ----

export interface OpenMeld {
  type: 'chow' | 'pong';
  tiles: TileIndex[];       // the 3 tile indices in the meld
  claimedFrom: number;      // which player's discard was claimed
}

export interface PlayerState {
  hand: TileCounts;         // closed hand tiles (13 normally, 14 after draw/claim before discard)
  discards: TileIndex[];    // river of discarded tiles (in order)
  openMelds: OpenMeld[];    // melds claimed from other players
  isHuman: boolean;         // true for player 0 (the user)
  seatWind: Wind;
}

export interface GameState {
  players: PlayerState[];
  wall: TileIndex[];       // remaining wall tiles
  wallIndex: number;       // next draw position
  prevailingWind: Wind;
  currentPlayer: number;   // 0-3, whose turn it is
  turnNumber: number;
  deadTiles: TileCounts;   // all visible/discarded tiles aggregated
}

export interface ClaimOption {
  type: 'pong' | 'chow';
  tile: TileIndex;            // the discarded tile being claimed
  fromPlayer: number;         // who discarded it
  chowTiles?: [TileIndex, TileIndex]; // the 2 tiles from your hand (for chow)
}

export interface GameTurn {
  player: number;
  drawnTile: TileIndex;
  discardedTile: TileIndex | null;  // null if won
  handBefore: TileCounts;
  handAfter: TileCounts;
  analysis?: AnalysisResult;  // only for human player
  isWin: boolean;
  claim?: ClaimOption;        // if this turn resulted from claiming a discard
}

export interface GameSimOptions {
  seed?: number;
  prevailingWind?: Wind;
}

// ---- Winds ----

const SEAT_WINDS: Wind[] = [0, 1, 2, 3]; // East, South, West, North

// ---- Core functions ----

/** Build a full 136-tile wall and shuffle it */
function buildFullWall(rng: SeededRNG): TileIndex[] {
  const wall: TileIndex[] = [];
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    for (let j = 0; j < TILES_PER_TYPE; j++) {
      wall.push(i);
    }
  }
  rng.shuffle(wall);
  return wall;
}

/** Initialize a new 4-player game. Deal 13 tiles to each player. Player 0 is human. */
export function initializeGame(options?: GameSimOptions): GameState {
  const seed = options?.seed ?? Date.now();
  const prevailingWind: Wind = options?.prevailingWind ?? 0;
  const rng = new SeededRNG(seed);

  const wall = buildFullWall(rng);
  let wallIndex = 0;

  // Deal 13 tiles to each player
  const players: PlayerState[] = [];
  for (let p = 0; p < 4; p++) {
    const hand = createEmptyTileCounts();
    for (let t = 0; t < HAND_SIZE; t++) {
      hand[wall[wallIndex]]++;
      wallIndex++;
    }
    players.push({
      hand,
      discards: [],
      openMelds: [],
      isHuman: p === 0,
      seatWind: SEAT_WINDS[p],
    });
  }

  const deadTiles = createEmptyTileCounts();

  return {
    players,
    wall,
    wallIndex,
    prevailingWind,
    currentPlayer: 0, // East starts
    turnNumber: 0,
    deadTiles,
  };
}

/** Get tiles remaining in the wall */
export function getWallRemaining(state: GameState): number {
  return state.wall.length - state.wallIndex;
}

/** Count all tiles visible in all 4 rivers. Returns TileCounts of tiles no longer available. */
export function getDeadTiles(state: GameState): TileCounts {
  const dead = createEmptyTileCounts();
  for (const player of state.players) {
    for (const tile of player.discards) {
      dead[tile]++;
    }
  }
  return dead;
}

/** How many copies of this tile could still be drawn?
 *  4 - inMyHand - inAllRivers */
export function getLiveTileCount(state: GameState, tileIndex: TileIndex, playerIdx: number = 0): number {
  const inHand = state.players[playerIdx].hand[tileIndex];
  const inRivers = state.deadTiles[tileIndex];
  return Math.max(0, TILES_PER_TYPE - inHand - inRivers);
}

/** Build a GameContext from the current game state for a specific player */
export function buildGameContext(state: GameState, playerIdx: number): GameContext {
  const player = state.players[playerIdx];
  return {
    seatWind: player.seatWind,
    prevailingWind: state.prevailingWind,
    wallRemaining: getWallRemaining(state),
    isSelfDrawn: true,
    isConcealed: player.openMelds.length === 0,
    bonusTiles: [],
  };
}

/** Draw a tile from the wall for the given player. Returns the drawn tile or null if wall empty. */
function drawTile(state: GameState, playerIdx: number): TileIndex | null {
  if (state.wallIndex >= state.wall.length) return null;
  const tile = state.wall[state.wallIndex];
  state.wallIndex++;
  state.players[playerIdx].hand[tile]++;
  return tile;
}

/** Discard a tile from the given player's hand and add to their river */
function discardTile(state: GameState, playerIdx: number, tile: TileIndex): void {
  state.players[playerIdx].hand[tile]--;
  state.players[playerIdx].discards.push(tile);
  state.deadTiles[tile]++;
}

/** Simulate an AI player's turn: draw from wall, pick best discard. Returns a GameTurn. */
export function simulateAITurn(state: GameState, playerIdx: number, rulesetMode: RulesetMode): GameTurn | null {
  const config = getRulesetConfig(rulesetMode);
  const includeSevenPairs = config.sevenPairsEnabled;

  const handBefore = cloneTileCounts(state.players[playerIdx].hand);
  const drawn = drawTile(state, playerIdx);
  if (drawn === null) return null;

  // Check if AI won
  const hand = state.players[playerIdx].hand;
  if (calculateShanten(hand, includeSevenPairs) === -1) {
    return {
      player: playerIdx,
      drawnTile: drawn,
      discardedTile: null,
      handBefore,
      handAfter: cloneTileCounts(hand),
      isWin: true,
    };
  }

  // Pick best discard using the score-aware heuristic
  const ctx = buildGameContext(state, playerIdx);
  const discard = fastPickDiscard(cloneTileCounts(hand), includeSevenPairs, ctx);
  discardTile(state, playerIdx, discard);

  return {
    player: playerIdx,
    drawnTile: drawn,
    discardedTile: discard,
    handBefore,
    handAfter: cloneTileCounts(state.players[playerIdx].hand),
    isWin: false,
  };
}

/** Simulate the human player's draw (but don't discard — human decides). Returns GameTurn with analysis. */
export function simulateHumanDraw(state: GameState, rulesetMode: RulesetMode): GameTurn | null {
  const config = getRulesetConfig(rulesetMode);
  const includeSevenPairs = config.sevenPairsEnabled;
  const playerIdx = 0;

  const handBefore = cloneTileCounts(state.players[playerIdx].hand);
  const drawn = drawTile(state, playerIdx);
  if (drawn === null) return null;

  const hand = state.players[playerIdx].hand;

  // Check if human won
  if (calculateShanten(hand, includeSevenPairs) === -1) {
    return {
      player: playerIdx,
      drawnTile: drawn,
      discardedTile: null,
      handBefore,
      handAfter: cloneTileCounts(hand),
      isWin: true,
    };
  }

  // Analyze the hand with dead tile info
  const ctx = buildGameContext(state, playerIdx);
  const analysis = analyzeHand(cloneTileCounts(hand), ctx, rulesetMode, state.deadTiles);

  return {
    player: playerIdx,
    drawnTile: drawn,
    discardedTile: null, // human hasn't decided yet
    handBefore,
    handAfter: cloneTileCounts(hand),
    analysis,
    isWin: false,
  };
}

/** Execute the human player's discard choice */
export function executeHumanDiscard(state: GameState, tile: TileIndex): void {
  discardTile(state, 0, tile);
}

/** Advance one full round: all 4 players take a turn (AI auto, human with analysis).
 *  Returns the turns taken. The human's turn has analysis but no discard set yet. */
export function advanceRound(state: GameState, rulesetMode: RulesetMode): GameTurn[] {
  const turns: GameTurn[] = [];

  for (let i = 0; i < 4; i++) {
    const playerIdx = state.currentPlayer;

    let turn: GameTurn | null;
    if (playerIdx === 0) {
      turn = simulateHumanDraw(state, rulesetMode);
    } else {
      turn = simulateAITurn(state, playerIdx, rulesetMode);
    }

    if (turn === null) break; // wall empty
    turns.push(turn);
    state.turnNumber++;

    if (turn.isWin) break;

    // Advance to next player (only if human has discarded or it's AI)
    if (playerIdx !== 0) {
      state.currentPlayer = (state.currentPlayer + 1) % 4;
    } else {
      // For human turn, we stop here — caller must call executeHumanDiscard then advance
      break;
    }
  }

  return turns;
}

/** After the human discards, advance the remaining AI turns in the round */
export function advanceAITurns(state: GameState, rulesetMode: RulesetMode): GameTurn[] {
  const turns: GameTurn[] = [];

  // Move to next player after human
  state.currentPlayer = (state.currentPlayer + 1) % 4;

  while (state.currentPlayer !== 0) {
    const turn = simulateAITurn(state, state.currentPlayer, rulesetMode);
    if (turn === null) break; // wall empty
    turns.push(turn);
    state.turnNumber++;

    if (turn.isWin) break;
    state.currentPlayer = (state.currentPlayer + 1) % 4;
  }

  return turns;
}

/** Simulate a complete game with all AI players. Returns all turns.
 *  The human player also uses AI heuristic for full simulation mode. */
export function simulateFullGame(rulesetMode: RulesetMode, options?: GameSimOptions): GameTurn[] {
  const state = initializeGame(options);
  const config = getRulesetConfig(rulesetMode);
  const includeSevenPairs = config.sevenPairsEnabled;
  const allTurns: GameTurn[] = [];

  // Max turns before wall runs out (roughly 136 - 52 dealt = 84 draws)
  const maxTurns = 84;

  for (let t = 0; t < maxTurns; t++) {
    const playerIdx = state.currentPlayer;
    const handBefore = cloneTileCounts(state.players[playerIdx].hand);
    const drawn = drawTile(state, playerIdx);
    if (drawn === null) break;

    const hand = state.players[playerIdx].hand;

    if (calculateShanten(hand, includeSevenPairs) === -1) {
      allTurns.push({
        player: playerIdx,
        drawnTile: drawn,
        discardedTile: null,
        handBefore,
        handAfter: cloneTileCounts(hand),
        isWin: true,
      });
      break;
    }

    const ctx = buildGameContext(state, playerIdx);
    const discard = fastPickDiscard(cloneTileCounts(hand), includeSevenPairs, ctx);
    discardTile(state, playerIdx, discard);

    const turn: GameTurn = {
      player: playerIdx,
      drawnTile: drawn,
      discardedTile: discard,
      handBefore,
      handAfter: cloneTileCounts(state.players[playerIdx].hand),
      isWin: false,
    };

    // Add analysis for human player
    if (playerIdx === 0) {
      // Re-create 14-tile hand for analysis
      const hand14 = cloneTileCounts(handBefore);
      hand14[drawn]++;
      turn.analysis = analyzeHand(hand14, ctx, rulesetMode, state.deadTiles);
    }

    allTurns.push(turn);
    state.turnNumber++;
    state.currentPlayer = (state.currentPlayer + 1) % 4;
  }

  return allTurns;
}

// ---- Claim detection ----

/** Check if a player can pong (claim a triplet) from a discarded tile.
 *  Pong can be claimed from ANY player's discard. */
export function canPong(state: GameState, playerIdx: number, discardedTile: TileIndex): boolean {
  return state.players[playerIdx].hand[discardedTile] >= 2;
}

/** Check all possible chow claims for a player from a discarded tile.
 *  Chow can only be claimed from the player to your LEFT (the player whose turn is
 *  immediately before yours in turn order).
 *  Returns array of possible chow combinations (the 2 tiles from hand). */
export function getChowOptions(
  state: GameState,
  playerIdx: number,
  discardedTile: TileIndex,
  fromPlayer: number
): [TileIndex, TileIndex][] {
  // Chow only from player to your left (previous player in turn order)
  const leftPlayer = (playerIdx + 3) % 4; // player before you
  if (fromPlayer !== leftPlayer) return [];

  // Chow only works with suit tiles (not honors)
  if (discardedTile >= 27) return []; // WINDS_START = 27

  const hand = state.players[playerIdx].hand;
  const suitStart = Math.floor(discardedTile / 9) * 9;
  const rank = discardedTile - suitStart;
  const options: [TileIndex, TileIndex][] = [];

  // The discarded tile could be the low, middle, or high of a sequence

  // As low tile: need rank+1, rank+2
  if (rank + 2 < 9) {
    const t1 = suitStart + rank + 1;
    const t2 = suitStart + rank + 2;
    if (hand[t1] >= 1 && hand[t2] >= 1) {
      options.push([t1, t2]);
    }
  }

  // As middle tile: need rank-1, rank+1
  if (rank >= 1 && rank + 1 < 9) {
    const t1 = suitStart + rank - 1;
    const t2 = suitStart + rank + 1;
    if (hand[t1] >= 1 && hand[t2] >= 1) {
      options.push([t1, t2]);
    }
  }

  // As high tile: need rank-2, rank-1
  if (rank >= 2) {
    const t1 = suitStart + rank - 2;
    const t2 = suitStart + rank - 1;
    if (hand[t1] >= 1 && hand[t2] >= 1) {
      options.push([t1, t2]);
    }
  }

  return options;
}

/** Get all claim options available to the human (player 0) for a given discard */
export function getClaimOptions(
  state: GameState,
  discardedTile: TileIndex,
  fromPlayer: number
): ClaimOption[] {
  const options: ClaimOption[] = [];

  // Check pong
  if (canPong(state, 0, discardedTile)) {
    options.push({
      type: 'pong',
      tile: discardedTile,
      fromPlayer,
    });
  }

  // Check chow options
  const chows = getChowOptions(state, 0, discardedTile, fromPlayer);
  for (const [t1, t2] of chows) {
    options.push({
      type: 'chow',
      tile: discardedTile,
      fromPlayer,
      chowTiles: [t1, t2],
    });
  }

  return options;
}

/** Execute a claim: take the discarded tile, form an open meld, give player 14 tiles.
 *  The discard is removed from the river of the player who discarded it.
 *  After claiming, the human has 14 tiles and must discard. */
export function executeClaim(state: GameState, claim: ClaimOption): void {
  const player = state.players[0]; // human is always player 0
  const fromPlayerState = state.players[claim.fromPlayer];

  // Remove the tile from the discarder's river (it was the last discard)
  const riverIdx = fromPlayerState.discards.lastIndexOf(claim.tile);
  if (riverIdx !== -1) {
    fromPlayerState.discards.splice(riverIdx, 1);
    state.deadTiles[claim.tile]--;
  }

  // Add the claimed tile to human's hand
  player.hand[claim.tile]++;

  // Record the open meld
  if (claim.type === 'pong') {
    player.openMelds.push({
      type: 'pong',
      tiles: [claim.tile, claim.tile, claim.tile],
      claimedFrom: claim.fromPlayer,
    });
  } else if (claim.type === 'chow' && claim.chowTiles) {
    const allTiles = [claim.chowTiles[0], claim.tile, claim.chowTiles[1]].sort((a, b) => a - b);
    player.openMelds.push({
      type: 'chow',
      tiles: allTiles,
      claimedFrom: claim.fromPlayer,
    });
  }

  // After claiming, human has 14 tiles and needs to discard
  // The turn order jumps to human (player 0)
  state.currentPlayer = 0;
}
