
import { GoogleGenAI, Type } from "@google/genai";
import { AGENT_SCOUT_PROMPT, AGENT_A_PROMPT, AGENT_B_PROMPT, AGENT_C_PROMPT, AGENT_D_PROMPT } from "../constants";
import { ResearchDossier, ScriptBlock, TopicSuggestion } from "../types";

// Helper to ensure API key exists
const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing. Please set process.env.API_KEY");
  }
  return new GoogleGenAI({ apiKey });
};

// --- TIMING CALCULATION MODULE ---

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

// Basic number to words converter (0 - 999,999)
// Sufficient for script reading logic
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
  // Simple heuristic cleanup
  let s = text.toLowerCase().trim();

  // 1. Handle Currency ($130 -> 130 us dollars)
  // We handle comma separated numbers as well
  s = s.replace(/\$([0-9,]+(?:\.[0-9]+)?)/g, (match, p1) => {
     return p1 + ' us dollars'; 
  });

  // 2. Handle Percent (60% -> 60 percent)
  s = s.replace(/([0-9,]+(?:\.[0-9]+)?)%/g, '$1 percent');

  // 3. Handle Years (e.g. 2025 -> twenty twenty five)
  // Regex looks for 19xx or 20xx surrounded by boundaries to avoid matching inside other numbers if possible
  s = s.replace(/\b(19|20)(\d{2})\b/g, (match, p1, p2) => {
      // e.g. 2025 -> "twenty twenty five"
      return numberToWords(parseInt(p1)) + ' ' + numberToWords(parseInt(p2));
  });

  // 4. Handle Decimals (408.6 -> four hundred eight point six)
  s = s.replace(/(\d+)\.(\d+)/g, (match, p1, p2) => {
      // Split digits for the decimal part often reads better as single digits, 
      // but "point six" is standard.
      return numberToWords(parseInt(p1.replace(/,/g, ''))) + ' point ' + numberToWords(parseInt(p2));
  });

  // 5. Handle standard integers (run this last to avoid breaking dates/decimals)
  s = s.replace(/\d+/g, (match) => {
      return numberToWords(parseInt(match.replace(/,/g, '')));
  });

  // 6. Cleanup: Remove punctuation that isn't spoken (keep spaces)
  // We allow basic alpha-numeric and spaces.
  s = s.replace(/[^a-z0-9\s]/g, '');
  
  // Collapse spaces
  return s.replace(/\s+/g, ' ').trim();
};

const calculateDurationAndRetiming = (script: ScriptBlock[]): ScriptBlock[] => {
  let runningTimeSeconds = 0;

  return script.map(block => {
    // 1. Rewrite text to words
    const spokenText = expandTextForTiming(block.audioScript);
    
    // 2. Count chars with spaces
    const charCount = spokenText.length;
    
    // 3. Calculate Duration
    // PREVIOUSLY: charCount / 15 (Fast/Commercial pace)
    // NEW: charCount / 12 (Documentary/Dramatic pace ~130-140 wpm)
    let duration = Math.ceil(charCount / 12);
    
    // Optional: Safety floor. A block usually takes at least 3 seconds if it's not just "Yes."
    if (duration < 2) duration = 2; 

    const startTotal = runningTimeSeconds;
    const endTotal = runningTimeSeconds + duration;
    
    runningTimeSeconds = endTotal;

    // Helper to format MM:SS
    const formatTime = (totalSec: number) => {
        const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
        const s = (totalSec % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    return {
      ...block,
      timecode: `${formatTime(startTotal)} - ${formatTime(endTotal)}`
    };
  });
};

// --- AGENT FUNCTIONS ---

// Helper to determine if model supports search tools
const getToolsForModel = (model: string) => {
  // Only Gemini 3 series models reliably support the googleSearch tool with this configuration
  if (model.includes('gemini-3')) {
    return [{ googleSearch: {} }];
  }
  // For Gemini 2.5 Flash, 2.0, and 1.5, we disable search to prevent API errors
  return undefined;
};

export const runScoutAgent = async (model: string): Promise<TopicSuggestion[]> => {
  const ai = getClient();
  const tools = getToolsForModel(model);
  
  const response = await ai.models.generateContent({
    model: model, 
    contents: AGENT_SCOUT_PROMPT,
    config: {
      tools: tools,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            hook: { type: Type.STRING },
            viralFactor: { type: Type.STRING }
          },
          required: ["title", "hook", "viralFactor"]
        }
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("Scout returned empty intel.");
  return JSON.parse(text) as TopicSuggestion[];
};

export const runRadarAgent = async (topic: string, model: string): Promise<string> => {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: model,
    contents: `TOPIC: ${topic}\n\n${AGENT_A_PROMPT}`,
    config: {
      temperature: 0.7,
    }
  });
  return response.text || "Radar failed to acquire target.";
};

export const runAnalystAgent = async (topic: string, radarAnalysis: string, model: string): Promise<ResearchDossier> => {
  const ai = getClient();
  const tools = getToolsForModel(model);
  
  const response = await ai.models.generateContent({
    model: model, 
    contents: `TOPIC: ${topic}\n\nRADAR ANALYSIS: ${radarAnalysis}\n\n${AGENT_B_PROMPT}`,
    config: {
      tools: tools,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING },
          claims: { type: Type.ARRAY, items: { type: Type.STRING } },
          counterClaims: { type: Type.ARRAY, items: { type: Type.STRING } },
          visualAnchors: { type: Type.ARRAY, items: { type: Type.STRING } },
          dataPoints: { 
            type: Type.ARRAY, 
            items: { 
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                value: { type: Type.STRING }
              },
              required: ["label", "value"]
            } 
          } 
        },
        required: ["topic", "claims", "counterClaims", "visualAnchors", "dataPoints"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("Analyst returned empty data.");
  return JSON.parse(text) as ResearchDossier;
};

export const runArchitectAgent = async (dossier: ResearchDossier | string, model: string): Promise<string> => {
  const ai = getClient();
  // Handle both object (automatic) and string (human-edited) inputs
  const dossierStr = typeof dossier === 'string' ? dossier : JSON.stringify(dossier, null, 2);
  
  const response = await ai.models.generateContent({
    model: model,
    contents: `DOSSIER: ${dossierStr}\n\n${AGENT_C_PROMPT}`,
  });
  return response.text || "Architect failed to build structure.";
};

export const runWriterAgent = async (structure: string, dossier: ResearchDossier | string, model: string): Promise<ScriptBlock[]> => {
  const ai = getClient();
  // Handle both object (automatic) and string (human-edited) inputs
  const dossierStr = typeof dossier === 'string' ? dossier : JSON.stringify(dossier, null, 2);
  
  // Only use thinking budget if model is 3 or 2.5 series
  // Thinking is critical for the writer to maintain the 'Kozyra' persona and verify translation quality
  const thinkingConfig = (model.includes('gemini-3') || model.includes('gemini-2.5')) 
    ? { thinkingBudget: 2048 } 
    : undefined;

  const response = await ai.models.generateContent({
    model: model,
    contents: `DOSSIER: ${dossierStr}\nSTRUCTURE: ${structure}\n\n${AGENT_D_PROMPT}`,
    config: {
      responseMimeType: "application/json",
      thinkingConfig: thinkingConfig,
      // We accept a simplified array schema to ensure valid JSON output
       responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            // We ask the LLM for a timecode, but we will OVERWRITE it with our calculation function below
            timecode: { type: Type.STRING },
            visualCue: { type: Type.STRING },
            audioScript: { type: Type.STRING },
            russianScript: { type: Type.STRING },
            blockType: { type: Type.STRING, enum: ['INTRO', 'BODY', 'TRANSITION', 'SALES', 'OUTRO'] }
          },
          required: ["timecode", "visualCue", "audioScript", "russianScript", "blockType"]
        }
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("Writer returned empty script.");
  
  const rawScript = JSON.parse(text) as ScriptBlock[];

  // Post-process the script to fix timing using the strict character count method
  return calculateDurationAndRetiming(rawScript);
};

export const generateImageForBlock = async (prompt: string): Promise<string | null> => {
  const ai = getClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: `Cinematic storyboard frame, high contrast, geopolitical thriller style. SCENE: ${prompt}`,
      config: {
        // responseMimeType is NOT supported for image generation models
        imageConfig: {
          aspectRatio: "16:9"
        }
      }
    });
    
    // Extract base64 image
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (e) {
    console.error("Image gen failed", e);
    return null;
  }
};
