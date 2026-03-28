// Web Worker for Monte Carlo simulation
// Uses comlink for clean async API with the main thread

import * as Comlink from 'comlink';
import {
  runMonteCarloAnalysis,
  type MonteCarloRequest,
  type MonteCarloResult,
  type MonteCarloProgress,
} from '../engine/montecarlo';

export interface MonteCarloWorkerAPI {
  runSimulation(
    request: MonteCarloRequest,
    onProgress: (progress: MonteCarloProgress) => void,
  ): MonteCarloResult[];
}

const api: MonteCarloWorkerAPI = {
  runSimulation(
    request: MonteCarloRequest,
    onProgress: (progress: MonteCarloProgress) => void,
  ): MonteCarloResult[] {
    return runMonteCarloAnalysis(request, onProgress);
  },
};

Comlink.expose(api);
