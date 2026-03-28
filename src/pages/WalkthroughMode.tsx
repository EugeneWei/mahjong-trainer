import { useState, useCallback, useMemo } from 'react';
import TileRow from '../components/tiles/TileRow';
import TileSVG from '../components/tiles/TileSVG';
import GameContextPanel from '../components/input/GameContext';
import AnalysisPanel from '../components/analysis/AnalysisPanel';
import MonteCarloPanel from '../components/analysis/MonteCarloPanel';
import {
  cloneTileCounts,
  TILES_PER_TYPE,
  totalTileCount,
  type TileCounts,
} from '../engine/tiles';
import { createDefaultGameContext, type GameContext } from '../engine/hand';
import { analyzeHand, describeHandStrategy, tileFullName } from '../engine/analysis';
import { generateHandForPhase, SeededRNG, type GamePhase } from '../engine/generator';
import { calculateShanten } from '../engine/shanten';
import type { AnalysisResult } from '../engine/analysis';
import type { RulesetMode } from '../engine/rulesets';
import { getRulesetConfig } from '../engine/rulesets';
import GlossaryLinkedText from '../components/shared/GlossaryLinkedText';
import { useMonteCarloAnalysis } from '../hooks/useMonteCarloAnalysis';

interface WalkthroughModeProps {
  rulesetMode: RulesetMode;
}

interface Turn {
  tiles: TileCounts; // 14-tile hand (including drawn tile), or 13 for opening
  handBeforeDraw: TileCounts | null; // 13-tile hand before drawing (for display)
  drawnTile: number | null;
  discardedTile: number | null;
  analysis: AnalysisResult | null;
  strategy: string;
  wallRemaining: number;
}

export default function WalkthroughMode({ rulesetMode }: WalkthroughModeProps) {
  const [phase, setPhase] = useState<GamePhase>('early');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [currentTurn, setCurrentTurn] = useState(0);

  const config = getRulesetConfig(rulesetMode);

  const generateWalkthrough = useCallback(() => {
    const result = generateHandForPhase({ phase });
    const rng = new SeededRNG(Date.now());
    const newTurns: Turn[] = [];
    let currentTiles = cloneTileCounts(result.tiles);
    let wall = result.wallRemaining;

    const ctx0: GameContext = {
      ...createDefaultGameContext(),
      wallRemaining: wall,
    };
    newTurns.push({
      tiles: cloneTileCounts(currentTiles),
      handBeforeDraw: null,
      drawnTile: null,
      discardedTile: null,
      analysis: null,
      strategy: describeHandStrategy(currentTiles, ctx0, rulesetMode),
      wallRemaining: wall,
    });

    for (let turn = 0; turn < 10 && wall > 0; turn++) {
      const available: number[] = [];
      for (let i = 0; i < 34; i++) {
        const rem = TILES_PER_TYPE - currentTiles[i];
        for (let j = 0; j < rem; j++) available.push(i);
      }
      if (available.length === 0) break;

      const handBefore = cloneTileCounts(currentTiles);
      const drawn = available[rng.randomInt(available.length)];
      currentTiles[drawn]++;
      wall--;

      const ctx: GameContext = {
        ...createDefaultGameContext(),
        wallRemaining: wall,
      };

      if (calculateShanten(currentTiles, config.sevenPairsEnabled) === -1) {
        newTurns.push({
          tiles: cloneTileCounts(currentTiles),
          handBeforeDraw: handBefore,
          drawnTile: drawn,
          discardedTile: null,
          analysis: null,
          strategy: `Winning hand! Drew ${tileFullName(drawn)} to complete the hand. Tsumo!`,
          wallRemaining: wall,
        });
        break;
      }

      const analysis = analyzeHand(cloneTileCounts(currentTiles), ctx, rulesetMode);
      const discard = analysis.bestDiscard;

      newTurns.push({
        tiles: cloneTileCounts(currentTiles),
        handBeforeDraw: handBefore,
        drawnTile: drawn,
        discardedTile: discard,
        analysis,
        strategy: describeHandStrategy(currentTiles, ctx, rulesetMode),
        wallRemaining: wall,
      });

      currentTiles[discard]--;
    }

    setTurns(newTurns);
    setCurrentTurn(0);
  }, [phase, rulesetMode, config.sevenPairsEnabled]);

  const turn = turns[currentTurn];

  // Monte Carlo for current turn (if it has a 14-tile hand with analysis)
  const mcTiles = useMemo(
    () => (turn && turn.analysis && totalTileCount(turn.tiles) === 14 ? turn.tiles : null),
    [turn],
  );
  const mcCtx = useMemo(
    () => (turn && turn.analysis ? { ...createDefaultGameContext(), wallRemaining: turn.wallRemaining } : null),
    [turn],
  );
  const {
    results: mcResults,
    progress: mcProgress,
    isRunning: mcRunning,
    error: mcError,
    run: runMC,
  } = useMonteCarloAnalysis(mcTiles, mcCtx, rulesetMode, 300, false);

  return (
    <div className="p-4 space-y-4 pb-24">
      <h1 className="text-lg font-bold text-slate-200">Walkthrough</h1>

      {/* Phase selector */}
      <div className="flex items-center gap-2">
        {(['early', 'mid', 'late'] as GamePhase[]).map((p) => (
          <button
            key={p}
            onClick={() => setPhase(p)}
            className={`px-3 py-1 text-sm rounded-lg ${
              phase === p ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'
            }`}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      <button
        onClick={generateWalkthrough}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg text-sm"
      >
        Generate Walkthrough
      </button>

      {turn && (
        <>
          {/* Turn navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentTurn(Math.max(0, currentTurn - 1))}
              disabled={currentTurn === 0}
              className="px-3 py-1.5 text-sm bg-slate-700 rounded disabled:opacity-30 text-slate-300"
            >
              Prev
            </button>
            <span className="text-sm text-slate-400">
              Turn {currentTurn}/{turns.length - 1}
            </span>
            <button
              onClick={() => setCurrentTurn(Math.min(turns.length - 1, currentTurn + 1))}
              disabled={currentTurn === turns.length - 1}
              className="px-3 py-1.5 text-sm bg-slate-700 rounded disabled:opacity-30 text-slate-300"
            >
              Next
            </button>
          </div>

          {/* Game context */}
          <GameContextPanel
            context={{ ...createDefaultGameContext(), wallRemaining: turn.wallRemaining }}
            onChange={() => {}}
            readOnly
          />

          {/* Hand display */}
          <div className="bg-slate-800/50 rounded-lg p-3">
            {currentTurn === 0 ? (
              <>
                <div className="text-xs text-slate-400 mb-2">Opening Hand (13 tiles)</div>
                <TileRow tiles={turn.tiles} size="lg" />
              </>
            ) : turn.drawnTile !== null ? (
              <>
                <div className="text-xs text-slate-400 mb-2">
                  {turn.discardedTile !== null
                    ? `Drew ${tileFullName(turn.drawnTile)} — discard ${tileFullName(turn.discardedTile)} (red outline)`
                    : `Drew ${tileFullName(turn.drawnTile)} — winning tile!`}
                </div>
                <TileRow
                  tiles={turn.tiles}
                  size="lg"
                  drawnTile={turn.drawnTile}
                  dangerTiles={turn.discardedTile !== null ? [turn.discardedTile] : []}
                />
              </>
            ) : (
              <TileRow tiles={turn.tiles} size="lg" />
            )}
          </div>

          {/* Strategy explanation */}
          <div className="bg-slate-800/50 rounded-lg p-3">
            <h3 className="text-sm font-medium text-slate-300 mb-1">Strategy</h3>
            <GlossaryLinkedText text={turn.strategy} className="text-xs text-slate-400 leading-relaxed" />
          </div>

          {/* Discard explanation */}
          {turn.discardedTile !== null && turn.analysis && (
            <div className="bg-slate-800/50 rounded-lg p-3">
              <h3 className="text-sm font-medium text-slate-300 mb-1">Why discard {tileFullName(turn.discardedTile)}?</h3>
              <div className="flex items-center gap-2 mb-2">
                <TileSVG tile={turn.discardedTile} size="md" danger />
                <div className="text-xs text-slate-400">
                  {turn.analysis.discards[0]?.explanation}
                </div>
              </div>
              {turn.analysis.winningPaths.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-600/50">
                  <div className="text-xs text-slate-400 font-medium mb-1">Building toward:</div>
                  {turn.analysis.winningPaths.slice(0, 2).map((path, idx) => (
                    <div key={idx} className="text-xs text-slate-400 mt-1">
                      <span className="text-amber-400 font-bold">{path.fan} fan</span>{' '}
                      <GlossaryLinkedText text={`${path.name} — ${path.description}`} className="text-slate-300" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Full analysis */}
          {turn.analysis && <AnalysisPanel result={turn.analysis} showTopN={3} showPaths={false} />}

          {/* Monte Carlo */}
          {turn.analysis && totalTileCount(turn.tiles) === 14 && (
            <MonteCarloPanel
              results={mcResults}
              progress={mcProgress}
              isRunning={mcRunning}
              error={mcError}
              rulesetMode={rulesetMode}
              onRun={runMC}
            />
          )}
        </>
      )}
    </div>
  );
}
