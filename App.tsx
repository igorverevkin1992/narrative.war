
import React, { useState, useCallback, useEffect, useRef, useReducer } from 'react';
import mammoth from 'mammoth';
import { AgentType, INITIAL_STATE } from './types';
import { APP_VERSION, PROJECT_CONFIGS, TOPIC_TEMPLATES } from './constants';
import { stateReducer } from './store/reducer';
import { useAgentPipeline, isDocPipeline } from './hooks/useAgentPipeline';
import { useHistory } from './hooks/useHistory';
import AgentLog from './components/AgentLog';
import ScriptDisplay from './components/ScriptDisplay';
import HistorySidebar from './components/HistorySidebar';
import RichTextDisplay from './components/RichTextDisplay';
import StepEditor from './components/StepEditor';
import ErrorToast from './components/ErrorToast';
import ThumbnailPreview from './components/ThumbnailPreview';
import SeoDisplay from './components/SeoDisplay';
import SettingsPanel from './components/SettingsPanel';

// --- ICONS ---
const ScoutIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>;
const RadarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"/><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M12 2v2"/><path d="M12 22v-2"/><path d="m17 20.66-1-1.73"/><path d="M11 10.27a2 2 0 0 0 2.73 0"/><path d="m20.66 17-1.73-1"/><path d="m3.34 17 1.73-1"/><path d="m14 12 2.55-2.55"/><path d="M8.51 12.28 6 15"/></svg>;
const AnalystIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>;
const ArchitectIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>;
const WriterIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>;
const CircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10"/><path d="M12 8v4l3 3"/><path d="M22 12a10 10 0 0 1-10 10"/></svg>;
const PlanIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>;
const OutlinerIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;

const YOUTUBE_STEPS = [
  { id: AgentType.SCOUT,     label: "The Scout",     icon: ScoutIcon,     desc: "Global Intel Scan" },
  { id: AgentType.RADAR,     label: "The Radar",     icon: RadarIcon,     desc: "Trend Identification" },
  { id: AgentType.ANALYST,   label: "The Analyst",   icon: AnalystIcon,   desc: "Google Grounding" },
  { id: AgentType.ARCHITECT, label: "The Architect", icon: ArchitectIcon, desc: "Structure Map" },
  { id: AgentType.OUTLINER,  label: "The Outliner",  icon: OutlinerIcon,  desc: "Scene Planning" },
  { id: AgentType.WRITER,    label: "The Writer",    icon: WriterIcon,    desc: "Visual Scripting" },
];

const DOCUMENTARY_STEPS = [
  { id: AgentType.SCOUT,        label: "The Scout",       icon: ScoutIcon,     desc: "Global Intel Scan" },
  { id: AgentType.RADAR,        label: "The Radar",       icon: RadarIcon,     desc: "Trend Identification" },
  { id: AgentType.ANALYST,      label: "The Analyst",     icon: AnalystIcon,   desc: "Google Grounding" },
  { id: AgentType.ARCHITECT,    label: "The Architect",   icon: ArchitectIcon, desc: "Investigative Map" },
  { id: AgentType.DOC_CIRCLE,   label: "Doc Circle",      icon: CircleIcon,    desc: "Harmon Circle + 4 Acts" },
  { id: AgentType.ACT_PLANNING, label: "Act Planning",    icon: PlanIcon,      desc: "32-Beat Outline" },
  { id: AgentType.OUTLINER,     label: "Full Treatment",  icon: OutlinerIcon,  desc: "Scene-by-Scene" },
  { id: AgentType.WRITER,       label: "The Writer",      icon: WriterIcon,    desc: "Visual Scripting" },
];

const SHORT_DOC_STEPS = [
  { id: AgentType.SCOUT,        label: "The Scout",       icon: ScoutIcon,     desc: "Global Intel Scan" },
  { id: AgentType.RADAR,        label: "The Radar",       icon: RadarIcon,     desc: "Trend Identification" },
  { id: AgentType.ANALYST,      label: "The Analyst",     icon: AnalystIcon,   desc: "Google Grounding" },
  { id: AgentType.ARCHITECT,    label: "The Architect",   icon: ArchitectIcon, desc: "Investigative Map" },
  { id: AgentType.DOC_CIRCLE,   label: "Doc Circle",      icon: CircleIcon,    desc: "Harmon Circle + 2 Acts" },
  { id: AgentType.ACT_PLANNING, label: "Act Planning",    icon: PlanIcon,      desc: "16-Beat Outline" },
  { id: AgentType.OUTLINER,     label: "Full Treatment",  icon: OutlinerIcon,  desc: "Scene-by-Scene" },
  { id: AgentType.WRITER,       label: "The Writer",      icon: WriterIcon,    desc: "Visual Scripting" },
];

const YOUTUBE_AGENT_ORDER  = [AgentType.SCOUT, AgentType.RADAR, AgentType.ANALYST, AgentType.ARCHITECT, AgentType.OUTLINER, AgentType.WRITER, AgentType.COMPLETED];
const DOCUMENTARY_AGENT_ORDER = [AgentType.SCOUT, AgentType.RADAR, AgentType.ANALYST, AgentType.ARCHITECT, AgentType.DOC_CIRCLE, AgentType.ACT_PLANNING, AgentType.OUTLINER, AgentType.WRITER, AgentType.COMPLETED];

type AppTab = 'intel' | 'research' | 'script' | 'history';

function App() {
  const [state, dispatch] = useReducer(stateReducer, INITIAL_STATE);
  const [editedRadar, setEditedRadar] = useState('');
  const [editedDossier, setEditedDossier] = useState('');
  const [editedStructure, setEditedStructure] = useState('');
  const [editedOutline, setEditedOutline] = useState('');
  const [editedDocCircle, setEditedDocCircle] = useState('');
  const [editedActPlanning, setEditedActPlanning] = useState('');
  const [currentTab, setCurrentTab] = useState<AppTab>('intel');
  const [selectedSuggestion, setSelectedSuggestion] = useState<import('./types').TopicSuggestion | null>(null);
  const [showDraftRestore, setShowDraftRestore] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateCategory, setTemplateCategory] = useState<string>('all');
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addLog = useCallback((msg: string) => {
    dispatch({ type: 'ADD_LOG', message: msg });
  }, []);

  const { loadHistoryFromServer, loadFromHistory, handleDeleteHistory, saveToHistory } = useHistory(dispatch, addLog);

  const pipeline = useAgentPipeline({
    state,
    dispatch,
    addLog,
    saveToHistory,
    setEditedRadar,
    setEditedDossier,
    setEditedStructure,
    setEditedOutline,
    setEditedDocCircle,
    setEditedActPlanning,
  });

  useEffect(() => {
    loadHistoryFromServer();
    // Check for saved draft on startup
    try {
      const saved = localStorage.getItem('narrative_war_draft');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.finalScript?.length || parsed?.researchDossier || parsed?.structureMap) {
          setShowDraftRestore(true);
        }
      }
    } catch { /* ignore */ }
  }, [loadHistoryFromServer]);

  // Debounced auto-save draft to localStorage
  useEffect(() => {
    if (!state.finalScript?.length && !state.researchDossier && !state.structureMap) return;
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      try {
        const draft = {
          topic: state.topic,
          projectType: state.projectType,
          finalScript: state.finalScript,
          researchDossier: state.researchDossier,
          structureMap: state.structureMap,
          scriptOutline: state.scriptOutline,
          radarOutput: state.radarOutput,
          thumbnailConcept: state.thumbnailConcept,
          seoPackage: state.seoPackage,
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem('narrative_war_draft', JSON.stringify(draft));
      } catch { /* storage full or unavailable */ }
    }, 1500);
  }, [state.finalScript, state.researchDossier, state.structureMap, state.topic, state.projectType, state.scriptOutline, state.radarOutput, state.thumbnailConcept, state.seoPackage]);

  // Auto-navigate to the relevant tab when agent data arrives
  useEffect(() => {
    if (state.finalScript?.length) setCurrentTab('script');
    else if (state.scriptOutline || state.docCircle || state.researchDossier || state.structureMap) setCurrentTab('research');
    else if (state.scoutSuggestions || state.radarOutput) setCurrentTab('intel');
  }, [state.finalScript, state.scriptOutline, state.docCircle, state.researchDossier, state.structureMap, state.scoutSuggestions, state.radarOutput]);

  const onDeleteHistory = useCallback((id: number, e: React.MouseEvent) => {
    handleDeleteHistory(id, state.history, e);
  }, [handleDeleteHistory, state.history]);

  const onImageGen = useCallback((index: number) => {
    if (state.finalScript) pipeline.handleImageGen(index, state.finalScript);
  }, [pipeline, state.finalScript]);

  const handleRestoreDraft = useCallback(() => {
    try {
      const saved = localStorage.getItem('narrative_war_draft');
      if (!saved) return;
      const draft = JSON.parse(saved);
      dispatch({ type: 'MERGE', partial: {
        topic: draft.topic ?? '',
        projectType: draft.projectType ?? 'short_doc',
        finalScript: draft.finalScript ?? undefined,
        researchDossier: draft.researchDossier ?? undefined,
        structureMap: draft.structureMap ?? undefined,
        scriptOutline: draft.scriptOutline ?? undefined,
        radarOutput: draft.radarOutput ?? undefined,
        thumbnailConcept: draft.thumbnailConcept ?? undefined,
        seoPackage: draft.seoPackage ?? undefined,
      }});
    } catch { /* ignore */ }
    setShowDraftRestore(false);
  }, [dispatch]);

  const handleDiscardDraft = useCallback(() => {
    localStorage.removeItem('narrative_war_draft');
    setShowDraftRestore(false);
  }, []);

  const steps = state.projectType === 'short_doc' ? SHORT_DOC_STEPS : isDocPipeline(state.projectType) ? DOCUMENTARY_STEPS : YOUTUBE_STEPS;
  const agentOrder = isDocPipeline(state.projectType) ? DOCUMENTARY_AGENT_ORDER : YOUTUBE_AGENT_ORDER;
  const currentIdx = state.currentAgent === 'IDLE' ? -1 : agentOrder.indexOf(state.currentAgent as AgentType);

  return (
    <div className="min-h-screen bg-mw-black text-slate-300 font-sans selection:bg-mw-red selection:text-white">

      {showDraftRestore && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-mw-gray border border-mw-red/60 rounded px-4 py-3 shadow-lg text-sm font-mono">
          <span className="text-mw-red font-bold">DRAFT FOUND</span>
          <span className="text-slate-300">Restore previous session?</span>
          <button onClick={handleRestoreDraft} className="px-3 py-1 bg-mw-red hover:bg-red-700 text-white rounded text-xs font-bold transition-colors">RESTORE</button>
          <button onClick={handleDiscardDraft} className="px-3 py-1 bg-mw-gray/60 hover:bg-mw-gray border border-mw-slate/40 text-slate-400 rounded text-xs transition-colors">DISCARD</button>
        </div>
      )}

      {state.lastError && (
        <ErrorToast
          message={state.lastError}
          onClose={() => dispatch({ type: 'SET_FIELD', field: 'lastError', value: undefined })}
        />
      )}

      <header className="border-b border-mw-slate/30 bg-black/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-mw-red rounded-full animate-pulse shadow-[0_0_10px_#dc2626]" />
            <h1 className="text-xl font-bold tracking-widest text-white">
              NARRATIVE<span className="text-mw-red">.WAR</span>{' '}
              <span className="text-xs text-mw-slate ml-2 font-mono border border-mw-slate/50 px-1 rounded">V{APP_VERSION}</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setCurrentTab('history')}
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-mw-slate hover:text-mw-red transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>
              Projects ({state.history.length})
            </button>
            <div className="font-mono text-xs text-mw-slate hidden sm:block border-l border-mw-slate/30 pl-4">
              STATUS: {state.isProcessing ? 'BUSY' : state.stepStatus === 'WAITING_FOR_APPROVAL' ? 'WAITING' : 'IDLE'}
            </div>
            <button
              onClick={() => setShowSettings(true)}
              title="Settings"
              className="text-mw-slate hover:text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </div>
      </header>
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {/* Tab Navigation Bar */}
      <div className="sticky top-16 z-40 bg-mw-black/95 backdrop-blur border-b border-mw-slate/20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex">
            {([
              { id: 'intel'    as AppTab, label: 'INTEL',    hasData: !!(state.scoutSuggestions || state.radarOutput) },
              { id: 'research' as AppTab, label: 'RESEARCH', hasData: !!(state.researchDossier || state.structureMap) },
              { id: 'script'   as AppTab, label: 'SCRIPT',   hasData: !!(state.finalScript?.length) },
              { id: 'history'  as AppTab, label: 'HISTORY',  hasData: !!(state.history?.length) },
            ]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setCurrentTab(tab.id)}
                className={`px-6 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 ${
                  currentTab === tab.id
                    ? 'border-mw-red text-white'
                    : 'border-transparent text-mw-slate hover:text-white hover:border-mw-slate/50'
                }`}
              >
                {tab.label}
                {tab.hasData && <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start relative">

        {/* Left Column */}
        <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-24 h-fit">
          <div className="bg-mw-gray/30 p-6 rounded-lg border border-mw-slate/30 backdrop-blur-sm">
            <div className="mb-4">
              <label className="block text-xs font-bold text-mw-slate uppercase mb-2 tracking-wider">Agent Models</label>
              <div className="bg-black border border-mw-slate/50 rounded p-3 font-mono text-[11px] space-y-1">
                <div className="flex justify-between"><span className="text-mw-slate">Scout / Radar / Architect</span><span className="text-green-400">Flash</span></div>
                <div className="flex justify-between"><span className="text-mw-slate">Analyst / Writer</span><span className="text-purple-400">Pro</span></div>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold text-mw-slate uppercase mb-2 tracking-wider">Project Format</label>
              <div className="flex gap-2">
                {(Object.entries(PROJECT_CONFIGS).filter(([key]) => key !== 'youtube') as [string, typeof PROJECT_CONFIGS[keyof typeof PROJECT_CONFIGS]][]).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => dispatch({ type: 'SET_FIELD', field: 'projectType', value: key as 'youtube' | 'documentary' | 'short_doc' })}
                    disabled={state.isProcessing}
                    className={`flex-1 py-2 px-3 rounded border text-xs font-bold uppercase tracking-wider transition-all ${
                      state.projectType === key
                        ? 'border-mw-red bg-mw-red/10 text-white'
                        : 'border-mw-slate/40 text-mw-slate hover:border-mw-red/50'
                    } ${state.isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div>{cfg.label}</div>
                    <div className="font-mono font-normal normal-case opacity-70 mt-0.5">{cfg.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-mw-red uppercase tracking-wider">Target Vector (Topic)</label>
              <button
                onClick={() => setShowTemplates(v => !v)}
                className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border transition-all ${showTemplates ? 'border-cyan-500/60 text-cyan-300 bg-cyan-900/20' : 'border-mw-slate/30 text-mw-slate hover:border-cyan-400/50 hover:text-cyan-400'}`}
              >
                {showTemplates ? '▼ Templates' : '▶ Templates'}
              </button>
            </div>

            {showTemplates && (
              <div className="mb-3 bg-black/30 border border-mw-slate/20 rounded p-3 flex flex-col gap-2">
                {/* Category filter */}
                <div className="flex flex-wrap gap-1">
                  {(['all', 'geopolitics', 'business', 'history', 'crime', 'technology', 'society'] as const).map(cat => (
                    <button
                      key={cat}
                      onClick={() => setTemplateCategory(cat)}
                      className={`px-2 py-0.5 text-[10px] font-mono uppercase rounded border transition-all ${templateCategory === cat ? 'border-cyan-500/60 text-cyan-300 bg-cyan-900/20' : 'border-mw-slate/30 text-mw-slate hover:border-white/30'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                {/* Template list */}
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {TOPIC_TEMPLATES.filter(t => templateCategory === 'all' || t.category === templateCategory).map(t => (
                    <button
                      key={t.id}
                      disabled={state.isProcessing}
                      onClick={() => {
                        dispatch({ type: 'SET_FIELD', field: 'topic', value: t.scaffold });
                        setShowTemplates(false);
                      }}
                      className="text-left px-2 py-1.5 rounded border border-mw-slate/20 hover:border-cyan-500/40 hover:bg-cyan-900/10 transition-all group"
                    >
                      <div className="text-[10px] font-bold text-slate-200 group-hover:text-cyan-200">{t.name}</div>
                      <div className="text-[10px] text-mw-slate/70 font-mono truncate">{t.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={state.topic}
                onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'topic', value: e.target.value })}
                placeholder="Manual topic or select a template above..."
                className="w-full bg-black border border-mw-slate/50 rounded p-3 text-white focus:border-mw-red focus:ring-1 focus:ring-mw-red outline-none transition-all placeholder:text-mw-slate/50 font-mono"
                disabled={state.isProcessing || state.stepStatus !== 'IDLE'}
              />
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={pipeline.executeScout}
                disabled={state.isProcessing || (state.currentAgent !== 'IDLE' && state.currentAgent !== AgentType.COMPLETED)}
                className={`w-full py-3 px-4 rounded font-bold uppercase tracking-widest transition-all border border-mw-red/50 text-mw-red hover:bg-mw-red hover:text-white flex items-center justify-center gap-2 ${state.isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <ScoutIcon />
                SCAN GLOBAL INTEL (IDEAS)
              </button>
              <button
                onClick={() => pipeline.executeRadar()}
                disabled={state.isProcessing || !state.topic || (state.currentAgent !== 'IDLE' && state.currentAgent !== AgentType.COMPLETED)}
                className={`w-full py-3 px-4 rounded font-bold uppercase tracking-widest transition-all ${
                  state.isProcessing || (state.currentAgent !== 'IDLE' && state.currentAgent !== AgentType.COMPLETED)
                    ? 'bg-mw-slate/20 text-mw-slate cursor-not-allowed'
                    : 'bg-mw-red hover:bg-red-700 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)]'
                }`}
              >
                {state.isProcessing ? 'Executing...' : 'Run Sequence (Manual Topic)'}
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={async () => {
                  dispatch({ type: 'SET_FIELD', field: 'isSteppable', value: false });
                  const suggestions = await pipeline.executeScout();
                  if (suggestions && suggestions.length > 0) {
                    pipeline.handleSelectTopic(suggestions[0]);
                  }
                }}
                disabled={state.isProcessing || (state.currentAgent !== 'IDLE' && state.currentAgent !== AgentType.COMPLETED)}
                className={`w-full py-2.5 px-4 rounded font-bold uppercase tracking-widest transition-all text-sm border border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/30 hover:border-cyan-400 flex items-center justify-center gap-2 ${state.isProcessing ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Full Auto Run
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <div
                onClick={() => !state.isProcessing && dispatch({ type: 'SET_FIELD', field: 'isSteppable', value: !state.isSteppable })}
                className={`cursor-pointer flex items-center gap-2 px-3 py-2 rounded border transition-all ${state.isSteppable ? 'border-mw-red bg-mw-red/10 text-white' : 'border-mw-slate/50 text-mw-slate'}`}
              >
                <div className={`w-3 h-3 rounded-full ${state.isSteppable ? 'bg-mw-red' : 'bg-mw-slate'}`} />
                <span className="text-xs font-bold uppercase tracking-wider">Steppable Mode</span>
              </div>
              <label className={`cursor-pointer flex items-center gap-2 px-3 py-2 rounded border transition-all border-indigo-500/50 text-indigo-300 hover:bg-indigo-900/20 hover:border-indigo-400 ${state.isProcessing ? 'opacity-50 pointer-events-none' : ''}`} title="Import script from .json or .csv (export first from ScriptDisplay)">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <span className="text-xs font-bold uppercase tracking-wider">Import Script</span>
                <input
                  type="file"
                  accept=".json,.csv,.doc,.docx"
                  className="hidden"
                  disabled={state.isProcessing}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    e.target.value = '';

                    const importBlocks = (blocks: import('./types').ScriptBlock[]) => {
                      dispatch({ type: 'SET_FIELD', field: 'finalScript', value: blocks });
                      addLog(`>>> IMPORTED: ${blocks.length} blocks from "${file.name}"`);
                    };

                    const parseCSVText = (text: string) => {
                      const lines = text.split('\n').filter(l => l.trim());
                      const dataLines = lines.slice(1);
                      const blocks = dataLines.map(line => {
                        const fields: string[] = [];
                        let cur = '', inQuote = false;
                        for (let i = 0; i < line.length; i++) {
                          if (line[i] === '"') { inQuote = !inQuote; }
                          else if (line[i] === ',' && !inQuote) { fields.push(cur); cur = ''; }
                          else { cur += line[i]; }
                        }
                        fields.push(cur);
                        return {
                          timecode: fields[0]?.trim() ?? '',
                          blockType: (fields[1]?.trim() ?? 'BODY') as import('./types').ScriptBlock['blockType'],
                          visualCue: fields[2]?.trim() ?? '',
                          audioScript: fields[3]?.trim() ?? '',
                          russianScript: fields[4]?.trim() ?? '',
                          overlayFX: '',
                        };
                      }).filter(b => b.timecode || b.audioScript);
                      if (!blocks.length) throw new Error('No rows found in CSV');
                      return blocks;
                    };

                    const parseDocxText = (rawText: string) => {
                      // Our .doc export labels each field clearly:
                      // "00:00 - 00:30 [HOOK]", "VISUAL: ...", "AUDIO (EN): ...", "AUDIO (RU): ..."
                      // Field values can span multiple lines — accumulate until the next marker.
                      // Normalize: tabs (Word table cells) → newlines, then split on \r\n or \n
                      const rawLines = rawText.replace(/\u00a0/g, ' ').replace(/\t/g, '\n').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                      // Re-join labels Word HTML splits across leaf elements:
                      //   "AUDIO" + "(EN): text" → "AUDIO (EN): text"
                      //   "VISUAL" + ": text"    → "VISUAL: text"
                      const lines: string[] = [];
                      for (let i = 0; i < rawLines.length; i++) {
                        const l = rawLines[i], nx = rawLines[i + 1] ?? '';
                        if ((l === 'AUDIO' || l === 'VISUAL') && /^\(/.test(nx)) { lines.push(l + ' ' + nx); i++; }
                        else if ((l === 'AUDIO' || l === 'VISUAL') && /^[：:]/.test(nx)) { lines.push(l + nx); i++; }
                        else { lines.push(l); }
                      }
                      const blocks: import('./types').ScriptBlock[] = [];
                      let current: Partial<import('./types').ScriptBlock> | null = null;
                      let activeField: 'visualCue' | 'audioScript' | 'russianScript' | null = null;
                      // [BLOCKTYPE] is optional — Word may strip or separate the brackets
                      const tcPattern = /^(\d{1,2}:\d{2}(?::\d{2})?\s*[-–]\s*\d{1,2}:\d{2}(?::\d{2})?)(?:\s*\[([A-Z]+)\])?/;
                      // Regex-based field matchers — robust against fullwidth parens, varied spacing, different colons
                      const mVisual  = (l: string) => l.match(/^VISUAL\s*[：:]\s*(.*)/i);
                      const mAudioEn = (l: string) => l.match(/^AUDIO\s*[\u0028\uff08]EN[\u0029\uff09]\s*[：:]\s*(.*)/i);
                      const mAudioRu = (l: string) => l.match(/^AUDIO\s*[\u0028\uff08]RU[\u0029\uff09]\s*[：:]\s*(.*)/i);
                      // Diagnostics: show char codes of the first AUDIO line in block 6 to identify invisible chars
                      const tcLines = lines.filter(l => tcPattern.test(l));
                      const tc6idx = lines.findIndex((l, i) => i > 0 && tcPattern.test(l) && lines.slice(0, i).filter(ll => tcPattern.test(ll)).length === 5);
                      const audioLineNear6 = lines.slice(tc6idx, tc6idx + 10).find(l => l.toUpperCase().includes('AUDIO'));
                      const charCodes = audioLineNear6 ? [...audioLineNear6.slice(0, 20)].map(c => c.charCodeAt(0).toString(16)).join(' ') : 'none';
                      addLog(`>>> PARSE DIAG: ${lines.length} lines | ${tcLines.length} timecodes\n  TC6 AUDIO line: "${audioLineNear6?.slice(0, 40)}"\n  char codes: ${charCodes}`);
                      const isMarker = (l: string) => tcPattern.test(l) || !!mVisual(l) || !!mAudioEn(l) || !!mAudioRu(l);
                      for (const line of lines) {
                        const tcMatch = line.match(tcPattern);
                        if (tcMatch) {
                          if (current?.audioScript) blocks.push({ timecode: '', visualCue: '', overlayFX: '', audioScript: '', russianScript: '', blockType: 'BODY', ...current });
                          current = { timecode: tcMatch[1].trim(), blockType: (tcMatch[2] as import('./types').ScriptBlock['blockType']) ?? 'BODY', visualCue: '', overlayFX: '', audioScript: '', russianScript: '' };
                          activeField = null;
                          // Single-line block: all fields merged after the timecode
                          const rest = line.slice(tcMatch[0].length).trim();
                          if (mAudioEn(rest)) {
                            const vm = rest.match(/VISUAL\s*[：:]\s*(.*?)(?=AUDIO\s*[\u0028\uff08]EN[\u0029\uff09])/i);
                            const em = mAudioEn(rest);
                            const rm = mAudioRu(rest);
                            if (vm) current.visualCue = vm[1].trim();
                            if (em) current.audioScript = em[1].split(/AUDIO\s*[\u0028\uff08]RU[\u0029\uff09]/i)[0].trim();
                            if (rm) current.russianScript = rm[1].trim();
                          }
                        } else if (current) {
                          const vm = mVisual(line); const em = mAudioEn(line); const rm = mAudioRu(line);
                          if (vm) { current.visualCue = vm[1]; activeField = 'visualCue'; }
                          else if (em) { current.audioScript = em[1]; activeField = 'audioScript'; }
                          else if (rm) { current.russianScript = rm[1]; activeField = 'russianScript'; }
                          else if (activeField && !isMarker(line)) {
                            // Continuation of the previous field
                            current[activeField] = (current[activeField] ?? '') + ' ' + line;
                          }
                        }
                      }
                      if (current?.audioScript) blocks.push({ timecode: '', visualCue: '', overlayFX: '', audioScript: '', russianScript: '', blockType: 'BODY', ...current });
                      if (!blocks.length) throw new Error('No script blocks found in document. Make sure the file was exported from Narrative.War.');
                      return blocks;
                    };

                    if (file.name.endsWith('.json')) {
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        try {
                          const parsed = JSON.parse(ev.target?.result as string);
                          const blocks = Array.isArray(parsed) ? parsed : parsed.script ?? parsed.finalScript;
                          if (!Array.isArray(blocks) || !blocks.length) throw new Error('No script blocks found in JSON');
                          importBlocks(blocks);
                        } catch (err) { addLog(`>>> IMPORT ERROR: ${err instanceof Error ? err.message : String(err)}`); }
                      };
                      reader.readAsText(file, 'utf-8');
                    } else if (file.name.endsWith('.csv')) {
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        try { importBlocks(parseCSVText(ev.target?.result as string)); }
                        catch (err) { addLog(`>>> IMPORT ERROR: ${err instanceof Error ? err.message : String(err)}`); }
                      };
                      reader.readAsText(file, 'utf-8');
                    } else {
                      // .doc or .docx — first try as text (our HTML export), then mammoth (real DOCX)
                      const textReader = new FileReader();
                      textReader.onload = async (ev) => {
                        try {
                          const text = ev.target?.result as string;
                          const isHtml = text.trimStart().toLowerCase().startsWith('<');
                          if (isHtml) {
                            // Our HTML-based .doc export parsed via DOMParser
                            const doc = new DOMParser().parseFromString(text, 'text/html');
                            const blockEls = doc.querySelectorAll('.block');
                            if (blockEls.length) {
                              // Classes intact — parse structurally
                              const blocks = Array.from(blockEls).map(el => {
                                const timeText = el.querySelector('.time')?.textContent ?? '';
                                const tcMatch = timeText.match(/^([\d:]+\s*[-–]\s*[\d:]+)\s*\[([A-Z]+)\]/);
                                const visualText = el.querySelector('.visual')?.textContent ?? '';
                                const audioText = el.querySelector('.audio')?.textContent ?? '';
                                const russianText = el.querySelector('.russian')?.textContent ?? '';
                                return {
                                  timecode: tcMatch?.[1]?.trim() ?? timeText.trim(),
                                  blockType: (tcMatch?.[2] ?? 'BODY') as import('./types').ScriptBlock['blockType'],
                                  visualCue: visualText.replace(/^VISUAL:\s*/, '').trim(),
                                  audioScript: audioText.replace(/^AUDIO \(EN\):\s*/, '').trim(),
                                  russianScript: russianText.replace(/^AUDIO \(RU\):\s*/, '').trim(),
                                  overlayFX: '',
                                };
                              }).filter(b => b.audioScript);
                              if (!blocks.length) throw new Error('No script blocks found in HTML document');
                              importBlocks(blocks);
                            } else {
                              // Word stripped CSS classes — extract text from each leaf block element
                              // textContent on leaf elements preserves actual Unicode text without encoding issues
                              const textParts: string[] = [];
                              doc.body.querySelectorAll('p, div, td, h1, h2, h3, h4, li').forEach(el => {
                                if (!el.querySelector('p, div, td, h1, h2, h3, h4, li')) {
                                  // Normalize non-breaking spaces (Word HTML &nbsp; → \u00a0) to regular spaces
                                  const t = el.textContent?.replace(/\u00a0/g, ' ').trim();
                                  if (t) textParts.push(t);
                                }
                              });
                              const rawHtmlText = textParts.join('\n');
                              const audioLineCount = rawHtmlText.split('\n').filter(l => l.includes('AUDIO (EN):')).length;
                              addLog(`>>> DOC HTML RAW (first 30 lines, ${audioLineCount} AUDIO(EN) markers):\n${rawHtmlText.split('\n').slice(0, 30).join('\n')}`);
                              importBlocks(parseDocxText(rawHtmlText));
                            }
                          } else {
                            // Real DOCX (ZIP) — use mammoth via ArrayBuffer
                            const abReader = new FileReader();
                            abReader.onload = async (abEv) => {
                              try {
                                const arrayBuffer = abEv.target?.result as ArrayBuffer;
                                const result = await mammoth.extractRawText({ arrayBuffer });
                                const preview = result.value.split('\n').slice(0, 30).join('\n');
                                addLog(`>>> DOCX RAW (first 30 lines):\n${preview}`);
                                importBlocks(parseDocxText(result.value));
                              } catch (err) { addLog(`>>> IMPORT ERROR: ${err instanceof Error ? err.message : String(err)}`); }
                            };
                            abReader.readAsArrayBuffer(file);
                          }
                        } catch (err) { addLog(`>>> IMPORT ERROR: ${err instanceof Error ? err.message : String(err)}`); }
                      };
                      textReader.readAsText(file, 'utf-8');
                    }
                  }}
                />
              </label>
            </div>
          </div>

          {/* Agent chain */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-mw-slate uppercase tracking-wider pl-1">Chain of Agents</h3>
            {steps.map((step) => {
              const isActive = state.currentAgent === step.id;
              const thisIdx = agentOrder.indexOf(step.id);
              const isPast = currentIdx > thisIdx;
              return (
                <div key={step.id} className={`flex items-center gap-4 p-4 rounded border transition-all ${isActive ? 'bg-mw-red/10 border-mw-red text-white' : isPast ? 'bg-mw-gray/20 border-mw-slate/30 text-green-500' : 'bg-transparent border-transparent text-mw-slate opacity-50'}`}>
                  <step.icon />
                  <div>
                    <div className="font-bold text-sm uppercase">{step.label}</div>
                    <div className="text-xs font-mono opacity-70">{step.desc}</div>
                  </div>
                  {isActive && <div className="ml-auto w-2 h-2 bg-mw-red rounded-full animate-ping" />}
                  {isPast && <div className="ml-auto text-green-500 text-xs font-mono">[OK]</div>}
                </div>
              );
            })}
          </div>

          <AgentLog logs={state.logs} />

          {/* Writer progress bar — visible only during streaming */}
          {state.currentAgent === AgentType.WRITER && typeof state.writerChunks === 'number' && (
            <div className="mt-2 px-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-mw-slate mb-1">
                <span>WRITER: STREAMING</span>
                <span>{state.writerChunks} chunks</span>
              </div>
              <div className="w-full h-1 bg-mw-gray/40 rounded overflow-hidden">
                <div
                  className="h-full bg-mw-red transition-all duration-300 rounded"
                  style={{ width: `${Math.min(100, (state.writerChunks / 400) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Tab Content */}
        <div className="lg:col-span-8 space-y-6">

          {/* ── INTEL TAB ────────────────────────────────────────────── */}
          <div className={`space-y-6 ${currentTab !== 'intel' ? 'hidden' : ''}`}>
              {state.currentAgent === 'IDLE' && !state.scoutSuggestions && !state.radarOutput && (
                <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-mw-slate/20 rounded-lg p-12 text-center opacity-50">
                  <div className="text-6xl mb-4">&#x1F310;</div>
                  <h2 className="text-2xl font-bold mb-2">Awaiting Directive</h2>
                  <p className="max-w-md mx-auto">Click "SCAN GLOBAL INTEL" to brainstorm topics with the Scout Agent, or enter a target manually.</p>
                </div>
              )}
              {state.scoutSuggestions && (
                <div className={`bg-mw-gray/20 p-6 rounded border ${state.currentAgent === AgentType.SCOUT ? 'border-mw-red shadow-[0_0_15px_rgba(220,38,38,0.2)]' : 'border-mw-slate/30'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-mw-red font-mono text-xs">/// SCOUT_INTEL_REPORT (SELECT ONE)</h4>
                    <button onClick={pipeline.executeScout} disabled={state.isProcessing} className="font-mono text-xs border border-mw-slate/50 px-3 py-1 rounded hover:border-mw-red hover:text-mw-red transition-all disabled:opacity-30 disabled:cursor-not-allowed text-mw-slate">
                      [↻ RESCAN]
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {state.scoutSuggestions.map((suggestion, idx) => {
                      const isSelected = selectedSuggestion?.title === suggestion.title;
                      return (
                        <div key={idx} onClick={() => setSelectedSuggestion(isSelected ? null : suggestion)} className={`bg-black/50 border p-4 rounded cursor-pointer transition-all group ${isSelected ? 'border-mw-red bg-mw-red/10 shadow-[0_0_12px_rgba(220,38,38,0.25)]' : 'border-mw-slate/50 hover:border-mw-red/60 hover:bg-mw-red/5'}`}>
                          <h3 className={`font-bold mb-2 ${isSelected ? 'text-mw-red' : 'text-white group-hover:text-mw-red/80'}`}>{suggestion.title}</h3>
                          <p className="text-xs text-gray-400 mb-2">{suggestion.hook}</p>
                          {suggestion.sourceUrl && (
                            <a href={suggestion.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-[10px] text-blue-400 hover:text-blue-300 underline underline-offset-2 block truncate mb-2">
                              ↗ {suggestion.searchQuery ?? 'Verify on Google'}
                            </a>
                          )}
                          <div className="text-[10px] uppercase font-bold text-mw-slate border-t border-mw-slate/20 pt-2 mt-2">
                            Viral Factor: {suggestion.viralFactor}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {selectedSuggestion && (
                    <div className="mt-4 flex items-center gap-3">
                      <div className="flex-1 text-xs text-gray-400 font-mono">
                        SELECTED: <span className="text-white">{selectedSuggestion.title}</span>
                      </div>
                      <button
                        onClick={() => { pipeline.handleSelectTopic(selectedSuggestion); setSelectedSuggestion(null); }}
                        disabled={state.isProcessing}
                        className="font-mono text-xs bg-mw-red/20 border border-mw-red px-4 py-2 rounded hover:bg-mw-red/40 transition-all disabled:opacity-30 disabled:cursor-not-allowed text-white"
                      >
                        [▶ CONFIRM &amp; START RESEARCH]
                      </button>
                    </div>
                  )}
                </div>
              )}
              {state.radarOutput && (
                <div className={`bg-mw-gray/20 p-6 rounded border ${state.currentAgent === AgentType.RADAR ? 'border-mw-red shadow-[0_0_15px_rgba(220,38,38,0.2)]' : 'border-mw-slate/30'}`}>
                  <h4 className="text-mw-red font-mono text-xs mb-2">/// RADAR_INTERCEPT_DATA</h4>
                  {state.stepStatus === 'WAITING_FOR_APPROVAL' && state.currentAgent === AgentType.RADAR ? (
                    <StepEditor value={editedRadar} originalValue={state.radarOutput ?? ''} onChange={setEditedRadar} onApprove={() => pipeline.handleApproveRadar(editedRadar)} approveLabel="Approve &amp; Run Analyst →" borderColor="border-mw-red/50" textColor="text-gray-300" height="h-48" />
                  ) : (
                    <RichTextDisplay content={state.radarOutput} />
                  )}
                </div>
              )}
          </div>

          {/* ── RESEARCH TAB ─────────────────────────────────────────── */}
          <div className={`space-y-6 ${currentTab !== 'research' ? 'hidden' : ''}`}>
              {!state.researchDossier && !state.structureMap && (
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-mw-slate/20 rounded-lg p-12 text-center opacity-50">
                  <div className="text-5xl mb-4">📋</div>
                  <p className="text-sm text-mw-slate">Research will appear here after the Analyst and Architect agents run.</p>
                </div>
              )}
              {state.researchDossier && (
                <div className={`bg-mw-gray/20 p-6 rounded border ${state.currentAgent === AgentType.ANALYST ? 'border-mw-red shadow-[0_0_15px_rgba(220,38,38,0.2)]' : 'border-mw-slate/30'}`}>
                  <h4 className="text-blue-400 font-mono text-xs mb-2">/// ANALYST_DOSSIER (TEXT)</h4>
                  {state.stepStatus === 'WAITING_FOR_APPROVAL' && state.currentAgent === AgentType.ANALYST ? (
                    <StepEditor value={editedDossier} originalValue={state.researchDossier ?? ''} onChange={setEditedDossier} onApprove={() => pipeline.handleApproveAnalyst(editedDossier)} approveLabel="Approve &amp; Run Architect →" borderColor="border-blue-500/50" textColor="text-blue-100" />
                  ) : (
                    <RichTextDisplay content={state.researchDossier} />
                  )}
                </div>
              )}
              {state.structureMap && (
                <div className={`bg-mw-gray/20 p-6 rounded border ${state.currentAgent === AgentType.ARCHITECT ? 'border-mw-red shadow-[0_0_15px_rgba(220,38,38,0.2)]' : 'border-mw-slate/30'}`}>
                  <h4 className="text-green-500 font-mono text-xs mb-2">
                    {state.projectType === 'documentary' ? '/// ARCHITECT_THEMATIC_MAP' : '/// ARCHITECT_BLUEPRINT'}
                  </h4>
                  {state.stepStatus === 'WAITING_FOR_APPROVAL' && state.currentAgent === AgentType.ARCHITECT ? (
                    <StepEditor value={editedStructure} originalValue={state.structureMap ?? ''} onChange={setEditedStructure} onApprove={() => pipeline.handleApproveArchitect(editedStructure, state.researchDossier)} approveLabel={state.projectType === 'documentary' ? 'Approve Blueprint → Run Story Circle →' : 'Approve &amp; Run Outliner →'} borderColor="border-green-500/50" textColor="text-green-100" />
                  ) : (
                    <RichTextDisplay content={state.structureMap} />
                  )}
                </div>
              )}
              {state.docCircle && isDocPipeline(state.projectType) && (
                <div className={`bg-mw-gray/20 p-6 rounded border ${state.currentAgent === AgentType.DOC_CIRCLE ? 'border-mw-red shadow-[0_0_15px_rgba(220,38,38,0.2)]' : 'border-violet-500/40'}`}>
                  <div className="flex gap-2 mb-3">
                    {(['CIRCLE', 'ACT PLANNING', 'FULL OUTLINE'] as const).map((label, i) => {
                      const done = i === 0 ? !!state.actPlanning : i === 1 ? !!state.scriptOutline : false;
                      const active = i === 0 ? state.currentAgent === AgentType.DOC_CIRCLE : i === 1 ? state.currentAgent === AgentType.ACT_PLANNING : state.currentAgent === AgentType.OUTLINER;
                      return (
                        <span key={label} className={`text-[9px] font-bold px-2 py-0.5 rounded border font-mono ${
                          active ? 'border-white text-white' : done ? 'border-green-500 text-green-400' : 'border-slate-600 text-slate-600'
                        }`}>{done ? '✓ ' : ''}{label}</span>
                      );
                    })}
                  </div>
                  <h4 className="text-violet-400 font-mono text-xs mb-2">/// DOC_CIRCLE — STEPS 1-3: CONFLICTS + GLOBAL CIRCLE + 4 ACTS</h4>
                  {state.stepStatus === 'WAITING_FOR_APPROVAL' && state.currentAgent === AgentType.DOC_CIRCLE ? (
                    <StepEditor value={editedDocCircle} originalValue={state.docCircle ?? ''} onChange={setEditedDocCircle} onApprove={() => pipeline.handleApproveDocCircle(editedDocCircle, state.structureMap ?? '', state.researchDossier)} approveLabel="Approve Circle → Build Act Planning →" borderColor="border-violet-500/50" textColor="text-violet-100" />
                  ) : (
                    <RichTextDisplay content={state.docCircle} />
                  )}
                </div>
              )}
              {state.actPlanning && isDocPipeline(state.projectType) && (
                <div className={`bg-mw-gray/20 p-6 rounded border ${state.currentAgent === AgentType.ACT_PLANNING ? 'border-mw-red shadow-[0_0_15px_rgba(220,38,38,0.2)]' : 'border-indigo-500/40'}`}>
                  <div className="flex gap-2 mb-3">
                    {(['CIRCLE', 'ACT PLANNING', 'FULL OUTLINE'] as const).map((label, i) => {
                      const done = i === 0 ? true : i === 1 ? !!state.scriptOutline : false;
                      const active = i === 1 ? state.currentAgent === AgentType.ACT_PLANNING : i === 2 ? state.currentAgent === AgentType.OUTLINER : false;
                      return (
                        <span key={label} className={`text-[9px] font-bold px-2 py-0.5 rounded border font-mono ${
                          active ? 'border-white text-white' : done ? 'border-green-500 text-green-400' : 'border-slate-600 text-slate-600'
                        }`}>{done ? '✓ ' : ''}{label}</span>
                      );
                    })}
                  </div>
                  <h4 className="text-indigo-400 font-mono text-xs mb-2">/// ACT_PLANNING — STEPS 4-5: ACT CIRCLES + {state.projectType === 'short_doc' ? '16' : '32'}-BEAT OUTLINE</h4>
                  {state.stepStatus === 'WAITING_FOR_APPROVAL' && state.currentAgent === AgentType.ACT_PLANNING ? (
                    <StepEditor value={editedActPlanning} originalValue={state.actPlanning ?? ''} onChange={setEditedActPlanning} onApprove={() => pipeline.handleApproveActPlanning(editedActPlanning, state.docCircle ?? '', state.structureMap ?? '', state.researchDossier)} approveLabel="Approve Act Planning → Generate Full Outline →" borderColor="border-indigo-500/50" textColor="text-indigo-100" height="h-[40rem]" />
                  ) : (
                    <RichTextDisplay content={state.actPlanning} />
                  )}
                </div>
              )}
              {state.scriptOutline && !state.finalScript && (
                <div className={`bg-mw-gray/20 p-6 rounded border ${state.currentAgent === AgentType.OUTLINER ? 'border-mw-red shadow-[0_0_15px_rgba(220,38,38,0.2)]' : 'border-amber-500/40'}`}>
                  {isDocPipeline(state.projectType) && (
                    <div className="flex gap-2 mb-3">
                      {(['CIRCLE', 'ACT PLANNING', 'FULL OUTLINE'] as const).map((label, i) => {
                        const done = i < 2 ? true : false;
                        const active = i === 2 ? state.currentAgent === AgentType.OUTLINER : false;
                        return (
                          <span key={label} className={`text-[9px] font-bold px-2 py-0.5 rounded border font-mono ${
                            active ? 'border-white text-white' : done ? 'border-green-500 text-green-400' : 'border-slate-600 text-slate-600'
                          }`}>{done ? '✓ ' : ''}{label}</span>
                        );
                      })}
                    </div>
                  )}
                  <h4 className="text-amber-400 font-mono text-xs mb-2">/// FULL OUTLINE — AWAITING YOUR APPROVAL</h4>
                  {state.stepStatus === 'WAITING_FOR_APPROVAL' && !state.isProcessing ? (
                    <StepEditor value={editedOutline} originalValue={state.scriptOutline ?? ''} onChange={setEditedOutline} onApprove={() => pipeline.handleApproveOutline(editedOutline, state.structureMap ?? '', state.researchDossier)} approveLabel="Approve Outline &amp; Generate Script →" borderColor="border-amber-500/50" textColor="text-amber-100" />
                  ) : (
                    <RichTextDisplay content={state.scriptOutline} />
                  )}
                </div>
              )}
              {state.thumbnailConcept && (
                <ThumbnailPreview
                  thumbnailConcept={state.thumbnailConcept}
                  previewImageUrl={state.previewImageUrl}
                  isProcessing={state.isProcessing}
                  onGenerate={pipeline.handlePreviewGen}
                />
              )}
          </div>

          {/* ── SCRIPT TAB ───────────────────────────────────────────── */}
          {currentTab === 'script' && (
            <>
              {!state.finalScript?.length && !state.documentaryActs && (
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-mw-slate/20 rounded-lg p-12 text-center opacity-50">
                  <div className="text-5xl mb-4">✍️</div>
                  <p className="text-sm text-mw-slate">The final script will appear here after the Writer agent completes.</p>
                </div>
              )}
              {state.currentWritingAct !== undefined && state.documentaryActs && (
                <div className="bg-mw-gray/20 p-4 rounded border border-mw-red/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-mw-red uppercase tracking-wider font-mono">Documentary Writer</span>
                    <span className="text-xs font-mono text-mw-slate">
                      Act {state.currentWritingAct + 1} / {state.documentaryActs.length}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mb-2 truncate">
                    {state.documentaryActs[state.currentWritingAct]?.block}
                  </div>
                  <div className="w-full bg-black/50 rounded-full h-1.5">
                    <div
                      className="bg-mw-red h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${((state.currentWritingAct + 1) / state.documentaryActs.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              {state.finalScript && (
                <>
                  <div className="flex justify-center gap-3 flex-wrap">
                    <button onClick={pipeline.executeSEO} disabled={state.isProcessing} className={`px-5 py-2 rounded font-bold uppercase tracking-widest transition-all border text-xs ${state.isProcessing ? 'border-mw-slate/30 text-mw-slate cursor-not-allowed opacity-50' : 'border-yellow-500/50 text-yellow-300 hover:bg-yellow-900/30 hover:border-yellow-400'}`}>
                      {state.isProcessing ? 'Processing...' : 'Generate SEO Package'}
                    </button>
                    <button onClick={pipeline.executeRewrite} disabled={state.isProcessing} className={`px-5 py-2 rounded font-bold uppercase tracking-widest transition-all border text-xs ${state.isProcessing ? 'border-mw-slate/30 text-mw-slate cursor-not-allowed opacity-50' : 'border-indigo-500/50 text-indigo-300 hover:bg-indigo-900/30 hover:border-indigo-400'}`}>
                      {state.isProcessing ? 'Processing...' : 'Rewrite (Fix Repetitions)'}
                    </button>
                    <button onClick={pipeline.executeAuditFix} disabled={state.isProcessing} className={`px-5 py-2 rounded font-bold uppercase tracking-widest transition-all border text-xs ${state.isProcessing ? 'border-mw-slate/30 text-mw-slate cursor-not-allowed opacity-50' : 'border-amber-500/50 text-amber-300 hover:bg-amber-900/30 hover:border-amber-400'}`}>
                      {state.isProcessing ? 'Processing...' : 'Fix Audit Issues'}
                    </button>
                  </div>
                  <ScriptDisplay
                    script={state.finalScript}
                    topic={state.topic}
                    projectType={state.projectType}
                    radarContent={state.radarOutput}
                    analystContent={state.researchDossier}
                    architectContent={state.structureMap}
                    thumbnailConcept={state.thumbnailConcept}
                    seo={state.seoPackage}
                    onGenerateImage={onImageGen}
                    dispatch={dispatch}
                    undoStack={state.undoStack}
                    redoStack={state.redoStack}
                  />
                  {state.seoPackage && <SeoDisplay seo={state.seoPackage} />}
                </>
              )}
            </>
          )}

          {/* ── HISTORY TAB ──────────────────────────────────────────── */}
          {currentTab === 'history' && (
            <HistorySidebar
              history={state.history}
              isOpen={false}
              onClose={() => {}}
              onSelect={loadFromHistory}
              onDelete={onDeleteHistory}
              inline
            />
          )}

        </div>
      </main>
    </div>
  );
}

export default App;
