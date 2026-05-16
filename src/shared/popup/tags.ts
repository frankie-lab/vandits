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

/** Slug normaliser shared with `personal-tags-filter.ts`. */
export function tagSlug(input: string): string {
  return (input ?? '')
    .replace(/^#/, '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, '');
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
 */
export function extractTaxonomyCandidates(enriched: any): string[] {
  if (!enriched?.clasificacion) return [];
  const c = enriched.clasificacion;
  const out: string[] = [];
  const push = (v: unknown, prefixRe: RegExp) => {
    if (typeof v !== 'string') return;
    const clean = v.replace(prefixRe, '').trim();
    if (clean) out.push(clean);
  };
  push(c.categoria_principal, /^\d+\.\s*/);
  push(c.subcategoria, /^\d+\.\d+\s*/);
  push(c.tipo_especifico, /^\d+\.\d+\.\d+\s*/);
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

export const POPUP_TAG_CAPS = {
  taxonomy: 3,
  collections: 4,
  semantic: 5,
  user: 4,
} as const;
