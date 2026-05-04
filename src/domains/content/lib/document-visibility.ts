/**
 * document-visibility.ts — Single source of truth for "should this point/route
 * be visible in the GLOBAL map?".
 *
 * Rule (Option 4, confirmed 2026-05-04):
 * - Visibility = RLS (already applied at fetch time) + not deleted.
 * - `documents.status` is now PURELY editorial metadata (Borrador / En revisión
 *   / Publicado). It has NO effect on visibility. It is shown in chips/badges
 *   and may be used by user-driven filters, but the map renders every point
 *   the user is allowed to fetch.
 * - `locations.is_approved` is internal classification (Catalog vs Workspace
 *   for the owner's own UI). It does NOT affect visibility either.
 * - Manual points (no `document_id`) are visible.
 * - Routes are NEVER visible by default in the global map (controlled by the
 *   Itineraries panel / document focus view) — that rule is enforced elsewhere.
 *
 * Document-focus mode bypasses this helper: when `filterByDocumentId` is set,
 * all points of that document are shown.
 *
 * See: mem://logic/map/visibility-rule-rls-only
 */
import type { AnnotatedLocation } from '@/domains/content/store/locations-store';

/** Kept exported for legacy callers; status no longer affects visibility. */
export type DocumentLifecycleStatus = 'draft' | 'in_review' | 'published';

/**
 * @param loc Annotated location (carries _docId).
 * @returns true when the point should appear in the GLOBAL map view.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function isLocationVisibleInGlobalMap(_loc: AnnotatedLocation): boolean {
  // Visibility is enforced by RLS at fetch time and by the deleted_at filter
  // in db-operations. Anything that reaches the store is, by definition, visible.
  return true;
}
