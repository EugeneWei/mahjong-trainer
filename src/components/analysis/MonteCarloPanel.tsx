// Monte Carlo simulation results panel
// Shows EV-ranked discard recommendations with win rate, average fan, and fan distribution

import TileSVG from '../tiles/TileSVG';
import type { MonteCarloResult } from '../../engine/montecarlo';
import type { RulesetMode } from '../../engine/rulesets';
import { getRulesetConfig } from '../../engine/rulesets';
import { tileFullName } from '../../engine/analysis';

interface MonteCarloPanelProps {
  results: MonteCarloResult[] | null;
  progress: number;
  isRunning: boolean;
  error: string | null;
  rulesetMode: RulesetMode;
  onRun?: () => void;
}

export default function MonteCarloPanel({
  results,
  progress,
  isRunning,
  error,
  rulesetMode,
  onRun,
}: MonteCarloPanelProps) {
  const config = getRulesetConfig(rulesetMode);
  const unit = config.unit;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="bg-slate-800/50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-medium text-slate-300">
            Monte Carlo Simulation
          </h3>
          {onRun && !isRunning && (
            <button
              onClick={onRun}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded"
            >
              {results ? 'Re-run' : 'Run Simulation'}
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500">
          Payout-weighted expected value via random game continuations
        </p>
      </div>

      {/* Progress bar */}
      {isRunning && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span>Simulating...</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-200"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-xs text-red-300">
          Simulation error: {error}
        </div>
      )}

      {/* Results */}
      {results && results.length > 0 && (
        <>
          {/* Top discards ranked by EV */}
          <div className="bg-slate-800/50 rounded-lg p-3">
            <h3 className="text-sm font-medium text-slate-300 mb-2">
              Discards Ranked by Expected Value
            </h3>
            <div className="space-y-3">
              {results.slice(0, 8).map((r, idx) => (
                <DiscardEVRow
                  key={r.tile}
                  result={r}
                  rank={idx + 1}
                  isBest={idx === 0}
                  unit={unit}
                  maxEV={results[0].avgPayout}
                />
              ))}
            </div>
          </div>

          {/* Path comparison: top 2 */}
          {results.length >= 2 && results[0].avgPayout > 0 && results[1].avgPayout > 0 && (
            <PathComparison a={results[0]} b={results[1]} unit={unit} />
          )}
        </>
      )}

      {/* No results yet and not running */}
      {!results && !isRunning && !error && (
        <div className="bg-slate-800/30 rounded-lg p-4 text-center text-xs text-slate-500">
          Monte Carlo simulation will estimate payout-weighted EV for each discard option.
          {onRun && (
            <button
              onClick={onRun}
              className="block mx-auto mt-2 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded"
            >
              Run Simulation
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DiscardEVRow({
  result,
  rank,
  isBest,
  unit,
  maxEV,
}: {
  result: MonteCarloResult;
  rank: number;
  isBest: boolean;
  unit: string;
  maxEV: number;
}) {
  const winPct = (result.winRate * 100).toFixed(1);
  const evDisplay = result.avgPayout.toFixed(1);
  const barWidth = maxEV > 0 ? (result.avgPayout / maxEV) * 100 : 0;

  return (
    <div
      className={`p-2 rounded ${
        isBest ? 'bg-blue-900/30 border border-blue-700/50' : 'bg-slate-700/30'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 w-4">{rank}.</span>
        <TileSVG tile={result.tile} size="sm" danger={isBest} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-amber-400">
              EV: {evDisplay}
            </span>
            <span className="text-xs text-slate-400">
              {winPct}% win
            </span>
            {result.avgFan > 0 && (
              <span className="text-xs text-slate-500">
                avg {result.avgFan.toFixed(1)} {unit}
              </span>
            )}
          </div>
          {/* EV bar */}
          <div className="w-full bg-slate-700 rounded-full h-1 mt-1.5">
            <div
              className={`h-1 rounded-full ${isBest ? 'bg-amber-400' : 'bg-slate-500'}`}
              style={{ width: `${Math.max(barWidth, 1)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Fan distribution */}
      {Object.keys(result.fanDistribution).length > 0 && (
        <FanDistributionBar distribution={result.fanDistribution} unit={unit} sims={result.simulations} />
      )}

      {/* Best hand seen */}
      {result.bestHandSeen && (
        <div className="mt-1.5 ml-6 text-xs text-slate-500">
          Best: {result.bestHandSeen.fan} {unit} ({result.bestHandSeen.patterns.join(' + ')})
        </div>
      )}
    </div>
  );
}

function FanDistributionBar({
  distribution,
  unit,
  sims,
}: {
  distribution: Record<number, number>;
  unit: string;
  sims: number;
}) {
  const entries = Object.entries(distribution)
    .map(([fan, count]) => ({ fan: Number(fan), count }))
    .sort((a, b) => a.fan - b.fan);

  const totalWins = entries.reduce((sum, e) => sum + e.count, 0);
  if (totalWins === 0) return null;

  // Color gradient by fan value
  const fanColor = (fan: number): string => {
    if (fan >= 10) return 'bg-purple-500';
    if (fan >= 7) return 'bg-red-500';
    if (fan >= 5) return 'bg-orange-500';
    if (fan >= 4) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="mt-1.5 ml-6">
      <div className="flex h-3 rounded overflow-hidden bg-slate-700">
        {entries.map(({ fan, count }) => (
          <div
            key={fan}
            className={`${fanColor(fan)} relative group`}
            style={{ width: `${(count / sims) * 100}%` }}
            title={`${fan} ${unit}: ${count} wins (${((count / sims) * 100).toFixed(1)}%)`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-0 mt-0.5">
        {entries.map(({ fan, count }) => (
          <span key={fan} className="text-[10px] text-slate-500">
            {fan}{unit}: {((count / sims) * 100).toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  );
}

function PathComparison({
  a,
  b,
  unit,
}: {
  a: MonteCarloResult;
  b: MonteCarloResult;
  unit: string;
}) {
  const evDiff = a.avgPayout - b.avgPayout;
  const winDiff = (a.winRate - b.winRate) * 100;

  return (
    <div className="bg-slate-800/50 rounded-lg p-3">
      <h3 className="text-sm font-medium text-slate-300 mb-2">Path Comparison</h3>
      <div className="grid grid-cols-2 gap-3">
        <ComparisonCard result={a} label="Path A (Best EV)" unit={unit} accent="amber" />
        <ComparisonCard result={b} label="Path B" unit={unit} accent="slate" />
      </div>
      <div className="mt-2 p-2 bg-slate-700/30 rounded text-xs text-slate-400">
        {evDiff > 0 ? (
          <>
            Discarding <span className="text-slate-200 font-medium">{tileFullName(a.tile)}</span> has{' '}
            <span className="text-amber-400 font-bold">+{evDiff.toFixed(1)}</span> higher EV
            {winDiff < 0 && (
              <> despite {Math.abs(winDiff).toFixed(1)}% lower win rate — the higher scoring
                 hands more than compensate</>
            )}
            {winDiff > 0 && <> with {winDiff.toFixed(1)}% higher win rate too</>}
            .
          </>
        ) : (
          <>Both paths have similar expected value.</>
        )}
      </div>
    </div>
  );
}

function ComparisonCard({
  result,
  label,
  unit,
  accent,
}: {
  result: MonteCarloResult;
  label: string;
  unit: string;
  accent: 'amber' | 'slate';
}) {
  const evColor = accent === 'amber' ? 'text-amber-400' : 'text-slate-300';
  return (
    <div className="bg-slate-700/30 rounded p-2">
      <div className="text-[10px] text-slate-500 mb-1">{label}</div>
      <div className="flex items-center gap-1.5 mb-1">
        <TileSVG tile={result.tile} size="sm" />
        <span className="text-xs text-slate-300">{tileFullName(result.tile)}</span>
      </div>
      <div className={`text-lg font-bold ${evColor}`}>
        {result.avgPayout.toFixed(1)}
      </div>
      <div className="text-[10px] text-slate-500">EV (payout-weighted)</div>
      <div className="mt-1 text-xs text-slate-400">
        {(result.winRate * 100).toFixed(1)}% win rate
      </div>
      <div className="text-xs text-slate-400">
        {result.avgFan.toFixed(1)} avg {unit}
      </div>
    </div>
  );
}
