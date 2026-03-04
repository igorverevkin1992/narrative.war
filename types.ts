
export enum AgentType {
  SCOUT = 'SCOUT', // New Agent
  RADAR = 'RADAR',
  ANALYST = 'ANALYST',
  ARCHITECT = 'ARCHITECT',
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
}

export type ProjectType = 'youtube' | 'documentary';

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
  radarOutput?: string; // Potential viral topics
  researchDossier?: string; // Always stored as formatted string
  structureMap?: string; // Structure plan (6-act for YouTube, 10-12-act for documentary)
  thumbnailConcept?: string; // Extracted from Architect output
  documentaryActs?: Array<{ block: string; timecode: string; description: string }>; // Documentary only
  currentWritingAct?: number; // 0-indexed act being written (documentary multi-pass progress)
  finalScript?: ScriptBlock[];

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
  projectType: 'youtube',
  logs: ['> NARRATIVE.WAR INITIALIZED...', '> WAITING FOR TARGET VECTOR...'],
  history: [],
  showHistory: false
};
