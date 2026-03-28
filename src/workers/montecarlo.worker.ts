// Web Worker for Monte Carlo / Hybrid simulation
// Uses comlink for clean async API with the main thread

import * as Comlink from 'comlink';
import {
  runMonteCarloAnalysis,
  runHybridAnalysis,
  type MonteCarloRequest,
  type MonteCarloResult,
  type MonteCarloProgress,
  type HybridAnalysisResult,
} from '../engine/montecarlo';

export interface MonteCarloWorkerAPI {
  runSimulation(
    request: MonteCarloRequest,
    onProgress: (progress: MonteCarloProgress) => void,
  ): MonteCarloResult[];

  runHybrid(
    request: MonteCarloRequest,
    onProgress: (progress: MonteCarloProgress) => void,
  ): HybridAnalysisResult;
}

const api: MonteCarloWorkerAPI = {
  runSimulation(
    request: MonteCarloRequest,
    onProgress: (progress: MonteCarloProgress) => void,
  ): MonteCarloResult[] {
    return runMonteCarloAnalysis(request, onProgress);
  },

  runHybrid(
    request: MonteCarloRequest,
    onProgress: (progress: MonteCarloProgress) => void,
  ): HybridAnalysisResult {
    return runHybridAnalysis(request, onProgress);
  },
};

Comlink.expose(api);
