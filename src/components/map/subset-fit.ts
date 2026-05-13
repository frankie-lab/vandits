/**
 * subset-fit.ts — Helper único para "haz fit del mapa a este subconjunto de POIs".
 *
 * Contrato canónico (PR-4A.1). Sustituye cualquier llamada directa a
 * `mapRef.flyToBounds`/`fitBounds` desde consolas (FilterBar, diálogos de
 * reparación, selección, etc.).
 *
 * Principio rector: "Filtrar ≠ mover cámara. Seleccionar/Reparar = sí puede
 * mover cámara, con guardarraíles".
 *
 * El listener real vive en LocationMap.tsx y aplica:
 *  - Modo `if-outside` (default): solo encuadra si <40% del subconjunto está
 *    dentro del viewport actual.
 *  - Modo `always`: siempre encuadra.
 *  - Clamp de zoom (≈ z12) para no saltar a z18 con dos puntos juntos.
 *  - Cooldown 4s tras intención manual del usuario (pan/zoom/drag).
 *
 * Ver mem://logic/map/subset-fit-contract.
 */

export const SUBSET_FIT_BOUNDS_EVENT = 'subset-fit-bounds-request';

export type SubsetFitMode = 'always' | 'if-outside';

export interface SubsetFitDetail {
  locationIds: string[];
  mode: SubsetFitMode;
  reason: string;
  /**
   * Piso de zoom opcional. Si tras calcular el bounds el zoom resultante
   * es menor, el listener fuerza este valor manteniendo el centro.
   * Default `null` = sin piso (retrocompatible).
   */
  minZoom?: number | null;
}

export interface SubsetFitOptions {
  mode?: SubsetFitMode;
  /** Etiqueta de telemetría/debug. p.ej. 'repair-preview', 'selection-start'. */
  reason: string;
  /** Piso de zoom opcional. Ver SubsetFitDetail.minZoom. */
  minZoom?: number | null;
}

/**
 * Solicita al mapa hacer fit (suave, vía flyToBounds) sobre un subconjunto
 * de POIs identificados por id. No-op en SSR o si no hay ids.
 */
export function requestSubsetFit(
  locationIds: string[],
  opts: SubsetFitOptions,
): void {
  if (typeof window === 'undefined') return;
  if (!Array.isArray(locationIds) || locationIds.length === 0) return;

  const detail: SubsetFitDetail = {
    locationIds: [...locationIds],
    mode: opts.mode ?? 'if-outside',
    reason: opts.reason,
  };

  window.dispatchEvent(
    new CustomEvent<SubsetFitDetail>(SUBSET_FIT_BOUNDS_EVENT, { detail }),
  );
}
