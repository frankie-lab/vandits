/**
 * PR-EXPORT-2 — mapToPoiExportRecord.
 *
 * Único punto del codebase que lee `GeoLocation` para construir el DTO
 * canónico `PoiExportRecord`. Los serializers NUNCA leen `GeoLocation`.
 *
 * Reglas (ver `docs/contracts/pr-export-2-poi-export-canon.md`):
 *   - `ownerUserId` jamás entra en el DTO.
 *   - `classification.poiLevel` y `classification.rootStatus` sólo si
 *     `scope === 'internal'`.
 *   - `enrichmentStatus`/`geoHealth` sólo `internal`.
 *   - `content.imageUrl` en `public` sólo si es URL pública validada
 *     (no signed/private). En `internal` se permite cualquier URL HTTP(S).
 *   - `content.description`: plaintext (KML aplica XML-escape en su serializer).
 *   - `customData`: filtrada por `CUSTOM_DATA_EXPORT_ALLOWLIST`.
 *   - No `enriched_data` crudo, no `raw_geocode`, no debug.
 */

import type { GeoLocation } from '@/types/location';
import { getPoiCurationLevel } from '@/domains/content/lib/poi-curation-level';
import {
  CUSTOM_DATA_EXPORT_ALLOWLIST,
  filterCustomDataForExport,
  type PoiExportRecord,
  type PoiExportScope,
} from '@/domains/content/lib/poi-export-record';
import { buildPoiExportContent } from '@/domains/content/lib/poi-export-content-model';

// Re-export para fácil import desde tests.
export { CUSTOM_DATA_EXPORT_ALLOWLIST };

/**
 * Heurística defensiva: identifica URLs que parecen firmadas/privadas
 * y que por tanto NO deben aparecer en exports `public`.
 *
 * Patrones detectados:
 *   - Supabase storage signed URLs: `/storage/v1/object/sign/`.
 *   - Query params típicos de URLs firmadas: `token`, `signature`,
 *     `X-Amz-*`, `Expires`/`expires`, `se=` (Azure SAS), `sig=`.
 *   - URLs no http(s).
 */
function isLikelyPrivateImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return true;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return true;
  if (/\/storage\/v1\/object\/sign\//i.test(trimmed)) return true;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return true;
  }
  const search = parsed.search.toLowerCase();
  if (!search) return false;
  return (
    search.includes('token=') ||
    search.includes('signature=') ||
    search.includes('x-amz-') ||
    search.includes('expires=') ||
    search.includes('sig=') ||
    /[?&]se=/.test(search)
  );
}

function pickPublicImageUrl(loc: GeoLocation): string | undefined {
  const url = loc.enrichedData?.imagen;
  if (!url) return undefined;
  if (isLikelyPrivateImageUrl(url)) return undefined;
  return url;
}

function pickInternalImageUrl(loc: GeoLocation): string | undefined {
  const url = loc.enrichedData?.imagen;
  if (!url || typeof url !== 'string') return undefined;
  if (!/^https?:\/\//i.test(url.trim())) return undefined;
  return url;
}

function pickDescription(loc: GeoLocation): string | undefined {
  // Preferir descripción canónica IA en plaintext; fallback a description
  // legacy. Nunca emitir enriched_data crudo.
  const ia = loc.enrichedData?.descripcion;
  if (typeof ia === 'string' && ia.trim()) return ia.trim();
  if (typeof loc.description === 'string' && loc.description.trim()) {
    return loc.description.trim();
  }
  return undefined;
}

function pickTags(loc: GeoLocation): string[] | undefined {
  const tags = loc.enrichedData?.etiquetas;
  if (!Array.isArray(tags) || tags.length === 0) return undefined;
  const clean = tags
    .map((t) => (typeof t === 'string' ? t.replace(/^#+/, '').trim() : ''))
    .filter(Boolean);
  return clean.length > 0 ? clean : undefined;
}

function pickGeography(loc: GeoLocation): PoiExportRecord['geography'] {
  const out: PoiExportRecord['geography'] = {};
  if (loc.continent) out.continent = loc.continent;
  if (loc.country) out.country = loc.country;
  if (loc.region) out.region = loc.region;
  if (loc.zone) out.zone = loc.zone;
  return out;
}

/**
 * Mapper canónico. Único punto que lee `GeoLocation` para export.
 *
 * @param loc   POI fuente (ya filtrado por `evaluatePoiExport` upstream).
 * @param scope Scope autorizado por el pipeline.
 */
export function mapToPoiExportRecord(
  loc: GeoLocation,
  scope: PoiExportScope,
): PoiExportRecord {
  const coords = loc.coordinates;
  const record: PoiExportRecord = {
    id: loc.id,
    name: loc.name ?? '',
    coordinates: {
      latitude: coords.lat,
      longitude: coords.lng,
      ...(typeof coords.altitude === 'number' ? { altitude: coords.altitude } : {}),
    },
    geography: pickGeography(loc),
    content: {
      description: pickDescription(loc),
      imageUrl:
        scope === 'public' ? pickPublicImageUrl(loc) : pickInternalImageUrl(loc),
      tags: pickTags(loc),
    },
    customData: filterCustomDataForExport(loc.customData),
    exportScope: scope,
    layeredContent: buildPoiExportContent(loc, { scope }),
  };

  if (scope === 'internal') {
    const level = getPoiCurationLevel(loc).level;
    record.classification = { poiLevel: level };
    // rootStatus: aún sin helper canónico en el codebase; se omite hasta
    // que exista SoT. Espacio reservado en el tipo.
    if (loc.enrichmentStatus) {
      record.enrichmentStatus = String(loc.enrichmentStatus);
    }
    if (loc.geoHealth) {
      record.geoHealth = String(loc.geoHealth);
    }
  }

  // Limpieza: content keys undefined no deben aparecer en JSON output.
  // (JSON.stringify ya las omite, pero mantenemos shape limpio para tests.)
  if (record.content.description === undefined) delete record.content.description;
  if (record.content.imageUrl === undefined) delete record.content.imageUrl;
  if (record.content.tags === undefined) delete record.content.tags;
  if (record.customData === undefined) delete record.customData;

  return record;
}

/**
 * Helper batch — mapea una lista. NO aplica `evaluatePoiExport`; el
 * caller debe haber filtrado upstream.
 */
export function mapToPoiExportRecords(
  locs: GeoLocation[],
  scope: PoiExportScope,
): PoiExportRecord[] {
  return locs.map((l) => mapToPoiExportRecord(l, scope));
}
