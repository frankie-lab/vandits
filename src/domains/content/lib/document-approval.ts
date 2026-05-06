/**
 * Single helper to mass-approve all (non-deleted, not-yet-approved) locations
 * of a document and integrate them into the user's catalog.
 *
 * Called from:
 *  - DocumentsPanel  (per-document "Aprobar todos" button in the list)
 *  - DocumentFocusView (header CTA)
 *
 * Excluye automáticamente puntos marcados como duplicados de catálogo
 * (`custom_data.duplicate_of`) detectados durante el post-import: aprobarlos
 * crearía duplicados visuales con el canónico ya aprobado. El usuario puede
 * revisarlos manualmente desde la vista del documento.
 *
 * Emits the global `locations:changed` and `reload-locations` events so the
 * map and counters re-render in place without a full app reload.
 */
import { supabase } from '@/integrations/supabase/client';
import { consumePendingCollection } from '@/services/pending-collection.service';

export interface ApproveResult {
  approved: number;
  skippedDuplicates: number;
  collectionAdded?: number;
  collectionId?: string | null;
}

export async function approveAllDocumentLocations(
  docId: string,
): Promise<ApproveResult> {
  // 1. Fetch all pending locations of the document along with custom_data
  //    so we can filter out duplicates of catalog (auto-linked during import).
  const { data: pending, error: fetchErr } = await supabase
    .from('locations')
    .select('id, custom_data')
    .eq('document_id', docId)
    .eq('is_approved', false)
    .is('deleted_at', null);

  if (fetchErr) throw fetchErr;

  const all = pending ?? [];
  const skippedIds: string[] = [];
  const targetIds: string[] = [];
  for (const row of all) {
    const dup = (row.custom_data as { duplicate_of?: string } | null)?.duplicate_of;
    if (dup) skippedIds.push(row.id as string);
    else targetIds.push(row.id as string);
  }

  if (targetIds.length === 0) {
    return { approved: 0, skippedDuplicates: skippedIds.length };
  }

  const { data, error } = await supabase
    .from('locations')
    .update({ is_approved: true })
    .in('id', targetIds)
    .select('id');

  if (error) throw error;

  const approved = data?.length ?? 0;

  if (approved > 0) {
    window.dispatchEvent(new CustomEvent('locations:changed'));
    window.dispatchEvent(new CustomEvent('reload-locations'));
  }

  return { approved, skippedDuplicates: skippedIds.length };
}
