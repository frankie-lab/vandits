/**
 * Helper transversal único para diferir la asignación de colección de un
 * documento importado HASTA que el usuario apruebe la importación.
 *
 * Antes: Web scraper / FileUpload llamaban a `attachDocumentToCollection`
 * inmediatamente tras el import, creando colecciones "fantasma" con puntos
 * no aprobados (visibles solo en mesa de trabajo) que el usuario quizá
 * nunca aprobaría.
 *
 * Ahora: la intención se guarda en `documents.metadata.pending_collection`
 * y se materializa en `approveAllDocumentLocations` (o en `applyCatalog`
 * cuando el usuario ejecuta "Aprobar / Añadir a colección").
 *
 * Ver mem://logic/map/visibility-rule-approval-gated
 */
import { supabase } from '@/integrations/supabase/client';
import { attachDocumentToCollection, type Visibility } from '@/services/document-add.service';

export interface PendingCollectionIntent {
  collectionId?: string | null;
  newCollection?: { name: string; visibility?: Visibility } | null;
}

export async function setPendingCollection(
  docId: string,
  intent: PendingCollectionIntent,
): Promise<void> {
  const hasExisting = !!intent.collectionId && intent.collectionId !== '__new__';
  const hasNew = !!intent.newCollection?.name?.trim();
  if (!hasExisting && !hasNew) return;

  const payload = {
    collection_id: hasExisting ? (intent.collectionId as string) : null,
    new_collection: hasNew
      ? {
          name: intent.newCollection!.name.trim(),
          visibility: intent.newCollection!.visibility ?? 'private',
        }
      : null,
  };

  const { data: doc } = await supabase
    .from('documents')
    .select('metadata')
    .eq('id', docId)
    .maybeSingle();
  const meta = (doc?.metadata as Record<string, unknown> | null) ?? {};
  const next = { ...meta, pending_collection: payload };
  await supabase
    .from('documents')
    .update({ metadata: next as never })
    .eq('id', docId);
}

/** Materialize and clear `pending_collection` after the user approves. */
export async function consumePendingCollection(
  docId: string,
  userId: string,
): Promise<{ added: number; collectionId: string | null }> {
  const { data: doc } = await supabase
    .from('documents')
    .select('metadata')
    .eq('id', docId)
    .maybeSingle();
  const meta = (doc?.metadata as Record<string, unknown> | null) ?? {};
  const pending = meta.pending_collection as
    | { collection_id?: string | null; new_collection?: { name: string; visibility?: Visibility } | null }
    | undefined;
  if (!pending) return { added: 0, collectionId: null };

  const res = await attachDocumentToCollection({
    docId,
    userId,
    collectionId: pending.collection_id ?? null,
    newCollection: pending.new_collection ?? null,
  });

  // Clear pending_collection (keep other metadata)
  const { pending_collection: _drop, ...rest } = meta as Record<string, unknown>;
  await supabase
    .from('documents')
    .update({ metadata: rest as never })
    .eq('id', docId);

  return res;
}
