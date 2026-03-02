import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { AGENT_SCOUT_PROMPT, AGENT_LENS_PROMPT, AGENT_RESEARCH_PROMPT, AGENT_ARCHITECT_PROMPT, AGENT_SCRIPTWRITER_PROMPT, CHARS_PER_SECOND, MIN_BLOCK_DURATION_SEC, IMAGE_GEN_MODEL, IMAGE_GEN_PROMPT_PREFIX, API_RETRY_COUNT, API_RETRY_BASE_DELAY_MS, AGENT_MODELS } from "../constants";
import { ResearchDossier, ScriptBlock, TopicSuggestion } from "../types";
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

async function fetchHarrisStyle(topic: string): Promise<string> {
  try {
    logger.info(`📡 Запрашиваем стиль Johnny Harris для темы: "${topic}"...`);
    const response = await fetch(`${BACKEND_URL}/api/get-harris-style`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: topic })
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

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= API_RETRY_COUNT; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < API_RETRY_COUNT) {
        const waitMs = API_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        logger.warn(`${label}: attempt ${attempt + 1} failed, retrying in ${waitMs}ms`, err);
        await delay(waitMs);
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

const calculateDurationAndRetiming = (script: ScriptBlock[]): ScriptBlock[] => {
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

// --- AGENT FUNCTIONS ---
// Models are hardcoded per agent via AGENT_MODELS (constants.ts)

const getToolsForModel = (model: string) => {
  if (model.includes('gemini-3')) {
    return [{ googleSearch: {} }];
  }
  return undefined;
};

export const runScoutAgent = async (): Promise<TopicSuggestion[]> => {
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
  }, 'runScoutAgent');
};

export const runRadarAgent = async (topic: string): Promise<string> => {
  const model = AGENT_MODELS.RADAR;
  return withRetry(async () => {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model,
      contents: `TOPIC: ${topic}\n\n${AGENT_LENS_PROMPT}`,
      config: {
        temperature: 0.7,
      }
    });
    return response.text || "Lens Agent failed to acquire target.";
  }, 'runRadarAgent');
};

export const runAnalystAgent = async (topic: string, radarAnalysis: string): Promise<ResearchDossier> => {
  const model = AGENT_MODELS.ANALYST;
  return withRetry(async () => {
    const ai = getClient();
    const tools = getToolsForModel(model);

    // googleSearch grounding is incompatible with responseMimeType/responseSchema —
    // use free-text response and extract JSON manually.
    const response = await ai.models.generateContent({
      model,
      contents: `TOPIC: ${topic}\n\nLENS ANALYSIS: ${radarAnalysis}\n\n${AGENT_RESEARCH_PROMPT}`,
      config: {
        tools,
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
      }
    });

    const text = extractResponseText(response, 'Analyst');
    if (!text) throw new Error("Analyst returned empty data.");
    return extractJson<ResearchDossier>(text, 'Analyst');
  }, 'runAnalystAgent');
};

export const runArchitectAgent = async (dossier: string): Promise<string> => {
  const model = AGENT_MODELS.ARCHITECT;
  return withRetry(async () => {
    const ai = getClient();
    const dossierStr = dossier;

    const response = await ai.models.generateContent({
      model,
      contents: `DOSSIER: ${dossierStr}\n\n${AGENT_ARCHITECT_PROMPT}`,
    });
    return response.text || "Architect failed to build structure.";
  }, 'runArchitectAgent');
};

// Writer uses streaming to prevent ERR_CONNECTION_CLOSED on large responses.
// Pro model + 60 blocks + bilingual text + thinking can take 2-3 min.
// Streaming keeps the connection alive with incremental data chunks.
export const runWriterAgent = async (structure: string, dossier: string): Promise<ScriptBlock[]> => {
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
    // --------------------------------------------------

    // thinkingConfig removed: gemini-3.x uses thinkingLevel (not thinkingBudget),
    // and mixing it with responseSchema + streaming causes immediate server disconnect.

    const response = await ai.models.generateContentStream({
      model,
      contents: `DOSSIER: ${dossierStr}\nSTRUCTURE: ${structure}\n\n${enhancedPrompt}`,
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 65536,
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
    for await (const chunk of response) {
      const part = chunk.text;
      if (part) fullText += part;
    }

    if (!fullText) throw new Error("Writer returned empty script.");

    const rawScript = safeJsonParse<ScriptBlock[]>(fullText, 'Writer');
    return calculateDurationAndRetiming(rawScript);
  }, 'runWriterAgent');
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