import { useState, useEffect } from 'react';

interface StatsData {
  totalQuizzes: number;
  correctCount: number;
  streakCurrent: number;
  streakBest: number;
  byPhase: Record<string, { total: number; correct: number }>;
}

const STORAGE_KEY = 'mahjong-trainer-stats';

function loadStats(): StatsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    totalQuizzes: 0,
    correctCount: 0,
    streakCurrent: 0,
    streakBest: 0,
    byPhase: {
      early: { total: 0, correct: 0 },
      mid: { total: 0, correct: 0 },
      late: { total: 0, correct: 0 },
    },
  };
}

export function recordQuizResult(phase: string, correct: boolean) {
  const stats = loadStats();
  stats.totalQuizzes++;
  if (correct) {
    stats.correctCount++;
    stats.streakCurrent++;
    stats.streakBest = Math.max(stats.streakBest, stats.streakCurrent);
  } else {
    stats.streakCurrent = 0;
  }
  if (!stats.byPhase[phase]) stats.byPhase[phase] = { total: 0, correct: 0 };
  stats.byPhase[phase].total++;
  if (correct) stats.byPhase[phase].correct++;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

export default function Stats() {
  const [stats, setStats] = useState<StatsData>(loadStats());

  useEffect(() => {
    const handler = () => setStats(loadStats());
    window.addEventListener('storage', handler);
    // Also refresh on focus
    window.addEventListener('focus', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('focus', handler);
    };
  }, []);

  const accuracy =
    stats.totalQuizzes > 0
      ? Math.round((stats.correctCount / stats.totalQuizzes) * 100)
      : 0;

  return (
    <div className="p-4 space-y-4 pb-24">
      <h1 className="text-lg font-bold text-slate-200">Statistics</h1>

      {stats.totalQuizzes === 0 ? (
        <div className="text-sm text-slate-500 py-8 text-center">
          Complete some quizzes to see your stats here.
        </div>
      ) : (
        <>
          {/* Overview */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Total Quizzes" value={stats.totalQuizzes.toString()} />
            <StatCard label="Accuracy" value={`${accuracy}%`} />
            <StatCard label="Current Streak" value={stats.streakCurrent.toString()} />
            <StatCard label="Best Streak" value={stats.streakBest.toString()} />
          </div>

          {/* By phase */}
          <div className="bg-slate-800/50 rounded-lg p-3">
            <h3 className="text-sm font-medium text-slate-300 mb-2">By Game Phase</h3>
            <div className="space-y-2">
              {['early', 'mid', 'late'].map((phase) => {
                const data = stats.byPhase[phase] || { total: 0, correct: 0 };
                const pct = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
                return (
                  <div key={phase} className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-12 capitalize">{phase}</span>
                    <div className="flex-1 bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-blue-500 rounded-full h-2 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-400 w-16 text-right">
                      {data.correct}/{data.total}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reset */}
          <button
            onClick={() => {
              localStorage.removeItem(STORAGE_KEY);
              setStats(loadStats());
            }}
            className="text-xs text-slate-500 hover:text-slate-400"
          >
            Reset stats
          </button>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-800/50 rounded-lg p-3 text-center">
      <div className="text-2xl font-bold text-slate-200">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
