/**
 * PR-EXPORT-2 Fase 3A — Resolver de candidatos del ExportPanel.
 *
 * Helper único que decide qué `GeoLocation[]` entra al pipeline canónico
 * (`runPoiExport`) según la fuente del caller, la selección activa o el
 * universo filtrado del mapa.
 *
 * Prioridad (de mayor a menor):
 *   1. `explicitLocations` — payload propagado por el caller (toolbar,
 *      bridge ShareSheet→Export con detalle, popup, etc.).
 *   2. `selectedIds` (cross-document) — selección actual del usuario.
 *      Se resuelve recorriendo `documents` ENTERO, NUNCA recortando a
 *      `selectedDocument.locations` (eso descartaba selección cross-doc
 *      y producía el `0 / 0` espurio documentado en la auditoría
 *      `pr-export-2-exportpanel-current-behavior-audit.md`).
 *   3. `getFiltered()` — universo filtrado global, sin exigir
 *      `selectedDocument`.
 *
 * Este resolver NO toca core PR-EXPORT-2: no llama a
 * `evaluatePoiExport`, no toca scope, no serializa. Sólo materializa el
 * subconjunto sobre el que luego operará `runPoiExport`.
 *
 * Ver `docs/audits/pr-export-2-exportpanel-current-behavior-audit.md` §8
 * y `docs/audits/pr-export-2-exportpanel-ux-redesign-plan.md` §3.1.
 */
import type { GeoLocation, KMLDocument } from '@/types/location';

export type ExportSourceOrigin =
  | 'explicit'
  | 'selection'
  | 'filtered'
  | 'empty';

export interface ExportSourceInput {
  /** POIs explícitos pasados por el caller. Mayor prioridad. */
  explicitLocations?: GeoLocation[] | null;
  /** Selección activa del usuario (cross-document). */
  selectedIds: Iterable<string>;
  /** Universo completo de documentos cargados en el store. */
  documents: KMLDocument[];
  /** Factory para el universo filtrado global (fallback). */
  getFiltered: () => GeoLocation[];
}

export interface ExportSourceResolution {
  locations: GeoLocation[];
  origin: ExportSourceOrigin;
}

export function resolveExportCandidates(
  input: ExportSourceInput,
): ExportSourceResolution {
  if (input.explicitLocations && input.explicitLocations.length > 0) {
    return { locations: input.explicitLocations.slice(), origin: 'explicit' };
  }

  const ids =
    input.selectedIds instanceof Set
      ? input.selectedIds
      : new Set(input.selectedIds);

  if (ids.size > 0) {
    const out: GeoLocation[] = [];
    const seen = new Set<string>();
    for (const doc of input.documents) {
      for (const loc of doc.locations) {
        if (ids.has(loc.id) && !seen.has(loc.id)) {
          out.push(loc);
          seen.add(loc.id);
        }
      }
    }
    return {
      locations: out,
      origin: out.length > 0 ? 'selection' : 'empty',
    };
  }

  const filtered = input.getFiltered();
  return {
    locations: filtered,
    origin: filtered.length > 0 ? 'filtered' : 'empty',
  };
}

/**
 * Etiqueta legible para el header del panel ("Fuente: ...").
 * Se mantiene en este módulo para garantizar paridad con el origen
 * resuelto.
 */
export function describeExportOrigin(
  origin: ExportSourceOrigin,
  count: number,
): string {
  switch (origin) {
    case 'explicit':
      return `Fuente explícita · ${count} POIs`;
    case 'selection':
      return `Selección actual · ${count} POIs`;
    case 'filtered':
      return `Universo filtrado · ${count} POIs`;
    case 'empty':
    default:
      return 'Sin POIs en la fuente seleccionada';
  }
}
