/**
 * PR-EXPORT-2 — DTO canónico de exportación de POIs.
 *
 * Single Source of Truth de:
 *   - shape `PoiExportRecord` (lo único que pueden leer los serializers);
 *   - scope (`public` | `internal`);
 *   - formato (`csv` | `kml` | `json` | `geojson`);
 *   - `CUSTOM_DATA_EXPORT_ALLOWLIST`;
 *   - helpers de tamaño 5k warn / 10k block.
 *
 * INVARIANTES (regla DURA — referencia: docs/contracts/pr-export-2-poi-export-canon.md):
 *   - `ownerUserId` NUNCA aparece en `PoiExportRecord`. Sólo se usa
 *     dentro de `evaluatePoiExport` para gating de permisos.
 *   - `classification.poiLevel` y `classification.rootStatus` son
 *     **internal-only** (omitidos por el mapper si `scope === 'public'`).
 *   - `enrichmentStatus` y `geoHealth` son **internal-only**.
 *   - `content.imageUrl` en `public` sólo si es URL pública validada
 *     (no signed/private). El mapper se encarga.
 *   - `customData` se filtra contra `CUSTOM_DATA_EXPORT_ALLOWLIST`.
 *   - No PII, no `enriched_data` crudo, no `raw_geocode`, no signed URLs,
 *     no debug.
 *
 * Default scope por formato (ratificado §15 plan PR-EXPORT-2):
 *   TODOS los formatos usan `public` por defecto. `internal` requiere
 *   selección explícita + permiso + autorización de `evaluatePoiExport`.
 */

export type PoiExportScope = 'public' | 'internal';

export type PoiExportFormat = 'csv' | 'kml' | 'json' | 'geojson';

/**
 * Coordenadas canónicas del registro. `altitude` opcional.
 */
export interface PoiExportCoordinates {
  latitude: number;
  longitude: number;
  altitude?: number;
}

/**
 * Geografía resuelta (nombres legibles, no FKs UUID).
 */
export interface PoiExportGeography {
  continent?: string;
  country?: string;
  region?: string;
  zone?: string;
}

/**
 * Clasificación operativa. INTERNAL-ONLY: omitida si `scope === 'public'`.
 */
export interface PoiExportClassification {
  /** POI-N (0/1/3/5/9/10). Sólo `internal`. */
  poiLevel?: number;
  /** Root status (A/B/C/D). Sólo `internal`. */
  rootStatus?: 'A' | 'B' | 'C' | 'D';
}

/**
 * Contenido editorial sanitizado. `description` en plaintext (el
 * serializer KML aplica XML-escape).
 */
export interface PoiExportContent {
  description?: string;
  /** URL pública validada (no signed/private). */
  imageUrl?: string;
  tags?: string[];
}

/**
 * DTO canónico que consumen los serializers. **Único** shape permitido
 * de entrada a CSV/KML/JSON/GeoJSON.
 *
 * Prohibido extender con `ownerUserId`, PII, `enriched_data` crudo,
 * `raw_geocode` o cualquier campo no listado abajo.
 */
export interface PoiExportRecord {
  id: string;
  name: string;
  coordinates: PoiExportCoordinates;
  geography: PoiExportGeography;
  content: PoiExportContent;
  /** Sólo presente si `scope === 'internal'`. */
  classification?: PoiExportClassification;
  /** Sólo `internal`. Estado operativo del enriquecimiento. */
  enrichmentStatus?: string;
  /** Sólo `internal`. Estado geográfico (`ok`/`partial`/...). */
  geoHealth?: string;
  /** Filtrado contra `CUSTOM_DATA_EXPORT_ALLOWLIST`. */
  customData?: Record<string, string>;
  /** Scope con el que se generó el registro. */
  exportScope: PoiExportScope;
  /**
   * PR-EXPORT-5 — Modelo de contenido por capas, scope-aware. Adición
   * retro-compatible: los serializers lo prefieren si está presente,
   * y caen a los campos legacy si no. Construido por
   * `mapToPoiExportRecord` vía `buildPoiExportContent`.
   * Tipo `unknown` aquí para evitar ciclo de import con el content model;
   * los consumers casteán a `PoiExportContent`.
   */
  layeredContent?: unknown;
}

/**
 * Allowlist conservadora inicial para `customData`. Cualquier ampliación
 * requiere auditoría y bump del contrato PR-EXPORT-2.
 */
export const CUSTOM_DATA_EXPORT_ALLOWLIST = [
  'source',
  'external_id',
  'user_label',
] as const;

export type CustomDataExportKey = (typeof CUSTOM_DATA_EXPORT_ALLOWLIST)[number];

/**
 * Versiones de formato (markers que se escriben en el envelope JSON/GeoJSON).
 * JSON v2 es BREAKING respecto al dump legacy de `GeoLocation`.
 */
export const POI_EXPORT_FORMAT_VERSION = {
  json: 'poi-export-json-v2',
  geojson: 'poi-export-geojson-v1',
} as const;

/* -------------------------------------------------------------------- */
/* Límites de tamaño (helper canónico — Fase 2 Core)                    */
/* -------------------------------------------------------------------- */

export const POI_EXPORT_SIZE_THRESHOLDS = {
  warn: 5000,
  block: 10000,
} as const;

export type PoiExportSizeLevel = 'ok' | 'warn' | 'block';

export interface PoiExportSizeVerdict {
  level: PoiExportSizeLevel;
  count: number;
  thresholds: typeof POI_EXPORT_SIZE_THRESHOLDS;
}

/**
 * Evalúa el tamaño del export.
 *   - count ≤ 5000          → 'ok'
 *   - 5001 ≤ count ≤ 10000  → 'warn'  (UI debe pedir confirmación)
 *   - count > 10000         → 'block' (serializers abortan)
 */
export function evaluatePoiExportSize(count: number): PoiExportSizeVerdict {
  const n = Math.max(0, Math.floor(count));
  let level: PoiExportSizeLevel = 'ok';
  if (n > POI_EXPORT_SIZE_THRESHOLDS.block) level = 'block';
  else if (n > POI_EXPORT_SIZE_THRESHOLDS.warn) level = 'warn';
  return { level, count: n, thresholds: POI_EXPORT_SIZE_THRESHOLDS };
}

/**
 * Error tipado para abortar serializers cuando el tamaño excede el bloqueo.
 */
export class PoiExportSizeError extends Error {
  readonly verdict: PoiExportSizeVerdict;
  constructor(verdict: PoiExportSizeVerdict) {
    super(
      `[poi-export] export bloqueado: ${verdict.count} POIs supera el límite de ${verdict.thresholds.block}`,
    );
    this.name = 'PoiExportSizeError';
    this.verdict = verdict;
  }
}

/**
 * Filtro silencioso de `customData` contra la allowlist. En dev emite
 * `console.warn` con la key descartada (sin payload, sin valor).
 */
export function filterCustomDataForExport(
  raw: Record<string, string> | undefined | null,
): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, string> = {};
  const allow = new Set<string>(CUSTOM_DATA_EXPORT_ALLOWLIST);
  const isDev =
    typeof import.meta !== 'undefined' &&
    typeof (import.meta as { env?: { DEV?: boolean } }).env !== 'undefined' &&
    (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
  for (const [key, value] of Object.entries(raw)) {
    if (allow.has(key)) {
      if (typeof value === 'string') out[key] = value;
    } else if (isDev) {
      // eslint-disable-next-line no-console
      console.warn(`[poi-export] customData key descartada: "${key}" no está en CUSTOM_DATA_EXPORT_ALLOWLIST`);
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Guard runtime que serializers usan para rechazar input no-DTO. Es
 * defensa en profundidad — el typecheck ya lo garantiza, pero algún
 * call site legacy podría intentar pasar `GeoLocation`.
 */
export function assertPoiExportRecords(
  records: unknown,
  fnName: string,
): asserts records is PoiExportRecord[] {
  if (!Array.isArray(records)) {
    throw new TypeError(`[poi-export] ${fnName}: input no es array`);
  }
  for (const r of records) {
    if (!r || typeof r !== 'object') {
      throw new TypeError(`[poi-export] ${fnName}: record no es objeto`);
    }
    const rec = r as Record<string, unknown>;
    // Detecta intentos de pasar GeoLocation crudo: tiene `coordinates.lat`/`lng`
    // y/o `ownerUserId`/`enrichedData` que PoiExportRecord nunca define.
    if ('ownerUserId' in rec) {
      throw new TypeError(
        `[poi-export] ${fnName}: input contiene 'ownerUserId' — parece GeoLocation, no PoiExportRecord. Usa mapToPoiExportRecord primero.`,
      );
    }
    if ('enrichedData' in rec) {
      throw new TypeError(
        `[poi-export] ${fnName}: input contiene 'enrichedData' crudo — usa mapToPoiExportRecord primero.`,
      );
    }
    const coords = rec.coordinates as Record<string, unknown> | undefined;
    if (!coords || typeof coords !== 'object') {
      throw new TypeError(`[poi-export] ${fnName}: record.coordinates ausente`);
    }
    if (typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') {
      throw new TypeError(
        `[poi-export] ${fnName}: coordinates debe tener latitude/longitude numéricos (DTO), no lat/lng (GeoLocation).`,
      );
    }
  }
}
