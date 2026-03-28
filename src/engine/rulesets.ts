// Ruleset configuration for HK, Chinese Official (MCR), and Blended modes

export type RulesetMode = 'hk' | 'blended' | 'chinese';

export interface RulesetConfig {
  mode: RulesetMode;
  label: string;
  description: string;
  /** Unit name: 'fan' for HK, 'pts' for Chinese */
  unit: string;
  /** Minimum score to declare a win */
  minimum: number;
  /** Whether Seven Pairs hand structure is valid */
  sevenPairsEnabled: boolean;
  /** Whether Thirteen Orphans is valid */
  thirteenOrphansEnabled: boolean;
}

export const RULESET_CONFIGS: Record<RulesetMode, RulesetConfig> = {
  hk: {
    mode: 'hk',
    label: 'HK',
    description: 'Hong Kong Old Style',
    unit: 'fan',
    minimum: 3,
    sevenPairsEnabled: false,
    thirteenOrphansEnabled: true,
  },
  blended: {
    mode: 'blended',
    label: 'Blended',
    description: 'HK + Chinese patterns',
    unit: 'fan',
    minimum: 3,
    sevenPairsEnabled: true,
    thirteenOrphansEnabled: true,
  },
  chinese: {
    mode: 'chinese',
    label: 'Chinese',
    description: 'Chinese Official (MCR)',
    unit: 'pts',
    minimum: 8,
    sevenPairsEnabled: true,
    thirteenOrphansEnabled: true,
  },
};

export function getRulesetConfig(mode: RulesetMode): RulesetConfig {
  return RULESET_CONFIGS[mode];
}

// localStorage key for persisting the selected ruleset
const STORAGE_KEY = 'mahjong-trainer-ruleset';

export function loadRulesetMode(): RulesetMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'hk' || stored === 'blended' || stored === 'chinese') return stored;
  } catch { /* ignore */ }
  return 'hk';
}

export function saveRulesetMode(mode: RulesetMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch { /* ignore */ }
}
