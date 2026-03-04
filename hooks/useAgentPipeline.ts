import { useCallback, useRef, Dispatch } from 'react';
import {
  runScoutAgent,
  runRadarAgent,
  runAnalystAgent,
  runArchitectAgent,
  runWriterAgent,
  generateImageForBlock,
  generatePreviewImage,
} from '../services/geminiService';
import { AgentType, SystemState, TopicSuggestion, ResearchDossier, ScriptBlock, HistoryItem } from '../types';
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
    currentHistory: HistoryItem[],
    radarOutput?: string,
    researchDossier?: string,
    structureMap?: string,
    thumbnailConcept?: string,
  ) => Promise<HistoryItem[]>;
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
      () => runWriterAgent(inputStructure, inputDossier, controller.signal, (chunks) => {
        if (chunks % 20 === 0) addLog(`>>> WRITER: Streaming... (${chunks} chunks received)`);
      }),
      dispatch, addLog, controller,
      () => {}
    );
    if (!script) return;

    // Validate minimum script length (12 min = 10,800 chars at 15 chars/sec)
    const totalChars = script.reduce((sum, b) => sum + (b.audioScript?.length ?? 0), 0);
    const estMin = (totalChars / 900).toFixed(1);
    addLog(`>>> SCRIPT: ${script.length} blocks, ~${estMin} min (${totalChars.toLocaleString()} chars).`);
    if (totalChars < 10800) {
      const warning = `Script too short: ${script.length} blocks / ~${estMin} min. Min is 12 min. Consider re-running Writer.`;
      addLog(`>>> WARNING: ${warning}`);
      dispatch({ type: 'MERGE', partial: { lastError: warning } });
    }

    addLog('>>> SCRIPT GENERATED.');
    const { topic, history, radarOutput, researchDossier, structureMap, thumbnailConcept } = stateRef.current;
    const updatedHistory = await saveToHistory(topic, AGENT_MODELS.WRITER, script, history, radarOutput, researchDossier, structureMap, thumbnailConcept);

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

    const result = await runStep(
      AgentType.ARCHITECT,
      () => runArchitectAgent(inputDossier, controller.signal),
      dispatch, addLog, controller,
      () => {}
    );
    if (!result) return;

    const { structure, thumbnailConcept } = result;
    addLog('>>> STRUCTURE LOCKED.');
    const isSteppable = stateRef.current.isSteppable;
    dispatch({
      type: 'MERGE', partial: {
        structureMap: structure,
        thumbnailConcept,
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
      () => runAnalystAgent(stateRef.current.topic, inputRadar, controller.signal),
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
  // fullContext is optional: richer prompt for Radar (includes Scout hook/angle/viral),
  // while activeTopic stays clean (title only) for state/history/display.
  const executeRadar = useCallback(async (overrideTopic?: string, fullContext?: string) => {
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
      () => runRadarAgent(fullContext ?? activeTopic, controller.signal),
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
      () => runScoutAgent(controller.signal),
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

  // ── PREVIEW IMAGE GENERATION ────────────────────────────────────────────────
  const handlePreviewGen = useCallback(async (referenceBase64: string, mimeType: string) => {
    const { thumbnailConcept } = stateRef.current;
    if (!thumbnailConcept) return;
    addLog('>>> GENERATING THUMBNAIL PREVIEW...');
    const url = await generatePreviewImage(referenceBase64, mimeType, thumbnailConcept);
    if (url) {
      dispatch({ type: 'MERGE', partial: { previewImageUrl: url } });
      addLog('>>> THUMBNAIL PREVIEW GENERATED.');
    } else {
      const error = 'Preview generation failed. Check console.';
      addLog(`>>> ERROR: ${error}`);
      dispatch({ type: 'MERGE', partial: { lastError: error } });
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
    // Pass full Scout context to Radar so it anchors on specific details (hook, angle, viral factor).
    // state.topic stays as the clean title for display/history/style-fetch.
    const richContext = [
      suggestion.title,
      suggestion.hook          ? `\nSCOUT HOOK: ${suggestion.hook}` : '',
      suggestion.narrativeAngle ? `\nNARRATIVE ANGLE: ${suggestion.narrativeAngle}` : '',
      suggestion.viralFactor   ? `\nVIRAL FACTOR: ${suggestion.viralFactor}` : '',
    ].join('');
    dispatch({ type: 'MERGE', partial: { topic: suggestion.title, currentAgent: 'IDLE' } });
    executeRadar(suggestion.title, richContext);
  }, [dispatch, addLog, executeRadar]);

  return {
    executeScout,
    executeRadar,
    executeAnalyst,
    executeArchitect,
    executeWriter,
    handleImageGen,
    handlePreviewGen,
    handleApproveRadar,
    handleApproveAnalyst,
    handleApproveArchitect,
    handleSelectTopic,
    cancelCurrentOperation,
  };
}
