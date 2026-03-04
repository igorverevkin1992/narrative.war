import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ScriptBlock, HistoryItem } from '../types';
import { logger } from './logger';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

export const saveRunToHistory = async (
  topic: string,
  model: string,
  script: ScriptBlock[],
  radarOutput?: string,
  researchDossier?: string,
  structureMap?: string,
  thumbnailConcept?: string,
): Promise<HistoryItem | null> => {
  if (!supabase) {
    logger.warn("Supabase credentials missing. Project not saved.");
    return null;
  }

  const { data, error } = await supabase
    .from('projects')
    .insert([{
      topic,
      model,
      script,
      radar_output: radarOutput ?? null,
      research_dossier: researchDossier ?? null,
      structure_map: structureMap ?? null,
      thumbnail_concept: thumbnailConcept ?? null,
    }])
    .select();

  if (error) {
    logger.error('Error saving project', error);
    return null;
  }
  return (data?.[0] as HistoryItem) ?? null;
};

export const fetchHistory = async (): Promise<HistoryItem[]> => {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('projects')
    .select('id, created_at, topic, model, radar_output, research_dossier, structure_map, thumbnail_concept, script')
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Error fetching projects', error);
    return [];
  }
  return (data as HistoryItem[]) ?? [];
};

export const deleteHistoryItem = async (id: number): Promise<boolean> => {
  if (!supabase) return false;

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id);

  if (error) {
    logger.error('Error deleting project', error);
    return false;
  }
  return true;
};
