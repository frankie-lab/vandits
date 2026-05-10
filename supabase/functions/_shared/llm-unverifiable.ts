/**
 * llm-unverifiable.ts — SHARED helper. Detecta cuando el LLM se "rinde" y
 * escribe en `descripcion` un texto que en realidad es una confesión de no
 * poder generar la ficha (placeholder evasivo). Estos textos NO deben
 * persistirse como enriquecimiento.
 *
 * MIRROR del cliente: `src/domains/content/lib/llm-unverifiable.ts`. Mantener
 * los dos archivos en sintonía: misma regex, mismo comportamiento.
 *
 * Estrategia: regex estricta sobre `descripcion`. Sólo dispara cuando la
 * propia descripción afirma que NO se puede generar/crear/verificar una
 * descripción o ficha. NO dispara por "se recomienda verificar X" en la
 * observación (eso es UX legítimo).
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

export const UNVERIFIABLE_REGEX_SOURCE = UNVERIFIABLE_DESC_REGEX.source;
