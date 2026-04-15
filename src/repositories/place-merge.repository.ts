import { supabase } from '@/integrations/supabase/client';
import type { PlaceMergeRecord } from '@/domains/v2';

const TABLE = 'place_merge_history' as const;

function toMerge(row: any): PlaceMergeRecord {
  return {
    id: row.id,
    sourcePlaceId: row.source_place_id,
    targetPlaceId: row.target_place_id,
    mergedAt: new Date(row.merged_at),
    mergedBy: row.merged_by ?? undefined,
    reason: row.reason ?? undefined,
  };
}

export const placeMergeRepository = {
  async findByTarget(targetPlaceId: string): Promise<PlaceMergeRecord[]> {
    const { data, error } = await supabase.from(TABLE).select('*')
      .eq('target_place_id', targetPlaceId);
    if (error) throw error;
    return (data ?? []).map(toMerge);
  },

  async findBySource(sourcePlaceId: string): Promise<PlaceMergeRecord[]> {
    const { data, error } = await supabase.from(TABLE).select('*')
      .eq('source_place_id', sourcePlaceId);
    if (error) throw error;
    return (data ?? []).map(toMerge);
  },

  async record(sourcePlaceId: string, targetPlaceId: string, mergedBy?: string, reason?: string): Promise<PlaceMergeRecord> {
    const { data, error } = await supabase.from(TABLE).insert({
      source_place_id: sourcePlaceId,
      target_place_id: targetPlaceId,
      merged_by: mergedBy ?? null,
      reason: reason ?? null,
    }).select().single();
    if (error) throw error;
    return toMerge(data);
  },
};
