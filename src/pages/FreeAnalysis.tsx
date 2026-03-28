import { useState, useCallback, useMemo } from 'react';
import TileRow from '../components/tiles/TileRow';
import TilePicker from '../components/tiles/TilePicker';
import ShorthandField from '../components/input/ShorthandField';
import GameContextPanel from '../components/input/GameContext';
import AnalysisPanel from '../components/analysis/AnalysisPanel';
import MonteCarloPanel from '../components/analysis/MonteCarloPanel';
import {
  createEmptyTileCounts,
  totalTileCount,
  cloneTileCounts,
  type TileCounts,
} from '../engine/tiles';
import { createDefaultGameContext, type GameContext } from '../engine/hand';
import { analyzeHand, describeHandStrategy } from '../engine/analysis';
import { generateRandomHand } from '../engine/generator';
import type { AnalysisResult } from '../engine/analysis';
import type { RulesetMode } from '../engine/rulesets';
import GlossaryLinkedText from '../components/shared/GlossaryLinkedText';
import { useMonteCarloAnalysis } from '../hooks/useMonteCarloAnalysis';

interface FreeAnalysisProps {
  rulesetMode: RulesetMode;
}

export default function FreeAnalysis({ rulesetMode }: FreeAnalysisProps) {
  const [tiles, setTiles] = useState<TileCounts>(createEmptyTileCounts());
  const [gameCtx, setGameCtx] = useState<GameContext>(createDefaultGameContext());
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [strategy, setStrategy] = useState('');
  const [inputMode, setInputMode] = useState<'picker' | 'text'>('picker');

  const count = totalTileCount(tiles);

  // Monte Carlo hook — only active when we have a 14-tile hand
  const mcTiles = useMemo(() => (count === 14 ? tiles : null), [tiles, count]);
  const mcCtx = useMemo(() => (count === 14 ? gameCtx : null), [gameCtx, count]);
  const {
    results: mcResults,
    progress: mcProgress,
    isRunning: mcRunning,
    error: mcError,
    method: mcMethod,
    shanten: mcShanten,
    run: runMC,
  } = useMonteCarloAnalysis(mcTiles, mcCtx, rulesetMode, 500, true);

  const runAnalysis = useCallback(
    (hand: TileCounts, ctx: GameContext) => {
      const c = totalTileCount(hand);
      if (c === 14) {
        const result = analyzeHand(cloneTileCounts(hand), ctx, rulesetMode);
        setAnalysis(result);
        setStrategy('');
      } else if (c === 13) {
        setStrategy(describeHandStrategy(hand, ctx, rulesetMode));
        setAnalysis(null);
      } else {
        setAnalysis(null);
        setStrategy('');
      }
    },
    [rulesetMode]
  );

  const handleTileAdd = (tile: number) => {
    if (count >= 14) return;
    const next = cloneTileCounts(tiles);
    next[tile]++;
    setTiles(next);
    runAnalysis(next, gameCtx);
  };

  const handleTileRemove = (tile: number) => {
    if (tiles[tile] <= 0) return;
    const next = cloneTileCounts(tiles);
    next[tile]--;
    setTiles(next);
    runAnalysis(next, gameCtx);
  };

  const handleShorthandChange = (newTiles: TileCounts) => {
    setTiles(newTiles);
    runAnalysis(newTiles, gameCtx);
  };

  const handleContextChange = (ctx: GameContext) => {
    setGameCtx(ctx);
    runAnalysis(tiles, ctx);
  };

  const handleGenerate = () => {
    const hand = generateRandomHand();
    setTiles(hand);
    runAnalysis(hand, gameCtx);
  };

  const handleClear = () => {
    setTiles(createEmptyTileCounts());
    setAnalysis(null);
    setStrategy('');
  };

  return (
    <div className="p-4 space-y-4 pb-24">
      <h1 className="text-lg font-bold text-slate-200">Free Analysis</h1>

      {/* Hand display */}
      <div className="bg-slate-800/50 rounded-lg p-3">
        <div className="text-xs text-slate-400 mb-2">
          Your Hand ({count}/14 tiles)
          {count === 13 && ' — add one more tile to see discard analysis'}
        </div>
        {count > 0 ? (
          <TileRow tiles={tiles} size="lg" onTileClick={handleTileRemove} />
        ) : (
          <div className="text-sm text-slate-500 py-4 text-center">
            Add tiles using the picker below, type shorthand notation, or generate a random hand
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleGenerate}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 px-3 rounded-lg"
        >
          Random Hand
        </button>
        <button
          onClick={handleClear}
          className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm py-2 px-3 rounded-lg"
        >
          Clear
        </button>
        <button
          onClick={() => setInputMode(inputMode === 'picker' ? 'text' : 'picker')}
          className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm py-2 px-3 rounded-lg"
        >
          {inputMode === 'picker' ? 'Text' : 'Tiles'}
        </button>
      </div>

      {/* Input area */}
      {inputMode === 'picker' ? (
        <TilePicker
          currentHand={tiles}
          onTileAdd={handleTileAdd}
          onTileRemove={handleTileRemove}
          maxTiles={14}
          currentCount={count}
        />
      ) : (
        <ShorthandField onHandChange={handleShorthandChange} currentHand={tiles} />
      )}

      {/* Game context */}
      <GameContextPanel context={gameCtx} onChange={handleContextChange} />

      {/* Strategy description for 13-tile hands */}
      {strategy && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <h3 className="text-sm font-medium text-slate-300 mb-1">Hand Strategy</h3>
          <GlossaryLinkedText text={strategy} className="text-xs text-slate-400 leading-relaxed" />
        </div>
      )}

      {/* Full analysis for 14-tile hands */}
      {analysis && <AnalysisPanel result={analysis} />}

      {/* Monte Carlo simulation */}
      {count === 14 && (
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

      {/* Suit legend */}
      <div className="bg-slate-800/30 rounded-lg p-3">
        <h3 className="text-xs font-medium text-slate-500 mb-1">Tile Suit Guide</h3>
        <div className="text-xs text-slate-500 space-y-0.5">
          <div><span className="text-green-400 font-medium">Bam</span> = Bamboo (green, numbered 1-9)</div>
          <div><span className="text-red-400 font-medium">Wan</span> = Characters/Wan (red, numbered 1-9)</div>
          <div><span className="text-blue-400 font-medium">Dot</span> = Dots/Circles (blue, numbered 1-9)</div>
          <div><span className="text-slate-400 font-medium">E S W N</span> = Wind tiles (East, South, West, North)</div>
          <div><span className="text-slate-400 font-medium">中 發 白</span> = Dragon tiles (Red, Green, White)</div>
        </div>
        <div className="text-xs text-slate-600 mt-1">
          Shorthand: 123m = 1-2-3 Bamboo, 456p = 4-5-6 Characters, 789s = 7-8-9 Dots
        </div>
      </div>
    </div>
  );
}
