import { useState } from 'react';
import { getAllGlossaryEntries, type GlossaryEntry } from '../engine/glossary';
import type { RulesetMode } from '../engine/rulesets';

const CATEGORY_LABELS: Record<string, string> = {
  basic: 'Basic Patterns',
  honor: 'Honor Patterns',
  hand: 'Hand Patterns',
  limit: 'Limit Hands',
  'chinese-high': 'Chinese Official — High (48-88 pts)',
  'chinese-mid': 'Chinese Official — Medium (8-32 pts)',
  'chinese-low': 'Chinese Official — Lower (2-6 pts)',
  'chinese-1pt': 'Chinese Official — 1 Point',
  situational: 'Situational (game-state dependent)',
};

const CATEGORY_ORDER = ['basic', 'honor', 'hand', 'limit', 'chinese-high', 'chinese-mid', 'chinese-low', 'chinese-1pt', 'situational'];

interface GlossaryProps {
  rulesetMode: RulesetMode;
}

export default function Glossary({ rulesetMode }: GlossaryProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  // Map ruleset modes to filters
  const filterMode = rulesetMode === 'blended' ? undefined : rulesetMode;
  const allEntries = getAllGlossaryEntries(filterMode);

  // Group by category
  const grouped = new Map<string, GlossaryEntry[]>();
  for (const entry of allEntries) {
    const list = grouped.get(entry.category) || [];
    list.push(entry);
    grouped.set(entry.category, list);
  }

  const modeLabel = rulesetMode === 'hk' ? 'Hong Kong' : rulesetMode === 'chinese' ? 'Chinese Official (MCR)' : 'All rules (HK + Chinese)';

  return (
    <div className="p-4 space-y-4 pb-24">
      <h1 className="text-lg font-bold text-slate-200">Scoring Glossary</h1>
      <p className="text-xs text-slate-500">
        Showing patterns for: <span className="text-slate-400 font-medium">{modeLabel}</span>.
        Tap any pattern to see its full description.
      </p>

      {CATEGORY_ORDER.map((cat) => {
        const entries = grouped.get(cat);
        if (!entries || entries.length === 0) return null;
        return (
          <div key={cat}>
            <h2 className="text-sm font-medium text-slate-400 mb-2 mt-4 border-b border-slate-700 pb-1">
              {CATEGORY_LABELS[cat]}
            </h2>
            <div className="space-y-1">
              {entries.map((entry) => (
                <GlossaryCard
                  key={entry.english}
                  entry={entry}
                  isExpanded={expanded === entry.english}
                  onToggle={() => setExpanded(expanded === entry.english ? null : entry.english)}
                  rulesetMode={rulesetMode}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GlossaryCard({
  entry,
  isExpanded,
  onToggle,
  rulesetMode,
}: {
  entry: GlossaryEntry;
  isExpanded: boolean;
  onToggle: () => void;
  rulesetMode: RulesetMode;
}) {
  const valueLabel = rulesetMode === 'chinese' && entry.mcrPoints !== undefined
    ? `${entry.mcrPoints}pt`
    : `${entry.fan}f`;

  const rulesetBadges = entry.ruleset.map(r => {
    if (r === 'hk') return 'HK';
    if (r === 'chinese') return 'MCR';
    return 'Blend';
  });

  return (
    <div className="bg-slate-800/50 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-amber-400 w-10 shrink-0">{valueLabel}</span>
          <span className="text-sm text-slate-200 truncate">{entry.english}</span>
          {entry.chinese && (
            <span className="text-xs text-slate-500 truncate hidden sm:inline">{entry.chinese}</span>
          )}
        </div>
        <span className="text-slate-500 text-xs shrink-0 ml-2">{isExpanded ? 'v' : '>'}</span>
      </button>
      {isExpanded && (
        <div className="px-3 pb-3 pt-0 border-t border-slate-700/50">
          {entry.chinese && (
            <div className="text-xs text-slate-500 mt-2 sm:hidden">{entry.chinese}</div>
          )}
          <p className="text-xs text-slate-400 leading-relaxed mt-2">{entry.description}</p>
          {entry.example && (
            <div className="text-xs text-slate-500 bg-slate-700/40 rounded p-2 mt-2">
              <span className="font-medium text-slate-400">Example: </span>
              {entry.example}
            </div>
          )}
          <div className="flex gap-1 mt-2">
            {rulesetBadges.map((badge, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-500">{badge}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
