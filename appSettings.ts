import { AGENT_MODELS, AVAILABLE_MODELS } from './constants';

export type AgentKey = keyof typeof AGENT_MODELS;

export interface AppSettings {
  modelOverrides: Partial<Record<AgentKey, string>>;
  autoSeoEnabled: boolean;
  showRussianScript: boolean;
  parallelActWriting: boolean; // write documentary acts in parallel (faster, no motif tracking)
}

const STORAGE_KEY = 'narrative_war_settings';

const DEFAULTS: AppSettings = {
  modelOverrides: {},
  autoSeoEnabled: true,
  showRussianScript: true,
  parallelActWriting: false,
};

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

// Mutable singleton — updated by SettingsPanel, read by geminiService
let _settings: AppSettings = load();

export function getSettings(): AppSettings {
  return _settings;
}

export function updateSettings(patch: Partial<AppSettings>): void {
  _settings = { ..._settings, ...patch };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_settings)); } catch { /* ignore */ }
}

/** Returns the effective model for a given agent — override if set, else constant default. */
export function getModel(agent: AgentKey): string {
  return _settings.modelOverrides[agent] ?? AGENT_MODELS[agent];
}

export { AVAILABLE_MODELS };
