import { type RulesetMode, RULESET_CONFIGS } from '../../engine/rulesets';

interface RulesetSelectorProps {
  mode: RulesetMode;
  onChange: (mode: RulesetMode) => void;
}

const MODES: RulesetMode[] = ['hk', 'blended', 'chinese'];

export default function RulesetSelector({ mode, onChange }: RulesetSelectorProps) {
  return (
    <div className="flex items-center gap-1.5">
      {MODES.map((m) => {
        const config = RULESET_CONFIGS[m];
        const isActive = mode === m;
        return (
          <button
            key={m}
            onClick={() => onChange(m)}
            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
              isActive
                ? 'bg-amber-600 text-white font-medium'
                : 'bg-slate-700/60 text-slate-400 hover:bg-slate-600/60'
            }`}
            title={config.description}
          >
            {config.label}
          </button>
        );
      })}
    </div>
  );
}
