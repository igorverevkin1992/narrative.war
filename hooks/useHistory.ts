import { useCallback, Dispatch } from 'react';
import { HistoryItem, ScriptBlock } from '../types';
import { saveRunToHistory, fetchHistory, deleteHistoryItem } from '../services/supabaseClient';
import { Action } from '../store/reducer';
import { AgentType } from '../types';
import { logger } from '../services/logger';

export function useHistory(dispatch: Dispatch<Action>, addLog: (msg: string) => void) {
  const loadHistoryFromServer = useCallback(async () => {
    try {
      const history = await fetchHistory();
      dispatch({ type: 'SET_HISTORY', history });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Failed to load history', message);
      addLog(`ERROR: Could not load history: ${message}`);
    }
  }, [dispatch, addLog]);

  const loadFromHistory = useCallback((item: HistoryItem) => {
    dispatch({
      type: 'MERGE', partial: {
        topic: item.topic,
        finalScript: item.script,
        currentAgent: AgentType.COMPLETED,
        researchDossier: undefined,
        radarOutput: undefined,
        scoutSuggestions: undefined,
        showHistory: false,
      }
    });
    addLog(`>>> LOADED ARCHIVE ID: ${item.id} [${item.topic}]`);
  }, [dispatch, addLog]);

  const handleDeleteHistory = useCallback(async (
    id: number,
    currentHistory: HistoryItem[],
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    const previousHistory = currentHistory;
    dispatch({ type: 'SET_HISTORY', history: currentHistory.filter(item => item.id !== id) });
    const success = await deleteHistoryItem(id);
    if (success) {
      addLog(`>>> ARCHIVE ID ${id} DELETED PERMANENTLY.`);
    } else {
      dispatch({ type: 'SET_HISTORY', history: previousHistory });
      addLog(`>>> ERROR: COULD NOT DELETE ARCHIVE ID ${id}.`);
    }
  }, [dispatch, addLog]);

  const saveToHistory = useCallback(async (
    topic: string,
    model: string,
    script: ScriptBlock[],
    currentHistory: HistoryItem[]
  ): Promise<HistoryItem[]> => {
    const savedEntry = await saveRunToHistory(topic, model, script);
    return savedEntry ? [savedEntry, ...currentHistory] : currentHistory;
  }, []);

  return { loadHistoryFromServer, loadFromHistory, handleDeleteHistory, saveToHistory };
}
