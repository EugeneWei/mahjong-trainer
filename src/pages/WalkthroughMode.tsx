import { useState, useCallback, useMemo } from 'react';
import TileSVG from '../components/tiles/TileSVG';
import AnalysisPanel from '../components/analysis/AnalysisPanel';
import MonteCarloPanel from '../components/analysis/MonteCarloPanel';
import TableView from '../components/layout/TableView';
import {
  cloneTileCounts,
  totalTileCount,
  type TileCounts,
  type TileIndex,
} from '../engine/tiles';
import { createDefaultGameContext, type GameContext } from '../engine/hand';
import { tileFullName, analyzeHand, analyzeClaimDecision } from '../engine/analysis';
import type { AnalysisResult, ClaimAnalysis } from '../engine/analysis';
import type { RulesetMode } from '../engine/rulesets';
import { getRulesetConfig } from '../engine/rulesets';
import GlossaryLinkedText from '../components/shared/GlossaryLinkedText';
import { useMonteCarloAnalysis } from '../hooks/useMonteCarloAnalysis';
import {
  initializeGame,
  simulateAITurn,
  simulateHumanDraw,
  executeHumanDiscard,
  advanceAITurns,
  getWallRemaining,
  getDeadTiles,
  buildGameContext,
  getClaimOptions,
  executeClaim,
  type GameState,
  type GameTurn,
  type ClaimOption,
} from '../engine/game-sim';

interface WalkthroughModeProps {
  rulesetMode: RulesetMode;
}

type WalkthroughPhase = 'setup' | 'human-turn' | 'between-turns' | 'claim-decision' | 'game-over';

interface WalkthroughState {
  gameState: GameState;
  allTurns: GameTurn[];       // all turns so far
  currentHumanTurn: GameTurn | null;
  phase: WalkthroughPhase;
  message: string;
  humanAnalysis: AnalysisResult | null;
  selectedTile: TileIndex | null;  // two-step discard: selected but not yet confirmed
  claimOptions: ClaimOption[];     // available pong/chow options from last AI discard
  claimAnalyses: ClaimAnalysis[];  // analysis for each claim option
  pendingAITurns: GameTurn[];      // AI turns that happened before the claim opportunity
}

export default function WalkthroughMode({ rulesetMode }: WalkthroughModeProps) {
  const [state, setState] = useState<WalkthroughState | null>(null);
  const [viewTurnIndex, setViewTurnIndex] = useState(-1); // -1 = current live view

  const config = getRulesetConfig(rulesetMode);

  // Start a new game
  const startGame = useCallback(() => {
    const gameState = initializeGame({ seed: Date.now() });
    // Run AI turns before human's first turn (players 1, 2, 3 go first if East is player 0)
    // Actually in standard Mahjong, East (player 0) goes first. So human draws first.
    const humanTurn = simulateHumanDraw(gameState, rulesetMode);

    if (!humanTurn) {
      setState({
        gameState,
        allTurns: [],
        currentHumanTurn: null,
        phase: 'game-over',
        message: 'Wall is empty.',
        humanAnalysis: null,
        selectedTile: null,
        claimOptions: [],
        claimAnalyses: [],
        pendingAITurns: [],
      });
      return;
    }

    if (humanTurn.isWin) {
      setState({
        gameState,
        allTurns: [humanTurn],
        currentHumanTurn: humanTurn,
        phase: 'game-over',
        message: `You drew ${tileFullName(humanTurn.drawnTile)} and won on your first draw! Tsumo!`,
        humanAnalysis: null,
        selectedTile: null,
        claimOptions: [],
        claimAnalyses: [],
        pendingAITurns: [],
      });
      return;
    }

    setState({
      gameState,
      allTurns: [humanTurn],
      currentHumanTurn: humanTurn,
      phase: 'human-turn',
      message: `You drew ${tileFullName(humanTurn.drawnTile)}. Click on a tile to discard it.`,
      humanAnalysis: humanTurn.analysis ?? null,
      selectedTile: null,
      claimOptions: [],
      pendingAITurns: [],
    });
    setViewTurnIndex(-1);
  }, [rulesetMode]);

  // Step 1: Select a tile (highlight it, show confirm button)
  const handleTileSelect = useCallback((tile: TileIndex) => {
    if (!state || state.phase !== 'human-turn') return;
    setState({
      ...state,
      selectedTile: state.selectedTile === tile ? null : tile, // toggle
    });
  }, [state]);

  // Step 2: Confirm the discard
  const handleConfirmDiscard = useCallback(() => {
    if (!state || state.phase !== 'human-turn' || !state.currentHumanTurn || state.selectedTile === null) return;

    const tile = state.selectedTile;
    const gameState = state.gameState;

    // Execute the discard
    executeHumanDiscard(gameState, tile);

    // Update the current human turn record
    const updatedHumanTurn: GameTurn = {
      ...state.currentHumanTurn,
      discardedTile: tile,
      handAfter: cloneTileCounts(gameState.players[0].hand),
    };

    // Update dead tiles
    gameState.deadTiles = getDeadTiles(gameState);

    // Run AI turns one at a time, checking for claim opportunities after each
    const result = runAITurnsWithClaimCheck(gameState, rulesetMode);

    if (result.type === 'game-over') {
      setState({
        ...state,
        allTurns: [...state.allTurns.slice(0, -1), updatedHumanTurn, ...result.aiTurns],
        currentHumanTurn: null,
        phase: 'game-over',
        message: result.message,
        humanAnalysis: null,
        selectedTile: null,
        claimOptions: [],
        claimAnalyses: [],
        pendingAITurns: [],
      });
    } else if (result.type === 'claim-available') {
      // An AI discarded something the human can claim — analyze each option
      const lastAI = result.aiTurns[result.aiTurns.length - 1];
      const windName = ['East', 'South', 'West', 'North'][gameState.players[lastAI.player].seatWind];
      const ctx = buildGameContext(gameState, 0);
      const humanHand = gameState.players[0].hand;
      const analyses = result.claimOptions!.map(claim =>
        analyzeClaimDecision(humanHand, claim.tile, claim.type, claim.chowTiles, ctx, rulesetMode, gameState.deadTiles)
      );
      setState({
        ...state,
        allTurns: [...state.allTurns.slice(0, -1), updatedHumanTurn, ...result.aiTurns],
        currentHumanTurn: null,
        phase: 'claim-decision',
        message: `${windName} discarded ${tileFullName(lastAI.discardedTile!)}. You can claim this tile!`,
        humanAnalysis: null,
        selectedTile: null,
        claimOptions: result.claimOptions!,
        claimAnalyses: analyses,
        pendingAITurns: result.aiTurns,
      });
    } else {
      // Normal between-turns
      const aiDiscardMessages = result.aiTurns.map(t => {
        const windName = ['East', 'South', 'West', 'North'][gameState.players[t.player].seatWind];
        return `${windName} discarded ${tileFullName(t.discardedTile!)}`;
      });
      setState({
        ...state,
        allTurns: [...state.allTurns.slice(0, -1), updatedHumanTurn, ...result.aiTurns],
        currentHumanTurn: null,
        phase: 'between-turns',
        message: `You discarded ${tileFullName(tile)}. ${aiDiscardMessages.join('. ')}.`,
        humanAnalysis: null,
        selectedTile: null,
        claimOptions: [],
        claimAnalyses: [],
        pendingAITurns: [],
      });
    }
  }, [state, rulesetMode]);

  // Run AI turns one at a time, checking for human claim opportunities after each discard
  function runAITurnsWithClaimCheck(
    gameState: GameState,
    mode: RulesetMode
  ): {
    type: 'normal' | 'game-over' | 'claim-available';
    aiTurns: GameTurn[];
    message: string;
    claimOptions?: ClaimOption[];
  } {
    const aiTurns: GameTurn[] = [];

    // Move to next player after human
    gameState.currentPlayer = (gameState.currentPlayer + 1) % 4;

    while (gameState.currentPlayer !== 0) {
      const playerIdx = gameState.currentPlayer;
      const turn = simulateAITurn(gameState, playerIdx, mode);

      if (!turn) {
        return { type: 'game-over', aiTurns, message: 'Wall is empty. Draw game.' };
      }

      aiTurns.push(turn);
      gameState.turnNumber++;

      if (turn.isWin) {
        const windName = ['East', 'South', 'West', 'North'][gameState.players[playerIdx].seatWind];
        return { type: 'game-over', aiTurns, message: `${windName} won!` };
      }

      // Check if human can claim this discard (pong or chow)
      if (turn.discardedTile !== null) {
        const claims = getClaimOptions(gameState, turn.discardedTile, playerIdx);
        if (claims.length > 0) {
          // Pause to offer the claim — don't advance further
          return { type: 'claim-available', aiTurns, message: '', claimOptions: claims };
        }
      }

      gameState.currentPlayer = (gameState.currentPlayer + 1) % 4;
    }

    return { type: 'normal', aiTurns, message: '' };
  }

  // Handle claiming a discard (pong or chow)
  const handleClaim = useCallback((claim: ClaimOption) => {
    if (!state || state.phase !== 'claim-decision') return;

    const gameState = state.gameState;

    // Execute the claim
    executeClaim(gameState, claim);
    gameState.deadTiles = getDeadTiles(gameState);

    // Analyze the 14-tile hand (human now has 14 tiles and must discard)
    const ctx = buildGameContext(gameState, 0);
    const analysis = analyzeHand(
      cloneTileCounts(gameState.players[0].hand),
      ctx,
      rulesetMode,
      gameState.deadTiles
    );

    const claimDesc = claim.type === 'pong'
      ? `Pong! You claimed ${tileFullName(claim.tile)}.`
      : `Chow! You claimed ${tileFullName(claim.tile)}.`;

    setState({
      ...state,
      currentHumanTurn: {
        player: 0,
        drawnTile: claim.tile,
        discardedTile: null,
        handBefore: cloneTileCounts(gameState.players[0].hand), // already includes claimed tile
        handAfter: cloneTileCounts(gameState.players[0].hand),
        analysis,
        isWin: false,
        claim,
      },
      phase: 'human-turn',
      message: `${claimDesc} Click on a tile to discard it.`,
      humanAnalysis: analysis,
      selectedTile: null,
      claimOptions: [],
      claimAnalyses: [],
      pendingAITurns: [],
    });
  }, [state, rulesetMode]);

  // Skip the claim opportunity
  const handleSkipClaim = useCallback(() => {
    if (!state || state.phase !== 'claim-decision') return;

    const gameState = state.gameState;

    // Continue the remaining AI turns
    const result = runAITurnsWithClaimCheck(gameState, rulesetMode);

    if (result.type === 'game-over') {
      setState({
        ...state,
        allTurns: [...state.allTurns, ...result.aiTurns],
        phase: 'game-over',
        message: result.message,
        humanAnalysis: null,
        selectedTile: null,
        claimOptions: [],
        claimAnalyses: [],
        pendingAITurns: [],
      });
    } else if (result.type === 'claim-available') {
      const lastAI = result.aiTurns[result.aiTurns.length - 1];
      const windName = ['East', 'South', 'West', 'North'][gameState.players[lastAI.player].seatWind];
      const ctx = buildGameContext(gameState, 0);
      const humanHand = gameState.players[0].hand;
      const analyses = result.claimOptions!.map(claim =>
        analyzeClaimDecision(humanHand, claim.tile, claim.type, claim.chowTiles, ctx, rulesetMode, gameState.deadTiles)
      );
      setState({
        ...state,
        allTurns: [...state.allTurns, ...result.aiTurns],
        phase: 'claim-decision',
        message: `${windName} discarded ${tileFullName(lastAI.discardedTile!)}. You can claim this tile!`,
        claimOptions: result.claimOptions!,
        claimAnalyses: analyses,
        pendingAITurns: [...state.pendingAITurns, ...result.aiTurns],
        selectedTile: null,
      });
    } else {
      const allAI = [...state.pendingAITurns, ...result.aiTurns];
      const aiDiscardMessages = allAI.map(t => {
        const windName = ['East', 'South', 'West', 'North'][gameState.players[t.player].seatWind];
        return `${windName} discarded ${tileFullName(t.discardedTile!)}`;
      });
      setState({
        ...state,
        allTurns: [...state.allTurns, ...result.aiTurns],
        phase: 'between-turns',
        message: `${aiDiscardMessages.join('. ')}.`,
        humanAnalysis: null,
        selectedTile: null,
        claimOptions: [],
        claimAnalyses: [],
        pendingAITurns: [],
      });
    }
  }, [state, rulesetMode]);

  // Advance to human's next turn
  const nextTurn = useCallback(() => {
    if (!state || state.phase !== 'between-turns') return;

    const gameState = state.gameState;
    const humanTurn = simulateHumanDraw(gameState, rulesetMode);

    if (!humanTurn) {
      setState({
        ...state,
        phase: 'game-over',
        message: 'Wall is empty. Draw game.',
        humanAnalysis: null,
        selectedTile: null,
        claimOptions: [],
        claimAnalyses: [],
        pendingAITurns: [],
      });
      return;
    }

    if (humanTurn.isWin) {
      setState({
        ...state,
        allTurns: [...state.allTurns, humanTurn],
        currentHumanTurn: humanTurn,
        phase: 'game-over',
        message: `You drew ${tileFullName(humanTurn.drawnTile)} and won! Tsumo!`,
        humanAnalysis: null,
        selectedTile: null,
        claimOptions: [],
        claimAnalyses: [],
        pendingAITurns: [],
      });
      return;
    }

    setState({
      ...state,
      allTurns: [...state.allTurns, humanTurn],
      currentHumanTurn: humanTurn,
      phase: 'human-turn',
      message: `You drew ${tileFullName(humanTurn.drawnTile)}. Click on a tile to discard it.`,
      humanAnalysis: humanTurn.analysis ?? null,
      selectedTile: null,
      claimOptions: [],
      pendingAITurns: [],
    });
  }, [state, rulesetMode]);

  // Monte Carlo for current human turn
  const mcTiles = useMemo(() => {
    if (!state || state.phase !== 'human-turn' || !state.currentHumanTurn) return null;
    const hand = state.currentHumanTurn.handAfter;
    return totalTileCount(hand) === 14 ? hand : null;
  }, [state]);

  const mcCtx = useMemo(() => {
    if (!state || state.phase !== 'human-turn') return null;
    return buildGameContext(state.gameState, 0);
  }, [state]);

  const {
    results: mcResults,
    progress: mcProgress,
    isRunning: mcRunning,
    error: mcError,
    method: mcMethod,
    shanten: mcShanten,
    run: runMC,
  } = useMonteCarloAnalysis(mcTiles, mcCtx, rulesetMode, 300, false);

  // Count human's turns for display
  const humanTurnCount = state ? state.allTurns.filter(t => t.player === 0).length : 0;

  return (
    <div className="p-4 space-y-4 pb-24">
      <h1 className="text-lg font-bold text-slate-200">Walkthrough (4-Player Game)</h1>

      {/* Start button */}
      {(!state || state.phase === 'game-over') && (
        <button
          onClick={startGame}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg text-sm"
        >
          {state ? 'New Game' : 'Start Game'}
        </button>
      )}

      {state && (
        <>
          {/* Status message (non-turn info) */}
          {state.phase !== 'human-turn' && (
            <div className="bg-slate-800/60 rounded-lg p-3">
              <GlossaryLinkedText
                text={state.message}
                className="text-sm text-slate-300 leading-relaxed"
              />
            </div>
          )}

          {/* Table View with all rivers and human's hand */}
          <TableView
            gameState={state.gameState}
            humanHand={
              state.currentHumanTurn
                ? state.currentHumanTurn.handAfter
                : state.gameState.players[0].hand
            }
            drawnTile={
              state.phase === 'human-turn' && state.currentHumanTurn
                ? state.currentHumanTurn.drawnTile
                : undefined
            }
            selectedTile={state.selectedTile ?? undefined}
            dangerTiles={
              state.humanAnalysis
                ? [state.humanAnalysis.bestDiscard]
                : []
            }
            onTileClick={state.phase === 'human-turn' ? handleTileSelect : undefined}
            prompt={state.phase === 'human-turn' ? state.message : undefined}
          >
            {/* Center area: dead tile summary */}
            <div className="bg-slate-800/40 rounded-lg p-2 text-center">
              <div className="text-xs text-slate-500 mb-1">Dead Tiles</div>
              <div className="text-xs text-slate-400">
                {(() => {
                  const dead = state.gameState.deadTiles;
                  let total = 0;
                  for (let i = 0; i < 34; i++) total += dead[i];
                  return `${total} tiles in rivers`;
                })()}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Turn {humanTurnCount} | Wall: {getWallRemaining(state.gameState)}
              </div>
            </div>
          </TableView>

          {/* Confirm discard button (two-step process) */}
          {state.phase === 'human-turn' && state.selectedTile !== null && (
            <div className="flex gap-2">
              <button
                onClick={handleConfirmDiscard}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2"
              >
                Discard {tileFullName(state.selectedTile)}
                <TileSVG tile={state.selectedTile} size="sm" danger />
              </button>
              <button
                onClick={() => setState({ ...state, selectedTile: null })}
                className="bg-slate-700 hover:bg-slate-600 text-slate-300 py-3 px-4 rounded-lg text-sm"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Claim decision: pong/chow/skip with analysis */}
          {state.phase === 'claim-decision' && state.claimOptions.length > 0 && (
            <div className="space-y-3">
              {/* Header */}
              <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-4">
                <div className="text-base font-bold text-amber-300 text-center">
                  {state.message}
                </div>
              </div>

              {/* Analysis for each claim option */}
              {state.claimOptions.map((claim, idx) => {
                const analysis = state.claimAnalyses[idx];
                const isRecommended = analysis?.recommendation === 'claim';
                const desc = claim.type === 'pong'
                  ? `Pong — take ${tileFullName(claim.tile)} to form a triplet`
                  : `Chow — take ${tileFullName(claim.tile)} to form ${claim.chowTiles ? [...claim.chowTiles, claim.tile].sort((a, b) => a - b).map(t => tileFullName(t)).join(', ') : 'a sequence'}`;

                return (
                  <div key={idx} className={`rounded-lg p-3 ${isRecommended ? 'bg-green-900/20 border border-green-700/40' : 'bg-slate-800/50 border border-slate-700/40'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <TileSVG tile={claim.tile} size="sm" highlighted />
                      <span className="text-sm font-medium text-slate-200">{desc}</span>
                      {isRecommended && (
                        <span className="text-[10px] bg-green-700/50 text-green-300 px-1.5 py-0.5 rounded font-bold ml-auto">RECOMMENDED</span>
                      )}
                    </div>
                    {analysis && (
                      <div className="text-xs text-slate-400 leading-relaxed whitespace-pre-line mb-2">
                        <GlossaryLinkedText text={analysis.explanation} className="text-xs text-slate-400 leading-relaxed" />
                      </div>
                    )}
                    <button
                      onClick={() => handleClaim(claim)}
                      className={`w-full py-2 rounded-lg text-sm font-medium ${
                        isRecommended
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-amber-600 hover:bg-amber-700 text-white'
                      }`}
                    >
                      Claim {claim.type === 'pong' ? 'Pong' : 'Chow'}
                    </button>
                  </div>
                );
              })}

              {/* Skip option with analysis */}
              {(() => {
                const anyRecommendsSkip = state.claimAnalyses.some(a => a?.recommendation === 'skip');
                return (
                  <div className={`rounded-lg p-3 ${anyRecommendsSkip ? 'bg-blue-900/20 border border-blue-700/40' : 'bg-slate-800/50 border border-slate-700/40'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-slate-200">Skip — keep hand concealed</span>
                      {anyRecommendsSkip && (
                        <span className="text-[10px] bg-blue-700/50 text-blue-300 px-1.5 py-0.5 rounded font-bold ml-auto">RECOMMENDED</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mb-2">
                      Keeps Concealed Hand + Self-Drawn potential (2 {getRulesetConfig(rulesetMode).unit} combined). Your hand stays flexible for higher-scoring patterns.
                      {state.claimAnalyses[0] && state.claimAnalyses[0].skipPaths.length > 0 && (
                        <span> Concealed paths: {state.claimAnalyses[0].skipPaths.slice(0, 3).map(p => `${p.name} (${p.fan} ${getRulesetConfig(rulesetMode).unit})`).join(', ')}.</span>
                      )}
                    </div>
                    <button
                      onClick={handleSkipClaim}
                      className={`w-full py-2 rounded-lg text-sm ${
                        anyRecommendsSkip
                          ? 'bg-blue-600 hover:bg-blue-700 text-white font-medium'
                          : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                      }`}
                    >
                      Skip
                    </button>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Between turns: show AI actions and advance button */}
          {state.phase === 'between-turns' && (
            <button
              onClick={nextTurn}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg text-sm"
            >
              Draw Next Tile
            </button>
          )}

          {/* Game over */}
          {state.phase === 'game-over' && (
            <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-amber-400">Game Over</div>
              <div className="text-sm text-slate-300 mt-1">{state.message}</div>
            </div>
          )}

          {/* Analysis section (during human's turn) */}
          {state.phase === 'human-turn' && state.humanAnalysis && (
            <>
              {/* Strategy explanation */}
              <div className="bg-slate-800/50 rounded-lg p-3">
                <h3 className="text-sm font-medium text-slate-300 mb-1">Analysis</h3>
                <GlossaryLinkedText
                  text={state.humanAnalysis.handAnalysis}
                  className="text-xs text-slate-400 leading-relaxed whitespace-pre-line"
                />
              </div>

              {/* Discard recommendation */}
              <div className="bg-slate-800/50 rounded-lg p-3">
                <h3 className="text-sm font-medium text-slate-300 mb-1">
                  Recommended: discard {tileFullName(state.humanAnalysis.bestDiscard)}
                </h3>
                <div className="flex items-center gap-2 mb-2">
                  <TileSVG tile={state.humanAnalysis.bestDiscard} size="md" danger />
                  <div className="text-xs text-slate-400">
                    {state.humanAnalysis.discards[0]?.explanation}
                  </div>
                </div>
                {state.humanAnalysis.winningPaths.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-600/50">
                    <div className="text-xs text-slate-400 font-medium mb-1">Building toward:</div>
                    {state.humanAnalysis.winningPaths.slice(0, 2).map((path, idx) => (
                      <div key={idx} className="text-xs text-slate-400 mt-1">
                        <span className="text-amber-400 font-bold">{path.fan} {config.unit}</span>{' '}
                        <GlossaryLinkedText
                          text={`${path.name} — ${path.description}`}
                          className="text-slate-300"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Full discard analysis */}
              <AnalysisPanel result={state.humanAnalysis} showTopN={3} showPaths={false} />

              {/* Monte Carlo */}
              {mcTiles && (
                <MonteCarloPanel
                  results={mcResults}
                  progress={mcProgress}
                  isRunning={mcRunning}
                  error={mcError}
                  rulesetMode={rulesetMode}
                  method={mcMethod}
                  shanten={mcShanten}
                  onRun={runMC}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
