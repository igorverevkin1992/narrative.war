import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { AGENT_SCOUT_PROMPT, AGENT_LENS_PROMPT, AGENT_RESEARCH_PROMPT, AGENT_ARCHITECT_PROMPT, AGENT_ARCHITECT_DOCUMENTARY_PROMPT, AGENT_SCRIPTWRITER_PROMPT, AGENT_DOCUMENTARY_WRITER_PROMPT, CHARS_PER_SECOND, MIN_BLOCK_DURATION_SEC, IMAGE_GEN_MODEL, IMAGE_GEN_PROMPT_PREFIX, API_RETRY_COUNT, API_RETRY_BASE_DELAY_MS, AGENT_MODELS } from "../constants";
import { ResearchDossier, ScriptBlock, TopicSuggestion, ProjectType } from "../types";
import { logger } from "./logger";

// API client factory.
// Proxy mode (recommended): set VITE_USE_PROXY=true in .env
//   → All calls go through FastAPI at VITE_BACKEND_URL, API key stays on server.
//   → Backend must have GOOGLE_API_KEY in its environment.
// Direct mode (default): VITE_GOOGLE_API_KEY is used directly from browser.
//   → Key is exposed in the client bundle (acceptable for local personal use).
const getClient = () => {
  const useProxy = import.meta.env.VITE_USE_PROXY === 'true';
  if (useProxy) {
    const backendUrl = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000";
    // Route through FastAPI proxy — real key is added by backend, never sent to browser.
    return new GoogleGenAI({
      apiKey: "proxy",
      httpOptions: { baseUrl: `${backendUrl}/api/gemini` }
    });
  }
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("API Key missing. Set VITE_GOOGLE_API_KEY (direct) or VITE_USE_PROXY=true (backend proxy).");
  }
  return new GoogleGenAI({ apiKey });
};

// --- STYLE RETRIEVAL HELPER ---
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000";

async function fetchHarrisStyle(topic: string, k = 3): Promise<string> {
  try {
    logger.info(`📡 Запрашиваем стиль Johnny Harris для темы: "${topic}" (k=${k})...`);
    const response = await fetch(`${BACKEND_URL}/api/get-harris-style`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, k })
    });

    if (response.ok) {
      const data = await response.json();
      logger.info("✅ Стиль успешно загружен из базы знаний.");
      return data.style_context || "";
    } else {
      logger.warn("⚠️ Бэкенд стиля ответил ошибкой", { status: response.status });
      return "";
    }
  } catch (e) {
    logger.warn("⚠️ Не удалось получить стиль (сервер выключен?)", e);
    return "";
  }
}

// --- RETRY HELPER ---

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Extracts HTTP status code from Gemini SDK error messages.
// Pattern: "got status: UNAVAILABLE. {"error":{"code":503..."
function getHttpStatus(err: unknown): number | null {
  if (!(err instanceof Error)) return null;
  const m = err.message.match(/"code"\s*:\s*(\d+)/);
  return m ? parseInt(m[1]) : null;
}

async function withRetry<T>(fn: () => Promise<T>, label: string, signal?: AbortSignal): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= API_RETRY_COUNT; attempt++) {
    if (signal?.aborted) throw new Error('Operation cancelled by user.');
    try {
      return await fn();
    } catch (err) {
      if (signal?.aborted) throw new Error('Operation cancelled by user.');
      lastError = err;
      const status = getHttpStatus(err);
      // 400 Bad Request: no point retrying — the request itself is malformed.
      if (status === 400) throw err;
      if (attempt < API_RETRY_COUNT) {
        // 429 Rate Limit: longer backoff + jitter to avoid thundering herd.
        const base = status === 429
          ? API_RETRY_BASE_DELAY_MS * Math.pow(2, attempt + 1) + Math.floor(Math.random() * 1000)
          : API_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        logger.warn(`${label}: attempt ${attempt + 1} failed (HTTP ${status ?? 'unknown'}), retrying in ${base}ms`, err);
        await delay(base);
      }
    }
  }
  throw lastError;
}

// --- RESPONSE TEXT EXTRACTOR ---
// response.text may be empty when googleSearch grounding is active on some models.
// Falls back to manually assembling text from candidates[0].content.parts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractResponseText(response: any, label: string): string {
  const direct = response.text as string | undefined;
  if (direct) return direct;

  // Manual fallback: collect all text parts from first candidate
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts = response.candidates?.[0]?.content?.parts as any[] | undefined;
  if (parts?.length) {
    const assembled = parts.filter(p => typeof p.text === 'string').map(p => p.text as string).join('');
    if (assembled) return assembled;
  }

  // Check if prompt was blocked by safety filters (no candidates at all)
  const blockReason = response.promptFeedback?.blockReason;
  const finishReason = response.candidates?.[0]?.finishReason;
  logger.error(`${label}: empty text. blockReason=${blockReason} finishReason=${finishReason}`, {
    candidateCount: response.candidates?.length ?? 0,
    parts: parts?.map((p: any) => Object.keys(p)),
  });
  return '';
}

// --- SAFE JSON PARSER ---

function safeJsonParse<T>(text: string, label: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    logger.error(`${label}: Failed to parse JSON response`, { text: text.substring(0, 200), err });
    throw new Error(`${label}: Invalid JSON response from API`, { cause: err });
  }
}

// Extracts the first JSON object or array from free-form text.
// Required when googleSearch grounding is active — incompatible with responseMimeType/responseSchema.
function extractJson<T>(text: string, label: string): T {
  const match = text.match(/```json\s*([\s\S]*?)```/) || text.match(/([\[{][\s\S]*[\]}])/);
  if (!match) {
    logger.error(`${label}: No JSON block found in grounded response`, { text: text.substring(0, 300) });
    throw new Error(`${label}: No JSON found in response`);
  }
  return safeJsonParse<T>(match[1].trim(), label);
}

// --- TIMING CALCULATION MODULE ---

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

const numberToWords = (n: number): string => {
  if (n === 0) return 'zero';
  let str = '';

  if (n >= 1000000) {
      str += numberToWords(Math.floor(n / 1000000)) + ' million ';
      n %= 1000000;
  }
  if (n >= 1000) {
      str += numberToWords(Math.floor(n / 1000)) + ' thousand ';
      n %= 1000;
  }
  if (n >= 100) {
      str += ONES[Math.floor(n / 100)] + ' hundred ';
      n %= 100;
      if (n > 0) str += 'and ';
  }
  if (n >= 20) {
      str += TENS[Math.floor(n / 10)] + ' ';
      n %= 10;
  }
  if (n >= 10) {
      str += TEENS[n - 10] + ' ';
      n = 0;
  }
  if (n > 0) {
      str += ONES[n] + ' ';
  }
  return str.trim();
};

const expandTextForTiming = (text: string): string => {
  if (!text) return '';
  let s = text.toLowerCase().trim();

  s = s.replace(/\$([0-9,]+(?:\.[0-9]+)?)/g, (_match, p1) => {
     return p1 + ' us dollars';
  });

  s = s.replace(/([0-9,]+(?:\.[0-9]+)?)%/g, '$1 percent');

  s = s.replace(/\b(19|20)(\d{2})\b/g, (_match, p1, p2) => {
      return numberToWords(parseInt(p1)) + ' ' + numberToWords(parseInt(p2));
  });

  s = s.replace(/(\d+)\.(\d+)/g, (_match, p1, p2) => {
      return numberToWords(parseInt(p1.replace(/,/g, ''))) + ' point ' + numberToWords(parseInt(p2));
  });

  s = s.replace(/\d+/g, (match) => {
      return numberToWords(parseInt(match.replace(/,/g, '')));
  });

  s = s.replace(/[^a-z0-9\s]/g, '');

  return s.replace(/\s+/g, ' ').trim();
};

export const calculateDurationAndRetiming = (script: ScriptBlock[]): ScriptBlock[] => {
  let runningTimeSeconds = 0;

  return script.map(block => {
    const spokenText = expandTextForTiming(block.audioScript);
    const charCount = spokenText.length;

    let duration = Math.ceil(charCount / CHARS_PER_SECOND);
    if (duration < MIN_BLOCK_DURATION_SEC) duration = MIN_BLOCK_DURATION_SEC;

    const startTotal = runningTimeSeconds;
    const endTotal = runningTimeSeconds + duration;

    runningTimeSeconds = endTotal;

    const formatTime = (totalSec: number) => {
        const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
        const sec = (totalSec % 60).toString().padStart(2, '0');
        return `${m}:${sec}`;
    };

    return {
      ...block,
      timecode: `${formatTime(startTotal)} - ${formatTime(endTotal)}`
    };
  });
};

// --- INTERNAL STRUCTURED TYPES FOR RADAR + ARCHITECT ---
// These are not exported — RADAR/ARCHITECT still return `string` to the pipeline.
// Using responseSchema forces the model to output valid JSON; we then format to readable text.

interface RadarHypothesis { theory: string; proof: string; }
interface RadarAnalysis   { strategicOverview: string; hypotheses: RadarHypothesis[]; }
interface ArchitectBlock  { block: string; timecode: string; description: string; }
interface ArchitectPlan   { title: string; thumbnailConcept: string; visualAnchor: string; structure: ArchitectBlock[]; }

function formatRadarOutput(r: RadarAnalysis): string {
  let out = `STRATEGIC OVERVIEW:\n${r.strategicOverview}\n\n/// VIDEO HYPOTHESES`;
  r.hypotheses.forEach((h, i) => {
    out += `\n\nHYPOTHESIS ${i + 1}:\nTHEORY: ${h.theory}\nPROOF:  ${h.proof}`;
  });
  return out;
}

function formatArchitectOutput(p: ArchitectPlan): string {
  let out = `=== PACKAGING PLAN ===\nTITLE: ${p.title}\nTHUMBNAIL: ${p.thumbnailConcept}\n\n`;
  out += `=== VISUAL ANCHOR (Opening 5 seconds) ===\n${p.visualAnchor}\n\n`;
  out += `=== STRUCTURAL BREAKDOWN ===`;
  p.structure.forEach((s, i) => {
    out += `\n\n${i + 1}. ${s.block} (${s.timecode})\n   ${s.description}`;
  });
  return out;
}

// --- AGENT FUNCTIONS ---
// Models are hardcoded per agent via AGENT_MODELS (constants.ts)

const getToolsForModel = (model: string) => {
  // googleSearch grounding only works reliably on Flash models.
  // Pro models (gemini-3.1-pro-preview) disconnect immediately when googleSearch is included.
  if (model.includes('flash')) {
    return [{ googleSearch: {} }];
  }
  return undefined;
};

export const runScoutAgent = async (signal?: AbortSignal): Promise<TopicSuggestion[]> => {
  const model = AGENT_MODELS.SCOUT;
  return withRetry(async () => {
    const ai = getClient();
    const tools = getToolsForModel(model);

    // googleSearch grounding is incompatible with responseMimeType/responseSchema —
    // use free-text response and extract JSON manually.
    // safetySettings BLOCK_NONE required: geopolitical/military research triggers default filters.
    const response = await ai.models.generateContent({
      model,
      contents: AGENT_SCOUT_PROMPT,
      config: {
        tools,
        abortSignal: signal,
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
      }
    });

    const text = extractResponseText(response, 'Scout');
    if (!text) throw new Error("Scout returned empty intel.");
    return extractJson<TopicSuggestion[]>(text, 'Scout');
  }, 'runScoutAgent', signal);
};

export const runRadarAgent = async (topic: string, signal?: AbortSignal): Promise<string> => {
  const model = AGENT_MODELS.RADAR;
  return withRetry(async () => {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model,
      contents: `TOPIC: ${topic}\n\n${AGENT_LENS_PROMPT}`,
      config: {
        temperature: 0.7,
        abortSignal: signal,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            strategicOverview: { type: Type.STRING },
            hypotheses: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  theory: { type: Type.STRING },
                  proof:  { type: Type.STRING },
                },
                required: ["theory", "proof"],
              },
            },
          },
          required: ["strategicOverview", "hypotheses"],
        },
      }
    });
    const text = response.text;
    if (!text) throw new Error("Radar returned empty analysis.");
    const parsed = safeJsonParse<RadarAnalysis>(text, 'Radar');
    return formatRadarOutput(parsed);
  }, 'runRadarAgent', signal);
};

export const runAnalystAgent = async (topic: string, radarAnalysis: string, signal?: AbortSignal): Promise<ResearchDossier> => {
  const model = AGENT_MODELS.ANALYST;
  return withRetry(async () => {
    const ai = getClient();

    // Original working config: responseSchema + googleSearch, no safetySettings.
    // safetySettings caused TCP disconnect on Pro models; removed.
    // googleSearch works on gemini-3-pro-preview (3.0), was issue only with 3.1-pro.
    const tools = getToolsForModel(model);
    const response = await ai.models.generateContent({
      model,
      contents: `TOPIC: ${topic}\n\nLENS ANALYSIS: ${radarAnalysis}\n\n${AGENT_RESEARCH_PROMPT}`,
      config: {
        tools,
        abortSignal: signal,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            topic:         { type: Type.STRING },
            visualEvidence: { type: Type.ARRAY, items: { type: Type.STRING } },
            smokingGun: {
              type: Type.OBJECT,
              properties: {
                source:       { type: Type.STRING },
                url:          { type: Type.STRING },
                quote_or_fact: { type: Type.STRING },
              },
              required: ["source", "url", "quote_or_fact"],
            },
            contextPoints: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  value: { type: Type.STRING },
                },
                required: ["label", "value"],
              },
            },
          },
          required: ["topic", "visualEvidence", "smokingGun", "contextPoints"],
        },
      }
    });

    const text = response.text;
    if (!text) throw new Error("Analyst returned empty data.");
    return safeJsonParse<ResearchDossier>(text, 'Analyst');
  }, 'runAnalystAgent', signal);
};

export const runArchitectAgent = async (dossier: string, projectType: ProjectType = 'youtube', signal?: AbortSignal): Promise<{ structure: string; thumbnailConcept: string; acts?: ArchitectBlock[] }> => {
  const model = AGENT_MODELS.ARCHITECT;
  const prompt = projectType === 'documentary' ? AGENT_ARCHITECT_DOCUMENTARY_PROMPT : AGENT_ARCHITECT_PROMPT;
  return withRetry(async () => {
    const ai = getClient();

    const response = await ai.models.generateContent({
      model,
      contents: `DOSSIER: ${dossier}\n\n${prompt}`,
      config: {
        abortSignal: signal,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title:            { type: Type.STRING },
            thumbnailConcept: { type: Type.STRING },
            visualAnchor:     { type: Type.STRING },
            structure: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  block:       { type: Type.STRING },
                  timecode:    { type: Type.STRING },
                  description: { type: Type.STRING },
                },
                required: ["block", "timecode", "description"],
              },
            },
          },
          required: ["title", "thumbnailConcept", "visualAnchor", "structure"],
        },
      },
    });
    const text = response.text;
    if (!text) throw new Error("Architect failed to build structure.");
    const parsed = safeJsonParse<ArchitectPlan>(text, 'Architect');
    const result: { structure: string; thumbnailConcept: string; acts?: ArchitectBlock[] } = {
      structure: formatArchitectOutput(parsed),
      thumbnailConcept: parsed.thumbnailConcept,
    };
    if (projectType === 'documentary') result.acts = parsed.structure;
    return result;
  }, 'runArchitectAgent', signal);
};

// Writer uses streaming to prevent ERR_CONNECTION_CLOSED on large responses.
// Pro model + 60 blocks + bilingual text can take 2-3 min.
// onProgress fires every 20 chunks so the UI can show activity.
export const runWriterAgent = async (
  structure: string,
  dossier: string,
  signal?: AbortSignal,
  onProgress?: (chunks: number) => void,
): Promise<ScriptBlock[]> => {
  const model = AGENT_MODELS.WRITER;
  return withRetry(async () => {
    const ai = getClient();
    const dossierStr = dossier;

    // Extract topic for style fetch (dossier always starts with "TOPIC: ...")
    let topicForStyle = "General geopolitical conflict";
    const topicMatch = dossier.match(/^TOPIC:\s*(.+)/m);
    if (topicMatch) topicForStyle = topicMatch[1].trim();

    const styleContext = await fetchHarrisStyle(topicForStyle);

    // Inject style into prompt
    const enhancedPrompt = `
      ${AGENT_SCRIPTWRITER_PROMPT}

      === STYLE REFERENCE: HARRIS/KOZYRA DATA-NOIR ===
      Use the following real examples from Johnny Harris transcripts to copy the rhythm, visual language, and pacing.
      Your script must feel like a cold intelligence briefing, not a YouTube video.

      ${styleContext ? `STYLE EXAMPLES FOR THIS TOPIC:\n${styleContext}` : "No style examples found. Default to cold, analytical Data-Noir tone."}
      ================================================
    `;

    // thinkingConfig removed: gemini-3.x uses thinkingLevel (not thinkingBudget),
    // and mixing it with responseSchema + streaming causes immediate server disconnect.

    const response = await ai.models.generateContentStream({
      model,
      contents: `DOSSIER: ${dossierStr}\nSTRUCTURE: ${structure}\n\n${enhancedPrompt}`,
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 65536,
        abortSignal: signal,
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              timecode: { type: Type.STRING },
              visualCue: { type: Type.STRING },
              overlayFX: { type: Type.STRING },
              audioScript: { type: Type.STRING },
              russianScript: { type: Type.STRING },
              blockType: { type: Type.STRING, enum: ['HOOK', 'INTRO', 'BODY', 'TRANSITION', 'SALES', 'OUTRO'] }
            },
            required: ["timecode", "visualCue", "overlayFX", "audioScript", "russianScript", "blockType"]
          }
        }
      }
    });

    // Collect all streamed chunks into the full JSON string
    let fullText = '';
    let chunkCount = 0;
    for await (const chunk of response) {
      if (signal?.aborted) throw new Error('Operation cancelled by user.');
      const part = chunk.text;
      if (part) {
        fullText += part;
        chunkCount++;
        if (onProgress && chunkCount % 20 === 0) onProgress(chunkCount);
      }
    }

    if (!fullText) throw new Error("Writer returned empty script.");

    const rawScript = safeJsonParse<ScriptBlock[]>(fullText, 'Writer');
    return calculateDurationAndRetiming(rawScript);
  }, 'runWriterAgent');
};

// --- DOCUMENTARY: PER-ACT WRITER (non-streaming, ~20-25 blocks per call) ---
export const runDocumentaryActWriter = async (
  act: { block: string; timecode: string; description: string },
  allActs: { block: string; timecode: string; description: string }[],
  dossier: string,
  prevBlocks: ScriptBlock[],
  signal?: AbortSignal,
): Promise<ScriptBlock[] | null> => {
  const model = AGENT_MODELS.WRITER;
  const ai = getClient();

  const topicQuery = `${act.block} ${act.description}`.substring(0, 200);
  const styleContext = await fetchHarrisStyle(topicQuery, 6);

  const structureSummary = allActs.map((a, i) =>
    `ACT ${i + 1}: ${a.block} [${a.timecode}]`
  ).join('\n');

  const prevContext = prevBlocks.length > 0
    ? `\n\nLAST BLOCKS FROM PREVIOUS ACT (maintain narrative continuity):\n${prevBlocks.map(b => `"${b.audioScript}"`).join('\n')}`
    : '';

  const contents = `FULL DOCUMENTARY STRUCTURE:\n${structureSummary}\n\nCURRENT ACT TO WRITE:\n${act.block} [${act.timecode}]\n${act.description}${prevContext}\n\nRESEARCH DOSSIER:\n${dossier}\n\n${AGENT_DOCUMENTARY_WRITER_PROMPT}\n\n${styleContext ? `=== STYLE REFERENCE: HARRIS/KOZYRA DATA-NOIR ===\n${styleContext}\n================================================` : ''}`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        abortSignal: signal,
        responseMimeType: "application/json",
        maxOutputTokens: 32768,
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              timecode:      { type: Type.STRING },
              visualCue:     { type: Type.STRING },
              overlayFX:     { type: Type.STRING },
              audioScript:   { type: Type.STRING },
              russianScript: { type: Type.STRING },
              blockType:     { type: Type.STRING, enum: ['HOOK', 'INTRO', 'BODY', 'TRANSITION', 'SALES', 'OUTRO'] }
            },
            required: ["timecode", "visualCue", "overlayFX", "audioScript", "russianScript", "blockType"]
          }
        }
      }
    });

    const text = response.text;
    if (!text) return null;
    return safeJsonParse<ScriptBlock[]>(text, `DocWriter ${act.block}`);
  } catch (e: unknown) {
    if (signal?.aborted) return null;
    const message = e instanceof Error ? e.message : String(e);
    logger.error(`Documentary act writer failed: ${act.block}`, { message });
    return null;
  }
};

export const generateImageForBlock = async (prompt: string): Promise<string | null> => {
  const ai = getClient();
  try {
    const response = await ai.models.generateContent({
      model: IMAGE_GEN_MODEL,
      contents: `${IMAGE_GEN_PROMPT_PREFIX} ${prompt}`,
      config: {
        imageConfig: {
          aspectRatio: "16:9"
        }
      }
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) return null;

    for (const part of parts) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error("Image generation failed", { message, prompt: prompt.substring(0, 80) });
    return null;
  }
};

export const generatePreviewImage = async (
  referenceBase64: string,
  mimeType: string,
  thumbnailConcept: string
): Promise<string | null> => {
  const ai = getClient();
  try {
    const response = await ai.models.generateContent({
      model: IMAGE_GEN_MODEL,
      contents: [
        { inlineData: { mimeType, data: referenceBase64 } },
        { text: `Create a YouTube thumbnail in 16:9 format based on this reference image. Concept: ${thumbnailConcept}. Style: cinematic, high contrast, bold composition, professional quality.` },
      ] as never,
      config: {
        imageConfig: { aspectRatio: "16:9" }
      }
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) return null;

    for (const part of parts) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error("Preview generation failed", { message });
    return null;
  }
};