/**
 * llm-unverifiable.ts — SHARED helper (servidor). MIRROR de
 * `src/domains/content/lib/llm-unverifiable.ts`. Mantener idénticos.
 *
 * Detecta texto del LLM que en realidad confiesa NO poder generar la ficha
 * (placeholder evasivo en `enriched_data.descripcion`). Estos textos NO deben
 * persistirse como enriquecimiento, ni siquiera bajo `skipValidation`.
 *
 * Heurística adicional: si la descripción es < 60 chars tras strip markdown,
 * se considera placeholder evasivo aunque no matchee la regex.
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

export const UNVERIFIABLE_REGEX_SOURCE = UNVERIFIABLE_DESC_REGEX.source;
