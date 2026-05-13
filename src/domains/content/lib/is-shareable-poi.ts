/**
 * is-shareable-poi — Frontera canónica de "contenido publicable".
 *
 * Decisión de producto (PR-1 curated sharing boundary): un seguidor sólo
 * ve POIs publicables del usuario seguido. Health/tint son dominio privado
 * del owner. Si un POI no es shareable, NO entra al universo del seguidor:
 *   - invisible en mapa
 *   - fuera de listas, contadores, exports
 *   - no participa en clustering ni viewport culling
 *
 * Realtime: si un POI seguido pierde su estado curado (owner rompe geo,
 * retira visibility, etc.), desaparece inmediatamente del mapa del seguidor.
 * Si tenía un popup abierto, se cierra junto con el rebuild. Cluster
 * recalcula. Esto es decisión explícita: la red social no debe convertirse
 * en un vertedero operativo.
 *
 * Criterio canónico (4 condiciones):
 *   1. Enriched (descripcion no vacía vía `isPointEnriched`).
 *   2. Geo "ok" vía `isHealthyShareableGeo`.
 *   3. Visibility ∈ {followers, public} (RLS ya bloquea private; check
 *      defensivo para evitar leaks si el cliente recibiera contenido extra).
 *   4. No deleted_at (best-effort; RLS también lo filtra).
 *
 * `is_approved` queda fuera de PR-1: se incorporará si llega a ser campo
 * canónico estable de moderación.
 *
 * Pipeline canónico — `isShareablePoi` se aplica en `getFilteredLocations`
 * ANTES de cualquier paso de viewport culling, clustering o markerLocations.
 *
 * Ver `mem://logic/sharing/curated-only-rule`.
 */

import type { GeoLocation } from '@/types/location';
import { isPointEnriched } from '@/domains/content/lib/point-visual-state';
import { isHealthyShareableGeo } from '@/domains/content/lib/geo-health';

/** Campos opcionales que pueden venir anotados (annotated locations). */
type Annotated = GeoLocation & {
  deletedAt?: Date | string | null;
  deleted_at?: string | null;
};

export function isShareablePoi(loc: GeoLocation | null | undefined): boolean {
  if (!loc) return false;

  // Enriched (descripcion IA no vacía).
  if (!isPointEnriched(loc)) return false;

  // Geo apta para compartir.
  if (!isHealthyShareableGeo(loc)) return false;

  // Visibility (defensivo: undefined → tratamos como NO shareable porque
  // el criterio explícito requiere que el owner haya marcado followers/public).
  const v = loc.visibility;
  if (v !== 'followers' && v !== 'public') return false;

  // Deleted (best-effort).
  const ann = loc as Annotated;
  if (ann.deletedAt || ann.deleted_at) return false;

  return true;
}
