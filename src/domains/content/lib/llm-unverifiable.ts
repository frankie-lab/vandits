/**
 * llm-unverifiable.ts — Helper único (cliente). Detecta texto del LLM que en
 * realidad confiesa NO poder generar la ficha (placeholder evasivo en
 * `enriched_data.descripcion`).
 *
 * MIRROR del servidor: `supabase/functions/_shared/llm-unverifiable.ts`.
 * Mantener ambas regex idénticas.
 *
 * Usado por:
 *  - `hasRealEnrichment` (paleta, contadores, "está enriquecido?")
 *  - `<UnenrichedRecoveryBlock>` (rama kind=llm_unverifiable)
 *  - Backfill SQL (la misma regex aplicada en `~*` sobre `descripcion`).
 */

const UNVERIFIABLE_DESC_REGEX =
  /(no\s+se\s+puede\s+(generar|crear)\s+(una?|esta)?\s*(descripción|ficha))|(no\s+es\s+posible\s+(crear|generar)\s+(una?|esta)?\s*(descripción|ficha))|(no\s+se\s+puede\s+verificar\s+(esta|la)?\s*(descripción|ficha|ubicación))|(sin\s+datos\s+verificables[^\.]{0,80}no\s+es\s+posible\s+(crear|generar))/i;

export interface UnverifiableInput {
  descripcion?: string | null;
}

export function isUnverifiableLLMOutput(input: UnverifiableInput | null | undefined): boolean {
  if (!input) return false;
  const d = (input.descripcion ?? '').trim();
  if (!d) return false;
  return UNVERIFIABLE_DESC_REGEX.test(d);
}

/** Same regex applied to a raw string. Used when only the descripcion is at hand. */
export function isUnverifiableDescription(desc: string | null | undefined): boolean {
  if (!desc) return false;
  return UNVERIFIABLE_DESC_REGEX.test(desc);
}
