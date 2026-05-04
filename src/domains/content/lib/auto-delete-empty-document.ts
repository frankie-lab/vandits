/**
 * Helper transversal: auto-borra un documento si tras una operación
 * de borrado se ha quedado sin puntos NI rutas vinculadas.
 *
 * Llamarlo desde cualquier sitio que borre `locations` o `routes`
 * pertenecientes a un documento.
 *
 * Regla: si `locations` (no soft-deleted) === 0 AND
 *        `routes` con route_preferences.documentId === 0
 *        → eliminar el documento (preservando huérfanos: ya no quedan).
 */
import { supabase } from '@/integrations/supabase/client';
import { deleteDocumentFromDatabase } from './db-operations';
import { useLocationsStore } from '@/domains/content/store/locations-store';
import { toast } from 'sonner';

export async function autoDeleteIfEmpty(docId: string): Promise<boolean> {
  if (!docId) return false;
  try {
    const [{ count: locCount }, { count: routeCount }] = await Promise.all([
      supabase
        .from('locations')
        .select('id', { count: 'exact', head: true })
        .eq('document_id', docId)
        .is('deleted_at', null),
      supabase
        .from('routes')
        .select('id', { count: 'exact', head: true })
        .contains('route_preferences', { documentId: docId }),
    ]);

    if ((locCount ?? 0) > 0 || (routeCount ?? 0) > 0) return false;

    // Empty: delete the document row + raw file. No locations to wipe.
    const ok = await deleteDocumentFromDatabase(docId, { deleteLocations: false });
    if (!ok) return false;

    // Sync local store
    useLocationsStore.setState((state) => ({
      documents: state.documents.filter((d) => d.id !== docId),
      _docVersion: state._docVersion + 1,
    }));

    toast.info('Documento vacío eliminado automáticamente.');
    window.dispatchEvent(new CustomEvent('document:deleted', { detail: { id: docId, auto: true } }));
    return true;
  } catch (e) {
    console.warn('[autoDeleteIfEmpty] error:', e);
    return false;
  }
}
