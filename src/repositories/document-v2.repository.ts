import { supabase } from '@/integrations/supabase/client';
import type { DocumentV2 } from '@/domains/v2';

const TABLE = 'documents' as const;

function toDocumentV2(row: any): DocumentV2 {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    sourceType: row.source_type ?? undefined,
    filename: row.original_filename ?? undefined,
    originalFilePath: row.original_file_path ?? undefined,
    importStatus: row.import_status ?? undefined,
    totalWaypoints: row.total_waypoints ?? 0,
    resolvedCount: row.resolved_count ?? 0,
    pendingCount: row.pending_count ?? 0,
    conflictCount: row.conflict_count ?? 0,
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at) : undefined,
    metadata: row.metadata ?? {},
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export const documentV2Repository = {
  async findById(id: string): Promise<DocumentV2 | null> {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? toDocumentV2(data) : null;
  },

  async findByUser(userId: string): Promise<DocumentV2[]> {
    const { data, error } = await supabase.from(TABLE).select('*')
      .eq('user_id', userId).order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toDocumentV2);
  },

  async updateAuditCounters(id: string, counts: { totalWaypoints?: number; resolvedCount?: number; pendingCount?: number; conflictCount?: number }): Promise<void> {
    const row: Record<string, any> = {};
    if (counts.totalWaypoints !== undefined) row.total_waypoints = counts.totalWaypoints;
    if (counts.resolvedCount !== undefined) row.resolved_count = counts.resolvedCount;
    if (counts.pendingCount !== undefined) row.pending_count = counts.pendingCount;
    if (counts.conflictCount !== undefined) row.conflict_count = counts.conflictCount;
    const { error } = await supabase.from(TABLE).update(row).eq('id', id);
    if (error) throw error;
  },

  async updateImportStatus(id: string, status: DocumentV2['importStatus']): Promise<void> {
    const row: Record<string, any> = { import_status: status };
    if (status === 'confirmed') row.confirmed_at = new Date().toISOString();
    const { error } = await supabase.from(TABLE).update(row).eq('id', id);
    if (error) throw error;
  },

  async setSourceType(id: string, sourceType: DocumentV2['sourceType']): Promise<void> {
    const { error } = await supabase.from(TABLE).update({ source_type: sourceType }).eq('id', id);
    if (error) throw error;
  },
};
