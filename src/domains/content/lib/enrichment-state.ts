/**
 * enrichment-state.ts — ÚNICA fuente de verdad sobre "¿este punto está
 * enriquecido de verdad?" en TODA la app (mapa, popup, listas, contadores,
 * paneles, edge functions consumiendo en TS).
 *
 * Definición canónica:
 *   "Enriquecido real" ≡ existe `enriched_data.descripcion` no vacío.
 *
 * Cualquier otra señal (`enrichment_status === 'enriched'`,
 * `enriched_data != null`, `enriched_data.etiquetas`) es legacy/parcial y
 * NO debe usarse como sustituto. Esos campos pueden estar presentes por
 * stubs heredados (p.ej. tags importados) sin que exista IA real.
 *
 * Acepta tanto la forma camelCase del dominio (`enrichedData`) como la
 * snake_case que llega de Supabase directo (`enriched_data`), para que los
 * consumidores no necesiten transformar antes.
 */

export interface EnrichableLocation {
  enrichedData?: { descripcion?: string | null } | null;
  enriched_data?: { descripcion?: string | null } | null;
  description?: string | null;
}

/** True ⇔ el punto tiene descripción IA real (no stub, no tags sueltas). */
export function hasRealEnrichment(loc: EnrichableLocation | null | undefined): boolean {
  if (!loc) return false;
  const desc = loc.enrichedData?.descripcion ?? loc.enriched_data?.descripcion;
  return typeof desc === 'string' && desc.trim().length > 0;
}

/** True ⇔ el punto tiene `description` importada (texto plano, sin IA). */
export function hasImportedDescription(
  loc: EnrichableLocation | null | undefined,
): boolean {
  if (!loc) return false;
  return typeof loc.description === 'string' && loc.description.trim().length > 0;
}

export type EnrichmentStateBucket = 'enriched' | 'imported' | 'empty';

/**
 * Tres-estados canónicos del punto, alineados con la paleta de marcadores
 * (`getPointVisualState`).
 */
export function getEnrichmentBucket(
  loc: EnrichableLocation | null | undefined,
): EnrichmentStateBucket {
  if (hasRealEnrichment(loc)) return 'enriched';
  if (hasImportedDescription(loc)) return 'imported';
  return 'empty';
}
