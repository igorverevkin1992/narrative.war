import { useCallback, useRef, Dispatch } from 'react';
import {
  runScoutAgent,
  runRadarAgent,
  runAnalystAgent,
  runArchitectAgent,
  runWriterAgent,
  generateImageForBlock,
} from '../services/geminiService';
import { AgentType, SystemState, TopicSuggestion, ResearchDossier, ScriptBlock } from '../types';
import { Action } from '../store/reducer';
import { AGENT_MODELS } from '../constants';

// Helper: converts ResearchDossier object to readable string
export const formatDossierToString = (d: ResearchDossier): string => {
  let output = `TOPIC: ${d.topic}\n\n`;
  output += `/// SMOKING GUN (THE EVIDENCE)\n`;
  output += `- **${d.smokingGun.source}**\n`;
  output += `  URL: ${d.smokingGun.url}\n`;
  output += `  PROOF: "${d.smokingGun.quote_or_fact}"\n\n`;
  output += `/// VISUAL EVIDENCE (WHAT TO SHOW ON SCREEN)\n`;
  d.visualEvidence.forEach(v => (output += `- ${v}\n`));
  output += `\n/// CONTEXT POINTS (MYTH vs REALITY)\n`;
  d.contextPoints.forEach(cp => (output += `- **${cp.label}**: ${cp.value}\n`));
  return output;
};

// Generic pipeline step executor — removes 5x boilerplate duplication
async function runStep<T>(
  agentType: AgentType,
  fn: () => Promise<T>,
  dispatch: Dispatch<Action>,
  addLog: (msg: string) => void,
  controller: AbortController,
  onSuccess: (result: T) => void
): Promise<T | null> {
  dispatch({ type: 'MERGE', partial: { currentAgent: agentType, isProcessing: true, stepStatus: 'PROCESSING', lastError: undefined } });
  try {
    const result = await fn();
    if (controller.signal.aborted) return null;
    onSuccess(result);
    return result;
  } catch (e: unknown) {
    if (controller.signal.aborted) return null;
    const message = e instanceof Error ? e.message : String(e);
    addLog(`ERROR: ${message}`);
    dispatch({ type: 'MERGE', partial: { isProcessing: false, stepStatus: 'IDLE', lastError: message } });
    return null;
  }
}

interface PipelineOptions {
  state: SystemState;
  dispatch: Dispatch<Action>;
  addLog: (msg: string) => void;
  saveToHistory: (
    topic: string,
    model: string,
    script: ScriptBlock[],
    currentHistory: typeof state.history
  ) => Promise<typeof state.history>;
  // Steppable mode edit state setters
  setEditedRadar: (v: string) => void;
  setEditedDossier: (v: string) => void;
  setEditedStructure: (v: string) => void;
}

export function useAgentPipeline({
  state,
  dispatch,
  addLog,
  saveToHistory,
  setEditedRadar,
  setEditedDossier,
  setEditedStructure,
}: PipelineOptions) {
  const abortRef = useRef<AbortController | null>(null);
  // Keep latest state accessible inside async callbacks without stale closures
  const stateRef = useRef(state);
  stateRef.current = state;

  const cancelCurrentOperation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const newController = useCallback(() => {
    cancelCurrentOperation();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    return ctrl;
  }, [cancelCurrentOperation]);

  // ── WRITER ─────────────────────────────────────────────────────────────────
  const executeWriter = useCallback(async (inputStructure: string, inputDossier: string) => {
    const controller = newController();
    dispatch({ type: 'MERGE', partial: { structureMap: inputStructure } });
    addLog('>>> ACTIVATING AGENT D: THE WRITER...');

    const script = await runStep(
      AgentType.WRITER,
      () => runWriterAgent(inputStructure, inputDossier),
      dispatch, addLog, controller,
      () => {}
    );
    if (!script) return;

    addLog('>>> SCRIPT GENERATED.');
    const { topic, history } = stateRef.current;
    const updatedHistory = await saveToHistory(topic, AGENT_MODELS.WRITER, script, history);

    dispatch({
      type: 'MERGE', partial: {
        currentAgent: AgentType.COMPLETED,
        finalScript: script,
        isProcessing: false,
        stepStatus: 'IDLE',
        history: updatedHistory,
      }
    });
    addLog('>>> SYSTEM STANDBY.');
  }, [newController, dispatch, addLog, saveToHistory]);

  // ── ARCHITECT ───────────────────────────────────────────────────────────────
  const executeArchitect = useCallback(async (inputDossier: string) => {
    const controller = newController();
    dispatch({ type: 'MERGE', partial: { researchDossier: inputDossier } });
    addLog('>>> ACTIVATING AGENT C: THE ARCHITECT...');

    const structure = await runStep(
      AgentType.ARCHITECT,
      () => runArchitectAgent(inputDossier),
      dispatch, addLog, controller,
      () => {}
    );
    if (!structure) return;

    addLog('>>> STRUCTURE LOCKED.');
    const isSteppable = stateRef.current.isSteppable;
    dispatch({
      type: 'MERGE', partial: {
        structureMap: structure,
        isProcessing: !isSteppable,
        stepStatus: isSteppable ? 'WAITING_FOR_APPROVAL' : 'PROCESSING',
      }
    });
    setEditedStructure(structure);
    if (!isSteppable) executeWriter(structure, inputDossier);
  }, [newController, dispatch, addLog, setEditedStructure, executeWriter]);

  // ── ANALYST ─────────────────────────────────────────────────────────────────
  const executeAnalyst = useCallback(async (inputRadar: string) => {
    const controller = newController();
    dispatch({ type: 'MERGE', partial: { radarOutput: inputRadar } });
    addLog('>>> ACTIVATING AGENT B: THE ANALYST (Google Grounding)...');

    const dossier = await runStep(
      AgentType.ANALYST,
      () => runAnalystAgent(stateRef.current.topic, inputRadar),
      dispatch, addLog, controller,
      () => {}
    );
    if (!dossier) return;

    addLog('>>> DOSSIER COMPILED.');
    const readableDossier = formatDossierToString(dossier);
    const isSteppable = stateRef.current.isSteppable;
    dispatch({
      type: 'MERGE', partial: {
        researchDossier: readableDossier,
        isProcessing: !isSteppable,
        stepStatus: isSteppable ? 'WAITING_FOR_APPROVAL' : 'PROCESSING',
      }
    });
    setEditedDossier(readableDossier);
    if (!isSteppable) executeArchitect(readableDossier);
  }, [newController, dispatch, addLog, setEditedDossier, executeArchitect]);

  // ── RADAR ───────────────────────────────────────────────────────────────────
  const executeRadar = useCallback(async (overrideTopic?: string) => {
    const activeTopic = overrideTopic ?? stateRef.current.topic;
    if (!activeTopic.trim()) {
      addLog('ERROR: No Target Vector.');
      return;
    }

    const controller = newController();
    dispatch({ type: 'MERGE', partial: { topic: activeTopic } });
    addLog('>>> ACTIVATING AGENT A: THE RADAR...');

    const radarOutput = await runStep(
      AgentType.RADAR,
      () => runRadarAgent(activeTopic),
      dispatch, addLog, controller,
      () => {}
    );
    if (!radarOutput) return;

    addLog('>>> RADAR SCAN COMPLETE.');
    const isSteppable = stateRef.current.isSteppable;
    dispatch({
      type: 'MERGE', partial: {
        radarOutput,
        isProcessing: !isSteppable,
        stepStatus: isSteppable ? 'WAITING_FOR_APPROVAL' : 'PROCESSING',
      }
    });
    setEditedRadar(radarOutput);
    if (!isSteppable) executeAnalyst(radarOutput);
  }, [newController, dispatch, addLog, setEditedRadar, executeAnalyst]);

  // ── SCOUT ───────────────────────────────────────────────────────────────────
  const executeScout = useCallback(async () => {
    const controller = newController();
    dispatch({ type: 'MERGE', partial: { scoutSuggestions: undefined } });
    addLog('>>> ACTIVATING AGENT S: THE SCOUT (Google Search)...');

    const suggestions = await runStep(
      AgentType.SCOUT,
      runScoutAgent,
      dispatch, addLog, controller,
      (result: TopicSuggestion[]) => {
        addLog(`>>> SCOUT REPORT: ${result.length} TARGETS IDENTIFIED.`);
        dispatch({ type: 'MERGE', partial: { scoutSuggestions: result, isProcessing: false, stepStatus: 'IDLE' } });
      }
    );
    return suggestions;
  }, [newController, dispatch, addLog]);

  // ── IMAGE GENERATION ────────────────────────────────────────────────────────
  const handleImageGen = useCallback(async (index: number, script: ScriptBlock[]) => {
    const blockPrompt = script[index]?.visualCue;
    if (!blockPrompt) return;
    addLog(`>>> GENERATING IMAGE FOR BLOCK ${index}...`);
    const imageUrl = await generateImageForBlock(blockPrompt);
    if (imageUrl) {
      dispatch({ type: 'UPDATE_SCRIPT_IMAGE', index, imageUrl });
      addLog(`>>> IMAGE GENERATED FOR BLOCK ${index}.`);
    } else {
      addLog(`>>> FAILED TO GENERATE IMAGE FOR BLOCK ${index}.`);
    }
  }, [dispatch, addLog]);

  // ── STEPPABLE APPROVE HANDLERS ──────────────────────────────────────────────
  const handleApproveRadar = useCallback((editedRadar: string) => {
    executeAnalyst(editedRadar);
  }, [executeAnalyst]);

  const handleApproveAnalyst = useCallback((editedDossier: string) => {
    executeArchitect(editedDossier);
  }, [executeArchitect]);

  const handleApproveArchitect = useCallback((editedStructure: string, dossier: string | undefined) => {
    if (dossier) executeWriter(editedStructure, dossier);
  }, [executeWriter]);

  const handleSelectTopic = useCallback((suggestion: TopicSuggestion) => {
    addLog(`>>> TARGET CONFIRMED: ${suggestion.title}`);
    dispatch({ type: 'MERGE', partial: { topic: suggestion.title, currentAgent: 'IDLE' } });
    executeRadar(suggestion.title);
  }, [dispatch, addLog, executeRadar]);

  return {
    executeScout,
    executeRadar,
    executeAnalyst,
    executeArchitect,
    executeWriter,
    handleImageGen,
    handleApproveRadar,
    handleApproveAnalyst,
    handleApproveArchitect,
    handleSelectTopic,
    cancelCurrentOperation,
  };
}
