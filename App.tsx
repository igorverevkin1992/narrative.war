
import React, { useState, useCallback, useEffect, useReducer } from 'react';
import { AgentType, INITIAL_STATE } from './types';
import { APP_VERSION } from './constants';
import { stateReducer } from './store/reducer';
import { useAgentPipeline } from './hooks/useAgentPipeline';
import { useHistory } from './hooks/useHistory';
import AgentLog from './components/AgentLog';
import ScriptDisplay from './components/ScriptDisplay';
import HistorySidebar from './components/HistorySidebar';
import RichTextDisplay from './components/RichTextDisplay';
import StepEditor from './components/StepEditor';
import ErrorToast from './components/ErrorToast';

// --- ICONS ---
const ScoutIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>;
const RadarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"/><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M12 2v2"/><path d="M12 22v-2"/><path d="m17 20.66-1-1.73"/><path d="M11 10.27a2 2 0 0 0 2.73 0"/><path d="m20.66 17-1.73-1"/><path d="m3.34 17 1.73-1"/><path d="m14 12 2.55-2.55"/><path d="M8.51 12.28 6 15"/></svg>;
const AnalystIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>;
const ArchitectIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>;
const WriterIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>;

const STEPS = [
  { id: AgentType.SCOUT, label: "The Scout", icon: ScoutIcon, desc: "Global Intel Scan" },
  { id: AgentType.RADAR, label: "The Radar", icon: RadarIcon, desc: "Trend Identification" },
  { id: AgentType.ANALYST, label: "The Analyst", icon: AnalystIcon, desc: "Google Grounding" },
  { id: AgentType.ARCHITECT, label: "The Architect", icon: ArchitectIcon, desc: "Structure Mapping" },
  { id: AgentType.WRITER, label: "The Writer", icon: WriterIcon, desc: "Visual Scripting" },
];

const AGENT_ORDER = [AgentType.SCOUT, AgentType.RADAR, AgentType.ANALYST, AgentType.ARCHITECT, AgentType.WRITER, AgentType.COMPLETED];

function App() {
  const [state, dispatch] = useReducer(stateReducer, INITIAL_STATE);
  const [editedRadar, setEditedRadar] = useState('');
  const [editedDossier, setEditedDossier] = useState('');
  const [editedStructure, setEditedStructure] = useState('');

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
  });

  useEffect(() => {
    loadHistoryFromServer();
  }, [loadHistoryFromServer]);

  const onDeleteHistory = useCallback((id: number, e: React.MouseEvent) => {
    handleDeleteHistory(id, state.history, e);
  }, [handleDeleteHistory, state.history]);

  const onImageGen = useCallback((index: number) => {
    if (state.finalScript) pipeline.handleImageGen(index, state.finalScript);
  }, [pipeline, state.finalScript]);

  const currentIdx = state.currentAgent === 'IDLE' ? -1 : AGENT_ORDER.indexOf(state.currentAgent as AgentType);

  return (
    <div className="min-h-screen bg-mw-black text-slate-300 font-sans selection:bg-mw-red selection:text-white">

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
              onClick={() => dispatch({ type: 'SET_FIELD', field: 'showHistory', value: true })}
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-mw-slate hover:text-mw-red transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>
              Archives ({state.history.length})
            </button>
            <div className="font-mono text-xs text-mw-slate hidden sm:block border-l border-mw-slate/30 pl-4">
              STATUS: {state.isProcessing ? 'BUSY' : state.stepStatus === 'WAITING_FOR_APPROVAL' ? 'WAITING' : 'IDLE'}
            </div>
          </div>
        </div>
      </header>

      <HistorySidebar
        history={state.history}
        isOpen={state.showHistory}
        onClose={() => dispatch({ type: 'SET_FIELD', field: 'showHistory', value: false })}
        onSelect={loadFromHistory}
        onDelete={onDeleteHistory}
      />

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

            <label className="block text-xs font-bold text-mw-red uppercase mb-2 tracking-wider">Target Vector (Topic)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={state.topic}
                onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'topic', value: e.target.value })}
                placeholder="Manual topic..."
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

            <div className="mt-4 flex items-center gap-3">
              <div
                onClick={() => !state.isProcessing && dispatch({ type: 'SET_FIELD', field: 'isSteppable', value: !state.isSteppable })}
                className={`cursor-pointer flex items-center gap-2 px-3 py-2 rounded border transition-all ${state.isSteppable ? 'border-mw-red bg-mw-red/10 text-white' : 'border-mw-slate/50 text-mw-slate'}`}
              >
                <div className={`w-3 h-3 rounded-full ${state.isSteppable ? 'bg-mw-red' : 'bg-mw-slate'}`} />
                <span className="text-xs font-bold uppercase tracking-wider">Steppable Mode</span>
              </div>
            </div>
          </div>

          {/* Agent chain */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-mw-slate uppercase tracking-wider pl-1">Chain of Agents</h3>
            {STEPS.map((step) => {
              const isActive = state.currentAgent === step.id;
              const thisIdx = AGENT_ORDER.indexOf(step.id);
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
        </div>

        {/* Right Column: Output */}
        <div className="lg:col-span-8 space-y-6">

          {state.currentAgent === 'IDLE' && !state.finalScript && !state.scoutSuggestions && (
            <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-mw-slate/20 rounded-lg p-12 text-center opacity-50">
              <div className="text-6xl mb-4">&#x1F310;</div>
              <h2 className="text-2xl font-bold mb-2">Awaiting Directive</h2>
              <p className="max-w-md mx-auto">Click "SCAN GLOBAL INTEL" to brainstorm topics with the Scout Agent, or enter a target manually.</p>
            </div>
          )}

          {/* Scout */}
          {state.scoutSuggestions && (
            <div className={`bg-mw-gray/20 p-6 rounded border ${state.currentAgent === AgentType.SCOUT ? 'border-mw-red shadow-[0_0_15px_rgba(220,38,38,0.2)]' : 'border-mw-slate/30'}`}>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-mw-red font-mono text-xs">/// SCOUT_INTEL_REPORT (SELECT ONE)</h4>
                <button onClick={pipeline.executeScout} disabled={state.isProcessing} className="font-mono text-xs border border-mw-slate/50 px-3 py-1 rounded hover:border-mw-red hover:text-mw-red transition-all disabled:opacity-30 disabled:cursor-not-allowed text-mw-slate">
                  [↻ RESCAN]
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {state.scoutSuggestions.map((suggestion, idx) => (
                  <div key={idx} onClick={() => pipeline.handleSelectTopic(suggestion)} className="bg-black/50 border border-mw-slate/50 p-4 rounded cursor-pointer hover:border-mw-red hover:bg-mw-red/10 transition-all group">
                    <h3 className="font-bold text-white mb-2 group-hover:text-mw-red">{suggestion.title}</h3>
                    <p className="text-xs text-gray-400 mb-2">{suggestion.hook}</p>
                    <div className="text-[10px] uppercase font-bold text-mw-slate border-t border-mw-slate/20 pt-2 mt-2">
                      Viral Factor: {suggestion.viralFactor}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Radar */}
          {state.radarOutput && (
            <div className={`bg-mw-gray/20 p-6 rounded border ${state.currentAgent === AgentType.RADAR ? 'border-mw-red shadow-[0_0_15px_rgba(220,38,38,0.2)]' : 'border-mw-slate/30'}`}>
              <h4 className="text-mw-red font-mono text-xs mb-2">/// RADAR_INTERCEPT_DATA</h4>
              {state.stepStatus === 'WAITING_FOR_APPROVAL' && state.currentAgent === AgentType.RADAR ? (
                <StepEditor value={editedRadar} onChange={setEditedRadar} onApprove={() => pipeline.handleApproveRadar(editedRadar)} approveLabel="Approve &amp; Run Analyst →" borderColor="border-mw-red/50" textColor="text-gray-300" height="h-48" />
              ) : (
                <RichTextDisplay content={state.radarOutput} />
              )}
            </div>
          )}

          {/* Analyst */}
          {state.researchDossier && (
            <div className={`bg-mw-gray/20 p-6 rounded border ${state.currentAgent === AgentType.ANALYST ? 'border-mw-red shadow-[0_0_15px_rgba(220,38,38,0.2)]' : 'border-mw-slate/30'}`}>
              <h4 className="text-blue-400 font-mono text-xs mb-2">/// ANALYST_DOSSIER (TEXT)</h4>
              {state.stepStatus === 'WAITING_FOR_APPROVAL' && state.currentAgent === AgentType.ANALYST ? (
                <StepEditor value={editedDossier} onChange={setEditedDossier} onApprove={() => pipeline.handleApproveAnalyst(editedDossier)} approveLabel="Approve &amp; Run Architect →" borderColor="border-blue-500/50" textColor="text-blue-100" />
              ) : (
                <RichTextDisplay content={state.researchDossier} />
              )}
            </div>
          )}

          {/* Architect */}
          {state.structureMap && (
            <div className={`bg-mw-gray/20 p-6 rounded border ${state.currentAgent === AgentType.ARCHITECT ? 'border-mw-red shadow-[0_0_15px_rgba(220,38,38,0.2)]' : 'border-mw-slate/30'}`}>
              <h4 className="text-green-500 font-mono text-xs mb-2">/// ARCHITECT_BLUEPRINT</h4>
              {state.stepStatus === 'WAITING_FOR_APPROVAL' && state.currentAgent === AgentType.ARCHITECT ? (
                <StepEditor value={editedStructure} onChange={setEditedStructure} onApprove={() => pipeline.handleApproveArchitect(editedStructure, state.researchDossier)} approveLabel="Approve &amp; Run Writer →" borderColor="border-green-500/50" textColor="text-green-100" />
              ) : (
                <RichTextDisplay content={state.structureMap} />
              )}
            </div>
          )}

          {state.finalScript && (
            <ScriptDisplay
              script={state.finalScript}
              topic={state.topic}
              radarContent={state.radarOutput}
              analystContent={state.researchDossier}
              architectContent={state.structureMap}
              onGenerateImage={onImageGen}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
