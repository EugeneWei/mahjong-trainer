import { useState, useCallback, useMemo } from 'react';
import TileRow from '../components/tiles/TileRow';
import TileSVG from '../components/tiles/TileSVG';
import DiscardRiver from '../components/tiles/DiscardRiver';
import GameContextPanel from '../components/input/GameContext';
import AnalysisPanel from '../components/analysis/AnalysisPanel';
import MonteCarloPanel from '../components/analysis/MonteCarloPanel';
import {
  cloneTileCounts,
  createEmptyTileCounts,
  type TileIndex,
  type TileCounts,
  NUM_TILE_TYPES,
  TILES_PER_TYPE,
} from '../engine/tiles';
import { createDefaultGameContext, type GameContext } from '../engine/hand';
import { analyzeHand, tileFullName } from '../engine/analysis';
import { generateHandForPhase, SeededRNG, type GamePhase } from '../engine/generator';
import type { AnalysisResult } from '../engine/analysis';
import type { RulesetMode } from '../engine/rulesets';
import { getRulesetConfig } from '../engine/rulesets';
import GlossaryLinkedText from '../components/shared/GlossaryLinkedText';
import { useMonteCarloAnalysis } from '../hooks/useMonteCarloAnalysis';
import { fastPickDiscard } from '../engine/montecarlo';
import { calculateShanten } from '../engine/shanten';

interface QuizModeProps {
  rulesetMode: RulesetMode;
}

interface QuizState {
  tiles: TileCounts;
  gameCtx: GameContext;
  analysis: AnalysisResult;
  answered: boolean;
  selectedTile: TileIndex | null;
  isCorrect: boolean;
  // Discard rivers from simulated opponents
  rivers: TileIndex[][];      // 3 opponent rivers
  deadTiles: TileCounts;      // aggregated dead tiles
  hasRivers: boolean;         // whether this quiz includes river context
}

/** Generate partial game rivers for quiz context */
function generateQuizRivers(
  humanHand: TileCounts,
  rulesetMode: RulesetMode,
  rng: SeededRNG,
): { rivers: TileIndex[][]; deadTiles: TileCounts } {
  const config = getRulesetConfig(rulesetMode);
  const includeSevenPairs = config.sevenPairsEnabled;

  // Build a wall minus the human's hand
  const wall: TileIndex[] = [];
  const used = cloneTileCounts(humanHand);
  for (let i = 0; i < NUM_TILE_TYPES; i++) {
    const remaining = TILES_PER_TYPE - used[i];
    for (let j = 0; j < remaining; j++) {
      wall.push(i);
    }
  }
  rng.shuffle(wall);

  // Deal 13 tiles to 3 AI players
  const aiHands: TileCounts[] = [];
  let wallIdx = 0;
  for (let p = 0; p < 3; p++) {
    const hand = createEmptyTileCounts();
    for (let t = 0; t < 13 && wallIdx < wall.length; t++) {
      hand[wall[wallIdx]]++;
      wallIdx++;
    }
    aiHands.push(hand);
  }

  // Simulate a few turns per AI (3-8 discards each)
  const numDiscards = 3 + rng.randomInt(6);
  const rivers: TileIndex[][] = [[], [], []];

  for (let turn = 0; turn < numDiscards; turn++) {
    for (let p = 0; p < 3; p++) {
      if (wallIdx >= wall.length) break;
      // Draw
      const drawn = wall[wallIdx];
      wallIdx++;
      aiHands[p][drawn]++;

      // Check win — if so, just discard the drawn tile instead
      if (calculateShanten(aiHands[p], includeSevenPairs) === -1) {
        aiHands[p][drawn]--;
        rivers[p].push(drawn);
        continue;
      }

      // Pick discard
      const discard = fastPickDiscard(cloneTileCounts(aiHands[p]), includeSevenPairs);
      aiHands[p][discard]--;
      rivers[p].push(discard);
    }
  }

  // Aggregate dead tiles
  const deadTiles = createEmptyTileCounts();
  for (const river of rivers) {
    for (const tile of river) {
      deadTiles[tile]++;
    }
  }

  return { rivers, deadTiles };
}

export default function QuizMode({ rulesetMode }: QuizModeProps) {
  const [phase, setPhase] = useState<GamePhase>('mid');
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [showRivers, setShowRivers] = useState(true);

  const config = getRulesetConfig(rulesetMode);

  const generateQuiz = useCallback(() => {
    const rng = new SeededRNG(Date.now());
    const result = generateHandForPhase({ phase, seed: rng.next() });
    const tiles14 = cloneTileCounts(result.tiles);
    // Add one tile to make it 14
    for (let i = 0; i < 34; i++) {
      if (tiles14[i] < 4) {
        tiles14[i]++;
        break;
      }
    }

    let rivers: TileIndex[][] = [[], [], []];
    let deadTiles = createEmptyTileCounts();
    const hasRivers = showRivers;

    if (hasRivers) {
      const riverData = generateQuizRivers(tiles14, rulesetMode, rng);
      rivers = riverData.rivers;
      deadTiles = riverData.deadTiles;
    }

    const ctx: GameContext = {
      ...createDefaultGameContext(),
      wallRemaining: hasRivers
        ? Math.max(10, result.wallRemaining - rivers.reduce((sum, r) => sum + r.length, 0) * 2)
        : result.wallRemaining,
    };

    const analysis = analyzeHand(cloneTileCounts(tiles14), ctx, rulesetMode, hasRivers ? deadTiles : undefined);

    setQuiz({
      tiles: tiles14,
      gameCtx: ctx,
      analysis,
      answered: false,
      selectedTile: null,
      isCorrect: false,
      rivers,
      deadTiles,
      hasRivers,
    });
  }, [phase, rulesetMode, showRivers]);

  // Monte Carlo -- runs only after answer is revealed
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
    method: mcMethod,
    shanten: mcShanten,
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

      {/* River toggle */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={showRivers}
            onChange={(e) => setShowRivers(e.target.checked)}
            className="rounded border-slate-600 bg-slate-700 text-blue-500"
          />
          Include discard rivers (dead tile tracking)
        </label>
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

          {/* Discard rivers (if enabled) */}
          {quiz.hasRivers && quiz.rivers.some(r => r.length > 0) && (
            <div className="bg-slate-800/30 rounded-lg p-3 space-y-2">
              <div className="text-xs text-slate-400 font-medium">
                Opponent Discards
                {quiz.answered && (
                  <span className="text-slate-500 ml-1">
                    (dead tiles affect acceptance counts)
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {quiz.rivers.map((river, idx) => (
                  <DiscardRiver
                    key={idx}
                    discards={river}
                    seatWind={(idx + 1) as 0 | 1 | 2 | 3}
                    compact
                  />
                ))}
              </div>
            </div>
          )}

          {/* The hand */}
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-400 mb-2">
              {quiz.answered
                ? 'Result'
                : `Which tile would you discard?${quiz.hasRivers ? ' Consider the visible discards.' : ''} Tap to select.`}
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

                {/* Dead tile impact note */}
                {quiz.hasRivers && (
                  <div className="mt-2 text-xs text-slate-400 text-center">
                    Analysis accounts for {quiz.rivers.reduce((sum, r) => sum + r.length, 0)} visible dead tiles
                  </div>
                )}

                {/* Target hand explanation */}
                {quiz.analysis.winningPaths.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-600/50">
                    <div className="text-xs text-slate-400 mb-1 font-medium">What you're building toward:</div>
                    {quiz.analysis.winningPaths.slice(0, 2).map((path, idx) => (
                      <div key={idx} className="text-xs text-slate-400 mt-1">
                        <span className="text-amber-400 font-bold">{path.fan} {config.unit}</span>{' '}
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
                method={mcMethod}
                shanten={mcShanten}
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
