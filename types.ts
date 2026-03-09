
export enum AgentType {
  SCOUT = 'SCOUT', // New Agent
  RADAR = 'RADAR',
  ANALYST = 'ANALYST',
  ARCHITECT = 'ARCHITECT',
  OUTLINER = 'OUTLINER',
  DOC_CIRCLE = 'DOC_CIRCLE',
  ACT_PLANNING = 'ACT_PLANNING',
  WRITER = 'WRITER',
  COMPLETED = 'COMPLETED'
}

export interface DataPoint {
  label: string;
  value: string;
}

export interface TopicSuggestion {
  title: string;
  hook: string;
  narrativeAngle: string;
  viralFactor: string;
  protagonist: string;  // "Real Name — Role (journalist/researcher/victim/whistleblower). Source."
  antagonist: string;   // "Named institution or individual — documented action."
  searchQuery?: string; // Exact Google query used to find this topic (used to build sourceUrl)
  sourceUrl?: string;   // Google Search URL constructed from searchQuery.
}

export interface SmokingGun {
  source: string;
  url: string;
  quote_or_fact: string;
}

export interface ResearchDossier {
  topic: string;
  visualEvidence: string[];
  smokingGun: SmokingGun;
  contextPoints: DataPoint[];
}

export interface ScriptBlock {
  timecode: string;
  visualCue: string;
  overlayFX: string;
  audioScript: string;
  russianScript: string;
  blockType: 'HOOK' | 'INTRO' | 'BODY' | 'TRANSITION' | 'SALES' | 'OUTRO';
  imageUrl?: string;
  assetUrl?: string;
  assetName?: string;
  ruStale?: boolean; // true when audioScript was edited after russianScript was generated
}

export type ProjectType = 'youtube' | 'documentary' | 'short_doc';

export interface SeoPackage {
  titles: string[];
  description: string;
  tags: string;
  firstComment: string;
  endScreenScript: string;
}

export interface HistoryItem {
  id: number;
  created_at: string;
  topic: string;
  model: string;
  project_type?: string;
  radar_output?: string;
  research_dossier?: string;
  structure_map?: string;
  thumbnail_concept?: string;
  script: ScriptBlock[];
}

export interface SystemState {
  currentAgent: AgentType | 'IDLE';
  topic: string;
  isProcessing: boolean;
  logs: string[];
  
  // Execution Mode
  isSteppable: boolean;
  stepStatus: 'IDLE' | 'WAITING_FOR_APPROVAL' | 'PROCESSING';

  // Project Format
  projectType: ProjectType;

  // Agent Outputs
  scoutSuggestions?: TopicSuggestion[]; // Output from Scout
  scoutHook?: string; // Raw Scout hook text — passed through to Analyst as primary event anchor
  radarOutput?: string; // Potential viral topics
  researchDossier?: string; // Always stored as formatted string
  structureMap?: string; // Structure plan (6-act for YouTube, 10-12-act for documentary)
  scriptOutline?: string; // Outliner output (numbered scene list with setup/payoff arcs)
  docCircle?: string;    // Documentary: Steps 1-3 (conflict architecture + global Harmon circle + 4-act division)
  actPlanning?: string;  // Documentary: Steps 4-5 (per-act circles + 32-beat outline)
  thumbnailConcept?: string; // Extracted from Architect output
  documentaryActs?: Array<{ block: string; timecode: string; description: string }>; // Documentary only
  currentWritingAct?: number; // 0-indexed act being written (documentary multi-pass progress)
  writerChunks?: number;     // Streaming chunk count for Writer progress bar
  finalScript?: ScriptBlock[];

  // Undo/Redo for script editing (capped at 20 snapshots each)
  undoStack?: ScriptBlock[][];
  redoStack?: ScriptBlock[][];

  // SEO Package
  seoPackage?: SeoPackage;

  // Preview
  previewImageUrl?: string;

  // Error surfacing
  lastError?: string;
  
  // History
  history: HistoryItem[];
  showHistory: boolean;
}

// NOTE: Import APP_VERSION at usage site to avoid circular deps
// The initial logs use a static string here; App.tsx uses APP_VERSION for headers.
export const INITIAL_STATE: SystemState = {
  currentAgent: 'IDLE',
  topic: '',
  isProcessing: false,
  isSteppable: true,
  stepStatus: 'IDLE',
  projectType: 'short_doc',
  logs: ['> NARRATIVE.WAR INITIALIZED...', '> WAITING FOR TARGET VECTOR...'],
  history: [],
  showHistory: false
};
