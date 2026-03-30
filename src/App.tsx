import { useState, useCallback } from 'react';
import FreeAnalysis from './pages/FreeAnalysis';
import QuizMode from './pages/QuizMode';
import WalkthroughMode from './pages/WalkthroughMode';
import Glossary from './pages/Glossary';
import Stats from './pages/Stats';
import RulesetSelector from './components/input/RulesetSelector';
import { type RulesetMode, loadRulesetMode, saveRulesetMode, RULESET_CONFIGS } from './engine/rulesets';

type Tab = 'analyze' | 'quiz' | 'walkthrough' | 'glossary' | 'stats';

const TABS: { id: Tab; label: string }[] = [
  { id: 'analyze', label: 'Analyze' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'walkthrough', label: 'Learn' },
  { id: 'glossary', label: 'Glossary' },
  { id: 'stats', label: 'Stats' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('analyze');
  const [rulesetMode, setRulesetMode] = useState<RulesetMode>(loadRulesetMode);

  const handleRulesetChange = useCallback((mode: RulesetMode) => {
    setRulesetMode(mode);
    saveRulesetMode(mode);
  }, []);

  const config = RULESET_CONFIGS[rulesetMode];

  return (
    <div className="flex flex-col min-h-dvh bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800/80 backdrop-blur border-b border-slate-700/50 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-bold text-slate-200 tracking-tight">
            Mahjong Trainer
          </h1>
          <RulesetSelector mode={rulesetMode} onChange={handleRulesetChange} />
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">
          {config.description} &middot; {config.minimum} {config.unit} minimum
        </div>
      </header>

      {/* Page content — all tabs stay mounted to preserve state */}
      <main className="flex-1 overflow-y-auto">
        <div style={{ display: tab === 'analyze' ? 'block' : 'none' }}>
          <FreeAnalysis rulesetMode={rulesetMode} />
        </div>
        <div style={{ display: tab === 'quiz' ? 'block' : 'none' }}>
          <QuizMode rulesetMode={rulesetMode} />
        </div>
        <div style={{ display: tab === 'walkthrough' ? 'block' : 'none' }}>
          <WalkthroughMode rulesetMode={rulesetMode} />
        </div>
        <div style={{ display: tab === 'glossary' ? 'block' : 'none' }}>
          <Glossary rulesetMode={rulesetMode} />
        </div>
        <div style={{ display: tab === 'stats' ? 'block' : 'none' }}>
          <Stats />
        </div>
      </main>

      {/* Bottom navigation */}
      <nav
        className="bg-slate-800/95 backdrop-blur border-t border-slate-700/50 flex justify-around sticky bottom-0 z-10"
        style={{ paddingBottom: 'var(--safe-bottom, 0px)' }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-col items-center py-2 px-2 text-xs ${
              tab === t.id ? 'text-blue-400 font-medium' : 'text-slate-500'
            }`}
          >
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
