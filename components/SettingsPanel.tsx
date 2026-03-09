import React, { useState, useEffect } from 'react';
import { getSettings, updateSettings, AppSettings, AgentKey } from '../appSettings';
import { AVAILABLE_MODELS, AGENT_MODELS } from '../constants';

interface SettingsPanelProps {
  onClose: () => void;
}

const AGENT_LABELS: Record<AgentKey, string> = {
  SCOUT: 'Scout',
  RADAR: 'Radar',
  ANALYST: 'Analyst',
  ARCHITECT: 'Architect',
  OUTLINER: 'Outliner',
  DOC_CIRCLE: 'Doc Circle',
  ACT_PLANNING: 'Act Planning',
  WRITER: 'Writer',
};

const AGENT_KEYS = Object.keys(AGENT_LABELS) as AgentKey[];

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<AppSettings>(getSettings());

  // Save on every change
  useEffect(() => {
    updateSettings(settings);
  }, [settings]);

  const setModelOverride = (agent: AgentKey, model: string) => {
    setSettings(s => ({
      ...s,
      modelOverrides: { ...s.modelOverrides, [agent]: model },
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-mw-gray border border-mw-slate/40 rounded-lg shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-mw-slate/30">
          <h2 className="text-sm font-bold text-white uppercase tracking-widest font-mono">Settings</h2>
          <button onClick={onClose} className="text-mw-slate hover:text-white transition-colors text-lg leading-none">✕</button>
        </div>

        <div className="p-5 flex flex-col gap-6">
          {/* Model overrides */}
          <section>
            <h3 className="text-[10px] font-bold text-mw-slate uppercase tracking-wider mb-3">Agent Models</h3>
            <div className="flex flex-col gap-2">
              {AGENT_KEYS.map(agent => (
                <div key={agent} className="flex items-center justify-between gap-3">
                  <span className="text-xs font-mono text-slate-300 w-28">{AGENT_LABELS[agent]}</span>
                  <select
                    value={settings.modelOverrides[agent] ?? AGENT_MODELS[agent]}
                    onChange={e => setModelOverride(agent, e.target.value)}
                    className="flex-1 bg-black/50 border border-mw-slate/40 rounded px-2 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-mw-red/60"
                  >
                    {AVAILABLE_MODELS.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>

          {/* Toggles */}
          <section>
            <h3 className="text-[10px] font-bold text-mw-slate uppercase tracking-wider mb-3">Behaviour</h3>
            <div className="flex flex-col gap-3">
              <label className="flex items-center justify-between gap-3 cursor-pointer group">
                <span className="text-xs font-mono text-slate-300">Auto-generate SEO after Writer</span>
                <button
                  onClick={() => setSettings(s => ({ ...s, autoSeoEnabled: !s.autoSeoEnabled }))}
                  className={`w-10 h-5 rounded-full border transition-colors relative ${settings.autoSeoEnabled ? 'bg-mw-red border-mw-red' : 'bg-black/40 border-mw-slate/40'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${settings.autoSeoEnabled ? 'left-5' : 'left-0.5'}`} />
                </button>
              </label>
              <label className="flex items-center justify-between gap-3 cursor-pointer group">
                <span className="text-xs font-mono text-slate-300">Show Russian script column</span>
                <button
                  onClick={() => setSettings(s => ({ ...s, showRussianScript: !s.showRussianScript }))}
                  className={`w-10 h-5 rounded-full border transition-colors relative ${settings.showRussianScript ? 'bg-mw-red border-mw-red' : 'bg-black/40 border-mw-slate/40'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${settings.showRussianScript ? 'left-5' : 'left-0.5'}`} />
                </button>
              </label>
              <label className="flex items-center justify-between gap-3 cursor-pointer group">
                <div>
                  <span className="text-xs font-mono text-slate-300">Parallel act writing (Documentary)</span>
                  <p className="text-[10px] text-mw-slate/60 font-mono mt-0.5">Faster, but disables motif continuity tracking</p>
                </div>
                <button
                  onClick={() => setSettings(s => ({ ...s, parallelActWriting: !s.parallelActWriting }))}
                  className={`w-10 h-5 rounded-full border transition-colors relative flex-shrink-0 ${settings.parallelActWriting ? 'bg-mw-red border-mw-red' : 'bg-black/40 border-mw-slate/40'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${settings.parallelActWriting ? 'left-5' : 'left-0.5'}`} />
                </button>
              </label>
            </div>
          </section>

          {/* Reset */}
          <section className="border-t border-mw-slate/20 pt-4">
            <button
              onClick={() => {
                const fresh: AppSettings = { modelOverrides: {}, autoSeoEnabled: true, showRussianScript: true, parallelActWriting: false };
                setSettings(fresh);
              }}
              className="text-xs font-mono text-mw-slate hover:text-white border border-mw-slate/30 hover:border-white/40 px-3 py-1.5 rounded transition-colors"
            >
              Reset to Defaults
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
