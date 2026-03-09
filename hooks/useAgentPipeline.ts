import { useCallback, useRef, Dispatch } from 'react';
import {
  runScoutAgent,
  runRadarAgent,
  runAnalystAgent,
  runArchitectAgent,
  runDocCircleAgent,
  runActPlanningAgent,
  runOutlineAgent,
  runWriterAgent,
  runDocumentaryActWriter,
  calculateDurationAndRetiming,
  generateImageForBlock,
  generatePreviewImage,
  runSEOAgent,
  runScriptRewriterAgent,
  runAuditFixAgent,
} from '../services/geminiService';
import { AgentType, SystemState, TopicSuggestion, ResearchDossier, ScriptBlock, HistoryItem } from '../types';
import { Action } from '../store/reducer';
import { AGENT_MODELS, PROJECT_CONFIGS, DEMONETIZATION_BLACKLIST } from '../constants';
import { getSettings } from '../appSettings';

// Helper: true for any project type that uses the documentary pipeline (DocCircle → ActPlanning → Outline → multi-pass Writer)
export const isDocPipeline = (pt: string): boolean => pt === 'documentary' || pt === 'short_doc';

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
    projectType?: string,
    radarOutput?: string,
    researchDossier?: string,
    structureMap?: string,
    thumbnailConcept?: string,
  ) => Promise<HistoryItem[]>;
  // Steppable mode edit state setters
  setEditedRadar: (v: string) => void;
  setEditedDossier: (v: string) => void;
  setEditedStructure: (v: string) => void;
  setEditedOutline: (v: string) => void;
  setEditedDocCircle: (v: string) => void;
  setEditedActPlanning: (v: string) => void;
}

export function useAgentPipeline({
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
  const executeWriter = useCallback(async (inputStructure: string, inputDossier: string, inputOutline?: string) => {
    const controller = newController();
    dispatch({ type: 'MERGE', partial: { structureMap: inputStructure } });
    addLog('>>> ACTIVATING AGENT D: THE WRITER...');

    const script = await runStep(
      AgentType.WRITER,
      () => runWriterAgent(inputStructure, inputDossier, controller.signal, (chunks) => {
        dispatch({ type: 'MERGE', partial: { writerChunks: chunks } });
        if (chunks % 40 === 0) addLog(`>>> WRITER: Streaming... (${chunks} chunks received)`);
      }, inputOutline),
      dispatch, addLog, controller,
      () => {}
    );
    if (!script) return;

    const { projectType } = stateRef.current;
    const config = PROJECT_CONFIGS[projectType];
    const totalChars = script.reduce((sum, b) => sum + (b.audioScript?.length ?? 0), 0);
    const estMin = (totalChars / 900).toFixed(1);
    addLog(`>>> SCRIPT: ${script.length} blocks, ~${estMin} min (${totalChars.toLocaleString()} chars).`);
    if (totalChars < config.minChars) {
      const warning = `Script too short: ${script.length} blocks / ~${estMin} min. Min is ${config.description}. Consider re-running Writer.`;
      addLog(`>>> WARNING: ${warning}`);
      dispatch({ type: 'MERGE', partial: { lastError: warning } });
    }

    addLog('>>> SCRIPT GENERATED.');
    const { topic, history, radarOutput, researchDossier, structureMap, thumbnailConcept } = stateRef.current;
    const updatedHistory = await saveToHistory(topic, AGENT_MODELS.WRITER, script, history, projectType, radarOutput, researchDossier, structureMap, thumbnailConcept);

    dispatch({
      type: 'MERGE', partial: {
        currentAgent: AgentType.COMPLETED,
        finalScript: script,
        isProcessing: false,
        stepStatus: 'IDLE',
        history: updatedHistory,
        writerChunks: undefined,
      }
    });
    addLog('>>> SYSTEM STANDBY.');

    // Auto-SEO: silently generate after script is ready (if enabled in settings)
    if (getSettings().autoSeoEnabled) {
      addLog('>>> AUTO SEO: Generating YouTube SEO package...');
      try {
        const pkg = await runSEOAgent(topic, radarOutput, script);
        if (pkg) {
          dispatch({ type: 'MERGE', partial: { seoPackage: pkg } });
          addLog('>>> AUTO SEO: Done.');
        }
      } catch (e) {
        addLog(`>>> AUTO SEO: Failed — ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }, [newController, dispatch, addLog, saveToHistory]);

  // ── DOCUMENTARY MULTI-PASS WRITER ────────────────────────────────────────────
  const executeDocumentaryWriter = useCallback(async (
    acts: Array<{ block: string; timecode: string; description: string }>,
    inputDossier: string,
  ) => {
    const controller = newController();
    dispatch({ type: 'MERGE', partial: { isProcessing: true, currentAgent: AgentType.WRITER, stepStatus: 'PROCESSING', lastError: undefined } });
    addLog(`>>> DOCUMENTARY WRITER: ${acts.length} ACTS TO WRITE.`);

    let allBlocks: ScriptBlock[] = [];
    const { scriptOutline, projectType } = stateRef.current;
    const useParallel = getSettings().parallelActWriting;

    if (useParallel) {
      addLog(`>>> MODE: PARALLEL — all ${acts.length} acts writing simultaneously (no motif tracking).`);
      dispatch({ type: 'MERGE', partial: { currentWritingAct: 0 } });
      const results = await Promise.all(
        acts.map((act, i) => {
          addLog(`>>> ACT ${i + 1}/${acts.length}: ${act.block} [parallel]...`);
          return runDocumentaryActWriter(act, acts, inputDossier, [], controller.signal, scriptOutline, projectType);
        })
      );
      for (let i = 0; i < results.length; i++) {
        if (!results[i]) {
          const error = `Act ${i + 1} ("${acts[i].block}") generation failed.`;
          addLog(`>>> ERROR: ${error}`);
          dispatch({ type: 'MERGE', partial: { isProcessing: false, stepStatus: 'IDLE', lastError: error } });
          return;
        }
        allBlocks = [...allBlocks, ...results[i]!];
        addLog(`>>> ACT ${i + 1} DONE: ${results[i]!.length} blocks.`);
      }
      dispatch({ type: 'MERGE', partial: { finalScript: calculateDurationAndRetiming(allBlocks) } });
    } else {
      let motifLog = '';
      for (let i = 0; i < acts.length; i++) {
        if (controller.signal.aborted) return;
        dispatch({ type: 'MERGE', partial: { currentWritingAct: i } });
        addLog(`>>> ACT ${i + 1}/${acts.length}: ${acts[i].block}...`);

        const actBlocks = await runDocumentaryActWriter(
          acts[i], acts, inputDossier, allBlocks.slice(-3), controller.signal, scriptOutline, projectType,
          motifLog || undefined
        );

        if (!actBlocks) {
          const error = `Act ${i + 1} ("${acts[i].block}") generation failed.`;
          addLog(`>>> ERROR: ${error}`);
          dispatch({ type: 'MERGE', partial: { isProcessing: false, stepStatus: 'IDLE', lastError: error } });
          return;
        }

        allBlocks = [...allBlocks, ...actBlocks];
        addLog(`>>> ACT ${i + 1} DONE: ${actBlocks.length} blocks.`);
        dispatch({ type: 'MERGE', partial: { finalScript: calculateDurationAndRetiming(allBlocks) } });

        const anchorBlocks = actBlocks.filter(b => ['HOOK', 'INTRO', 'TRANSITION'].includes(b.blockType)).slice(0, 3);
        if (anchorBlocks.length) {
          motifLog += `\nACT ${i + 1} — "${acts[i].block}":\n` +
            anchorBlocks.map(b => `  [${b.blockType}] "${b.audioScript.substring(0, 150)}"`).join('\n');
        }
      }
    }

    const retimed = calculateDurationAndRetiming(allBlocks);
    const config = PROJECT_CONFIGS[stateRef.current.projectType] ?? PROJECT_CONFIGS['documentary'];
    const totalChars = retimed.reduce((sum, b) => sum + (b.audioScript?.length ?? 0), 0);
    const estMin = (totalChars / 900).toFixed(1);
    addLog(`>>> DOCUMENTARY: ${retimed.length} blocks, ~${estMin} min (${totalChars.toLocaleString()} chars).`);
    if (totalChars < config.minChars) {
      const warning = `Documentary too short: ~${estMin} min. Min is 60 min. Consider re-running Writer.`;
      addLog(`>>> WARNING: ${warning}`);
      dispatch({ type: 'MERGE', partial: { lastError: warning } });
    }

    addLog('>>> DOCUMENTARY SCRIPT GENERATED.');
    const { topic, history, radarOutput, researchDossier, structureMap, thumbnailConcept } = stateRef.current;
    const updatedHistory = await saveToHistory(topic, AGENT_MODELS.WRITER, retimed, history, stateRef.current.projectType, radarOutput, researchDossier, structureMap, thumbnailConcept);

    dispatch({
      type: 'MERGE', partial: {
        currentAgent: AgentType.COMPLETED,
        finalScript: retimed,
        isProcessing: false,
        stepStatus: 'IDLE',
        currentWritingAct: undefined,
        history: updatedHistory,
      }
    });
    addLog('>>> SYSTEM STANDBY.');

    // Auto-SEO: silently generate after script is ready (if enabled in settings)
    if (getSettings().autoSeoEnabled) {
      addLog('>>> AUTO SEO: Generating YouTube SEO package...');
      try {
        const pkg = await runSEOAgent(topic, radarOutput, retimed);
        if (pkg) {
          dispatch({ type: 'MERGE', partial: { seoPackage: pkg } });
          addLog('>>> AUTO SEO: Done.');
        }
      } catch (e) {
        addLog(`>>> AUTO SEO: Failed — ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }, [newController, dispatch, addLog, saveToHistory]);

  // ── OUTLINER ─────────────────────────────────────────────────────────────────
  const executeOutline = useCallback(async (
    inputStructure: string,
    inputDossier: string,
    docCircle?: string,
    actPlanning?: string,
  ) => {
    const controller = newController();
    addLog('>>> ACTIVATING OUTLINER: Generating scene outline...');

    const outline = await runStep(
      AgentType.OUTLINER,
      () => runOutlineAgent(inputStructure, inputDossier, controller.signal, docCircle, actPlanning, stateRef.current.projectType),
      dispatch, addLog, controller,
      () => {}
    );
    if (!outline) return;

    const isSteppable = stateRef.current.isSteppable;
    addLog(isSteppable
      ? '>>> OUTLINE READY. Awaiting your approval before writing begins.'
      : '>>> OUTLINE READY. Auto-continuing to writer...');
    dispatch({ type: 'MERGE', partial: {
      scriptOutline: outline,
      isProcessing: !isSteppable,
      stepStatus: isSteppable ? 'WAITING_FOR_APPROVAL' : 'PROCESSING',
    }});
    setEditedOutline(outline);
    if (!isSteppable) {
      const { projectType, documentaryActs } = stateRef.current;
      if (isDocPipeline(projectType) && documentaryActs) {
        executeDocumentaryWriter(documentaryActs, inputDossier);
      } else {
        executeWriter(inputStructure, inputDossier, outline);
      }
    }
  }, [newController, dispatch, addLog, setEditedOutline, executeDocumentaryWriter, executeWriter]);

  // ── ACT PLANNING (Steps 4-5: per-act circles + 32-beat outline) ───────────────
  const executeActPlanning = useCallback(async (
    inputDocCircle: string,
    inputStructure: string,
    inputDossier: string,
  ) => {
    const controller = newController();
    const { projectType } = stateRef.current;
    const beatCount = projectType === 'short_doc' ? '16' : '32';
    addLog(`>>> ACT PLANNING: Building per-act circles + ${beatCount}-beat full outline...`);

    const result = await runStep(
      AgentType.ACT_PLANNING,
      () => runActPlanningAgent(inputDocCircle, inputStructure, inputDossier, controller.signal, projectType),
      dispatch, addLog, controller,
      () => {}
    );
    if (!result) return;

    const isSteppable = stateRef.current.isSteppable;
    addLog(isSteppable
      ? `>>> ACT PLANNING READY. Review all ${beatCount} beats before generating full outline.`
      : '>>> ACT PLANNING READY. Auto-continuing to outline...');
    dispatch({ type: 'MERGE', partial: {
      actPlanning: result,
      isProcessing: !isSteppable,
      stepStatus: isSteppable ? 'WAITING_FOR_APPROVAL' : 'PROCESSING',
    }});
    setEditedActPlanning(result);
    if (!isSteppable) executeOutline(inputStructure, inputDossier, inputDocCircle, result);
  }, [newController, dispatch, addLog, setEditedActPlanning, executeOutline]);

  // ── DOC CIRCLE (Steps 1-3: conflict arch + global Harmon circle + 4-act division) ──
  const executeDocCircle = useCallback(async (inputStructure: string, inputDossier: string) => {
    const controller = newController();
    addLog('>>> DOC CIRCLE: Generating conflict architecture + global Harmon circle...');

    const result = await runStep(
      AgentType.DOC_CIRCLE,
      () => runDocCircleAgent(inputStructure, inputDossier, controller.signal, stateRef.current.projectType),
      dispatch, addLog, controller,
      () => {}
    );
    if (!result) return;

    const isSteppable = stateRef.current.isSteppable;
    addLog(`>>> DOC CIRCLE READY. Parsed ${result.acts.length} acts.${isSteppable ? ' Review drama architecture before proceeding.' : ' Auto-continuing...'}`);
    dispatch({ type: 'MERGE', partial: {
      docCircle: result.text,
      documentaryActs: result.acts,
      isProcessing: !isSteppable,
      stepStatus: isSteppable ? 'WAITING_FOR_APPROVAL' : 'PROCESSING',
    }});
    setEditedDocCircle(result.text);
    if (!isSteppable) executeActPlanning(result.text, inputStructure, inputDossier);
  }, [newController, dispatch, addLog, setEditedDocCircle, executeActPlanning]);

  // ── ARCHITECT ───────────────────────────────────────────────────────────────
  const executeArchitect = useCallback(async (inputDossier: string) => {
    const controller = newController();
    dispatch({ type: 'MERGE', partial: { researchDossier: inputDossier } });
    addLog('>>> ACTIVATING AGENT C: THE ARCHITECT...');

    const { projectType } = stateRef.current;
    const result = await runStep(
      AgentType.ARCHITECT,
      () => runArchitectAgent(inputDossier, projectType, controller.signal),
      dispatch, addLog, controller,
      () => {}
    );
    if (!result) return;

    const { structure, thumbnailConcept, acts } = result;
    addLog('>>> STRUCTURE LOCKED.');
    const isSteppable = stateRef.current.isSteppable;
    dispatch({
      type: 'MERGE', partial: {
        structureMap: structure,
        thumbnailConcept,
        documentaryActs: acts,
        isProcessing: !isSteppable,
        stepStatus: isSteppable ? 'WAITING_FOR_APPROVAL' : 'PROCESSING',
      }
    });
    setEditedStructure(structure);
    if (!isSteppable) {
      if (isDocPipeline(projectType)) {
        executeDocCircle(structure, inputDossier);
      } else {
        executeOutline(structure, inputDossier);
      }
    }
  }, [newController, dispatch, addLog, setEditedStructure, executeDocCircle, executeOutline]);

  // ── ANALYST ─────────────────────────────────────────────────────────────────
  const executeAnalyst = useCallback(async (inputRadar: string) => {
    const controller = newController();
    dispatch({ type: 'MERGE', partial: { radarOutput: inputRadar } });
    addLog('>>> ACTIVATING AGENT B: THE ANALYST (Google Grounding)...');

    const dossier = await runStep(
      AgentType.ANALYST,
      () => runAnalystAgent(stateRef.current.topic, inputRadar, controller.signal, stateRef.current.scoutHook),
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
    if (!dossier) return;
    const { projectType } = stateRef.current;
    if (isDocPipeline(projectType)) {
      executeDocCircle(editedStructure, dossier);
    } else {
      executeOutline(editedStructure, dossier);
    }
  }, [executeDocCircle, executeOutline]);

  const handleApproveDocCircle = useCallback((editedDocCircle: string, structure: string, dossier: string | undefined) => {
    if (!dossier) return;
    executeActPlanning(editedDocCircle, structure, dossier);
  }, [executeActPlanning]);

  const handleApproveActPlanning = useCallback((editedActPlanning: string, docCircle: string, structure: string, dossier: string | undefined) => {
    if (!dossier) return;
    executeOutline(structure, dossier, docCircle, editedActPlanning);
  }, [executeOutline]);

  const handleApproveOutline = useCallback((editedOutline: string, structure: string, dossier: string | undefined) => {
    if (!dossier) return;
    const { projectType, documentaryActs } = stateRef.current;
    if (isDocPipeline(projectType) && documentaryActs) {
      executeDocumentaryWriter(documentaryActs, dossier);
    } else {
      executeWriter(structure, dossier, editedOutline);
    }
  }, [executeWriter, executeDocumentaryWriter]);

  const handleSelectTopic = useCallback((suggestion: TopicSuggestion) => {
    addLog(`>>> TARGET CONFIRMED: ${suggestion.title}`);
    // Pass full Scout context to Radar so it anchors on specific details (hook, angle, viral factor).
    // state.topic stays as the clean title for display/history/style-fetch.
    const richContext = [
      suggestion.title,
      suggestion.hook           ? `\nSCOUT HOOK: ${suggestion.hook}` : '',
      suggestion.narrativeAngle ? `\nNARRATIVE ANGLE: ${suggestion.narrativeAngle}` : '',
      suggestion.viralFactor    ? `\nVIRAL FACTOR: ${suggestion.viralFactor}` : '',
      suggestion.protagonist    ? `\nPROTAGONIST (real person found by Scout): ${suggestion.protagonist}` : '',
      suggestion.antagonist     ? `\nANTAGONIST (documented): ${suggestion.antagonist}` : '',
    ].join('');
    const hookWithPeople = [
      suggestion.hook,
      suggestion.protagonist    ? `\nPROTAGONIST: ${suggestion.protagonist}` : '',
      suggestion.antagonist     ? `\nANTAGONIST: ${suggestion.antagonist}` : '',
      suggestion.narrativeAngle ? `\nNARRATIVE ANGLE: ${suggestion.narrativeAngle}` : '',
      suggestion.viralFactor    ? `\nVIRAL FACTOR: ${suggestion.viralFactor}` : '',
    ].join('');
    dispatch({ type: 'MERGE', partial: { topic: suggestion.title, scoutHook: hookWithPeople, currentAgent: 'IDLE' } });
    executeRadar(suggestion.title, richContext);
  }, [dispatch, addLog, executeRadar]);

  const executeSEO = useCallback(async () => {
    const { topic, radarOutput, finalScript } = stateRef.current;
    if (!finalScript?.length) return;
    const controller = newController();
    addLog('>>> SEO AGENT: Generating YouTube SEO package...');
    dispatch({ type: 'MERGE', partial: { isProcessing: true } });
    try {
      const pkg = await runSEOAgent(topic, radarOutput, finalScript, controller.signal);
      if (pkg) {
        dispatch({ type: 'MERGE', partial: { seoPackage: pkg, isProcessing: false } });
        addLog('>>> SEO AGENT: Package generated successfully.');
      } else {
        dispatch({ type: 'MERGE', partial: { isProcessing: false, lastError: 'SEO Agent returned no data.' } });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      dispatch({ type: 'MERGE', partial: { isProcessing: false, lastError: `SEO Agent failed: ${msg}` } });
      addLog(`>>> SEO AGENT ERROR: ${msg}`);
    }
  }, [dispatch, addLog, newController]);

  // ── SCRIPT REWRITER ─────────────────────────────────────────────────────────
  const executeRewrite = useCallback(async () => {
    const { finalScript } = stateRef.current;
    if (!finalScript?.length) return;
    const controller = newController();
    addLog('>>> REWRITER: Starting script adaptation...');
    dispatch({ type: 'MERGE', partial: { isProcessing: true } });
    try {
      const rewritten = await runScriptRewriterAgent(
        finalScript,
        (done, total) => { addLog(`>>> REWRITER: ${done}/${total} blocks done`); },
        controller.signal
      );
      dispatch({ type: 'SET_FIELD', field: 'finalScript', value: rewritten });
      dispatch({ type: 'MERGE', partial: { isProcessing: false } });
      addLog('>>> REWRITER: Script adaptation complete.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      dispatch({ type: 'MERGE', partial: { isProcessing: false, lastError: `Rewriter failed: ${msg}` } });
      addLog(`>>> REWRITER ERROR: ${msg}`);
    }
  }, [dispatch, addLog, newController]);

  // ── AUDIT FIX ────────────────────────────────────────────────────────────────
  const executeAuditFix = useCallback(async () => {
    const { finalScript, projectType } = stateRef.current;
    if (!finalScript?.length) return;

    const maxSales = projectType === 'documentary' ? 4 : 1;

    // ── Pass 1: Instant structural fixes (no AI) ──────────────────────────────
    const fixed = [...finalScript];
    const structLog: string[] = [];

    if (fixed[0]?.blockType !== 'HOOK') {
      fixed[0] = { ...fixed[0], blockType: 'HOOK' };
      structLog.push('block[0] → HOOK');
    }
    if (fixed[fixed.length - 1]?.blockType !== 'OUTRO') {
      fixed[fixed.length - 1] = { ...fixed[fixed.length - 1], blockType: 'OUTRO' };
      structLog.push('block[last] → OUTRO');
    }

    const salesIdxs = fixed.map((b, i) => b.blockType === 'SALES' ? i : -1).filter(i => i >= 0);
    if (salesIdxs.length === 0) {
      const p1 = Math.floor(fixed.length * 0.33);
      fixed[p1] = { ...fixed[p1], blockType: 'SALES' };
      structLog.push(`SALES inserted at block[${p1}]`);
      if (projectType === 'documentary') {
        const p2 = Math.floor(fixed.length * 0.66);
        fixed[p2] = { ...fixed[p2], blockType: 'SALES' };
        structLog.push(`SALES inserted at block[${p2}]`);
      }
    } else if (salesIdxs.length > maxSales) {
      salesIdxs.slice(maxSales).forEach(i => { fixed[i] = { ...fixed[i], blockType: 'TRANSITION' }; });
      structLog.push(`${salesIdxs.length - maxSales} excess SALES → TRANSITION`);
    }

    let run = 1;
    for (let i = 1; i < fixed.length; i++) {
      if (fixed[i].blockType === fixed[i - 1].blockType) {
        run++;
        if (run === 5 && fixed[i].blockType === 'BODY') {
          fixed[i] = { ...fixed[i], blockType: 'TRANSITION' };
          structLog.push(`run break at block[${i}] → TRANSITION`);
          run = 1;
        }
      } else { run = 1; }
    }

    addLog(`>>> AUDIT FIX (structural): ${structLog.length ? structLog.join('; ') : 'nothing to fix'}`);
    dispatch({ type: 'SET_FIELD', field: 'finalScript', value: fixed });

    // ── Pass 2: AI content fixes (targeted) ───────────────────────────────────
    const BLACKLIST = DEMONETIZATION_BLACKLIST;
    const blockIssues: Record<number, string[]> = {};
    fixed.forEach((b, i) => {
      const issues: string[] = [];
      const text = ((b.audioScript ?? '') + ' ' + (b.russianScript ?? '')).toLowerCase();
      const found = BLACKLIST.filter(w => text.includes(w));
      if (found.length) issues.push(`blacklisted words: ${found.join(', ')}`);
      if ((b.audioScript ?? '').split(/\s+/).filter(Boolean).length < 30) issues.push('audioScript too short (< 30 words)');
      if (issues.length) blockIssues[i] = issues;
    });

    const targetIndices = Object.keys(blockIssues).map(Number);
    if (!targetIndices.length) {
      addLog('>>> AUDIT FIX: No content issues — structural fixes applied only.');
      return;
    }

    addLog(`>>> AUDIT FIX (AI): ${targetIndices.length} blocks need content fixes...`);
    const controller = newController();
    dispatch({ type: 'MERGE', partial: { isProcessing: true } });
    try {
      const aiFixed = await runAuditFixAgent(
        fixed, targetIndices, blockIssues,
        (done, total) => addLog(`>>> AUDIT FIX: ${done}/${total} blocks done`),
        controller.signal
      );
      dispatch({ type: 'SET_FIELD', field: 'finalScript', value: aiFixed });
      dispatch({ type: 'MERGE', partial: { isProcessing: false } });
      addLog('>>> AUDIT FIX: Complete.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      dispatch({ type: 'MERGE', partial: { isProcessing: false, lastError: `Audit fix failed: ${msg}` } });
      addLog(`>>> AUDIT FIX ERROR: ${msg}`);
    }
  }, [dispatch, addLog, newController]);

  return {
    executeScout,
    executeRadar,
    executeAnalyst,
    executeArchitect,
    executeDocCircle,
    executeActPlanning,
    executeOutline,
    executeWriter,
    executeDocumentaryWriter,
    handleImageGen,
    handlePreviewGen,
    handleApproveRadar,
    handleApproveAnalyst,
    handleApproveArchitect,
    handleApproveDocCircle,
    handleApproveActPlanning,
    handleApproveOutline,
    handleSelectTopic,
    cancelCurrentOperation,
    executeSEO,
    executeRewrite,
    executeAuditFix,
  };
}
