/**
 * can-replace-current-poi — UNIQUE source of truth for "is the POI open in
 * the popup a valid target to be REPLACED by a nearby candidate?".
 *
 * Canon (P-POI-CURATION-2.12):
 *
 *   "Reemplazar" es una mutación DESTRUCTIVA sobre el POI abierto (mueve
 *   nombre + coordenadas + descripción del candidato encima del POI actual).
 *   Solo tiene sentido cuando el POI actual tiene DEUDA OBJETIVA real:
 *
 *     - no está enriquecido por IA (`enriched_data.descripcion` vacío), o
 *     - el panel se abrió por un name↔coordinate mismatch detectado durante
 *       enrichment (prop `mismatch` no nula).
 *
 *   Cuando NO es reparable (POI ya enriquecido y sano, sin mismatch), la
 *   acción primaria de la fila seleccionada pasa a ser "Guardar como punto
 *   personal" — aditiva, no destructiva.
 *
 * Esta función NO evalúa ownership/edit-perm explícitamente porque el
 * NearbyPanel inline siempre opera sobre POIs sobre los que el usuario ya
 * tiene autoridad operativa (es su propio documento o admin). Si en el
 * futuro se invoca desde otros contextos, añadir aquí el guard explícito
 * — no duplicarlo en consumidores.
 *
 * Ver:
 *  - docs/contracts/popup-contract.md § "Fila seleccionada — primaria + secundaria"
 *  - mem://ui/popup/selected-row-action-canon
 */
import { isPointEnriched } from './point-visual-state';

export interface ReplaceablePoi {
  enriched_data: any;
  description: string | null;
}

export interface CanReplaceOptions {
  /** Set when the recovery panel was opened due to a name↔coordinate
   *  mismatch detected during enrichment. Always replaceable in that case. */
  mismatch?: unknown | null;
}

/**
 * Returns `true` if the POI currently open in the popup can be replaced
 * by a nearby candidate (destructive mutation).
 */
export function canReplaceCurrentPoi(
  loc: ReplaceablePoi | null | undefined,
  opts: CanReplaceOptions = {},
): boolean {
  if (!loc) return false;
  if (opts.mismatch) return true;
  // Conservador: si está enriquecido por IA y sin mismatch, NUNCA permitir
  // sobrescribir su identidad desde la lista de candidatos.
  return !isPointEnriched(loc as any);
}
