/**
 * P-POPUP-2 — Canonical geographic header for POI popup (own-enriched branch).
 *
 * # Canonical order (specific → general)
 *
 *   {locality} · {zone} · {region} · {country}
 *
 * Where, per `mem://geography/canonical-tree-spec` and
 * `src/shared/geography/hierarchy.ts`:
 *
 *   - `locality`       = municipio / villa / pueblo (admin_nivel_4)
 *   - `zone`           = **PROVINCIA** / departamento / condado (admin_nivel_2)
 *   - `region`         = comunidad / región / estado          (admin_nivel_1)
 *   - `country`        = país (canonicalizado, "Spain"↔"España" → "España")
 *
 * # ZONE semantics — explicit confirmation (per user request, P-POPUP-2)
 *
 *   - Existence: `zone` exists whenever the location has been geocoded to at
 *     least provincia-level. Source preference:
 *       1) `loc.zone` (denormalised column)
 *       2) `loc.enrichedData.datos_geograficos.admin_nivel_2`
 *     `getLocationHierarchy(loc)` already resolves both and strips
 *     `(sin provincia)` placeholders.
 *
 *   - Meaning: it is the **PROVINCIA** in the canonical tree
 *     (`region_id`=región, `zone_id`=PROVINCIA, `admin3_id`=COMARCA,
 *     `locality_id`=municipio). NEVER comarca, NEVER municipio.
 *
 *   - Position in the popup header: BETWEEN `locality` and `region`, as
 *     declared above. Skipping zone would create the ambiguity
 *     "Zaragoza (locality), Aragón (region)" → reader cannot tell
 *     municipio from provincia when both share the name (e.g. Madrid).
 *
 * # Other levels
 *
 *   - `continent`     omitted from header (implicit via country).
 *   - `admin_level_3` (comarca), `sublocality` (barrio), `street` → out of
 *     scope for this pilot; reserved for a future "Ubicación completa"
 *     collapsible (P-POPUP-2.1).
 *
 * # Click contract
 *
 *   - `country`, `region`, `zone` → `.filter-link` with `data-filter-type`
 *     consumed by the existing handler in `map-popup-handlers.ts`.
 *     **The handler is NOT extended in this pilot** — contract preserved.
 *   - `locality` → rendered as static chip (no `.filter-link`) because the
 *     filter handler does not currently support `locality`. Adding it would
 *     change the click contract → deferred.
 *
 * # Overflow
 *
 *   - Wraps natively (`flex-wrap`). No horizontal scroll. No JS collapsible.
 *   - At most 4 chips visible; no `+N` needed at this level.
 *
 * # Tokens
 *
 *   Uses `tk(token, legacy)` from the caller to preserve the P-POPUP-1
 *   feature-flag contract (no new hardcoded hex outside legacy fallback).
 */
import type { GeoLocation } from '@/types/location';
import { getLocationHierarchy } from '@/shared/geography/hierarchy';

export interface GeoChipResolved {
  level: 'locality' | 'zone' | 'region' | 'country';
  value: string;
  filterType: 'zone' | 'region' | 'country' | null;
}

/**
 * Returns the ordered list of geo chips, canonicalised, deduplicated,
 * placeholders stripped. Order = specific → general.
 */
export function getCanonicalGeoChips(loc: GeoLocation): GeoChipResolved[] {
  const h = getLocationHierarchy(loc);
  const out: GeoChipResolved[] = [];
  if (h.locality) out.push({ level: 'locality', value: h.locality, filterType: null });
  if (h.zone) out.push({ level: 'zone', value: h.zone, filterType: 'zone' });
  if (h.region) out.push({ level: 'region', value: h.region, filterType: 'region' });
  if (h.country) out.push({ level: 'country', value: h.country, filterType: 'country' });
  // Dedupe by value (case-insensitive) — e.g. "Madrid" locality + "Madrid"
  // zone in one-tier admin systems. Keep the more specific (first) entry.
  const seen = new Set<string>();
  return out.filter(c => {
    const k = c.value.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Escapes a string for safe embedding inside an HTML attribute or text.
 * Conservative: angle brackets and quotes only.
 */
function esc(v: string): string {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface GeoHeaderTokens {
  /** `tk('hsl(var(--popup-geo-chip-bg))', '#dcfce7')` etc. */
  background: string;
  foreground: string;
  /** Optional: emitted to data-attr for analytics; render is static here. */
  variant?: string;
}

/**
 * Renders the canonical geo header as a single chip row. Empty string if no
 * data. Caller is responsible for placing it in Zone A (header).
 *
 * Sizing is unified across all chips in the row:
 *   - height ≈ 22px (padding 2x8, font 11px/500, radius 12px)
 *   - wrap natural, no scroll
 */
export function buildGeoHeaderHtml(
  loc: GeoLocation,
  tokens: { background: string; foreground: string },
): string {
  const chips = getCanonicalGeoChips(loc);
  if (chips.length === 0) return '';
  const inner = chips.map(c => {
    const v = esc(c.value);
    const baseStyle = `padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; line-height: 1.4; background: ${tokens.background}; color: ${tokens.foreground};`;
    if (c.filterType) {
      return `<span class="filter-link" data-filter-type="${c.filterType}" data-filter-value="${v}" data-geo-level="${c.level}" style="${baseStyle} cursor: pointer; transition: filter 0.15s;" title="Filtrar por ${v}">${v}</span>`;
    }
    // locality (non-clickable in this pilot — see ZONE semantics comment).
    return `<span data-geo-level="${c.level}" style="${baseStyle}">${v}</span>`;
  }).join('');
  return `<div data-popup-geo-header="1" style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px;">${inner}</div>`;
}
