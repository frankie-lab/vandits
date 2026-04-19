/**
 * document-visibility.ts — Single source of truth for "should this point/route
 * be visible in the GLOBAL map?".
 *
 * Rule (Option 3, confirmed 2026-04-19):
 * - A location/route is visible in the GLOBAL map iff its parent document is
 *   `published` (Catálogo). Documents in `draft` (Mesa de Trabajo) are scoped
 *   to their own document view.
 * - Manual points (no `document_id`) are always visible in the global map.
 * - Routes are NEVER visible by default in the global map (controlled by the
 *   Itineraries panel / document focus view), regardless of doc status.
 *
 * Document-focus mode bypasses this helper: when `filterByDocumentId` is set,
 * all points of that document are shown regardless of status.
 *
 * See: mem://logic/map/workspace-document-scoped-visibility
 */
import type { AnnotatedLocation } from '@/domains/content/store/locations-store';

export type DocumentLifecycleStatus = 'draft' | 'in_review' | 'published' | 'archived';

/**
 * @param loc      Annotated location (carries _docId).
 * @param docStatusByDocId  Map docId -> status. Built once per render in the store.
 * @returns true when the point should appear in the GLOBAL map view.
 */
export function isLocationVisibleInGlobalMap(
  loc: AnnotatedLocation,
  docStatusByDocId: Map<string, DocumentLifecycleStatus | undefined>,
): boolean {
  // Manual point: no parent document → always visible
  if (!loc._docId) return true;
  const status = docStatusByDocId.get(loc._docId);
  // Default to draft when status is unknown (safer: hide rather than leak)
  return status === 'published';
}
