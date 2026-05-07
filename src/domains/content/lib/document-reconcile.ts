/**
 * Helper transversal y idempotente que cierra el ciclo de vida de un
 * documento importado en el cliente.
 *
 * Espejo de `supabase/functions/_shared/finalize-import.ts`. Cualquier UI o
 * hook que cargue la lista de documentos puede llamarlo en best-effort para
 * auto-curar documentos legacy cuyos puntos quedaron 100% aprobados pero
 * `import_status` siguió en `reviewing` (caso típico: scraper antiguo que no
 * cerraba el lifecycle).
 *
 * Fuente única de verdad para el auto-approve: `shouldAutoApproveImport`.
 */
import { supabase } from '@/integrations/supabase/client';
import { shouldAutoApproveImport } from './location-lifecycle';
import { approveAllDocumentLocations } from './document-approval';

export interface ReconcileResult {
  approved: number;
  collectionAdded: number;
  reconciled: boolean;
}

export async function reconcileDocumentImportStatus(
  docId: string,
): Promise<ReconcileResult> {
  const result: ReconcileResult = { approved: 0, collectionAdded: 0, reconciled: false };

  const { data: doc } = await supabase
    .from('documents')
    .select('id, source_type, import_status')
    .eq('id', docId)
    .maybeSingle();
  if (!doc) return result;

  // Auto-approve si el canal es trusted y queda algo pendiente.
  if (shouldAutoApproveImport((doc as { source_type?: string | null }).source_type ?? null)) {
    const { count: pendingCount } = await supabase
      .from('locations')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', docId)
      .eq('is_approved', false)
      .is('deleted_at', null);
    if ((pendingCount ?? 0) > 0) {
      try {
        const r = await approveAllDocumentLocations(docId);
        result.approved = r.approved;
        result.collectionAdded = r.collectionAdded ?? 0;
      } catch (e) {
        console.warn('[reconcile] approveAll failed', e);
      }
    }
  }

  // Reconcile import_status si todo está aprobado.
  const [{ count: totalCount }, { count: approvedCount }] = await Promise.all([
    supabase.from('locations').select('id', { count: 'exact', head: true }).eq('document_id', docId).is('deleted_at', null),
    supabase.from('locations').select('id', { count: 'exact', head: true }).eq('document_id', docId).is('deleted_at', null).eq('is_approved', true),
  ]);
  const total = totalCount ?? 0;
  const approved = approvedCount ?? 0;
  const trusted = shouldAutoApproveImport((doc as { source_type?: string | null }).source_type ?? null);
  const isConfirmed = (doc as { import_status?: string | null }).import_status === 'confirmed';
  const shouldConfirm = !isConfirmed && ((total > 0 && approved === total) || (trusted && total === 0));
  if (shouldConfirm) {
    await supabase.from('documents').update({ import_status: 'confirmed' } as never).eq('id', docId);
    result.reconciled = true;
  }
  // Best-effort: also consume pending_collection if it's still there and
  // approveAllDocumentLocations didn't run (e.g. doc was already 100% approved).
  if (!result.collectionAdded && shouldConfirm) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { consumePendingCollection } = await import('@/services/pending-collection.service');
        const r = await consumePendingCollection(docId, user.id);
        result.collectionAdded = r.added;
      }
    } catch (e) {
      console.warn('[reconcile] consumePendingCollection failed', e);
    }
  }
  return result;
}
