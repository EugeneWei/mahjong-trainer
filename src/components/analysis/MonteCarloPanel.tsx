// Hybrid analysis results panel
// Shows EV-ranked discard recommendations with win rate, average fan, and fan distribution
// Displays "Exact Analysis" or "Monte Carlo (N sims)" badge based on method used

import TileSVG from '../tiles/TileSVG';
import type { MonteCarloResult, AnalysisMethod } from '../../engine/montecarlo';
import type { RulesetMode } from '../../engine/rulesets';
import { getRulesetConfig } from '../../engine/rulesets';
import { tileFullName } from '../../engine/analysis';

interface MonteCarloPanelProps {
  results: MonteCarloResult[] | null;
  progress: number;
  isRunning: boolean;
  error: string | null;
  rulesetMode: RulesetMode;
  method?: AnalysisMethod | null;
  shanten?: number | null;
  onRun?: () => void;
  onRunMore?: () => void;
  runMoreBatchSize?: number;
}

export default function MonteCarloPanel({
  results,
  progress,
  isRunning,
  error,
  rulesetMode,
  method,
  shanten,
  onRun,
  onRunMore,
  runMoreBatchSize = 1000,
}: MonteCarloPanelProps) {
  const config = getRulesetConfig(rulesetMode);
  const unit = config.unit;

  const isExact = method?.type === 'exact';
  const methodLabel = method?.label ?? 'Monte Carlo Simulation';

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="bg-slate-800/50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-slate-300">
              {isExact ? 'Exact Analysis' : 'Monte Carlo Simulation'}
            </h3>
            {method && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  isExact
                    ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700/50'
                    : 'bg-blue-900/50 text-blue-400 border border-blue-700/50'
                }`}
              >
                {isExact ? 'Exact' : `MC ${(method as { simulations: number }).simulations} sims`}
              </span>
            )}
          </div>
          {!isRunning && (
            <div className="flex items-center gap-1.5">
              {onRunMore && results && !isExact && (
                <button
                  onClick={onRunMore}
                  className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-100 px-2.5 py-1 rounded"
                >
                  Run {runMoreBatchSize} more
                </button>
              )}
              {onRun && (
                <button
                  onClick={onRun}
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded"
                >
                  {results ? 'Re-run' : 'Run Analysis'}
                </button>
              )}
            </div>
          )}
        </div>
        <p className="text-xs text-slate-500">
          {isExact
            ? shanten === 0
              ? 'Exact enumeration of all winning tiles and their payouts'
              : 'Exhaustive 2-ply search of all draw/discard sequences'
            : 'Payout-weighted expected value via random game continuations'}
        </p>
        {shanten != null && shanten >= 0 && (
          <p className="text-[10px] text-slate-600 mt-0.5">
            Shanten: {shanten} — {methodLabel}
          </p>
        )}
      </div>

      {/* Progress bar */}
      {isRunning && (
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span>{isExact ? 'Computing...' : 'Simulating...'}</span>
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
          Analysis error: {error}
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
                  isExact={isExact}
                />
              ))}
            </div>
          </div>

          {/* Path comparison: top 2 */}
          {results.length >= 2 && results[0].avgPayout > 0 && results[1].avgPayout > 0 && (
            <PathComparison a={results[0]} b={results[1]} unit={unit} isExact={isExact} />
          )}
        </>
      )}

      {/* No results yet and not running */}
      {!results && !isRunning && !error && (
        <div className="bg-slate-800/30 rounded-lg p-4 text-center text-xs text-slate-500">
          Analysis will estimate payout-weighted EV for each discard option.
          {onRun && (
            <button
              onClick={onRun}
              className="block mx-auto mt-2 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded"
            >
              Run Analysis
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
  isExact,
}: {
  result: MonteCarloResult;
  rank: number;
  isBest: boolean;
  unit: string;
  maxEV: number;
  isExact: boolean;
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
              {winPct}% win{isExact ? '' : ' (approx)'}
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
        <FanDistributionBar distribution={result.fanDistribution} unit={unit} sims={result.simulations} isExact={isExact} />
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
  isExact,
}: {
  distribution: Record<number, number>;
  unit: string;
  sims: number;
  isExact: boolean;
}) {
  const entries = Object.entries(distribution)
    .map(([fan, count]) => ({ fan: Number(fan), count }))
    .sort((a, b) => a.fan - b.fan);

  const totalCount = entries.reduce((sum, e) => sum + e.count, 0);
  if (totalCount === 0) return null;

  // For exact analysis, sims is 0, so use totalCount as the denominator
  const denominator = isExact ? totalCount : sims;

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
            style={{ width: `${(count / totalCount) * 100}%` }}
            title={`${fan} ${unit}: ${count} ${isExact ? 'outs' : 'wins'} (${((count / denominator) * 100).toFixed(1)}%)`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-0 mt-0.5">
        {entries.map(({ fan, count }) => (
          <span key={fan} className="text-[10px] text-slate-500">
            {fan}{unit}: {isExact ? `${count} outs` : `${((count / denominator) * 100).toFixed(0)}%`}
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
  isExact,
}: {
  a: MonteCarloResult;
  b: MonteCarloResult;
  unit: string;
  isExact: boolean;
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
            .{isExact ? ' (exact calculation)' : ''}
          </>
        ) : (
          <>Both paths have similar expected value.{isExact ? ' (exact calculation)' : ''}</>
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
