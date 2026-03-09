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
  | { type: 'MOVE_SCRIPT_BLOCK'; from: number; to: number }
  | { type: 'UNDO_SCRIPT' }
  | { type: 'REDO_SCRIPT' };

const MAX_UNDO = 20;

function pushUndo(state: SystemState): Pick<SystemState, 'undoStack' | 'redoStack'> {
  if (!state.finalScript) return {};
  const stack = [...(state.undoStack ?? []), state.finalScript];
  return { undoStack: stack.length > MAX_UNDO ? stack.slice(-MAX_UNDO) : stack, redoStack: [] };
}

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
      return { ...state, ...pushUndo(state), finalScript: s };
    }
    case 'DELETE_SCRIPT_BLOCK': {
      if (!state.finalScript) return state;
      return { ...state, ...pushUndo(state), finalScript: state.finalScript.filter((_, i) => i !== action.index) };
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
      return { ...state, ...pushUndo(state), finalScript: s };
    }
    case 'MOVE_SCRIPT_BLOCK': {
      if (!state.finalScript) return state;
      const s = [...state.finalScript];
      const [item] = s.splice(action.from, 1);
      s.splice(action.to, 0, item);
      return { ...state, ...pushUndo(state), finalScript: s };
    }
    case 'UNDO_SCRIPT': {
      const stack = state.undoStack ?? [];
      if (!stack.length) return state;
      const prev = stack[stack.length - 1];
      return {
        ...state,
        finalScript: prev,
        undoStack: stack.slice(0, -1),
        redoStack: state.finalScript ? [...(state.redoStack ?? []), state.finalScript] : (state.redoStack ?? []),
      };
    }
    case 'REDO_SCRIPT': {
      const stack = state.redoStack ?? [];
      if (!stack.length) return state;
      const next = stack[stack.length - 1];
      return {
        ...state,
        finalScript: next,
        redoStack: stack.slice(0, -1),
        undoStack: state.finalScript ? [...(state.undoStack ?? []), state.finalScript] : (state.undoStack ?? []),
      };
    }
    default:
      return state;
  }
}
