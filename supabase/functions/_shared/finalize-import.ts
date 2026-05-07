// Edge-function helper: cierra el ciclo de vida de un documento importado.
//
// Único punto donde se decide:
//   1. Auto-aprobar puntos pendientes según `shouldAutoApproveImport(source_type)`.
//   2. Materializar `metadata.pending_collection` (consumir intent).
//   3. Marcar `import_status='confirmed'` cuando el documento queda 100% aprobado
//      (o cuando el canal es trusted aunque haya 0 puntos).
//
// Mantener SINCRONIZADO con `src/domains/content/lib/document-reconcile.ts`.
// Cualquier canal server-side (scraper, OneDrive bulk, futuras integraciones)
// debe llamar a `finalizeImportedDocument` al cerrar el job — nunca decidir
// `is_approved` o `import_status` ad-hoc.
import { shouldAutoApproveImport } from './lifecycle.ts';

interface MinimalSupabase {
  from: (table: string) => any;
}

export interface FinalizeResult {
  approved: number;
  collectionAdded: number;
  collectionId: string | null;
  reconciled: boolean;
}

export async function finalizeImportedDocument(
  supabase: MinimalSupabase,
  docId: string,
): Promise<FinalizeResult> {
  const result: FinalizeResult = {
    approved: 0,
    collectionAdded: 0,
    collectionId: null,
    reconciled: false,
  };

  const { data: doc } = await supabase
    .from('documents')
    .select('id, user_id, source_type, import_status, metadata')
    .eq('id', docId)
    .maybeSingle();
  if (!doc) return result;

  // 1. Auto-approve si el canal es trusted (idempotente).
  if (shouldAutoApproveImport(doc.source_type)) {
    const { data: pendingRows } = await supabase
      .from('locations')
      .select('id, custom_data')
      .eq('document_id', docId)
      .eq('is_approved', false)
      .is('deleted_at', null);
    const pending = (pendingRows ?? []) as Array<{ id: string; custom_data: any }>;
    const targetIds: string[] = [];
    for (const row of pending) {
      const dup = (row.custom_data as { duplicate_of?: string } | null)?.duplicate_of;
      if (!dup) targetIds.push(row.id);
    }
    if (targetIds.length > 0) {
      const { data: updated } = await supabase
        .from('locations')
        .update({ is_approved: true })
        .in('id', targetIds)
        .select('id');
      result.approved = updated?.length ?? 0;
    }
  }

  // 2. Consumir pending_collection si existe (idempotente: lo borramos del metadata tras procesar).
  const meta = (doc.metadata as Record<string, unknown> | null) ?? {};
  const pendingCol = meta.pending_collection as
    | { collection_id?: string | null; new_collection?: { name: string; visibility?: string } | null }
    | undefined;
  if (pendingCol && doc.user_id) {
    try {
      const consumed = await materializePendingCollection(supabase, {
        docId,
        userId: doc.user_id,
        collectionId: pendingCol.collection_id ?? null,
        newCollection: pendingCol.new_collection ?? null,
      });
      result.collectionAdded = consumed.added;
      result.collectionId = consumed.collectionId;
      // Limpiar pending_collection del metadata
      const next = { ...meta };
      delete (next as Record<string, unknown>).pending_collection;
      await supabase.from('documents').update({ metadata: next }).eq('id', docId);
    } catch (e) {
      console.warn('[finalize-import] consumePendingCollection failed', e);
    }
  }

  // 3. Reconcile import_status.
  const { count: totalCount } = await supabase
    .from('locations')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', docId)
    .is('deleted_at', null);
  const { count: approvedCount } = await supabase
    .from('locations')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', docId)
    .is('deleted_at', null)
    .eq('is_approved', true);
  const total = totalCount ?? 0;
  const approved = approvedCount ?? 0;
  const trusted = shouldAutoApproveImport(doc.source_type);
  const shouldConfirm =
    doc.import_status !== 'confirmed' &&
    ((total > 0 && approved === total) || (trusted && total === 0));
  if (shouldConfirm) {
    await supabase.from('documents').update({ import_status: 'confirmed' }).eq('id', docId);
    result.reconciled = true;
  }

  return result;
}

// Replica simplificada de attachDocumentToCollection (cliente). Crea la
// colección si hace falta y añade todos los puntos aprobados del documento
// como collection_items 'place'.
async function materializePendingCollection(
  supabase: MinimalSupabase,
  args: {
    docId: string;
    userId: string;
    collectionId: string | null;
    newCollection: { name: string; visibility?: string } | null;
  },
): Promise<{ added: number; collectionId: string | null }> {
  let collectionId = args.collectionId;
  if (!collectionId && args.newCollection?.name) {
    const { data: created, error } = await supabase
      .from('collections')
      .insert({
        user_id: args.userId,
        name: args.newCollection.name,
        visibility: args.newCollection.visibility ?? 'private',
        kind: 'catalog',
      })
      .select('id')
      .single();
    if (error) throw error;
    collectionId = created?.id ?? null;
  }
  if (!collectionId) return { added: 0, collectionId: null };

  const { data: locs } = await supabase
    .from('locations')
    .select('id')
    .eq('document_id', args.docId)
    .eq('is_approved', true)
    .is('deleted_at', null);
  const ids = (locs ?? []).map((l: any) => l.id as string);
  if (ids.length === 0) return { added: 0, collectionId };

  const rows = ids.map((id) => ({
    collection_id: collectionId!,
    item_type: 'place',
    item_id: id,
  }));
  const { data: inserted } = await supabase
    .from('collection_items')
    .upsert(rows, { onConflict: 'collection_id,item_type,item_id', ignoreDuplicates: true })
    .select('id');
  return { added: inserted?.length ?? 0, collectionId };
}
