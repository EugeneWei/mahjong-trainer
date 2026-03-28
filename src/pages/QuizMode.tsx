import { useState, useCallback, useMemo } from 'react';
import TileRow from '../components/tiles/TileRow';
import TileSVG from '../components/tiles/TileSVG';
import GameContextPanel from '../components/input/GameContext';
import AnalysisPanel from '../components/analysis/AnalysisPanel';
import MonteCarloPanel from '../components/analysis/MonteCarloPanel';
import {
  cloneTileCounts,
  type TileIndex,
} from '../engine/tiles';
import { createDefaultGameContext, type GameContext } from '../engine/hand';
import { analyzeHand, tileFullName } from '../engine/analysis';
import { generateHandForPhase, type GamePhase } from '../engine/generator';
import type { AnalysisResult } from '../engine/analysis';
import type { RulesetMode } from '../engine/rulesets';
import GlossaryLinkedText from '../components/shared/GlossaryLinkedText';
import { useMonteCarloAnalysis } from '../hooks/useMonteCarloAnalysis';

interface QuizModeProps {
  rulesetMode: RulesetMode;
}

interface QuizState {
  tiles: number[];
  gameCtx: GameContext;
  analysis: AnalysisResult;
  answered: boolean;
  selectedTile: TileIndex | null;
  isCorrect: boolean;
}

export default function QuizMode({ rulesetMode }: QuizModeProps) {
  const [phase, setPhase] = useState<GamePhase>('early');
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });

  const generateQuiz = useCallback(() => {
    const result = generateHandForPhase({ phase });
    const tiles14 = cloneTileCounts(result.tiles);
    for (let i = 0; i < 34; i++) {
      if (tiles14[i] < 4) {
        tiles14[i]++;
        break;
      }
    }

    const ctx: GameContext = {
      ...createDefaultGameContext(),
      wallRemaining: result.wallRemaining,
    };

    const analysis = analyzeHand(cloneTileCounts(tiles14), ctx, rulesetMode);

    setQuiz({
      tiles: tiles14,
      gameCtx: ctx,
      analysis,
      answered: false,
      selectedTile: null,
      isCorrect: false,
    });
  }, [phase, rulesetMode]);

  // Monte Carlo — runs only after answer is revealed
  const mcTiles = useMemo(
    () => (quiz?.answered ? quiz.tiles : null),
    [quiz?.answered, quiz?.tiles],
  );
  const mcCtx = useMemo(
    () => (quiz?.answered ? quiz.gameCtx : null),
    [quiz?.answered, quiz?.gameCtx],
  );
  const {
    results: mcResults,
    progress: mcProgress,
    isRunning: mcRunning,
    error: mcError,
    run: runMC,
  } = useMonteCarloAnalysis(mcTiles, mcCtx, rulesetMode, 500, true);

  const handleDiscard = (tile: TileIndex) => {
    if (!quiz || quiz.answered) return;

    const isCorrect = tile === quiz.analysis.bestDiscard;
    setQuiz({ ...quiz, answered: true, selectedTile: tile, isCorrect });
    setStats((s) => ({
      correct: s.correct + (isCorrect ? 1 : 0),
      total: s.total + 1,
    }));
  };

  return (
    <div className="p-4 space-y-4 pb-24">
      <h1 className="text-lg font-bold text-slate-200">Quiz Mode</h1>

      {/* Phase selector + stats */}
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
        <span className="ml-auto text-xs text-slate-400">
          {stats.correct}/{stats.total} correct
          {stats.total > 0 && ` (${Math.round((stats.correct / stats.total) * 100)}%)`}
        </span>
      </div>

      {/* Generate button */}
      {!quiz && (
        <button
          onClick={generateQuiz}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg text-sm"
        >
          Start Quiz
        </button>
      )}

      {quiz && (
        <>
          {/* Game context (read-only) */}
          <GameContextPanel context={quiz.gameCtx} onChange={() => {}} readOnly />

          {/* The hand */}
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-400 mb-2">
              {quiz.answered ? 'Result' : 'Which tile would you discard? Tap to select.'}
            </div>
            <TileRow
              tiles={quiz.tiles}
              size="lg"
              selectedTile={quiz.selectedTile}
              dangerTiles={quiz.answered ? [quiz.analysis.bestDiscard] : []}
              onTileClick={quiz.answered ? undefined : handleDiscard}
            />
          </div>

          {/* Feedback */}
          {quiz.answered && (
            <div className="space-y-3">
              <div
                className={`rounded-lg p-3 ${
                  quiz.isCorrect
                    ? 'bg-green-900/30 border border-green-700/50'
                    : 'bg-red-900/30 border border-red-700/50'
                }`}
              >
                <div className="text-lg font-bold text-center">
                  {quiz.isCorrect ? 'Correct!' : 'Not optimal'}
                </div>
                <div className="flex items-center justify-center gap-2 mt-2 text-sm text-slate-300">
                  <span>Best discard:</span>
                  <TileSVG tile={quiz.analysis.bestDiscard} size="md" danger />
                  <span className="font-medium">{tileFullName(quiz.analysis.bestDiscard)}</span>
                </div>

                {/* Target hand explanation */}
                {quiz.analysis.winningPaths.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-600/50">
                    <div className="text-xs text-slate-400 mb-1 font-medium">What you're building toward:</div>
                    {quiz.analysis.winningPaths.slice(0, 2).map((path, idx) => (
                      <div key={idx} className="text-xs text-slate-400 mt-1">
                        <span className="text-amber-400 font-bold">{path.fan} fan</span>{' '}
                        <GlossaryLinkedText text={`${path.name} — ${path.description}`} className="text-slate-300" />
                      </div>
                    ))}
                  </div>
                )}

                {/* Best discard's reachable hands */}
                {quiz.analysis.discards[0]?.reachableHands.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-600/50">
                    <div className="text-xs text-slate-400 mb-1 font-medium">Winning tiles after this discard:</div>
                    {quiz.analysis.discards[0].reachableHands.slice(0, 3).map((h, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs mt-1">
                        <TileSVG tile={h.winningTile} size="sm" highlighted={h.fanValue >= 3} />
                        <span className="text-slate-300">{h.description}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <AnalysisPanel result={quiz.analysis} showTopN={3} showPaths={false} />

              <MonteCarloPanel
                results={mcResults}
                progress={mcProgress}
                isRunning={mcRunning}
                error={mcError}
                rulesetMode={rulesetMode}
                onRun={runMC}
              />

              <button
                onClick={generateQuiz}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg text-sm"
              >
                Next Hand
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
