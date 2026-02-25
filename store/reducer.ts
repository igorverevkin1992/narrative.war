import { SystemState, HistoryItem, ScriptBlock } from '../types';

// Strongly-typed mapped actions: each SET_FIELD variant binds field → correct value type
type SetFieldActions = {
  [K in keyof SystemState]: { type: 'SET_FIELD'; field: K; value: SystemState[K] };
}[keyof SystemState];

export type Action =
  | SetFieldActions
  | { type: 'ADD_LOG'; message: string }
  | { type: 'MERGE'; partial: Partial<SystemState> }
  | { type: 'UPDATE_SCRIPT_IMAGE'; index: number; imageUrl: string }
  | { type: 'SET_HISTORY'; history: HistoryItem[] };

const MAX_LOG_ENTRIES = 500;

export function stateReducer(state: SystemState, action: Action): SystemState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'ADD_LOG': {
      const logs = [...state.logs, action.message];
      return { ...state, logs: logs.length > MAX_LOG_ENTRIES ? logs.slice(-MAX_LOG_ENTRIES) : logs };
    }
    case 'MERGE':
      return { ...state, ...action.partial };
    case 'UPDATE_SCRIPT_IMAGE': {
      if (!state.finalScript) return state;
      const newScript = [...state.finalScript];
      newScript[action.index] = { ...newScript[action.index], imageUrl: action.imageUrl };
      return { ...state, finalScript: newScript };
    }
    case 'SET_HISTORY':
      return { ...state, history: action.history };
    default:
      return state;
  }
}
