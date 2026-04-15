import { supabase } from '@/integrations/supabase/client';
import type { Waypoint } from '@/domains/v2';

const TABLE = 'waypoints' as const;

function toWaypoint(row: any): Waypoint {
  return {
    id: row.id,
    documentId: row.document_id,
    placeId: row.place_id ?? undefined,
    rawName: row.raw_name,
    normalizedName: row.normalized_name,
    latitude: row.latitude,
    longitude: row.longitude,
    resolutionStatus: row.resolution_status,
    resolutionConfidence: row.resolution_confidence ?? undefined,
    resolutionMethod: row.resolution_method ?? undefined,
    resolvedByUserId: row.resolved_by_user_id ?? undefined,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
    sourceHash: row.source_hash ?? undefined,
    enrichmentStatus: row.enrichment_status ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export const waypointRepository = {
  async findByDocument(documentId: string): Promise<Waypoint[]> {
    const { data, error } = await supabase.from(TABLE).select('*').eq('document_id', documentId);
    if (error) throw error;
    return (data ?? []).map(toWaypoint);
  },

  async findByStatus(documentId: string, status: Waypoint['resolutionStatus']): Promise<Waypoint[]> {
    const { data, error } = await supabase.from(TABLE).select('*')
      .eq('document_id', documentId)
      .eq('resolution_status', status);
    if (error) throw error;
    return (data ?? []).map(toWaypoint);
  },

  async findById(id: string): Promise<Waypoint | null> {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? toWaypoint(data) : null;
  },

  async insertBatch(waypoints: Omit<Waypoint, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<Waypoint[]> {
    if (!waypoints.length) return [];
    const rows = waypoints.map(w => ({
      document_id: w.documentId,
      place_id: w.placeId ?? null,
      raw_name: w.rawName,
      normalized_name: w.normalizedName,
      latitude: w.latitude,
      longitude: w.longitude,
      resolution_status: w.resolutionStatus,
      resolution_confidence: w.resolutionConfidence ?? null,
      resolution_method: w.resolutionMethod ?? null,
      resolved_by_user_id: w.resolvedByUserId ?? null,
      resolved_at: w.resolvedAt?.toISOString() ?? null,
      source_hash: w.sourceHash ?? null,
      enrichment_status: w.enrichmentStatus ?? null,
    }));
    const { data, error } = await supabase.from(TABLE).insert(rows).select();
    if (error) throw error;
    return (data ?? []).map(toWaypoint);
  },

  async resolve(id: string, placeId: string, method: Waypoint['resolutionMethod'], userId?: string): Promise<Waypoint> {
    const { data, error } = await supabase.from(TABLE).update({
      place_id: placeId,
      resolution_status: 'resolved' as const,
      resolution_method: method,
      resolved_by_user_id: userId ?? null,
      resolved_at: new Date().toISOString(),
    }).eq('id', id).select().single();
    if (error) throw error;
    return toWaypoint(data);
  },

  async dismiss(id: string): Promise<void> {
    const { error } = await supabase.from(TABLE).update({
      resolution_status: 'dismissed' as const,
    }).eq('id', id);
    if (error) throw error;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
  },
};
