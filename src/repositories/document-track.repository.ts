import { supabase } from '@/integrations/supabase/client';
import type { DocumentTrack } from '@/domains/v2';

const TABLE = 'document_tracks' as const;

function toTrack(row: any): DocumentTrack {
  return {
    id: row.id,
    documentId: row.document_id,
    name: row.name,
    coordinates: (row.coordinates ?? []) as [number, number][],
    color: row.color ?? undefined,
    date: row.date ? new Date(row.date) : undefined,
    metadata: row.metadata ?? {},
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export const documentTrackRepository = {
  async findByDocument(documentId: string): Promise<DocumentTrack[]> {
    const { data, error } = await supabase.from(TABLE).select('*').eq('document_id', documentId);
    if (error) throw error;
    return (data ?? []).map(toTrack);
  },

  async insertBatch(tracks: Omit<DocumentTrack, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<DocumentTrack[]> {
    if (!tracks.length) return [];
    const rows = tracks.map(t => ({
      document_id: t.documentId,
      name: t.name,
      coordinates: t.coordinates as any,
      color: t.color ?? null,
      date: t.date?.toISOString() ?? null,
      metadata: t.metadata as any,
    }));
    const { data, error } = await supabase.from(TABLE).insert(rows).select();
    if (error) throw error;
    return (data ?? []).map(toTrack);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
  },

  async deleteByDocument(documentId: string): Promise<void> {
    const { error } = await supabase.from(TABLE).delete().eq('document_id', documentId);
    if (error) throw error;
  },
};
