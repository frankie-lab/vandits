/**
 * Single helper to mass-approve all (non-deleted, not-yet-approved) locations
 * of a document and integrate them into the user's catalog.
 *
 * Called from:
 *  - DocumentsPanel  (per-document "Aprobar todos" button in the list)
 *  - DocumentFocusView (header CTA)
 *
 * Emits the global `locations:changed` and `reload-locations` events so the
 * map and counters re-render in place without a full app reload.
 */
import { supabase } from '@/integrations/supabase/client';

export interface ApproveResult {
  approved: number;
}

export async function approveAllDocumentLocations(
  docId: string,
): Promise<ApproveResult> {
  const { data, error } = await supabase
    .from('locations')
    .update({ is_approved: true })
    .eq('document_id', docId)
    .eq('is_approved', false)
    .is('deleted_at', null)
    .select('id');

  if (error) throw error;

  const approved = data?.length ?? 0;

  if (approved > 0) {
    window.dispatchEvent(new CustomEvent('locations:changed'));
    window.dispatchEvent(new CustomEvent('reload-locations'));
  }

  return { approved };
}
