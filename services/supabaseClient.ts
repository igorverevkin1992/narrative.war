import { createClient } from '@supabase/supabase-js';
import { ScriptBlock, HistoryItem } from '../types';

// Initialize client
// NOTE: Ideally these should be in process.env, but for this environment we check if they exist
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabase: any = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

export const saveRunToHistory = async (topic: string, model: string, script: ScriptBlock[]) => {
  if (!supabase) {
    console.warn("Supabase credentials missing. History not saved.");
    return null;
  }

  const { data, error } = await supabase
    .from('mediawar_history')
    .insert([
      { 
        topic, 
        model, 
        script 
      },
    ])
    .select();

  if (error) {
    console.error('Error saving history:', error);
    return null;
  }
  return data?.[0];
};

export const fetchHistory = async (): Promise<HistoryItem[]> => {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('mediawar_history')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching history:', error);
    return [];
  }
  return data as HistoryItem[];
};

export const deleteHistoryItem = async (id: number): Promise<boolean> => {
  if (!supabase) return false;

  const { error } = await supabase
    .from('mediawar_history')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting history item:', error);
    return false;
  }
  return true;
};