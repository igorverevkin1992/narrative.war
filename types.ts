
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
  viralFactor: string;
}

export interface ResearchDossier {
  topic: string;
  claims: string[];
  counterClaims: string[];
  visualAnchors: string[];
  dataPoints: DataPoint[];
}

export interface ScriptBlock {
  timecode: string;
  visualCue: string;
  audioScript: string;
  russianScript: string;
  blockType: 'INTRO' | 'BODY' | 'TRANSITION' | 'SALES' | 'OUTRO';
  imageUrl?: string; // New field for AI generated storyboard
}

export interface HistoryItem {
  id: number;
  created_at: string;
  topic: string;
  model: string;
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

  // Agent Outputs
  scoutSuggestions?: TopicSuggestion[]; // Output from Scout
  radarOutput?: string; // Potential viral topics
  researchDossier?: ResearchDossier | string; // Now supports raw text for editing
  structureMap?: string; // 5-block structure plan
  finalScript?: ScriptBlock[];
  
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
  isSteppable: false,
  stepStatus: 'IDLE',
  logs: ['> MEDIAWAR.CORE INITIALIZED...', '> WAITING FOR TARGET VECTOR...'],
  history: [],
  showHistory: false
};
