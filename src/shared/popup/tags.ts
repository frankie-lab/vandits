/**
 * P-POPUP-2 — Canonical tag bucketing + dedupe for POI popup.
 *
 * Four disjoint buckets in render order:
 *   1. taxonomy  — `enriched.clasificacion.{categoria_principal, subcategoria, tipo_especifico}`
 *   2. collections — handled by `buildCollectionChipsPlaceholder` (own helper)
 *   3. semantic  — `enriched.etiquetas` (thematic) ∪ source hashtags (handled
 *      by `buildSourceHashtagsBlock`)
 *   4. user      — `enriched.etiquetas_personales` filtered by
 *      `filterPersonalTags` + this module's extended exclusion set
 *
 * # Dedupe rules
 *
 *   - `etiquetas_geograficas` is REMOVED from the popup entirely: its
 *     content is already covered by the canonical geo header
 *     (`geo-header.ts`). This is the main visible cleanup of the pilot.
 *   - Slug normalisation: lowercase, no `#`, no spaces, no diacritics
 *     (same rule as `personal-tags-filter.ts`).
 *   - Priority on collision: taxonomy > collection > semantic > user.
 *
 * # Overflow caps (per plan §5.4)
 *
 *   - taxonomy: 3 visible, rest → "+N" non-interactive marker
 *   - collections: 4 visible, rest → "+N más" (handled in collection helper)
 *   - semantic: 5 visible, rest → "+N más" via <details>
 *   - user: 4 visible, collapsed by default if >4 via <details>
 *
 * No React. No JS collapsibles. Uses native <details>/<summary>.
 */
import type { GeoLocation } from '@/types/location';

/**
 * Slug normaliser shared with `personal-tags-filter.ts`.
 *
 * P2-FIX-C — collapses **all** non-alphanumeric characters, not just
 * whitespace/underscore/dash. Covers real-world cases reported in P-POPUP-2:
 *   - `"Villa/Pueblo"` ↔ `"Villa Pueblo"` (slash separator)
 *   - `"Naturaleza & Paisaje"` ↔ `"Naturaleza Paisaje"`
 *   - `"Iglesia (s. XII)"` ↔ `"Iglesia s XII"`
 * Leading `#`, accents (NFKD strip), and case are also normalised.
 */
export function tagSlug(input: string): string {
  return (input ?? '')
    .replace(/^#/, '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export interface CanonicalTagBuckets {
  taxonomy: string[];
  /** Slugs of collections — used for dedupe only; render goes through
   *  `buildCollectionChipsPlaceholder` which already has its own visuals. */
  collectionSlugs: string[];
  semantic: string[];
  user: string[];
}

export interface DedupeInputs {
  /** Raw taxonomy candidates (already prefixed numbering stripped). */
  taxonomy: string[];
  /** Slugs of POI collections (from `getCollectionsForLocation`). */
  collectionSlugs: string[];
  /** Raw semantic / thematic tags (`enriched.etiquetas`). */
  semantic: string[];
  /** Raw personal tags already pre-filtered against collections by
   *  `filterPersonalTags`. We further filter vs taxonomy + semantic here. */
  user: string[];
  /** Geographic tags (`enriched.etiquetas_geograficas`) — used only for
   *  semantic exclusion. They are NEVER rendered as chips. */
  geographic?: string[];
}

/**
 * Applies the canonical dedupe order: taxonomy > collection > semantic > user.
 * Geographic tags are subtracted from semantic (legacy collision).
 */
export function dedupePopupTagBuckets(input: DedupeInputs): CanonicalTagBuckets {
  const taxonomySlugs = new Set<string>();
  const taxonomy: string[] = [];
  for (const raw of input.taxonomy ?? []) {
    if (typeof raw !== 'string') continue;
    const s = tagSlug(raw);
    if (!s || taxonomySlugs.has(s)) continue;
    taxonomySlugs.add(s);
    taxonomy.push(raw);
  }

  const collectionSlugs = new Set((input.collectionSlugs ?? []).map(tagSlug).filter(Boolean));
  const geoSlugs = new Set((input.geographic ?? []).map(tagSlug).filter(Boolean));

  const semanticSlugs = new Set<string>();
  const semantic: string[] = [];
  for (const raw of input.semantic ?? []) {
    if (typeof raw !== 'string') continue;
    const s = tagSlug(raw);
    if (!s) continue;
    if (taxonomySlugs.has(s)) continue;
    if (collectionSlugs.has(s)) continue;
    if (geoSlugs.has(s)) continue;
    if (semanticSlugs.has(s)) continue;
    semanticSlugs.add(s);
    semantic.push(raw);
  }

  const userSlugs = new Set<string>();
  const user: string[] = [];
  for (const raw of input.user ?? []) {
    if (typeof raw !== 'string') continue;
    const s = tagSlug(raw);
    if (!s) continue;
    if (taxonomySlugs.has(s)) continue;
    if (collectionSlugs.has(s)) continue;
    if (semanticSlugs.has(s)) continue;
    if (geoSlugs.has(s)) continue;
    if (userSlugs.has(s)) continue;
    userSlugs.add(s);
    user.push(raw);
  }

  return {
    taxonomy,
    collectionSlugs: [...collectionSlugs],
    semantic,
    user,
  };
}

/**
 * Extracts the raw taxonomy candidates from an enriched payload. Strips the
 * leading `N.` / `N.N` / `N.N.N` numbering that the IA classifier prepends.
 *
 * P2-FIX-E — also splits any field containing `>` (the IA classifier
 * occasionally concatenates `categoria > subcategoria > tipo` into a single
 * string). Each resulting fragment is trimmed and deduped (case-insensitive
 * by slug) so the popup never renders the same chip twice.
 */
export function extractTaxonomyCandidates(enriched: any): string[] {
  if (!enriched?.clasificacion) return [];
  const c = enriched.clasificacion;
  const raw: string[] = [];
  const push = (v: unknown, prefixRe: RegExp) => {
    if (typeof v !== 'string') return;
    // Split by `>` first (defensive against payloads where IA collapsed levels).
    for (const part of v.split('>')) {
      const clean = part.replace(prefixRe, '').trim();
      if (clean) raw.push(clean);
    }
  };
  push(c.categoria_principal, /^\d+(?:\.\d+)*\.?\s*/);
  push(c.subcategoria, /^\d+(?:\.\d+)*\.?\s*/);
  push(c.tipo_especifico, /^\d+(?:\.\d+)*\.?\s*/);
  // Dedupe by slug, preserve first occurrence (most generic level first).
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    const s = tagSlug(v);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(v);
  }
  return out;
}

/**
 * Convenience wrapper: builds the 4-bucket dedupe result from a location +
 * the externally-provided collection slugs.
 */
export function getCanonicalPopupTags(
  loc: GeoLocation,
  collectionSlugs: string[],
  userTagsPrefiltered: string[],
): CanonicalTagBuckets {
  const enriched: any = loc.enrichedData;
  return dedupePopupTagBuckets({
    taxonomy: extractTaxonomyCandidates(enriched),
    collectionSlugs,
    semantic: Array.isArray(enriched?.etiquetas) ? enriched.etiquetas : [],
    user: userTagsPrefiltered,
    geographic: Array.isArray(enriched?.etiquetas_geograficas)
      ? enriched.etiquetas_geograficas
      : [],
  });
}

/**
 * P-POPUP-12 — Canon de taxonomía editorial estructurada.
 * Cuatro familias renderizables (taxonomy / semantic / user / cultural),
 * límite duro 5 por familia, SIN overflow visual (`+N`). Si una familia
 * llega con >5 entradas, el render simplemente corta. La priorización
 * upstream es responsabilidad del enriquecimiento/normalizador.
 *
 * `collections` se mantiene para el helper de chips de colecciones (otro
 * slot, fuera del bloque taxonómico).
 */
export const POPUP_TAG_CAPS = {
  taxonomy: 5,
  collections: 4,
  semantic: 5,
  user: 5,
  cultural: 5,
} as const;
