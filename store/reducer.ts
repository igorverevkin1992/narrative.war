import { SystemState, HistoryItem, ScriptBlock } from '../types';
import { MAX_LOG_ENTRIES } from '../constants';

// Strongly-typed mapped actions: each SET_FIELD variant binds field → correct value type
type SetFieldActions = {
  [K in keyof SystemState]: { type: 'SET_FIELD'; field: K; value: SystemState[K] };
}[keyof SystemState];

export type Action =
  | SetFieldActions
  | { type: 'ADD_LOG'; message: string }
  | { type: 'MERGE'; partial: Partial<SystemState> }
  | { type: 'UPDATE_SCRIPT_IMAGE'; index: number; imageUrl: string }
  | { type: 'SET_HISTORY'; history: HistoryItem[] }
  | { type: 'UPDATE_SCRIPT_BLOCK'; index: number; patch: Partial<ScriptBlock> }
  | { type: 'DELETE_SCRIPT_BLOCK'; index: number }
  | { type: 'ADD_SCRIPT_BLOCK'; index: number }
  | { type: 'MOVE_SCRIPT_BLOCK'; from: number; to: number };

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
    case 'UPDATE_SCRIPT_BLOCK': {
      if (!state.finalScript) return state;
      const s = [...state.finalScript];
      s[action.index] = { ...s[action.index], ...action.patch };
      return { ...state, finalScript: s };
    }
    case 'DELETE_SCRIPT_BLOCK': {
      if (!state.finalScript) return state;
      return { ...state, finalScript: state.finalScript.filter((_, i) => i !== action.index) };
    }
    case 'ADD_SCRIPT_BLOCK': {
      if (!state.finalScript) return state;
      const newBlock: ScriptBlock = {
        timecode: '00:00 - 00:00',
        visualCue: '',
        overlayFX: '',
        audioScript: '',
        russianScript: '',
        blockType: 'BODY',
      };
      const s = [...state.finalScript];
      s.splice(action.index + 1, 0, newBlock);
      return { ...state, finalScript: s };
    }
    case 'MOVE_SCRIPT_BLOCK': {
      if (!state.finalScript) return state;
      const s = [...state.finalScript];
      const [item] = s.splice(action.from, 1);
      s.splice(action.to, 0, item);
      return { ...state, finalScript: s };
    }
    default:
      return state;
  }
}
