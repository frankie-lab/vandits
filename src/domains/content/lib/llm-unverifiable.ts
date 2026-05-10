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
 *
 * Heurística adicional: si la descripción es muy corta (< 60 chars tras strip
 * markdown) se considera placeholder evasivo aunque no matchee la regex.
 */

const UNVERIFIABLE_DESC_REGEX =
  /(no\s+se\s+puede\s+(generar|crear|verificar|proporcionar|ofrecer)\s+(una?|esta|la)?\s*(descripción|ficha|información|ubicación))|(no\s+es\s+posible\s+(crear|generar|verificar|proporcionar|ofrecer)\s+(una?|esta|la)?\s*(descripción|ficha|información|ubicación))|(informaci[oó]n\s+no\s+(disponible|verificable|encontrada))|(no\s+hay\s+informaci[oó]n\s+(disponible|verificable|suficiente))|(no\s+se\s+dispone\s+de\s+(informaci[oó]n|datos))|(sin\s+informaci[oó]n\s+(suficiente|verificable|disponible))|(no\s+se\s+han\s+encontrado\s+datos)|(datos\s+no\s+(disponibles|verificables))|(sin\s+datos\s+verificables)|(este\s+lugar\s+no\s+(existe|es\s+verificable|tiene\s+informaci[oó]n))/i;

const MIN_DESCRIPTION_LENGTH = 60;

export interface UnverifiableInput {
  descripcion?: string | null;
}

function stripMarkdown(s: string): string {
  return s.replace(/[*_`#>~\[\]()]/g, '').trim();
}

export function isUnverifiableLLMOutput(input: UnverifiableInput | null | undefined): boolean {
  if (!input) return false;
  const d = (input.descripcion ?? '').trim();
  if (!d) return false;
  if (UNVERIFIABLE_DESC_REGEX.test(d)) return true;
  if (stripMarkdown(d).length < MIN_DESCRIPTION_LENGTH) return true;
  return false;
}

/** Same regex applied to a raw string. Used when only the descripcion is at hand. */
export function isUnverifiableDescription(desc: string | null | undefined): boolean {
  if (!desc) return false;
  if (UNVERIFIABLE_DESC_REGEX.test(desc)) return true;
  if (stripMarkdown(desc).length < MIN_DESCRIPTION_LENGTH) return true;
  return false;
}
