// React hook for running hybrid (exact + Monte Carlo) analysis in a Web Worker

import { useState, useEffect, useRef, useCallback } from 'react';
import * as Comlink from 'comlink';
import type { TileCounts } from '../engine/tiles';
import type { GameContext } from '../engine/hand';
import type { RulesetMode } from '../engine/rulesets';
import type { MonteCarloResult, MonteCarloProgress, AnalysisMethod } from '../engine/montecarlo';
import type { MonteCarloWorkerAPI } from '../workers/montecarlo.worker';

interface UseMonteCarloResult {
  results: MonteCarloResult[] | null;
  progress: number; // 0-1
  isRunning: boolean;
  error: string | null;
  method: AnalysisMethod | null;
  shanten: number | null;
  run: () => void;
  runMore: () => void;
}

// Merge two Monte Carlo result batches for the same tile. Sim-weighted for
// winRate/avgPayout (computed over all sims); win-weighted for avgFan (defined
// only over winning sims).
function mergeResults(a: MonteCarloResult, b: MonteCarloResult): MonteCarloResult {
  const simsTotal = a.simulations + b.simulations;
  if (simsTotal === 0) return a;

  const winsA = a.winRate * a.simulations;
  const winsB = b.winRate * b.simulations;
  const winsTotal = winsA + winsB;

  const fanDistribution: Record<number, number> = { ...a.fanDistribution };
  for (const [fan, count] of Object.entries(b.fanDistribution)) {
    fanDistribution[Number(fan)] = (fanDistribution[Number(fan)] ?? 0) + count;
  }

  const bestHandSeen =
    a.bestHandSeen && b.bestHandSeen
      ? a.bestHandSeen.fan >= b.bestHandSeen.fan
        ? a.bestHandSeen
        : b.bestHandSeen
      : (a.bestHandSeen ?? b.bestHandSeen);

  return {
    tile: a.tile,
    simulations: simsTotal,
    winRate: winsTotal / simsTotal,
    avgFan: winsTotal > 0 ? (a.avgFan * winsA + b.avgFan * winsB) / winsTotal : 0,
    avgPayout: (a.avgPayout * a.simulations + b.avgPayout * b.simulations) / simsTotal,
    fanDistribution,
    bestHandSeen,
  };
}

export function useMonteCarloAnalysis(
  tiles: TileCounts | null,
  gameContext: GameContext | null,
  rulesetMode: RulesetMode,
  numSimulations: number = 500,
  autoRun: boolean = false,
): UseMonteCarloResult {
  const [results, setResults] = useState<MonteCarloResult[] | null>(null);
  const [progress, setProgress] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<AnalysisMethod | null>(null);
  const [shanten, setShanten] = useState<number | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const apiRef = useRef<Comlink.Remote<MonteCarloWorkerAPI> | null>(null);
  const cancelledRef = useRef(false);
  // Latest results + method in refs so runMore can merge without capturing stale state.
  const resultsRef = useRef<MonteCarloResult[] | null>(null);
  const methodRef = useRef<AnalysisMethod | null>(null);
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);
  useEffect(() => {
    methodRef.current = method;
  }, [method]);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
        apiRef.current = null;
      }
    };
  }, []);

  const run = useCallback(async () => {
    if (!tiles || !gameContext) return;

    // Cancel any previous run
    cancelledRef.current = true;
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
      apiRef.current = null;
    }

    cancelledRef.current = false;
    setIsRunning(true);
    setProgress(0);
    setResults(null);
    setError(null);
    setMethod(null);
    setShanten(null);

    try {
      // Create fresh worker
      const worker = new Worker(
        new URL('../workers/montecarlo.worker.ts', import.meta.url),
        { type: 'module' },
      );
      workerRef.current = worker;
      const api = Comlink.wrap<MonteCarloWorkerAPI>(worker);
      apiRef.current = api;

      const request = {
        tiles: [...tiles], // plain array for structured clone
        gameContext: { ...gameContext },
        rulesetMode,
        numSimulations,
      };

      const progressCallback = Comlink.proxy((p: MonteCarloProgress) => {
        if (!cancelledRef.current) {
          setProgress(p.total > 0 ? p.completed / p.total : 0);
        }
      });

      const hybridResult = await api.runHybrid(request, progressCallback);

      if (!cancelledRef.current) {
        setResults(hybridResult.results);
        setMethod(hybridResult.method);
        setShanten(hybridResult.shanten);
        setProgress(1);
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'Simulation failed');
      }
    } finally {
      if (!cancelledRef.current) {
        setIsRunning(false);
      }
    }
  }, [tiles, gameContext, rulesetMode, numSimulations]);

  // Run an additional batch and merge with existing results. No-op if prior
  // method is exact (already fully enumerated) or there are no prior results.
  const runMore = useCallback(async () => {
    if (!tiles || !gameContext) return;
    const priorResults = resultsRef.current;
    const priorMethod = methodRef.current;
    if (!priorResults || !priorMethod || priorMethod.type === 'exact') return;

    cancelledRef.current = true;
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
      apiRef.current = null;
    }

    cancelledRef.current = false;
    setIsRunning(true);
    setProgress(0);
    setError(null);

    try {
      const worker = new Worker(
        new URL('../workers/montecarlo.worker.ts', import.meta.url),
        { type: 'module' },
      );
      workerRef.current = worker;
      const api = Comlink.wrap<MonteCarloWorkerAPI>(worker);
      apiRef.current = api;

      const request = {
        tiles: [...tiles],
        gameContext: { ...gameContext },
        rulesetMode,
        numSimulations,
      };

      const progressCallback = Comlink.proxy((p: MonteCarloProgress) => {
        if (!cancelledRef.current) {
          setProgress(p.total > 0 ? p.completed / p.total : 0);
        }
      });

      const hybridResult = await api.runHybrid(request, progressCallback);

      if (!cancelledRef.current) {
        const byTile = new Map(hybridResult.results.map(r => [r.tile, r]));
        const merged = priorResults
          .map(prior => {
            const fresh = byTile.get(prior.tile);
            return fresh ? mergeResults(prior, fresh) : prior;
          })
          .sort((a, b) => b.avgPayout - a.avgPayout);
        setResults(merged);

        if (hybridResult.method.type === 'montecarlo') {
          const priorSims = priorMethod.type === 'montecarlo' ? priorMethod.simulations : 0;
          const totalSims = priorSims + hybridResult.method.simulations;
          setMethod({
            type: 'montecarlo',
            simulations: totalSims,
            label: `Monte Carlo (${totalSims} sims)`,
          });
        } else {
          setMethod(hybridResult.method);
        }
        setProgress(1);
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'Simulation failed');
      }
    } finally {
      if (!cancelledRef.current) {
        setIsRunning(false);
      }
    }
  }, [tiles, gameContext, rulesetMode, numSimulations]);

  // Auto-run when inputs change (if enabled)
  useEffect(() => {
    if (autoRun && tiles && gameContext) {
      // Slight delay to debounce rapid input changes
      const timer = setTimeout(() => {
        run();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [autoRun, tiles, gameContext, rulesetMode, run]);

  return { results, progress, isRunning, error, method, shanten, run, runMore };
}
