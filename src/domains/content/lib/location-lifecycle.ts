// Domain: Content — Lifecycle de un punto importado.
//
// Modelo único transversal: cada CANAL de importación define en qué estado
// nace un punto. La normalización geográfica ocurre SIEMPRE en el background
// del import (no es una opción del usuario).
//
//   raw         → recién insertado, sin coords ni FKs (estado interno fugaz)
//   normalized  → con coords + jerarquía geo, NO aprobado (workspace doc)
//   approved    → integrado al catálogo del usuario (visible en mapa global)
//
// Reglas por `documents.source_type` (canal de origen):
//   - web_import / manual / null+onedrive  → auto-aprueba al final del pipeline
//   - kml / gpx / geojson / csv (bulk crudo) → queda en `normalized`
//
// Helper único — nadie más debe interpretar source_type para decidir auto-approve.
import type { Database } from '@/integrations/supabase/types';

export type DocumentSourceType = Database['public']['Enums']['document_source_type'];

export type LifecycleStage = 'raw' | 'normalized' | 'approved';

/**
 * Canales considerados "confiables": el contenido viene curado o ya
 * geo-validado por su origen. Se aprueban automáticamente al terminar el
 * pipeline de importación.
 */
const TRUSTED_SOURCES: ReadonlyArray<DocumentSourceType | null> = [
  'web_import',
  'manual',
];

/**
 * ¿Debe auto-aprobarse este documento al final del pipeline?
 *
 * - `true`  → el helper `processImportedDocument` llamará a
 *             `approveAllDocumentLocations(docId)` automáticamente y
 *             materializará la `pending_collection`.
 * - `false` → los puntos quedan en `normalized` (workspace del documento).
 *             El usuario verá "Aprobar todos" en `DocumentsPanel`.
 */
export function shouldAutoApproveImport(sourceType: DocumentSourceType | null | undefined): boolean {
  return TRUSTED_SOURCES.includes((sourceType ?? null) as DocumentSourceType | null);
}

/**
 * Deriva el lifecycle de un location concreto a partir de columnas de DB.
 * No toca DB; lectura pura.
 */
export function getLocationLifecycle(loc: {
  is_approved?: boolean | null;
  isApproved?: boolean | null;
  country_id?: string | null;
  continent_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): LifecycleStage {
  const approved = loc.is_approved ?? loc.isApproved ?? false;
  if (approved) return 'approved';
  const hasCoords =
    typeof loc.latitude === 'number' &&
    typeof loc.longitude === 'number' &&
    Number.isFinite(loc.latitude) &&
    Number.isFinite(loc.longitude) &&
    !(loc.latitude === 0 && loc.longitude === 0);
  const hasGeo = Boolean(loc.country_id || loc.continent_id);
  return hasCoords && hasGeo ? 'normalized' : 'raw';
}
