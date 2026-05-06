/**
 * Document-scoped geocoding helpers.
 *
 * Wraps the global geocoding job store so callers can launch a backfill
 * limited to ONE document (the recently imported one) instead of all the
 * user's pending points. The store and edge function both accept a
 * document_id scope.
 */
import { supabase } from '@/integrations/supabase/client';
import { useGeocodingJobStore } from '@/stores/geocoding-job-store';

export async function getDocumentPendingGeocoding(
  docId: string,
): Promise<number> {
  const { count } = await supabase
    .from('locations')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', docId)
    .or('country_id.is.null,continent_id.is.null')
    .is('deleted_at', null);
  return count ?? 0;
}

export async function startDocumentGeocoding(
  docId: string,
  label?: string,
): Promise<void> {
  const pending = await getDocumentPendingGeocoding(docId);
  if (pending === 0) return;
  await useGeocodingJobStore
    .getState()
    .start(pending, { documentId: docId, label });
}
