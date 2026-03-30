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
import { tileFullName } from '../engine/analysis';
import type { AnalysisResult } from '../engine/analysis';
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
  type GameState,
  type GameTurn,
} from '../engine/game-sim';

interface WalkthroughModeProps {
  rulesetMode: RulesetMode;
}

type WalkthroughPhase = 'setup' | 'human-turn' | 'between-turns' | 'game-over';

interface WalkthroughState {
  gameState: GameState;
  allTurns: GameTurn[];       // all turns so far
  currentHumanTurn: GameTurn | null;
  phase: WalkthroughPhase;
  message: string;
  humanAnalysis: AnalysisResult | null;
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
      });
      return;
    }

    setState({
      gameState,
      allTurns: [humanTurn],
      currentHumanTurn: humanTurn,
      phase: 'human-turn',
      message: `You drew ${tileFullName(humanTurn.drawnTile)}. Choose a tile to discard.`,
      humanAnalysis: humanTurn.analysis ?? null,
    });
    setViewTurnIndex(-1);
  }, [rulesetMode]);

  // Human discards a tile
  const handleDiscard = useCallback((tile: TileIndex) => {
    if (!state || state.phase !== 'human-turn' || !state.currentHumanTurn) return;

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

    // Run AI turns
    const aiTurns = advanceAITurns(gameState, rulesetMode);

    // Check if any AI won
    const aiWinner = aiTurns.find(t => t.isWin);
    if (aiWinner) {
      setState({
        ...state,
        allTurns: [...state.allTurns.slice(0, -1), updatedHumanTurn, ...aiTurns],
        currentHumanTurn: null,
        phase: 'game-over',
        message: `Player ${aiWinner.player} (${['East', 'South', 'West', 'North'][gameState.players[aiWinner.player].seatWind]}) won!`,
        humanAnalysis: null,
      });
      return;
    }

    // Check if wall is empty
    if (getWallRemaining(gameState) === 0) {
      setState({
        ...state,
        allTurns: [...state.allTurns.slice(0, -1), updatedHumanTurn, ...aiTurns],
        currentHumanTurn: null,
        phase: 'game-over',
        message: 'Wall is empty. Draw game.',
        humanAnalysis: null,
      });
      return;
    }

    // Show what the AIs did before human's next turn
    const aiDiscardMessages = aiTurns.map(t => {
      const windName = ['East', 'South', 'West', 'North'][gameState.players[t.player].seatWind];
      return `${windName} discarded ${tileFullName(t.discardedTile!)}`;
    });

    setState({
      ...state,
      allTurns: [...state.allTurns.slice(0, -1), updatedHumanTurn, ...aiTurns],
      currentHumanTurn: null,
      phase: 'between-turns',
      message: `You discarded ${tileFullName(tile)}. ${aiDiscardMessages.join('. ')}.`,
      humanAnalysis: null,
    });
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
      });
      return;
    }

    setState({
      ...state,
      allTurns: [...state.allTurns, humanTurn],
      currentHumanTurn: humanTurn,
      phase: 'human-turn',
      message: `You drew ${tileFullName(humanTurn.drawnTile)}. Choose a tile to discard.`,
      humanAnalysis: humanTurn.analysis ?? null,
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
          {/* Message */}
          <div className="bg-slate-800/60 rounded-lg p-3">
            <GlossaryLinkedText
              text={state.message}
              className="text-sm text-slate-300 leading-relaxed"
            />
          </div>

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
            dangerTiles={
              state.humanAnalysis
                ? [state.humanAnalysis.bestDiscard]
                : []
            }
            onTileClick={state.phase === 'human-turn' ? handleDiscard : undefined}
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
