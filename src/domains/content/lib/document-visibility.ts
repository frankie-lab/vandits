/**
 * document-visibility.ts — Single source of truth for "should this point/route
 * be visible in the GLOBAL map?".
 *
 * Rule (Approval-gated, confirmed 2026-05-04):
 * - A point is visible in the GLOBAL map ONLY when `is_approved = true`.
 *   - For own points: the user must approve them (individually or in bulk)
 *     from Contenido → Documentos → [doc] → Aprobar.
 *   - For followed users' points: only their approved points are exposed by RLS
 *     (filtered by `visibility` followers/public), so the same check applies.
 * - Workspace puro (`is_approved=false`) NEVER appears in the global map.
 *   It is only visible inside its own document view (where `filterByDocumentId`
 *   bypasses this helper and shows every point of the document).
 * - Manual points (no `document_id`) follow the same rule: they need
 *   `is_approved=true` to appear in the global map.
 * - Routes are NEVER visible by default in the global map (controlled by the
 *   Itineraries panel / document focus view) — that rule is enforced elsewhere.
 *
 * `documents.status` (draft/in_review/published) is purely editorial metadata
 * and does NOT affect visibility — only `locations.is_approved` does.
 *
 * See: mem://logic/map/visibility-rule-approval-gated
 */
import type { AnnotatedLocation } from '@/domains/content/store/locations-store';
import {
  isPointVisibleViaCollections,
  isPointInAnyCatalogCollection,
  isPointInAnyVisibleCatalogCollection,
} from '@/domains/content/lib/collection-visibility';

/** Kept exported for legacy callers; status no longer affects visibility. */
export type DocumentLifecycleStatus = 'draft' | 'in_review' | 'published';

/**
 * Reglas (mem://logic/collections/visibility-and-styling):
 *  - Aprobado SIN colección catálogo → visible.
 *  - Aprobado CON ≥1 colección catálogo → visible solo si AL MENOS UNA está
 *    visible en sesión.
 *  - No aprobado → visible solo si está en una colección PRIVADA visible.
 */
export function isLocationVisibleInGlobalMap(loc: AnnotatedLocation): boolean {
  if (loc.isApproved === true) {
    if (!isPointInAnyCatalogCollection(loc.id)) return true;
    return isPointInAnyVisibleCatalogCollection(loc.id);
  }
  return isPointVisibleViaCollections(loc.id);
}
