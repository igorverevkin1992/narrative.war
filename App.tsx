
import React, { useState, useCallback, useEffect } from 'react';
import { AgentType, SystemState, INITIAL_STATE, ResearchDossier, ScriptBlock, HistoryItem, TopicSuggestion } from './types';
import { runRadarAgent, runAnalystAgent, runArchitectAgent, runWriterAgent, generateImageForBlock, runScoutAgent } from './services/geminiService';
import { saveRunToHistory, fetchHistory, deleteHistoryItem } from './services/supabaseClient';
import { AVAILABLE_MODELS } from './constants';
import AgentLog from './components/AgentLog';
import ScriptDisplay from './components/ScriptDisplay';
import HistorySidebar from './components/HistorySidebar';
import RichTextDisplay from './components/RichTextDisplay';

// Icons
const ScoutIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>;
const RadarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"/><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M12 2v2"/><path d="M12 22v-2"/><path d="m17 20.66-1-1.73"/><path d="M11 10.27a2 2 0 0 0 2.73 0"/><path d="m20.66 17-1.73-1"/><path d="m3.34 17 1.73-1"/><path d="m14 12 2.55-2.55"/><path d="M8.51 12.28 6 15"/></svg>;
const AnalystIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>;
const ArchitectIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>;
const WriterIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>;

// Helper to formatting Dossier Object to String
const formatDossierToString = (d: ResearchDossier): string => {
  let output = `TOPIC: ${d.topic}\n\n`;
  
  output += `/// WESTERN MEDIA NARRATIVES\n`;
  d.claims.forEach(c => output += `- ${c}\n`);
  output += `\n`;

  output += `/// GLOBAL SOUTH / BRICS REALITY\n`;
  d.counterClaims.forEach(c => output += `- ${c}\n`);
  output += `\n`;

  output += `/// HARD DATA POINTS\n`;
  d.dataPoints.forEach(dp => output += `- **${dp.label}**: ${dp.value}\n`);
  output += `\n`;

  output += `/// VISUAL ANCHORS (PHYSICAL PROOF)\n`;
  d.visualAnchors.forEach(a => output += `- ${a}\n`);

  return output;
};

function App() {
  const [state, setState] = useState<SystemState>(INITIAL_STATE);
  const [editedRadar, setEditedRadar] = useState('');
  const [editedDossier, setEditedDossier] = useState('');
  const [editedStructure, setEditedStructure] = useState('');

  // Load History on Mount
  useEffect(() => {
    const loadData = async () => {
      const history = await fetchHistory();
      setState(prev => ({ ...prev, history }));
    };
    loadData();
  }, []);

  const addLog = useCallback((msg: string) => {
    setState(prev => ({ ...prev, logs: [...prev.logs, msg] }));
  }, []);

  // --- EXECUTION FUNCTIONS ---

  const executeScout = async () => {
    setState(prev => ({ ...prev, isProcessing: true, stepStatus: 'PROCESSING', currentAgent: AgentType.SCOUT, scoutSuggestions: undefined }));
    addLog(`>>> ACTIVATING AGENT S: THE SCOUT (Google Search)...`);
    
    try {
      // Force Pro model inside the service, so state.selectedModel only applies to later steps if needed
      const suggestions = await runScoutAgent(state.selectedModel);
      addLog(`>>> SCOUT REPORT: ${suggestions.length} TARGETS IDENTIFIED.`);
      
      setState(prev => ({ 
        ...prev, 
        scoutSuggestions: suggestions,
        isProcessing: false, // Stop processing so user can select
        stepStatus: 'IDLE' 
      }));
    } catch (e: any) {
      addLog(`ERROR: ${e.message}`);
      setState(prev => ({ ...prev, isProcessing: false, stepStatus: 'IDLE' }));
    }
  };

  const handleSelectTopic = (suggestion: TopicSuggestion) => {
    addLog(`>>> TARGET CONFIRMED: ${suggestion.title}`);
    setState(prev => ({ ...prev, topic: suggestion.title, currentAgent: 'IDLE' }));
    // Automatically trigger Radar after selection? Or let user click Init?
    // Let's set the topic and let the user review/click Init for control, or strictly follow "moving to others"
    // The prompt implied "after which I select one and move on". 
    // We will set the topic and immediately execute Radar.
    setTimeout(() => {
        executeRadar(suggestion.title);
    }, 100);
  };

  const executeRadar = async (overrideTopic?: string) => {
    const activeTopic = overrideTopic || state.topic;

    if (!activeTopic.trim()) {
      addLog("ERROR: No Target Vector.");
      return;
    }
    setState(prev => ({ ...prev, topic: activeTopic, isProcessing: true, stepStatus: 'PROCESSING', currentAgent: AgentType.RADAR }));
    addLog(`>>> ACTIVATING AGENT A: THE RADAR...`);
    
    try {
      const radarOutput = await runRadarAgent(activeTopic, state.selectedModel);
      addLog(">>> RADAR SCAN COMPLETE.");
      
      setState(prev => ({ 
        ...prev, 
        radarOutput, 
        isProcessing: !prev.isSteppable, 
        stepStatus: prev.isSteppable ? 'WAITING_FOR_APPROVAL' : 'PROCESSING' 
      }));
      setEditedRadar(radarOutput);

      if (!state.isSteppable) executeAnalyst(radarOutput);
    } catch (e: any) {
      addLog(`ERROR: ${e.message}`);
      setState(prev => ({ ...prev, isProcessing: false, stepStatus: 'IDLE' }));
    }
  };

  const executeAnalyst = async (inputRadar: string) => {
    setState(prev => ({ 
      ...prev, 
      radarOutput: inputRadar,
      currentAgent: AgentType.ANALYST, 
      isProcessing: true, 
      stepStatus: 'PROCESSING' 
    }));
    addLog(">>> ACTIVATING AGENT B: THE ANALYST (Google Grounding)...");
    
    try {
      const dossier = await runAnalystAgent(state.topic, inputRadar, state.selectedModel);
      addLog(">>> DOSSIER COMPILED.");
      
      // Convert JSON Object to Human Readable String immediately for editing/display
      const readableDossier = formatDossierToString(dossier);

      setState(prev => ({ 
        ...prev, 
        researchDossier: readableDossier, // Store as string for uniformity in UI if needed, but here we store string for simple passing
        isProcessing: !prev.isSteppable, 
        stepStatus: prev.isSteppable ? 'WAITING_FOR_APPROVAL' : 'PROCESSING' 
      }));
      setEditedDossier(readableDossier);

      if (!state.isSteppable) executeArchitect(readableDossier);
    } catch (e: any) {
      addLog(`ERROR: ${e.message}`);
      setState(prev => ({ ...prev, isProcessing: false, stepStatus: 'IDLE' }));
    }
  };

  const executeArchitect = async (inputDossier: ResearchDossier | string) => {
    setState(prev => ({ 
      ...prev, 
      researchDossier: inputDossier,
      currentAgent: AgentType.ARCHITECT, 
      isProcessing: true, 
      stepStatus: 'PROCESSING' 
    }));
    addLog(">>> ACTIVATING AGENT C: THE ARCHITECT...");
    
    try {
      const structure = await runArchitectAgent(inputDossier, state.selectedModel);
      addLog(">>> STRUCTURE LOCKED.");
      
      setState(prev => ({ 
        ...prev, 
        structureMap: structure, 
        isProcessing: !prev.isSteppable, 
        stepStatus: prev.isSteppable ? 'WAITING_FOR_APPROVAL' : 'PROCESSING' 
      }));
      setEditedStructure(structure);

      if (!state.isSteppable) executeWriter(structure, inputDossier);
    } catch (e: any) {
      addLog(`ERROR: ${e.message}`);
      setState(prev => ({ ...prev, isProcessing: false, stepStatus: 'IDLE' }));
    }
  };

  const executeWriter = async (inputStructure: string, inputDossier: ResearchDossier | string) => {
    setState(prev => ({ 
      ...prev, 
      structureMap: inputStructure,
      currentAgent: AgentType.WRITER, 
      isProcessing: true, 
      stepStatus: 'PROCESSING' 
    }));
    addLog(">>> ACTIVATING AGENT D: THE WRITER...");
    
    try {
      const script = await runWriterAgent(inputStructure, inputDossier, state.selectedModel);
      addLog(">>> SCRIPT GENERATED.");
      
      // Save
      const savedEntry = await saveRunToHistory(state.topic, state.selectedModel, script);
      const newHistory = savedEntry ? [savedEntry, ...state.history] : state.history;

      setState(prev => ({ 
        ...prev, 
        currentAgent: AgentType.COMPLETED, 
        finalScript: script,
        isProcessing: false, 
        stepStatus: 'IDLE',
        history: newHistory
      }));
      addLog(">>> SYSTEM STANDBY.");
    } catch (e: any) {
      addLog(`ERROR: ${e.message}`);
      setState(prev => ({ ...prev, isProcessing: false, stepStatus: 'IDLE' }));
    }
  };

  // --- HANDLERS FOR STEPPABLE UI ---

  const handleApproveRadar = () => {
    executeAnalyst(editedRadar);
  };

  const handleApproveAnalyst = () => {
    // Pass the string directly. The Architect Agent now accepts text input.
    executeArchitect(editedDossier);
  };

  const handleApproveArchitect = () => {
    if (state.researchDossier) {
      executeWriter(editedStructure, state.researchDossier);
    }
  };

  const handleImageGen = async (index: number) => {
    if (!state.finalScript) return;
    
    // Grab prompt before async op to avoid closure staleness issues, 
    // though the prompt itself shouldn't change.
    const blockPrompt = state.finalScript[index].visualCue;
    
    addLog(`>>> GENERATING IMAGE FOR BLOCK ${index}...`);
    
    // Perform generation first
    const imageUrl = await generateImageForBlock(blockPrompt);
    
    if (imageUrl) {
      // Use atomic functional state update for both the image data and the log.
      // This prevents race conditions where separate setState calls might cause one update to overwrite another's base state
      // if not batched correctly, or if `prev` isn't what we expect.
      setState(prev => {
        if (!prev.finalScript) return prev;
        
        // Create shallow copy of array, but new reference for the specific item
        const newScript = [...prev.finalScript];
        newScript[index] = { ...newScript[index], imageUrl };
        
        return {
          ...prev,
          finalScript: newScript,
          logs: [...prev.logs, `>>> IMAGE GENERATED FOR BLOCK ${index}.`]
        };
      });
    } else {
      addLog(`>>> FAILED TO GENERATE IMAGE FOR BLOCK ${index}.`);
    }
  };

  // --- HISTORY & UI HELPERS ---

  const loadFromHistory = (item: HistoryItem) => {
    setState(prev => ({
      ...prev,
      topic: item.topic,
      finalScript: item.script,
      currentAgent: AgentType.COMPLETED,
      researchDossier: undefined,
      radarOutput: undefined,
      scoutSuggestions: undefined,
      showHistory: false,
      logs: [...prev.logs, `>>> LOADED ARCHIVE ID: ${item.id} [${item.topic}]`]
    }));
  };

  const handleDeleteHistory = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const previousHistory = state.history;
    setState(prev => ({ ...prev, history: prev.history.filter(item => item.id !== id) }));
    const success = await deleteHistoryItem(id);
    if (success) {
      addLog(`>>> ARCHIVE ID ${id} DELETED PERMANENTLY.`);
    } else {
      setState(prev => ({ ...prev, history: previousHistory }));
      addLog(`>>> ERROR: COULD NOT DELETE ARCHIVE ID ${id}.`);
    }
  };

  const Steps = [
    { id: AgentType.SCOUT, label: "The Scout", icon: ScoutIcon, desc: "Global Intel Scan" },
    { id: AgentType.RADAR, label: "The Radar", icon: RadarIcon, desc: "Trend Identification" },
    { id: AgentType.ANALYST, label: "The Analyst", icon: AnalystIcon, desc: "Google Grounding" },
    { id: AgentType.ARCHITECT, label: "The Architect", icon: ArchitectIcon, desc: "Structure Mapping" },
    { id: AgentType.WRITER, label: "The Writer", icon: WriterIcon, desc: "Visual Scripting" },
  ];

  return (
    <div className="min-h-screen bg-mw-black text-slate-300 font-sans selection:bg-mw-red selection:text-white">
      {/* Header */}
      <header className="border-b border-mw-slate/30 bg-black/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-mw-red rounded-full animate-pulse shadow-[0_0_10px_#dc2626]" />
            <h1 className="text-xl font-bold tracking-widest text-white">
              MEDIAWAR<span className="text-mw-red">.CORE</span> <span className="text-xs text-mw-slate ml-2 font-mono border border-mw-slate/50 px-1 rounded">V3.3</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
             <button 
              onClick={() => setState(prev => ({ ...prev, showHistory: true }))}
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
        onClose={() => setState(prev => ({ ...prev, showHistory: false }))} 
        onSelect={loadFromHistory}
        onDelete={handleDeleteHistory}
      />

      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start relative">
        
        {/* Left Column: Controls & Status - Made Sticky */}
        <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-24 h-fit">
          
          <div className="bg-mw-gray/30 p-6 rounded-lg border border-mw-slate/30 backdrop-blur-sm">
            <div className="mb-4">
              <label className="block text-xs font-bold text-mw-slate uppercase mb-2 tracking-wider">Inference Model</label>
              <select 
                value={state.selectedModel}
                onChange={(e) => setState(prev => ({ ...prev, selectedModel: e.target.value }))}
                disabled={state.isProcessing || state.stepStatus !== 'IDLE'}
                className="w-full bg-black border border-mw-slate/50 rounded p-2 text-white text-sm focus:border-mw-red outline-none font-mono"
              >
                {AVAILABLE_MODELS.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
              </select>
            </div>

            <label className="block text-xs font-bold text-mw-red uppercase mb-2 tracking-wider">Target Vector (Topic)</label>
            <div className="flex gap-2">
                <input 
                  type="text" 
                  value={state.topic}
                  onChange={(e) => setState(prev => ({ ...prev, topic: e.target.value }))}
                  placeholder="Manual topic..."
                  className="w-full bg-black border border-mw-slate/50 rounded p-3 text-white focus:border-mw-red focus:ring-1 focus:ring-mw-red outline-none transition-all placeholder:text-mw-slate/50 font-mono"
                  disabled={state.isProcessing || state.stepStatus !== 'IDLE'}
                />
            </div>

            <div className="mt-4 flex flex-col gap-2">
               {/* SCOUT BUTTON */}
               <button
                  onClick={executeScout}
                  disabled={state.isProcessing || (state.currentAgent !== 'IDLE' && state.currentAgent !== AgentType.COMPLETED)}
                  className={`w-full py-3 px-4 rounded font-bold uppercase tracking-widest transition-all border border-mw-red/50 text-mw-red hover:bg-mw-red hover:text-white flex items-center justify-center gap-2 ${
                    state.isProcessing ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
               >
                  <ScoutIcon />
                  SCAN GLOBAL INTEL (IDEAS)
               </button>

               {/* MANUAL START BUTTON */}
               <button
                  onClick={() => executeRadar()}
                  disabled={state.isProcessing || !state.topic || state.currentAgent !== 'IDLE' && state.currentAgent !== AgentType.COMPLETED}
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
                 onClick={() => !state.isProcessing && setState(prev => ({ ...prev, isSteppable: !prev.isSteppable }))}
                 className={`cursor-pointer flex items-center gap-2 px-3 py-2 rounded border transition-all ${state.isSteppable ? 'border-mw-red bg-mw-red/10 text-white' : 'border-mw-slate/50 text-mw-slate'}`}
               >
                 <div className={`w-3 h-3 rounded-full ${state.isSteppable ? 'bg-mw-red' : 'bg-mw-slate'}`} />
                 <span className="text-xs font-bold uppercase tracking-wider">Steppable Mode</span>
               </div>
            </div>

          </div>

          <div className="space-y-2">
             <h3 className="text-xs font-bold text-mw-slate uppercase tracking-wider pl-1">Chain of Agents</h3>
             {Steps.map((step, idx) => {
               const isActive = state.currentAgent === step.id;
               const agentOrder = [AgentType.SCOUT, AgentType.RADAR, AgentType.ANALYST, AgentType.ARCHITECT, AgentType.WRITER, AgentType.COMPLETED];
               const currentIdx = agentOrder.indexOf(state.currentAgent as AgentType);
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
        </div>

        {/* Right Column: Output Visualization */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Empty State */}
          {!state.currentAgent && !state.finalScript && !state.scoutSuggestions && state.currentAgent === 'IDLE' && (
             <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-mw-slate/20 rounded-lg p-12 text-center opacity-50">
               <div className="text-6xl mb-4">🌐</div>
               <h2 className="text-2xl font-bold mb-2">Awaiting Directive</h2>
               <p className="max-w-md mx-auto">Click "SCAN GLOBAL INTEL" to brainstorm topics with the Scout Agent, or enter a target manually.</p>
             </div>
          )}

          {/* SCOUT OUTPUT */}
          {(state.currentAgent === AgentType.SCOUT || state.scoutSuggestions) && state.scoutSuggestions && (
            <div className={`bg-mw-gray/20 p-6 rounded border ${state.currentAgent === AgentType.SCOUT ? 'border-mw-red shadow-[0_0_15px_rgba(220,38,38,0.2)]' : 'border-mw-slate/30'}`}>
               <h4 className="text-mw-red font-mono text-xs mb-4">/// SCOUT_INTEL_REPORT (SELECT ONE)</h4>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {state.scoutSuggestions.map((suggestion, idx) => (
                    <div 
                      key={idx}
                      onClick={() => handleSelectTopic(suggestion)}
                      className="bg-black/50 border border-mw-slate/50 p-4 rounded cursor-pointer hover:border-mw-red hover:bg-mw-red/10 transition-all group"
                    >
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

          {/* STEP 1: RADAR OUTPUT */}
          {(state.currentAgent === AgentType.RADAR || state.radarOutput) && state.radarOutput && (
            <div className={`bg-mw-gray/20 p-6 rounded border ${state.currentAgent === AgentType.RADAR ? 'border-mw-red shadow-[0_0_15px_rgba(220,38,38,0.2)]' : 'border-mw-slate/30'}`}>
               <h4 className="text-mw-red font-mono text-xs mb-2">/// RADAR_INTERCEPT_DATA</h4>
               {state.stepStatus === 'WAITING_FOR_APPROVAL' && state.currentAgent === AgentType.RADAR ? (
                 <div>
                   <textarea 
                      value={editedRadar} 
                      onChange={(e) => setEditedRadar(e.target.value)}
                      className="w-full h-48 bg-black border border-mw-red/50 text-gray-300 font-mono text-sm p-4 focus:outline-none"
                   />
                   <div className="mt-4 flex justify-end">
                     <button onClick={handleApproveRadar} className="bg-mw-red text-white px-6 py-2 rounded font-bold uppercase tracking-wider text-xs hover:bg-red-600">
                       Approve & Run Analyst &rarr;
                     </button>
                   </div>
                 </div>
               ) : (
                  <RichTextDisplay content={state.radarOutput} />
               )}
            </div>
          )}

          {/* STEP 2: ANALYST OUTPUT (NOW SUPPORTS TEXT DISPLAY) */}
          {(state.currentAgent === AgentType.ANALYST || state.researchDossier) && state.researchDossier && (
             <div className={`bg-mw-gray/20 p-6 rounded border ${state.currentAgent === AgentType.ANALYST ? 'border-mw-red shadow-[0_0_15px_rgba(220,38,38,0.2)]' : 'border-mw-slate/30'}`}>
                <h4 className="text-blue-400 font-mono text-xs mb-2">/// ANALYST_DOSSIER (TEXT)</h4>
                {state.stepStatus === 'WAITING_FOR_APPROVAL' && state.currentAgent === AgentType.ANALYST ? (
                   <div>
                     <textarea 
                        value={editedDossier} 
                        onChange={(e) => setEditedDossier(e.target.value)}
                        className="w-full h-96 bg-black border border-blue-500/50 text-blue-100 font-mono text-sm p-4 focus:outline-none leading-relaxed"
                     />
                     <div className="mt-4 flex justify-end">
                       <button onClick={handleApproveAnalyst} className="bg-mw-red text-white px-6 py-2 rounded font-bold uppercase tracking-wider text-xs hover:bg-red-600">
                         Approve & Run Architect &rarr;
                       </button>
                     </div>
                   </div>
                ) : (
                   /* Displaying the string version now */
                   <RichTextDisplay content={typeof state.researchDossier === 'string' ? state.researchDossier : formatDossierToString(state.researchDossier)} />
                )}
             </div>
          )}

          {/* STEP 3: ARCHITECT OUTPUT */}
          {(state.currentAgent === AgentType.ARCHITECT || state.structureMap) && state.structureMap && (
             <div className={`bg-mw-gray/20 p-6 rounded border ${state.currentAgent === AgentType.ARCHITECT ? 'border-mw-red shadow-[0_0_15px_rgba(220,38,38,0.2)]' : 'border-mw-slate/30'}`}>
                <h4 className="text-green-500 font-mono text-xs mb-2">/// ARCHITECT_BLUEPRINT</h4>
                {state.stepStatus === 'WAITING_FOR_APPROVAL' && state.currentAgent === AgentType.ARCHITECT ? (
                   <div>
                     <textarea 
                        value={editedStructure} 
                        onChange={(e) => setEditedStructure(e.target.value)}
                        className="w-full h-96 bg-black border border-green-500/50 text-green-100 font-mono text-sm p-4 focus:outline-none leading-relaxed"
                     />
                     <div className="mt-4 flex justify-end">
                       <button onClick={handleApproveArchitect} className="bg-mw-red text-white px-6 py-2 rounded font-bold uppercase tracking-wider text-xs hover:bg-red-600">
                         Approve & Run Writer &rarr;
                       </button>
                     </div>
                   </div>
                ) : (
                   <RichTextDisplay content={state.structureMap} />
                )}
             </div>
          )}

          {state.finalScript && <ScriptDisplay 
            script={state.finalScript} 
            topic={state.topic}
            radarContent={state.radarOutput}
            analystContent={typeof state.researchDossier === 'string' ? state.researchDossier : (state.researchDossier ? formatDossierToString(state.researchDossier) : undefined)}
            architectContent={state.structureMap}
            onGenerateImage={handleImageGen} 
          />}
        </div>
      </main>
    </div>
  );
}

export default App;
