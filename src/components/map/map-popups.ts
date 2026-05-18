/**
 * Map Popups — HTML generation for location popup content.
 * Extracted from LocationMap.tsx for maintainability.
 */

import { GeoLocation } from '@/types/location';
import { CURATOR_ICON_PATHS, CriteriaStatus } from './map-constants';
import {
  getCriteriaColor,
  calculateVisitRelevance,
  formatTimeAgo,
  parseLocalizacionToLinks,
} from './map-utils';
import { supabase } from '@/integrations/supabase/client';
import {
  CARD_FONT_FAMILY, FONT, COLOR, TAG_COLORS,
  CARD, HIGHLIGHT, OBSERVATION, SECTION_HEADER,
  GEO_LABELS, KEY_DATA_LABELS, SVG_PATHS,
  svgIcon, inlineTagBadge,
  DEFAULT_COLLAPSIBLE_SECTIONS,
  CollapsibleSectionConfig,
} from '@/lib/card-style-tokens';
import {
  normalizeCardConfig,
  getActiveFields,
  CARD_FIELD_CATALOG,
  DEFAULT_CARD_CONFIG_V2,
  type CardFieldKey,
  type EnrichmentCardConfigV2,
} from '@/shared/enrichment/card-schema';
import { descriptionToHtmlParagraphs } from '@/shared/enrichment/format-description';
import { isPointEnriched } from '@/domains/content/lib/point-visual-state';
import { isNearbyPopupContext } from '@/domains/content/lib/nearby-popup-context';
import { getCollectionsForLocation } from '@/domains/content/store/location-collections-store';
import { getCollectionChipColors } from '@/shared/lib/collection-chip-color';
import { filterPersonalTags } from '@/domains/content/lib/personal-tags-filter';
import { resolvePoiSource } from '@/domains/content/lib/poi-source';
import {
  getPoiCurationLevel,
  PRIMARY_ACTION_LABEL,
} from '@/domains/content/lib/poi-curation-level';
import { buildGeoHeaderHtml, buildTerritorialBreadcrumbHtml } from '@/shared/popup/geo-header';
import {
  getCanonicalPopupTags,
  tagSlug,
  POPUP_TAG_CAPS,
} from '@/shared/popup/tags';

// ─── P-POPUP-1 Feature Flag ─────────────────────────────────────────────────
// Tokenization of the `if (isEnriched && enriched)` branch of
// `createPopupContent()` to design-system v1 CSS vars.
//
// Default: **true** (safe). Tokens map to design-system v1 HSL values that
// are visually equivalent (≤2% pixel diff vs legacy hex) to the previous
// literals. See `docs/popups/p-popup-1-implementation-plan.md` and
// `docs/popups/p-popup-1-validation.md`.
//
// Rollback: edit this line to `false` (no redeploy of structure required;
// single-line change reverts the rama enriched to legacy hex literals).
// Runtime override (sandbox/QA): set `window.__POPUP_TOKENS_ENRICHED_V1__`
// to `false` BEFORE the popup is opened.
const POPUP_TOKENS_ENRICHED_V1_DEFAULT = true;
function isPopupTokensEnrichedV1On(): boolean {
  try {
    const w = (typeof window !== 'undefined' ? (window as any) : null);
    if (w && typeof w.__POPUP_TOKENS_ENRICHED_V1__ === 'boolean') {
      return w.__POPUP_TOKENS_ENRICHED_V1__;
    }
  } catch { /* SSR / restricted env */ }
  return POPUP_TOKENS_ENRICHED_V1_DEFAULT;
}
/** Token-or-legacy resolver. Token side MUST be visually equivalent. */
function tk(token: string, legacy: string): string {
  return isPopupTokensEnrichedV1On() ? token : legacy;
}

// ─── P-POPUP-2 Feature Flag ─────────────────────────────────────────────────
// Structural change to the enriched branch: canonical geo header
// (locality·zone·region·country) + 4-bucket canonical tag dedupe + overflow.
//
// Default: **true** (ON in production, ratified 2026-05-16). Rollback in
// runtime sin redeploy: `window.__POPUP_GEO_CANONICAL_V1__ = false` BEFORE
// opening a popup. Code rollback: flip default back to `false` (1 line).
// Legacy render branches preservadas intactas como rollback path.
// See docs/popups/p-popup-2-validation.md.
const POPUP_GEO_CANONICAL_V1_DEFAULT = true;
function isPopupGeoCanonicalV1On(): boolean {
  try {
    const w = (typeof window !== 'undefined' ? (window as any) : null);
    if (w && typeof w.__POPUP_GEO_CANONICAL_V1__ === 'boolean') {
      return w.__POPUP_GEO_CANONICAL_V1__;
    }
  } catch { /* SSR / restricted env */ }
  return POPUP_GEO_CANONICAL_V1_DEFAULT;
}

// ─── P-POPUP-3A Feature Flag (ownership strip) ──────────────────────────────
// Own enriched popups: hide redundant ownership badge ("Mi punto") + own
// `#username` chip; render a single compact line `Añadido dd/mm/yyyy`
// immediately under the geo header. followed/app/source popups are
// untouched. SourceFilterBridge contract intact.
//
// Default: **true** (rollout global, conforme docs/governance/rollout-policy.md).
// Kill-switch global runtime (rollback/debug, sin segmentación): set
// `window.__POPUP_OWNERSHIP_STRIP_V1__ = false` BEFORE opening the popup.
// See docs/popups/p-popup-3-ownership-cleanup-plan.md.
const POPUP_OWNERSHIP_STRIP_V1_DEFAULT = true;
export function isPopupOwnershipStripV1On(): boolean {
  try {
    const w = (typeof window !== 'undefined' ? (window as any) : null);
    if (w && typeof w.__POPUP_OWNERSHIP_STRIP_V1__ === 'boolean') {
      return w.__POPUP_OWNERSHIP_STRIP_V1__;
    }
  } catch { /* SSR / restricted env */ }
  return POPUP_OWNERSHIP_STRIP_V1_DEFAULT;
}

// ─── P-POPUP-4A Feature Flag (source metadata line) ────────────────────────
// Source/app enriched popups (rama A): replace the legacy `#sourceId` chip(s)
// rendered by `buildSourceHashtagsBlock` with a compact metadata line
//   `Añadido dd/mm/yyyy · vía <label>`
// where `<label>` is a clickable span preserving the `.source-filter-chip`
// contract (data-source-type, data-source-id, data-source-label) so
// SourceFilterBridge keeps working unchanged. own / followed / rama B are
// untouched. See docs/popups/p-popup-4a-source-provenance-cleanup-plan.md.
//
// Default: **true** (rollout global, conforme docs/governance/rollout-policy.md).
// Kill-switch global runtime: `window.__POPUP_SOURCE_METADATA_V1__ = false`
// BEFORE opening the popup.
const POPUP_SOURCE_METADATA_V1_DEFAULT = true;
export function isPopupSourceMetadataV1On(): boolean {
  try {
    const w = (typeof window !== 'undefined' ? (window as any) : null);
    if (w && typeof w.__POPUP_SOURCE_METADATA_V1__ === 'boolean') {
      return w.__POPUP_SOURCE_METADATA_V1__;
    }
  } catch { /* SSR / restricted env */ }
  return POPUP_SOURCE_METADATA_V1_DEFAULT;
}

// P-POPUP-15 — `isPopupDiagBadgeVisible` retirada: los badges
// `P-POPUP-2 ON` / `P-POPUP-3 ON` ya no se renderizan en runtime
// (ni en preview, ni con ?diag=1, ni en producción). Los atributos
// `data-popup-*` del root se conservan como hooks de test.

// ─── Card Config Cache ──────────────────────────────────────────────────────
// Source of truth: `app_settings.enrichment_card_config` always normalized
// through `normalizeCardConfig()` to v2. The popup never reads legacy v1 keys.
interface PopupCardConfig {
  v2: EnrichmentCardConfigV2;
  /** Field keys in editor-defined order, only those enabled */
  orderedKeys: CardFieldKey[];
  /** Per-field default-collapsed flag (only matters for collapsible fields) */
  collapsedDefault: Partial<Record<CardFieldKey, boolean>>;
  // Convenience flags consumed by the renderer
  include_tags: boolean;
  include_web: boolean;
  include_contact: boolean;
  include_interest_index: boolean;
  include_image: boolean;
  show_sources: boolean;
  collapsible_sections: Record<string, CollapsibleSectionConfig>;
}

let cachedCardConfig: PopupCardConfig | null = null;
let configLoadPromise: Promise<PopupCardConfig> | null = null;

function buildPopupConfig(v2: EnrichmentCardConfigV2): PopupCardConfig {
  const active = getActiveFields(v2);
  const orderedKeys = active.map(f => f.key);
  const collapsedDefault: Partial<Record<CardFieldKey, boolean>> = {};
  const collapsibleSections: Record<string, CollapsibleSectionConfig> = { ...DEFAULT_COLLAPSIBLE_SECTIONS };
  for (const f of v2.fields) {
    const def = CARD_FIELD_CATALOG[f.key];
    if (!def?.collapsible) continue;
    collapsedDefault[f.key] = f.collapsed_default ?? true;
    collapsibleSections[f.key] = {
      ...(collapsibleSections[f.key] ?? { collapsible: true, defaultOpen: false }),
      collapsible: true,
      defaultOpen: !(f.collapsed_default ?? true),
    };
  }
  const enabledSet = new Set(orderedKeys);
  return {
    v2,
    orderedKeys,
    collapsedDefault,
    include_tags: enabledSet.has('etiquetas'),
    include_web: v2.include_web,
    include_contact: v2.include_contact,
    include_interest_index: enabledSet.has('indice_interes'),
    include_image: v2.include_image,
    show_sources: enabledSet.has('fuentes'),
    collapsible_sections: collapsibleSections,
  };
}

const DEFAULT_POPUP_CONFIG: PopupCardConfig = buildPopupConfig(DEFAULT_CARD_CONFIG_V2);
const POPUP_MAX_HEIGHT = 'calc(100dvh - var(--top-header-h, 72px) - var(--bottom-overlay-safe-h, 0px) - 2 * var(--overlay-progress-gap, 12px) - 24px)';

export async function loadCardConfig(): Promise<PopupCardConfig> {
  if (cachedCardConfig) return cachedCardConfig;
  if (configLoadPromise) return configLoadPromise;

  configLoadPromise = (async () => {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'enrichment_card_config')
        .maybeSingle();

      const v2 = normalizeCardConfig(data?.value);
      cachedCardConfig = buildPopupConfig(v2);
    } catch {
      cachedCardConfig = DEFAULT_POPUP_CONFIG;
    }
    return cachedCardConfig!;
  })();

  return configLoadPromise;
}

export function getCardConfig(): PopupCardConfig {
  return cachedCardConfig || DEFAULT_POPUP_CONFIG;
}

// Invalidate cache when config changes — kicks off an immediate reload so
// the next synchronous getCardConfig() does not silently fall back to defaults.
export function invalidateCardConfig() {
  cachedCardConfig = null;
  configLoadPromise = null;
  // Fire-and-forget: warms cache for the next popup open.
  loadCardConfig().catch(() => {});
}

// ─── Collapsible Section Wrapper ────────────────────────────────────────────
// Renders either a <details>/<summary> or a static <div> based on config.
function wrapCollapsibleSection(
  sectionKey: string,
  headerHtml: string,
  bodyHtml: string,
  cardCfg: PopupCardConfig,
): string {
  const sectionCfg = cardCfg.collapsible_sections[sectionKey];
  const isCollapsible = sectionCfg?.collapsible ?? false;
  const defaultOpen = sectionCfg?.defaultOpen ?? false;

  // P-POPUP-11 — Secundarios discretos: sin tarjeta, sin fondo, sin borde
  // completo. Sólo un separador superior fino que actúa como divisor entre
  // secundarios consecutivos. Padding vertical reducido; nada de chrome tipo
  // CTA. Mantenemos API y handlers; sólo bajamos peso visual.
  const sectionGap = Math.round((CARD.sectionGap ?? 8) / 2);
  if (!isCollapsible) {
    return `<div style="border-top: 1px solid hsl(var(--border) / 0.6); margin-bottom: ${sectionGap}px;">` +
      `<div style="display: flex; align-items: center; gap: 6px; padding: 6px 0;">` +
        headerHtml +
      '</div>' +
      bodyHtml +
    '</div>';
  }

  return `<details${defaultOpen ? ' open' : ''} style="border-top: 1px solid hsl(var(--border) / 0.6); margin-bottom: ${sectionGap}px;">` +
    `<summary style="display: flex; align-items: center; gap: 6px; padding: 6px 0; background: transparent; cursor: pointer; list-style: none; user-select: none;">` +
      headerHtml +
      `<span style="font-size: 10px; color: ${COLOR.muted}; transition: transform 0.2s;">▶</span>` +
    '</summary>' +
    `<div>` + bodyHtml + '</div>' +
  '</details>';
}

// ─── P-POPUP-4E — Collection metadata segment ─────────────────────────────
// Las colecciones del POI se renderizan INLINE en la línea metadata (junto a
// la fecha) — NO como chips/pills/hashtags. Icono Lucide `bookmark` + nombre
// legible en `foreground` normal, sin color de colección. Máx 2 inline; del
// 3º en adelante "+N" con `title` listando los nombres restantes.
//
// Esta función emite el segmento listo para concatenar tras `<span>${date}…`
// en `buildOwnAddedLineHtml`, `buildOwnEnrichedMetadataLineHtml` y
// `buildSourceMetadataLineHtml`. Devuelve '' si el POI no tiene colecciones.
//
// `vía …` queda RESERVADO a provenance/source externo y nunca para colecciones.
const BOOKMARK_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>`;

const COLLECTIONS_INLINE_MAX = 2;

export function buildCollectionsMetadataSegment(location: GeoLocation): string {
  const cols = getCollectionsForLocation(location.id);
  if (!cols.length) return '';
  const inline = cols.slice(0, COLLECTIONS_INLINE_MAX);
  const overflow = cols.slice(COLLECTIONS_INLINE_MAX);
  const nameSpans = inline.map((c) => {
    const safeName = String(c.name ?? '').replace(/"/g, '&quot;');
    const safeId = String(c.id ?? '').replace(/"/g, '&quot;');
    return `<span class="collection-filter-chip" data-collection-id="${safeId}" data-collection-name="${safeName}" title="Colección: ${safeName}" style="cursor: pointer; color: hsl(var(--muted-foreground)); text-decoration: none; border-bottom: 1px solid hsl(var(--muted-foreground) / 0.35); transition: border-color 0.15s;" onmouseover="this.style.borderBottomColor='hsl(var(--muted-foreground) / 0.7)'" onmouseout="this.style.borderBottomColor='hsl(var(--muted-foreground) / 0.35)'">${safeName}</span>`;
  }).join(', ');
  let overflowHtml = '';
  if (overflow.length > 0) {
    const overflowNames = overflow.map((c) => String(c.name ?? '')).join(', ').replace(/"/g, '&quot;');
    overflowHtml = ` <span title="${overflowNames}" style="opacity: 0.8;">+${overflow.length}</span>`;
  }
  return `<span data-popup-collections-meta="${location.id}" style="display: inline-flex; align-items: center; gap: 4px; color: hsl(var(--muted-foreground));"><span>${nameSpans}${overflowHtml}</span></span>`;
}

// ─── Collection Chips placeholder (P-POPUP-4E: no-op) ──────────────────────
// Las colecciones ya NO se pintan como chips/hashtags flotantes; viven en la
// línea metadata vía `buildCollectionsMetadataSegment`. Se conserva el export
// como no-op para no romper imports legados; cualquier llamada actual emite
// string vacío y no inyecta DOM.
export function buildCollectionChipsPlaceholder(_location: GeoLocation): string {
  return '';
}

// APIs legacy mantenidas como no-op para no romper imports antiguos.
export async function loadCollectionChipsForPopup(_locationId: string): Promise<void> { /* noop */ }
export function invalidateCollectionChipsCache(_locationId?: string) { /* noop */ }

// Helper único: pinta el bloque ámbar de tags personales.
// Visible SIEMPRE (enriquecido o no), no configurable desde el editor de fichas.
export function buildPersonalTagsBlock(location: GeoLocation): string {
  const enriched: any = location.enrichedData;
  // Filtrado transversal: nunca pintar etiquetas que dupliquen el nombre de
  // una colección a la que el punto pertenece (ver personal-tags-filter.ts).
  const personales = filterPersonalTags(location.id, enriched?.etiquetas_personales);
  if (personales.length === 0) return '';
  const tagsHtml = personales
    .map((tag: string) =>
      inlineTagBadge(
        `#${tag.replace('#', '').replace(/\s+/g, '')}`,
        'personal',
        { filterType: 'tag', filterValue: tag.replace('#', '') },
      ),
    )
    .join('');
  return `
<div style="clear: both; display: flex; justify-content: center; flex-wrap: wrap; gap: 4px; margin: 0 0 ${CARD.sectionGap}px 0;">${tagsHtml}</div>`;
}

// ─── P-POPUP-7A — Personal interaction state (helper único) ──────────────
//
// Bloque compacto con el estado personal del usuario sobre el POI:
//   - Botón Visitado (toggle, gated por proximidad/foto-GPS en backend)
//   - Badge de verificación (icono Lucide camera/mapPin — sin emoji)
//   - Valoración personal 1–5★ COLAPSADA por defecto cuando user_rating=0
//     (se muestra affordance textual "Valorar" que expande el control 5★
//     inline al click — evita 5 estrellas vacías arriba del fold)
//
// Se renderiza UNA SOLA VEZ, debajo de `descripcion` en la rama enriched y
// debajo de `description` en la rama legacy. Helper único para evitar drift
// (norma transversal multiusuario).
//
// Devuelve '' para puntos de curador o para popups en contexto "Cerca de".
export function buildPersonalStateBlock(
  location: GeoLocation,
  ctx: { isOwn: boolean; isCuratorPoint: boolean; canEditLocation: boolean; heroOverlayActive?: boolean },
): string {
  if (ctx.isCuratorPoint) return '';
  if (isNearbyPopupContext(location.id)) return '';

  const isVisited = location.customData?.visited === 'true';
  const visitRelevance = isVisited
    ? calculateVisitRelevance(
        location.customData?.visited_verified_at,
        location.customData?.oldest_geotagged_photo_date,
      )
    : null;
  const userRating = parseInt(location.customData?.user_rating || '0', 10) || 0;
  const canRate = !!visitRelevance || ctx.canEditLocation || userRating > 0;
  const heroOverlayActive = !!ctx.heroOverlayActive;

  // Canon simplificado (sesión 2026-05-16):
  //   - Si el overlay sobre la hero está activo (hay hero) → este bloque
  //     NO renderiza ningún control de visitado. El estado vive arriba.
  //   - Si NO hay hero → fallback inferior mínimo: una pill discreta que
  //     refleja "Visitado" / "Pendiente" y conserva el toggle accesible.
  //   - Verified badge: vive sólo en el overlay; nunca duplicado aquí.
  let visitedBtn = '';
  const verifiedBadge = '';

  if (!heroOverlayActive) {
    const visitedLabel = isVisited ? 'Visitado' : (!ctx.isOwn ? '+ Adoptar y Visitar' : 'Pendiente');
    const visitedTitle = isVisited
      ? 'Click para marcar como pendiente'
      : (!ctx.isOwn ? 'Se añadirá a tu colección automáticamente' : 'Click para marcar como visitado');
    const visitedBg = isVisited
      ? 'hsl(var(--state-success) / 0.10)'
      : (!ctx.isOwn ? 'hsl(var(--state-loading) / 0.10)' : 'transparent');
    const visitedFg = isVisited
      ? 'hsl(var(--state-success))'
      : (!ctx.isOwn ? 'hsl(var(--state-loading))' : 'hsl(var(--text-secondary))');
    const visitedBorder = isVisited
      ? 'hsl(var(--state-success) / 0.35)'
      : (!ctx.isOwn ? 'hsl(var(--state-loading) / 0.35)' : 'hsl(var(--surface-border))');
    const iconHtml = isVisited
      ? svgIcon('check', { size: 10, color: 'currentColor' })
      : `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`;
    visitedBtn = `<button class="popup-action-btn" data-action="toggle-visited" data-location-id="${location.id}" title="${visitedTitle}" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; background: ${visitedBg}; color: ${visitedFg}; border: 1px solid ${visitedBorder}; border-radius: 9999px; font-size: 10px; font-weight: 500; cursor: pointer; transition: all 0.15s;">${iconHtml}<span>${visitedLabel}</span></button>`;
  }

  // P-POPUP-14 — El rating personal (★ del usuario) YA NO vive aquí. Se ha
  // unificado dentro de `buildEnrichmentRatingBlock` como segunda fila del
  // bloque único de ratings ("Rating del POI" / "Tu valoración"). Este
  // helper conserva sólo el toggle de visitado.
  // Variables `canRate` / `userRating` quedan como referencia documental;
  // su consumo migra al bloque unificado.
  void canRate; void userRating;

  const row = [verifiedBadge, visitedBtn].filter(Boolean).join('');
  if (!row) return '';
  return `
<div data-popup-personal-state="${location.id}" style="display: flex; justify-content: center; align-items: center; gap: 8px; flex-wrap: wrap; margin: 4px 0 ${CARD.sectionGap}px 0; padding: 6px 8px; background: hsl(var(--surface-muted) / 0.5); border-radius: 8px;">${row}</div>`;
}



export interface PopupOwnership {
  isOwn: boolean;
  isFollowing?: boolean;
  ownerName?: string;
  curatorId?: string;
  curatorIcon?: string;
  curatorColor?: string;
  curatorAvatar?: string;
  /** UID del viewer actual (PR-POI-SOURCE-6) — usado para resolver source hashtags. */
  viewerUid?: string | null;
  /** Mapa uid -> username opcional para etiquetas legibles en hashtags. */
  usernameLookup?: (uid: string) => string | null | undefined;
}

// ─── P-POPUP-14 — Unified ratings block (helper único) ────────────────
//
// Slot semántico `enrichmentRating` del composer canónico. Reemplaza la
// presentación legacy de "chip IA suelto + barra Valorar separada" por un
// único bloque editorial con DOS filas alineadas:
//
//   Row 1 — "Rating del POI"  ……………………………………………  ★★★★☆
//   Row 2 — "Tu valoración"   ……………………………………………  ★★★★★   (sólo si visitado)
//
// Reglas (canon P-POPUP-14):
//   - Ambas filas pertenecen al mismo bloque visual (background único).
//   - Texto/leyenda a la izquierda; estrellas alineadas a la derecha.
//   - Row 1 lee `enriched.indice_interes` (read-only). Si no hay rating
//     IA y no es curator point → la fila se omite.
//   - Row 2 lee `customData.user_rating` y `customData.visited`.
//     Sólo se renderiza si `visited === 'true'` (y no curator / no nearby).
//     Si visitado sin user_rating → affordance discreta "Valorar" inline.
//     Si visitado con user_rating → 5★ + clear.
//   - Curator points conservan `weighted-rating-container` + `data-ai-rating`
//     (compat con tests/handlers legacy) embebido en la Row 1.
//   - Si ninguna fila aplica → devuelve ''.
//
// NO toca: schema, handlers (`set-rating`/`clear-rating`/`toggle-visited`),
// visited/pending, composer slots, hero, footer, taxonomy, marker grammar.
//
// Ver `docs/popups/p-popup-7a2-rating-contract.md` (concepts) y
// `mem://logic/popup/rating-taxonomy`.
export function buildEnrichmentRatingBlock(
  location: GeoLocation,
  enriched: { indice_interes?: number | null; indice_interes_notas?: string | null } | null | undefined,
  ownership: { isCuratorPoint: boolean; isOwn?: boolean; canEditLocation?: boolean },
): string {
  const rating = Number(enriched?.indice_interes ?? 0);
  const notas = enriched?.indice_interes_notas ?? '';
  const isCurator = !!ownership.isCuratorPoint;
  const isNearby = isNearbyPopupContext(location.id);

  // Estado personal del viewer.
  const isVisited = location.customData?.visited === 'true';
  const userRating = parseInt(location.customData?.user_rating || '0', 10) || 0;
  const visitRelevance = isVisited
    ? calculateVisitRelevance(
        location.customData?.visited_verified_at,
        location.customData?.oldest_geotagged_photo_date,
      )
    : null;
  // P-POPUP-14.2: Row 2 SIEMPRE existe salvo curator/nearby. `visited`
  // gobierna si es editable (verde activo) o pendiente (gris disabled),
  // NO si la fila aparece.
  const showUserRow = !isCurator && !isNearby;
  const userRowState: 'not-visited' | 'visited-empty' | 'visited-rated' = !isVisited
    ? 'not-visited'
    : userRating > 0
      ? 'visited-rated'
      : 'visited-empty';
  void visitRelevance; // reservado para futura señal de confianza visual

  // Helpers visuales (compartidos por ambas filas).
  const labelStyle = `flex: 1 1 auto; min-width: 0; font-size: 11px; color: ${tk('hsl(var(--text-secondary))', '#6b7280')};`;
  const starColor = (active: boolean, palette: 'amber' | 'success') => {
    if (active) {
      return palette === 'success'
        ? tk('hsl(var(--state-success))', '#16a34a')
        : tk('hsl(var(--state-warning))', '#b45309');
    }
    return tk('hsl(var(--surface-border))', '#d1d5db');
  };
  const renderStaticStars = (value: number, palette: 'amber' | 'success') =>
    [1, 2, 3, 4, 5]
      .map((star) => `<span style="font-size: 14px; line-height: 1; color: ${starColor(star <= value, palette)};">${star <= value ? '\u2605' : '\u2606'}</span>`)
      .join('');

  // ─── Row 1 — Rating del POI ─────────────────────────────────────────
  let row1 = '';
  if (isCurator) {
    // Compat: mantenemos `weighted-rating-container` + `data-ai-rating` para
    // handlers/tests legacy, pero ahora dentro del layout label↔stars.
    row1 = `
<div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
  <span style="${labelStyle}">Rating del POI</span>
  <div
    class="weighted-rating-container"
    data-location-id="${location.id}"
    data-ai-rating="${rating || 0}"
    style="display: inline-flex; align-items: center; gap: 6px;"
    title="Rating ponderado: 50% IA + 50% Comunidad"
  >
    <span class="weighted-rating-stars" style="display: inline-flex; gap: 1px;">${renderStaticStars(rating, 'success')}</span>
    <span class="weighted-rating-value" style="font-size: 10px; font-weight: 600; color: ${tk('hsl(var(--state-success))', '#166534')};">${rating ? rating.toFixed(1) : '-'}</span>
    <span class="weighted-rating-breakdown" style="font-size: 9px; color: ${tk('hsl(var(--text-secondary))', '#6b7280')}; display: none;">(IA: ${rating || '-'} | Com: -)</span>
  </div>
</div>`;
  } else if (rating > 0) {
    row1 = `
<div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;" title="${notas || 'Índice de interés IA'}">
  <span style="${labelStyle}">Rating del POI</span>
  <span style="display: inline-flex; gap: 1px;">${renderStaticStars(rating, 'amber')}</span>
</div>`;
  }

  // ─── Row 2 — Estado personal (P-POPUP-14.2) ─────────────────────────
  // Siempre presente salvo curator/nearby. 3 estados visuales:
  //   not-visited   → label "Pendiente", 5☆ gris, read-only.
  //   visited-empty → label "Pendiente de valoración", 5☆ verde, interactivo.
  //   visited-rated → label "Tu valoración", ★ verde + clear, interactivo.
  let row2 = '';
  if (showUserRow) {
    const successColor = tk('hsl(var(--state-success))', '#16a34a');
    const mutedStarColor = tk('hsl(var(--surface-border))', '#d1d5db');
    const mutedTextColor = tk('hsl(var(--text-secondary) / 0.7)', '#9ca3af');
    const labelTextColor = tk('hsl(var(--text-secondary))', '#6b7280');

    let labelText = '';
    let starsHtml = '';
    const labelColor = userRowState === 'not-visited' ? mutedTextColor : labelTextColor;

    if (userRowState === 'not-visited') {
      labelText = 'Pendiente';
      const stars = [1, 2, 3, 4, 5]
        .map(
          () =>
            `<span aria-hidden="true" style="font-size: 13px; line-height: 1; color: ${mutedStarColor}; opacity: 0.7;">\u2606</span>`,
        )
        .join('');
      starsHtml = `<span data-personal-rating-state="not-visited" aria-disabled="true" title="Marca como visitado para poder valorar" style="display: inline-flex; align-items: center; gap: 2px; cursor: default;">${stars}</span>`;
    } else if (userRowState === 'visited-empty') {
      labelText = 'Pendiente de valoración';
      const interactiveStars = [1, 2, 3, 4, 5]
        .map(
          (star) =>
            `<button class="popup-action-btn" data-action="set-rating" data-location-id="${location.id}" data-rating="${star}" title="Valorar ${star} estrella${star > 1 ? 's' : ''}" style="background: none; border: none; padding: 0; cursor: pointer; font-size: 13px; line-height: 1; color: ${successColor}; opacity: 0.55;">\u2606</button>`,
        )
        .join('');
      starsHtml = `<span data-personal-rating-state="visited-empty" style="display: inline-flex; align-items: center; gap: 2px;" title="Valorar este lugar">${interactiveStars}</span>`;
    } else {
      labelText = 'Tu valoración';
      const interactiveStars = [1, 2, 3, 4, 5]
        .map((star) => {
          const active = userRating >= star;
          const color = active ? successColor : mutedStarColor;
          const opacity = active ? '1' : '0.55';
          return `<button class="popup-action-btn" data-action="set-rating" data-location-id="${location.id}" data-rating="${star}" title="Valorar ${star} estrella${star > 1 ? 's' : ''}" style="background: none; border: none; padding: 0; cursor: pointer; font-size: 13px; line-height: 1; color: ${color}; opacity: ${opacity};">${active ? '\u2605' : '\u2606'}</button>`;
        })
        .join('');
      starsHtml = `<span data-personal-rating-state="visited-rated" style="display: inline-flex; align-items: center; gap: 2px;" title="Tu valoración personal">${interactiveStars}<button class="popup-action-btn" data-action="clear-rating" data-location-id="${location.id}" title="Quitar valoración" style="background: none; border: none; padding: 0 0 0 4px; cursor: pointer; font-size: 10px; color: ${labelTextColor};">\u2715</button></span>`;
    }

    row2 = `
<div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
  <span style="${labelStyle.replace(`color: ${tk('hsl(var(--text-secondary))', '#6b7280')};`, `color: ${labelColor};`)}">${labelText}</span>
  ${starsHtml}
</div>`;
  }

  if (!row1 && !row2) return '';

  return `
<div data-popup-enrichment-rating="${location.id}" data-popup-ratings-block="v1" style="display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; margin: 0 0 ${CARD.sectionGap}px 0; background: hsl(var(--surface-muted) / 0.5); border-radius: 8px;">${row1}${row2}</div>`;
}

// ─── Source Hashtags (PR-POI-SOURCE-6) ─────────────────────────────────
// Helper único: emite los hashtags de origen del POI como chips clicables
// dentro del popup HTML. El click es delegado por `SourceFilterBridge` vía
// document-level listener sobre `.source-filter-chip`. Mismo contrato que
// `<SourceHashtag />` (fichas React) — fuente única `resolvePoiSource`.
export function buildSourceHashtagsBlock(
  location: GeoLocation,
  ownership?: PopupOwnership,
  opts?: { suppressOwn?: boolean },
): string {
  const viewerUid = ownership?.viewerUid ?? null;
  const source = resolvePoiSource(viewerUid, location, { usernameLookup: ownership?.usernameLookup });
  if (!source.hashtags.length) return '';
  // P-POPUP-3A: en own enriched el chip `#username` propio queda suprimido
  // (la ownership la lleva el marker; el viewer ya tiene `filterByUserId` en
  // UsersSidebar). Solo aplica si el caller activa `suppressOwn` — followed/
  // app/source SIEMPRE conservan su chip clicable.
  if (opts?.suppressOwn && source.type === 'own') return '';
  const chips = source.hashtags.map((tag, idx) => {
    const isPrimary = idx === 0;
    const filterId = isPrimary
      ? source.type === 'own' || source.type === 'followed'
        ? source.ownerUid ?? tag
        : source.sourceId ?? tag
      : tag;
    if (!filterId) return '';
    const safeTag = String(tag).replace(/"/g, '&quot;');
    const safeId = String(filterId).replace(/"/g, '&quot;');
    return `<span class="source-filter-chip" data-source-type="${source.type}" data-source-id="${safeId}" data-source-label="${safeTag}" title="Filtrar por #${safeTag}" style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 500; cursor: pointer; background: hsl(var(--secondary)); color: hsl(var(--secondary-foreground)); transition: background 0.15s;">#${safeTag}</span>`;
  }).join('');
  return `<div data-source-hashtags-root="${location.id}" style="clear: both; display: flex; justify-content: center; flex-wrap: wrap; gap: 4px; margin: 0 0 ${CARD.sectionGap}px 0;">${chips}</div>`;
}

// ─── P-POPUP-3A — Ownership "added" line (own enriched only) ─────────────
// Reemplaza al badge "Mi punto" + chip propio cuando el flag
// POPUP_OWNERSHIP_STRIP_V1 está ON. Una sola línea compacta con la fecha
// de adopción del POI. Sin literal de ownership: el marker (círculo verde)
// ya transmite la propiedad. Ver opción B en
// docs/popups/p-popup-3-ownership-cleanup-plan.md §8.
export function buildOwnAddedLineHtml(location: GeoLocation): string {
  const raw = (location as { createdAt?: Date | string | null }).createdAt;
  if (!raw) return '';
  const d = raw instanceof Date ? raw : new Date(raw);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const date = `${dd}/${mm}/${yyyy}`;
  return `<div data-popup-own-added="${location.id}" style="display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 0 0 ${CARD.sectionGap}px 0; font-size: 11px; line-height: 1.3; color: hsl(var(--muted-foreground));" title="Fecha en que añadiste este punto a tu red">
<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<circle cx="12" cy="12" r="10"/>
<polyline points="12 6 12 12 16 14"/>
</svg>
<span>Añadido ${date}${(() => { const c = buildCollectionsMetadataSegment(location); return c ? ' <span aria-hidden="true">·</span> ' + c : ''; })()}</span>
</div>`;
}

// ─── P-POPUP-4A — Source metadata line (source/app enriched only) ──────────
// Reemplaza al chip `#sourceId` por una línea legible
//   `Añadido dd/mm/aaaa · vía <label-clicable>`
// Para `app` con groupId se emiten DOS chips clicables separados por `·`,
// uno por filtro (preserva paridad funcional con `buildSourceHashtagsBlock`).
// Cada chip conserva `.source-filter-chip` + datasets canónicos.
//
// Reglas de formato del label (`prettifySourceId`):
//   - reemplaza `_`/`-` por ` · ` / espacios respectivamente
//   - separa CamelCase (`AtlasObscura` → `Atlas Obscura`)
//   - tokens cortos all-lowercase ≤4 letras → uppercase (`osm` → `OSM`)
//   - resto: capitaliza palabras conservadoramente
//   - fallback: string crudo si no aplica nada (seguridad)
export function prettifySourceId(raw: string | null | undefined): string {
  if (!raw) return '';
  const s = String(raw).trim();
  if (!s) return '';
  // Separadores → ` · ` (underscore) y ` ` (hyphen).
  const parts = s.split('_').map(part => {
    if (!part) return '';
    // Caso acrónimo: el segmento entero es all-lowercase ≤4 letras (`osm`).
    // Solo aplica cuando NO hay hyphen ni CamelCase dentro.
    if (/^[a-z]{1,4}$/.test(part)) return part.toUpperCase();
    const hyphenated = part.replace(/-/g, ' ');
    // CamelCase split (preserva acrónimos seguidos de minúscula: `USAToday` → `USA Today`).
    const camelSplit = hyphenated
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
    // Capitaliza primera letra de cada palabra (sin re-upper-case de tokens cortos).
    return camelSplit
      .split(/\s+/)
      .map(w => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ''))
      .join(' ');
  });
  return parts.filter(Boolean).join(' · ') || s;
}

function buildSourceChipSpan(
  type: string,
  filterId: string,
  label: string,
): string {
  const safeLabel = String(label).replace(/"/g, '&quot;');
  const safeId = String(filterId).replace(/"/g, '&quot;');
  const safeType = String(type).replace(/"/g, '&quot;');
  return `<span class="source-filter-chip" data-source-type="${safeType}" data-source-id="${safeId}" data-source-label="${safeLabel}" title="Filtrar por ${safeLabel}" style="cursor: pointer; text-decoration: underline; text-decoration-color: hsl(var(--muted-foreground) / 0.4); text-underline-offset: 2px; color: hsl(var(--muted-foreground)); transition: color 0.15s;">${safeLabel}</span>`;
}

/**
 * Emite la línea metadata canónica para `source` / `app` en rama A enriched.
 * Retorna '' si:
 *  - el flag está OFF
 *  - el tipo no es `source` ni `app`
 *  - no hay hashtags ni fecha (línea vacía no se pinta)
 */
export function buildSourceMetadataLineHtml(
  location: GeoLocation,
  ownership: PopupOwnership | undefined,
): string {
  if (!isPopupSourceMetadataV1On()) return '';
  const viewerUid = ownership?.viewerUid ?? null;
  const source = resolvePoiSource(viewerUid, location, { usernameLookup: ownership?.usernameLookup });
  if (source.type !== 'source' && source.type !== 'app') return '';

  // Fecha (opcional, mismo formato que ownership-strip).
  let datePart = '';
  const raw = (location as { createdAt?: Date | string | null }).createdAt;
  if (raw) {
    const d = raw instanceof Date ? raw : new Date(raw);
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      datePart = `Añadido ${dd}/${mm}/${yyyy}`;
    }
  }

  // Chips: uno por hashtag, cada uno con su filterId canónico.
  const chips = source.hashtags
    .map((tag, idx) => {
      const isPrimary = idx === 0;
      const filterId = isPrimary
        ? source.sourceId ?? tag
        : tag; // groupId
      if (!filterId) return '';
      return buildSourceChipSpan(source.type, filterId, prettifySourceId(tag));
    })
    .filter(Boolean);

  if (chips.length === 0 && !datePart) return '';

  const viaSegment = chips.length > 0
    ? `vía ${chips.join(' <span aria-hidden="true">·</span> ')}`
    : '';

  const collectionsSeg = buildCollectionsMetadataSegment(location);
  const segments = [datePart, collectionsSeg, viaSegment].filter(Boolean);
  if (segments.length === 0) return '';

  const inner = segments.join(' <span aria-hidden="true">·</span> ');

  return `<div data-popup-source-metadata="${location.id}" data-source-metadata-type="${source.type}" style="display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 0 0 ${CARD.sectionGap}px 0; font-size: 11px; line-height: 1.3; color: hsl(var(--muted-foreground));">
<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<ellipse cx="12" cy="5" rx="9" ry="3"/>
<path d="M3 5v14a9 3 0 0 0 18 0V5"/>
<path d="M3 12a9 3 0 0 0 18 0"/>
</svg>
<span>${inner}</span>
</div>`;
}

// ─── P-POPUP-4A.1 — Provenance reader (ownership-independent) ──────────────
// Ownership y provenance NO son excluyentes: un POI propio puede haberse
// adoptado desde una fuente externa (Atlas Obscura, OSM…) o desde el catálogo
// app (vandits-app + groupId). `resolvePoiSource` clasifica por PRIORIDAD
// sourceKind > owner, lo que enmascara la coexistencia. Esta lectura cruda
// devuelve el provenance independientemente del tipo resuelto, para fusionar
// la línea metadata propia (`Añadido dd/mm/aaaa · vía …`).
type ProvenanceMarker = {
  /** 'source' (external) | 'app' | null. */
  type: 'source' | 'app' | null;
  sourceId: string | null;
  groupId: string | null;
};
function readPoiProvenance(loc: GeoLocation): ProvenanceMarker {
  const a = loc as GeoLocation & {
    sourceKind?: string | null; source_kind?: string | null;
    sourceId?: string | null; source_id?: string | null;
    groupId?: string | null; group_id?: string | null;
  };
  const kind = a.sourceKind ?? a.source_kind ?? null;
  const sourceId = a.sourceId ?? a.source_id ?? null;
  const groupId = a.groupId ?? a.group_id ?? null;
  if (kind === 'app') return { type: 'app', sourceId: sourceId || 'vandits-app', groupId };
  if (kind === 'external' && sourceId) return { type: 'source', sourceId, groupId };
  return { type: null, sourceId: null, groupId: null };
}

/**
 * P-POPUP-4A.1 — Línea metadata para OWN enriched, fusionando provenance.
 *  - Sin provenance → idéntica a `buildOwnAddedLineHtml(location)`.
 *  - Con provenance (external/app) → `Añadido dd/mm/aaaa · vía <chip>(s)`,
 *    donde cada chip preserva `.source-filter-chip` + datasets canónicos.
 *
 * Usa el mismo SVG/typografía/tokens que `buildOwnAddedLineHtml` para
 * consistencia visual cuando no hay provenance.
 */
export function buildOwnEnrichedMetadataLineHtml(location: GeoLocation): string {
  // Date part (mismo formato que ownership-strip 3A).
  const raw = (location as { createdAt?: Date | string | null }).createdAt;
  let datePart = '';
  if (raw) {
    const d = raw instanceof Date ? raw : new Date(raw);
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      datePart = `<span style="font-style: italic;">Añadido ${dd}/${mm}/${yyyy}</span>`;
    }
  }

  const prov = readPoiProvenance(location);
  const chips: string[] = [];
  if (prov.type && prov.sourceId) {
    chips.push(buildSourceChipSpan(prov.type, prov.sourceId, prettifySourceId(prov.sourceId)));
    if (prov.type === 'app' && prov.groupId) {
      chips.push(buildSourceChipSpan('app', prov.groupId, prettifySourceId(prov.groupId)));
    }
  }

  if (!datePart && chips.length === 0) return '';

  const viaSegment = chips.length > 0
    ? `vía ${chips.join(' <span aria-hidden="true">·</span> ')}`
    : '';
  const collectionsSeg = buildCollectionsMetadataSegment(location);
  const inner = [datePart, collectionsSeg, viaSegment].filter(Boolean).join(' <span aria-hidden="true">·</span> ');

  return `<div data-popup-own-added="${location.id}"${prov.type ? ` data-popup-source-metadata="${location.id}" data-source-metadata-type="${prov.type}"` : ''} style="display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 0 0 10px 0; font-size: 11px; line-height: 1.4; color: hsl(var(--muted-foreground));" title="${prov.type ? 'Añadido a tu red — incluye fuente original' : 'Fecha en que añadiste este punto a tu red'}">
<span>${inner}</span>
</div>`;
}

// ─── P-POPUP-7B — Visited hero overlay (single source of truth) ──────────
//
// `resolveVisitedPresentationState` es la ÚNICA fuente de verdad sobre el
// estado visited del popup. Lo consumen TANTO `buildVisitedHeroOverlay`
// COMO `buildPersonalStateBlock`, eliminando cualquier drift entre las
// dos ramas (overlay sobre hero vs bloque inferior).
//
// Canon:
//   - visited=true + hero válida → overlay visible sobre la hero
//                                  + inline `✓ Visitado` discreto abajo
//   - visited=false              → sin overlay
//                                  + pill "Marcar visitado" en el bloque
//   - verified badge             → SÓLO en el overlay (cuando hay hero)
//
// `enriched` se acepta como en `buildImageSection`:
//   - `undefined`  → fallback a `location.enrichedData` (compat agnóstica).
//   - `null`       → rama legacy: NO se considera la imagen IA.
//   - objeto       → rama enriched: se usa `enriched.imagen` como AI image.

export interface VisitedPresentationState {
  isVisited: boolean;
  hasHero: boolean;
  isCurator: boolean;
  isNearby: boolean;
  visitRelevance: ReturnType<typeof calculateVisitRelevance>;
  showHeroOverlay: boolean;
  showInlineVisited: boolean;
  showVisitedPill: boolean;
  showVerifiedOnHero: boolean;
}

/**
 * P-POPUP-7B — SINGLE SOURCE OF TRUTH for "¿hay hero?" en el popup.
 *
 * Tanto `buildImageSection` (renderer) como `resolveVisitedPresentationState`
 * (resolver del overlay visited) DEBEN consumir este helper. Cualquier futuro
 * fallback de imagen debe añadirse SOLO aquí para impedir drift estructural.
 *
 * Contrato de `enriched` (idéntico al de `buildImageSection`):
 *   - `undefined` → fallback a `location.enrichedData` (compat agnóstica).
 *   - `null`      → rama legacy: NO se considera la imagen IA.
 *   - objeto      → rama enriched: se usa `enriched.imagen` como AI image.
 *
 * Curator: el renderer renderiza una hero específica de curator y NO usa este
 * helper para `displayImage`. El resolver tampoco lo necesita, porque el
 * overlay visited está canónicamente off para curator (`isCurator` short-circuit
 * en `resolveVisitedPresentationState`). Por simetría devolvemos `source:'curator'`
 * cuando hay curatorId+algo renderizable, pero el consumer (overlay) lo ignora.
 */
export type HeroImageSource = 'user' | 'ai' | 'curator' | null;
export interface HeroImageResolution {
  displayImage: string;        // '' si no hay
  source: HeroImageSource;
}

export function resolveHeroImage(
  location: GeoLocation,
  ownership: PopupOwnership | null | undefined,
  enriched: any,
): HeroImageResolution {
  const enrichedSource = enriched === undefined ? (location.enrichedData as any) : enriched;
  const aiImage = (enrichedSource?.imagen as string | undefined) || '';

  // Curator path — paridad con `buildImageSection` curator branch.
  if (ownership?.curatorId) {
    const curatorImg = aiImage || ownership.curatorAvatar || '';
    return { displayImage: curatorImg, source: curatorImg ? 'curator' : null };
  }

  const userImageUrl = (location.customData?.user_image_url as string | undefined) || '';
  const visibility = (location.customData?.user_image_visibility as string) || 'private';
  const canSeeUserImage = !!userImageUrl && (
    !!ownership?.isOwn ||
    visibility === 'public' ||
    (visibility === 'followers' && !!ownership?.isFollowing)
  );

  if (canSeeUserImage) return { displayImage: userImageUrl, source: 'user' };
  if (aiImage)         return { displayImage: aiImage,      source: 'ai' };
  return { displayImage: '', source: null };
}

export function resolveVisitedPresentationState(
  location: GeoLocation,
  ownership?: PopupOwnership | null,
  enriched?: any,
): VisitedPresentationState {
  const isVisited = location?.customData?.visited === 'true';
  const isCurator = !!ownership?.curatorId;
  const isNearby = !!location && isNearbyPopupContext(location.id);
  const hasHero = !!resolveHeroImage(location, ownership, enriched).displayImage;
  const visitRelevance = isVisited
    ? calculateVisitRelevance(
        location?.customData?.visited_verified_at,
        location?.customData?.oldest_geotagged_photo_date,
      )
    : null;

  // P-POPUP-15 — Hero queda SOLO para imagen + acciones foto. El estado
  // personal (visited/pendiente/rating) vive EXCLUSIVAMENTE en el bloque
  // canónico de ratings (P-POPUP-14.2). Tanto el overlay sobre la hero
  // como el pill de fallback en `buildPersonalStateBlock` quedan
  // desactivados por contrato. Los flags se preservan en la interfaz
  // (no-op = false) para no romper consumidores externos.
  const showHeroOverlay = false;
  const showInlineVisited = false;
  const showVisitedPill = false;
  const showVerifiedOnHero = false;
  void hasHero; void isCurator; void isNearby; void isVisited; void visitRelevance;

  return {
    isVisited,
    hasHero,
    isCurator,
    isNearby,
    visitRelevance,
    showHeroOverlay,
    showInlineVisited,
    showVisitedPill,
    showVerifiedOnHero,
  };
}

/**
 * Compat wrapper: returns the single `showHeroOverlay` flag from the
 * presentation state. Same args as before.
 */
export function isVisitedHeroOverlayActive(
  location: GeoLocation,
  ownership?: PopupOwnership | null,
  enriched?: any,
): boolean {
  return resolveVisitedPresentationState(location, ownership, enriched).showHeroOverlay;
}

/**
 * P-POPUP-15 — Contrato no-op. El overlay visited/pendiente del hero ha sido
 * retirado: el estado personal vive exclusivamente en el bloque canónico de
 * ratings (P-POPUP-14.2). Se mantiene el export para no romper consumidores
 * externos. Devuelve siempre cadena vacía.
 */
export function buildVisitedHeroOverlay(
  _location: GeoLocation,
  _ownership?: PopupOwnership | null,
  _enriched?: any,
  _state?: VisitedPresentationState,
): string {
  return '';
}


// ─── Image Section ───────────────────────────────────────────────────────────

export function buildImageSection(
  location: GeoLocation,
  enriched: any,
  ownership: PopupOwnership,
  visitedState?: VisitedPresentationState,
): string {
  // For curator points: prioritize enriched image, then curator avatar, then icon
  if (ownership.curatorId) {
    const curatorIcon = ownership.curatorIcon || 'map-pin';
    const curatorColor = ownership.curatorColor || '#14b8a6';
    const iconPath = CURATOR_ICON_PATHS[curatorIcon] || CURATOR_ICON_PATHS['map-pin'];

    // Priority: 1) AI enriched image 2) Curator avatar 3) Icon only
    const imageUrl = enriched?.imagen || ownership.curatorAvatar;

    if (imageUrl) {
      return `<div style="margin: 0 -12px 0 -12px;">
<div class="popup-hero" style="width: 100%; height: 160px; overflow: hidden;">
<img src="${imageUrl}" alt="${enriched?.imagen ? 'Ubicación' : 'Curador'}" style="width: 100%; height: 100%; object-fit: cover;" />
<!-- Curator icon overlay — posición vía safe-area canónica (P-POPUP-7D) -->
<div class="popup-hero-chrome popup-hero-chrome--br" style="
width: 40px;
height: 40px;
background: rgba(255,255,255,0.95);
border-radius: 50%;
justify-content: center;
box-shadow: 0 2px 8px rgba(0,0,0,0.2);
border: 2px solid ${curatorColor};
">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="${iconPath}" 
fill="none" 
stroke="${curatorColor}" 
stroke-width="2" 
stroke-linecap="round" 
stroke-linejoin="round"/>
</svg>
</div>
</div>
</div>`;
    } else {
      return `<div style="margin: 0 -12px 0 -12px; position: relative;">
<div style="width: 100%; height: 120px; background: linear-gradient(135deg, ${curatorColor}20, ${curatorColor}40); display: flex; align-items: center; justify-content: center;">
<div style="
width: 64px;
height: 64px;
background: rgba(255,255,255,0.95);
border-radius: 50%;
display: flex;
align-items: center;
justify-content: center;
box-shadow: 0 4px 12px rgba(0,0,0,0.15);
border: 3px solid ${curatorColor};
">
<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="${iconPath}" 
fill="none" 
stroke="${curatorColor}" 
stroke-width="2" 
stroke-linecap="round" 
stroke-linejoin="round"/>
</svg>
</div>
</div>
</div>`;
    }
  }

  // P-POPUP-7B — single source of truth. Renderer y resolver consumen
  // EXACTAMENTE el mismo helper para "¿hay hero?". Drift estructural extinguido.
  const hero = resolveHeroImage(location, ownership, enriched);
  const displayImage = hero.displayImage;
  const fallbackImage = (enriched?.imagen as string | undefined) || '';
  const userImageUrl = location.customData?.user_image_url as string | undefined;
  const locationName = (enriched?.nombre_lugar && enriched.nombre_lugar !== 'null') ? enriched.nombre_lugar : location.name;

  let imageHtml = '';
  if (displayImage) {
    imageHtml = `<img src="${displayImage}" alt="${locationName}" style="width: 100%; height: 160px; object-fit: cover;" onerror="this.src='${fallbackImage}'" />`;
  } else if (ownership.isOwn) {
    // Clickable placeholder — opens the photo menu (upload / Wikimedia search / OneDrive)
    imageHtml = `<button
class="popup-action-btn"
data-action="upload-photo"
data-location-id="${location.id}"
data-location-name="${locationName}"
style="width: 100%; height: 100px; background: linear-gradient(135deg, #f3f4f6, #e5e7eb); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border: none; cursor: pointer; transition: background 0.15s;"
onmouseover="this.style.background='linear-gradient(135deg, #e5e7eb, #d1d5db)'"
onmouseout="this.style.background='linear-gradient(135deg, #f3f4f6, #e5e7eb)'"
title="Buscar o subir una imagen"
>
<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
<circle cx="8.5" cy="8.5" r="1.5"/>
<polyline points="21 15 16 10 5 21"/>
</svg>
<span style="color: #6b7280; font-size: 12px; font-weight: 500;">Añadir imagen</span>
<span style="color: #9ca3af; font-size: 10px;">Buscar · Subir · OneDrive</span>
</button>`;
  } else {
    imageHtml = `<div style="width: 100%; height: 100px; background: linear-gradient(135deg, #f3f4f6, #e5e7eb); display: flex; align-items: center; justify-content: center;">
<span style="color: #9ca3af; font-size: 12px;">Sin imagen</span>
</div>`;
  }

  let buttonHtml = '';
  if (ownership.isOwn) {
    const hasUserImage = !!userImageUrl;
    buttonHtml = `
<div class="popup-hero-controls popup-hero-chrome popup-hero-chrome--br">
${hasUserImage ? `
<button 
class="popup-action-btn" 
data-action="delete-photo" 
data-location-id="${location.id}"
style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; background: none; color: white; border: none; cursor: pointer; transition: all 0.15s; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.6));"
onmouseover="this.style.transform='scale(1.15)'"
onmouseout="this.style.transform='scale(1)'"
title="Eliminar mi foto"
>
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
<path d="M3 6h18"/>
<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
</svg>
</button>
` : ''}
<button 
class="popup-action-btn" 
data-action="upload-photo" 
data-location-id="${location.id}"
data-location-name="${locationName}"
style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; background: none; color: white; border: none; cursor: pointer; transition: all 0.15s; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.6));"
onmouseover="this.style.transform='scale(1.15)'"
onmouseout="this.style.transform='scale(1)'"
title="${hasUserImage ? 'Cambiar foto' : 'Añadir foto'}"
>
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
<circle cx="12" cy="13" r="4"/>
</svg>
</button>
</div>`;
  }

  // P-POPUP-15 — Overlay visited/pendiente retirado del hero. El estado
  // personal vive exclusivamente en el ratings block (P-POPUP-14.2).
  void visitedState;

  return `<div class="popup-hero" style="margin: 0 -12px 0 -12px; position: relative;">
${imageHtml}
${buttonHtml}
</div>`;
}

// ─── Popup Content ───────────────────────────────────────────────────────────

export function createPopupContent(
  location: GeoLocation,
  criteriaTimestamp: number = 0,
  ownership?: PopupOwnership,
  canEnrich: boolean = false,
): string {
  const locationUpdatedAt = location.updatedAt ? new Date(location.updatedAt).getTime() : 0;
  // Los hashtags de colecciones se pintan inline desde
  // `location-collections-store` (lectura síncrona). Cuando el store cambia,
  // `LocationMap` regenera el popup con `setPopupContent(...)`.
  // Helper único `isPointEnriched` — NO usar `location.enrichedData` truthy
  // como proxy de "enriquecido" (puede contener stubs sin `descripcion`).
  const isEnriched = isPointEnriched(location);
  const canRegenerate = canEnrich && (!isEnriched || locationUpdatedAt < criteriaTimestamp);
  // P-POI-CURATION-2 — Verdict ÚNICO. Body y footer derivan del mismo
  // objeto en el mismo render pass (commit visual atómico). Si cambia
  // `bodyBlocker`, cuerpo + footer se reconstruyen consistentes.
  const curationVerdict = getPoiCurationLevel(location);
  // P-POPUP-13 — Unified renderer: el shell canónico es el único shell.
  // `enriched` se normaliza a objeto vacío cuando el POI no está enriquecido
  // (o `enriched_data` es null) para que el composer canónico pueda emitir
  // fragments vacíos por campo sin bifurcar el árbol visual.
  const enriched: any = location.enrichedData ?? {};
  const locationName = (enriched?.nombre_lugar && enriched.nombre_lugar !== 'null') ? enriched.nombre_lugar : location.name;
  const hasClassification = !!enriched?.clasificacion?.codigo;

  const isOwn = ownership?.isOwn ?? true;
  const ownerName = ownership?.ownerName;
  const isCuratorPoint = !!ownership?.curatorId;

  const statusInfo = getCriteriaColor(location, criteriaTimestamp);
  const statusLabels: Record<CriteriaStatus, string> = {
    current: 'Completado',
    previous: 'Pendiente actualizar',
    unknown: 'Sin ficha IA',
    new: 'Sin procesar',
  };

  const formatRegistrationDate = (date: Date | string): string => {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const registrationDate = isOwn ? formatRegistrationDate(location.createdAt) : '';

  const ownershipBadgeHtml = `
<div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
<div style="
display: inline-flex;
align-items: center;
gap: 4px;
padding: 2px 8px;
background: ${isOwn ? 'linear-gradient(135deg, #dbeafe, #bfdbfe)' : 'linear-gradient(135deg, #fef3c7, #fde68a)'};
border-radius: 12px;
font-size: 10px;
font-weight: 500;
color: ${isOwn ? '#1e40af' : '#92400e'};
">
<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
${isOwn
    ? '<circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>'
    : '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'
  }
</svg>
${isOwn ? 'Mi punto' : `De ${ownerName || 'seguido'}`}
</div>
${isOwn && registrationDate ? `
<div style="font-size: 9px; color: #6b7280; display: flex; align-items: center; gap: 3px;" title="Fecha en que añadiste este punto a tu red">
<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<circle cx="12" cy="12" r="10"/>
<polyline points="12 6 12 12 16 14"/>
</svg>
Añadido ${registrationDate}
</div>
` : ''}
</div>
`;

  const statusBarHtml = `
<div style="
height: 6px;
background: ${statusInfo.gradient};
margin: 0 -12px 0 -12px;
border-radius: 8px 8px 0 0;
box-shadow: 0 2px 4px rgba(0,0,0,0.1);
"></div>
`;

  const progressBarHtml = `
<div id="popup-progress-${location.id}" style="display: none; margin-bottom: 12px;">
<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
<span id="popup-progress-label-${location.id}" style="font-size: 11px; color: #6b7280;">Procesando...</span>
<span id="popup-progress-percent-${location.id}" style="font-size: 11px; font-weight: 500; color: #374151;">0%</span>
</div>
<div style="height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden;">
<div id="popup-progress-bar-${location.id}" style="height: 100%; width: 0%; background: linear-gradient(90deg, #8b5cf6, #7c3aed); border-radius: 3px; transition: width 0.3s ease;"></div>
</div>
</div>
`;

  const existingNotes = location.customData?.notes || '';
  const hasNotes = !!existingNotes || location.customData?.has_notes === 'true';
  const isVisited = location.customData?.visited === 'true';

  const visitRelevance = isVisited ? calculateVisitRelevance(
    location.customData?.visited_verified_at,
    location.customData?.oldest_geotagged_photo_date,
  ) : null;

  const canEditLocation = canEnrich;
  const canEditOwn = isOwn;
  const adminEditWarning = (canEditLocation && !isOwn && !isCuratorPoint) ? `
<div style="display: flex; align-items: center; gap: 6px; padding: 8px 10px; margin-bottom: 8px; background: linear-gradient(135deg, #fef3c7, #fde68a); border: 1px solid #f59e0b; border-radius: 6px; font-size: 10px; color: #92400e;">
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;">
<path d="M12 9v4m0 4h.01M5.07 19H19a2 2 0 0 0 1.75-2.95L13.75 4a2 2 0 0 0-3.5 0L3.25 16.05A2 2 0 0 0 5.07 19z"/>
</svg>
<span><strong>Modo Admin:</strong> Puedes editar este punto de ${ownerName || 'otro usuario'}</span>
</div>
` : '';

  // P-POPUP-11.1 — Footer action hierarchy refinement.
  // Grid 32px | 1fr | 32px → par central [Re-enriquecer][Notas] ópticamente
  // centrado; borrar icon-only a la derecha; pie informativo "Enriquecido ·
  // <fecha>" en segunda línea (muted, sin pill, sin border).
  const showEnrichedFooterLine = (isEnriched || isCuratorPoint) && !!location.updatedAt;
  const enrichedFooterLine = showEnrichedFooterLine ? `
<div style="text-align: center; font-size: 10px; color: hsl(var(--muted-foreground)); margin-top: 6px; letter-spacing: 0.01em;">
Enriquecido · ${formatRegistrationDate(location.updatedAt!)}
</div>
` : '';

  const reEnrichBtnHtml = (!isCuratorPoint && canEditLocation && isEnriched) ? `
<button
class="popup-action-btn"
data-action="enrich"
data-location-id="${location.id}"
style="display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 28px; padding: 0 12px; background: hsl(var(--primary) / 0.10); color: hsl(var(--primary)); border: none; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; transition: background 0.15s; white-space: nowrap;"
onmouseover="this.style.background='hsl(var(--primary) / 0.18)'"
onmouseout="this.style.background='hsl(var(--primary) / 0.10)'"
title="Regenerar ficha completa con IA"
>
<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/>
</svg>
Re-enriquecer
</button>
` : '';

  const notesBtnHtml = canEditOwn ? `
<button
class="popup-action-btn"
data-action="add-notes"
data-location-id="${location.id}"
style="display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 28px; padding: 0 12px; background: hsl(var(--muted)); color: hsl(var(--foreground)); border: none; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; transition: background 0.15s; white-space: nowrap;"
onmouseover="this.style.background='hsl(var(--muted) / 0.7)'"
onmouseout="this.style.background='hsl(var(--muted))'"
title="${hasNotes ? 'Editar notas' : 'Añadir notas'}"
>
<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
<polyline points="14 2 14 8 20 8"/>
<line x1="16" y1="13" x2="8" y2="13"/>
<line x1="16" y1="17" x2="8" y2="17"/>
</svg>
Notas${hasNotes ? ` <span style="width:4px; height:4px; border-radius:50%; background: hsl(var(--primary) / 0.6); display:inline-block; margin-left:2px;"></span>` : ''}
</button>
` : '';

  const deleteBtnHtml = canEditOwn ? `
<button
class="popup-action-btn"
data-action="delete-location"
data-location-id="${location.id}"
data-location-name="${location.name}"
style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; background: transparent; color: hsl(var(--destructive) / 0.7); border: none; border-radius: 6px; cursor: pointer; transition: background 0.15s, color 0.15s;"
onmouseover="this.style.background='hsl(var(--destructive) / 0.10)';this.style.color='hsl(var(--destructive))'"
onmouseout="this.style.background='transparent';this.style.color='hsl(var(--destructive) / 0.7)'"
title="Mover a la papelera"
>
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
</svg>
</button>
` : '';

  // PR-SHARE-1 — Share humano/social. Entrada única para POI individual.
  // Visible siempre que no sea curator/nearby; el ShareSheet decide si
  // muestra URL Vandits (POI shareable) o sólo "abrir en Maps externos".
  const shareBtnHtml = (!isCuratorPoint && !isNearbyPopupContext(location.id)) ? `
<button
class="popup-action-btn"
data-action="share-poi"
data-location-id="${location.id}"
data-location-name="${location.name}"
style="display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 28px; padding: 0 12px; background: hsl(var(--muted)); color: hsl(var(--foreground)); border: none; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; transition: background 0.15s; white-space: nowrap;"
onmouseover="this.style.background='hsl(var(--muted) / 0.7)'"
onmouseout="this.style.background='hsl(var(--muted))'"
title="Compartir este punto"
>
<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
<line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
</svg>
Compartir
</button>
` : '';
  const showCurationPrimary =
    !isCuratorPoint &&
    !isNearbyPopupContext(location.id) &&
    curationVerdict.primaryAction !== 'none';
  const curationPrimaryBtnHtml = showCurationPrimary ? `
<button
class="popup-action-btn"
data-action="curation-primary"
data-curation-action="${curationVerdict.primaryAction}"
data-curation-level="${curationVerdict.level}"
data-location-id="${location.id}"
style="width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; padding: 0 12px; background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.15s; margin-bottom: 8px;"
onmouseover="this.style.background='hsl(var(--primary) / 0.85)'"
onmouseout="this.style.background='hsl(var(--primary))'"
title="${PRIMARY_ACTION_LABEL[curationVerdict.primaryAction]}"
>${PRIMARY_ACTION_LABEL[curationVerdict.primaryAction]}</button>
` : '';

  const actionButtonsHtml = `
${curationPrimaryBtnHtml}
${progressBarHtml}
${(canEditLocation && !isOwn && !isCuratorPoint) ? adminEditWarning : ''}
<div style="display: grid; grid-template-columns: 32px 1fr 32px; align-items: center; gap: 8px;">
<div aria-hidden="true"></div>
<div style="display: flex; justify-content: center; align-items: center; gap: 8px;">
${reEnrichBtnHtml}
${notesBtnHtml}
</div>
<div style="display: flex; justify-content: flex-end; align-items: center;">
${deleteBtnHtml}
</div>
</div>
${enrichedFooterLine}
`;

  // P-POPUP-13 — Add-to-collection en lenguaje muted (sin gradient verde,
  // sin shadow, sin translateY). Mismo registro tipográfico que notesBtn.
  const addToCollectionBtnHtml = (!isOwn && !isCuratorPoint) ? `
<button
class="popup-action-btn"
data-action="add-to-collection"
data-location-id="${location.id}"
data-location-name="${location.name}"
style="width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; padding: 0 12px; background: hsl(var(--muted)); color: hsl(var(--foreground)); border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.15s; margin-top: 8px; margin-bottom: 4px;"
onmouseover="this.style.background='hsl(var(--muted) / 0.7)'"
onmouseout="this.style.background='hsl(var(--muted))'"
title="Añadir este punto a tu colección personal"
>
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<path d="M12 5v14M5 12h14"/>
</svg>
Añadir a mi colección
</button>
` : '';

  // P-POPUP-13 — Renderer único: el shell canónico se aplica a TODOS los
  // POIs. `enriched` normalizado a objeto vacío decide qué fragments existen,
  // nunca qué sistema visual se usa. Sin rama legacy.
  {
    const localizacionLinks = parseLocalizacionToLinks(enriched.localizacion, location);
    const popupId = `popup-${location.id.slice(0, 8)}`;
    const cardCfg = getCardConfig();
    const ownershipInfo: PopupOwnership = {
      isOwn,
      ownerName,
      isFollowing: ownership?.isFollowing,
      curatorId: ownership?.curatorId,
      curatorIcon: ownership?.curatorIcon,
      curatorColor: ownership?.curatorColor,
      curatorAvatar: ownership?.curatorAvatar,
    };

    // P-POPUP-7B (unificación) — single source of truth para el estado
    // visited. Mismo objeto alimenta el overlay hero y el bloque inferior.
    const visitedState = resolveVisitedPresentationState(location, ownershipInfo, enriched);

    return `
<div id="${popupId}" data-popup-version="${isPopupGeoCanonicalV1On() ? 'geo-canonical-v1' : 'legacy'}" data-popup-geo-canonical="${isPopupGeoCanonicalV1On() ? 'true' : 'false'}" data-popup-ownership-strip="${(isOwn && isPopupOwnershipStripV1On()) ? 'v1' : 'legacy'}" data-popup-operational-state="idle" data-popup-active-blocker="${curationVerdict.bodyBlocker}" data-popup-curation-level="${curationVerdict.level}" style="width: ${CARD.maxWidth}px; font-family: ${CARD_FONT_FAMILY}; position: relative; display: flex; flex-direction: column; max-height: ${POPUP_MAX_HEIGHT}; overflow: hidden;"><!-- P-POPUP-15: diag badges removed from runtime; data-popup-* remain as test hooks -->
${statusBarHtml}

<!-- Hero (fija, no participa en el scroll) -->
<div style="flex-shrink: 0;">
${buildImageSection(location, enriched, ownershipInfo, visitedState)}
</div>

<!-- Cuerpo desplazable -->
<div class="popup-scroll-body" data-popup-scroll-body="v1" style="position: relative; flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain;">
<div style="padding: 16px 16px 8px 16px;">
<!-- Nombre + Badge propiedad -->
<div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
<h3 style="margin: 0; font-size: ${FONT.title}px; font-weight: 700; color: ${COLOR.foreground}; line-height: 1.2; letter-spacing: -0.01em; flex: 1;">
${locationName || 'Sin nombre'}
</h3>
${(isOwn && isPopupOwnershipStripV1On()) ? '' : ownershipBadgeHtml}
</div>

<!-- P-POPUP-9 — Territorial breadcrumb (global→local) sustituye chips azules.
     Fallback legacy: localizacionLinks italic cuando el flag canonico esta off. -->
${isPopupGeoCanonicalV1On()
  ? `<div style="margin: 0 0 4px 0;">${buildTerritorialBreadcrumbHtml(location)}</div>`
  : `<p style="margin: 0 0 12px 0; font-size: ${FONT.subtitle}px; line-height: 1.4; color: ${COLOR.muted}; font-style: italic;">${localizacionLinks}</p>`}

<!-- Botón para añadir a colección (solo para puntos de seguidos) -->
${addToCollectionBtnHtml}

<!-- P-POPUP-7A.3 — Cabecera limpia: SOLO warning de validación de visita.
     El rating IA (enrichmentRating) bajó al slot post-descripción del
     composer canónico vía buildEnrichmentRatingBlock. -->
${!isCuratorPoint ? `
<div style="display: flex; flex-direction: column; align-items: center; gap: 6px; margin-bottom: 10px;">
<!-- Warning de validación (oculto por defecto) -->
<div id="visit-validation-warning-${location.id}" style="display: none; width: 100%; padding: 8px; background: ${tk('hsl(var(--state-warning) / 0.2)', 'linear-gradient(135deg, #fef3c7, #fde68a)')}; border: 1px solid ${tk('hsl(var(--state-warning) / 0.5)', '#fcd34d')}; border-radius: 8px;">
<p style="margin: 0 0 4px 0; font-size: 11px; font-weight: 600; color: ${tk('hsl(var(--state-warning))', '#92400e')};">No se puede validar la visita</p>
<p id="visit-distance-text-${location.id}" style="margin: 0 0 6px 0; font-size: 10px; color: ${tk('hsl(var(--state-warning))', '#a16207')};"></p>
<div style="font-size: 9px; color: ${tk('hsl(var(--state-warning))', '#78350f')}; border-top: 1px solid ${tk('hsl(var(--state-warning) / 0.5)', '#fcd34d')}; padding-top: 6px;">
<p style="margin: 0 0 3px 0; font-weight: 500;">Criterios de validación:</p>
<ul style="margin: 0; padding-left: 14px;">
<li>Estar a menos de 500m del lugar</li>
<li>Subir una foto con geolocalización (EXIF GPS)</li>
</ul>
</div>
</div>
</div>
` : ''}

${(() => {
  // P-POPUP-3A → own enriched: línea "Añadido dd/mm/yyyy" (sin literal ownership).
  if (isOwn && isPopupOwnershipStripV1On()) {
    // P-POPUP-4A.1 — own + provenance: fusiona "Añadido …" con "vía <chip>".
    // Si 4A está OFF o el POI no tiene provenance, degrada a línea sólo-fecha.
    if (isPopupSourceMetadataV1On()) return buildOwnEnrichedMetadataLineHtml(location);
    return buildOwnAddedLineHtml(location);
  }
  // P-POPUP-4A → source/app enriched (rama A): línea metadata "Añadido … · vía <label>".
  // Si el helper devuelve '' (flag OFF, sin hashtags, etc.) → fallback al legado.
  if (isPopupSourceMetadataV1On()) {
    const viewerUid = ownership?.viewerUid ?? null;
    const src = resolvePoiSource(viewerUid, location, { usernameLookup: ownership?.usernameLookup });
    if (src.type === 'source' || src.type === 'app') {
      const html = buildSourceMetadataLineHtml(location, ownership);
      if (html) return html;
    }
  }
  // followed (y own con flag OFF) → comportamiento legado.
  return buildSourceHashtagsBlock(location, ownership, { suppressOwn: false });
})()}
${buildCollectionChipsPlaceholder(location)}
${buildPersonalTagsBlock(location)}

${(() => {
  // P-POPUP-7A.1 — Compose enriched body en DOS niveles:
  //   (1) el switch produce SOLO fragments por fieldKey (sin orquestación);
  //   (2) un composer único decide la jerarquía final.
  //
  // CONTRATO TRANSVERSAL: `field_order` (card config) NO puede alterar la
  // jerarquía semántica principal del popup. La tripleta canónica
  //   descripcion → rating (personal state) → observacion
  // queda CONGELADA, independiente de cualquier orden persistido en la
  // editor de fichas. El resto de fields respeta `orderedKeys`.
  // Ver docs/popups/p-popup-7a-validation.md (§ 7A.1).
  const orderedKeys = cardCfg.orderedKeys;

  // P-POPUP-7B — `heroOverlayActive` colapsa el bloque inferior a inline
  // `✓ Visitado` cuando el overlay sobre la hero está activo.
  const heroOverlayActive = visitedState.showHeroOverlay;
  const personalStateCtx = { isOwn, isCuratorPoint, canEditLocation, heroOverlayActive };
  // P-POPUP-7A.3 — slots semánticos disjuntos (composer canónico).
  // P-POPUP-14 — el slot enrichmentRating ahora produce el bloque unificado
  // de ratings (Row1 POI + Row2 "Tu valoración" si visitado). Por eso recibe
  // también el contexto del viewer (isOwn / canEditLocation).
  const enrichmentRatingFragment = buildEnrichmentRatingBlock(
    location,
    enriched,
    { isCuratorPoint, isOwn, canEditLocation },
  );
  const personalStateFragment = buildPersonalStateBlock(location, personalStateCtx);

  // Claves cuya posición decide el composer canónico (NO `field_order`).
  const CANONICAL_KEYS = new Set(['descripcion', 'observacion']);

  // (1) Extracción: el switch SOLO produce fragments por fieldKey.
  //     Cero orquestación, cero side-effects ordinales.
  const renderFragment = (fieldKey: string): string => {
    switch (fieldKey) {
      case 'nombre_lugar':
      case 'localizacion':
        // Already rendered above
        return '';
      
      case 'clasificacion': {
        // P-POPUP-12 — el cultural_context se traslada al bloque taxonómico
        // editorial (case 'etiquetas') como 4ª familia. Este slot queda inerte
        // para preservar el orden del composer sin duplicar el chip violeta.
        return '';
      }

      
      case 'punto_destacado':
        if (!enriched.punto_destacado) return '';
        return `
<div style="clear: both; display: block; margin: 0 0 16px 0; background: transparent; border-left: ${HIGHLIGHT.borderWidth}px solid ${HIGHLIGHT.borderColor}; padding: 4px 0 4px 16px;">
  <p style="margin: 0; font-family: Georgia, Charter, 'Iowan Old Style', 'Palatino Linotype', serif; font-size: 14px; font-weight: 500; color: ${COLOR.foreground}; line-height: 1.6; letter-spacing: normal;">${enriched.punto_destacado}</p>
</div>`;
      
      case 'descripcion': {
        // P-POPUP-13 — degradación graciosa: si no hay `enriched.descripcion`
        // (POI no enriquecido), usamos `location.description` con el mismo
        // estilo editorial. Si tampoco existe, fragment vacío.
        const text = enriched.descripcion || (!isEnriched ? (location.description || '') : '');
        const desc = text
          ? `
<div class="vandits-description-body" style="clear: both; display: block; margin: 4px 0 16px 0;">
  ${descriptionToHtmlParagraphs(text, `margin: 0 0 12px 0; font-size: ${FONT.body}px; color: ${COLOR.bodyText}; line-height: 1.7; letter-spacing: 0.005em;`)}
</div>`
          : '';
        // P-POPUP-7A.1 — el switch ya NO compone; el rating se ancla en el composer.
        return desc;
      }
      
      case 'observacion':
        if (!enriched.observacion) return '';
        return `
<div style="clear: both; display: block; margin: 0 0 ${CARD.sectionGap}px 0; background: ${OBSERVATION.bgColor}; padding: 12px 14px; border-radius: ${OBSERVATION.borderRadius};">
  <p style="margin: 0; font-size: ${FONT.body}px; color: ${COLOR.obsText}; line-height: 1.65;"><span style="font-style: italic; color: ${COLOR.muted}; margin-right: 6px;">Nota:</span>${enriched.observacion}</p>
</div>`;
      
      case 'etiquetas_personales':
        // Renderizado fuera del switch para garantizar visibilidad siempre.
        return '';

      case 'etiquetas': {
        if (!cardCfg.include_tags) return '';

        // P-POPUP-12 — Canon de taxonomía editorial estructurada.
        // Cuatro familias (taxonomy / semantic / user / cultural), cada una
        // con límite duro de 5 (`POPUP_TAG_CAPS`). Sin overflow visual `+N`,
        // sin <details>, sin nube de chips. Familias separadas por divisores
        // horizontales y centradas. Colecciones y geografía NO viven aquí.
        const collectionSlugsForLoc = getCollectionsForLocation(location.id)
          .map(c => tagSlug(c.name ?? ''))
          .filter(Boolean);
        const userPreFiltered = filterPersonalTags(location.id, enriched?.etiquetas_personales);
        const buckets = getCanonicalPopupTags(location, collectionSlugsForLoc, userPreFiltered);

        const familyRows: string[] = [];

        const renderFamilyChips = (
          items: string[],
          cap: number,
          palette: 'classification' | 'thematic' | 'personal' | 'cultural',
          filterType: 'searchTerm' | 'tag',
        ) => {
          if (!items.length) return;
          const visible = items.slice(0, cap);
          const chips = visible.map(t => inlineTagBadge(
            `#${String(t).replace('#', '').replace(/\s+/g, '')}`,
            palette,
            { filterType, filterValue: String(t).replace('#', '') },
          )).join('');
          familyRows.push(
            `<div data-tag-family="${palette}" style="display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; padding: 8px 4px;">${chips}</div>`,
          );
        };

        if (!isCuratorPoint) {
          renderFamilyChips(buckets.taxonomy, POPUP_TAG_CAPS.taxonomy, 'classification', 'searchTerm');
          renderFamilyChips(buckets.semantic, POPUP_TAG_CAPS.semantic, 'thematic', 'tag');
          renderFamilyChips(buckets.user, POPUP_TAG_CAPS.user, 'personal', 'tag');
        }

        // Cultural context = 4ª familia. Chip único derivado de
        // `enriched.cultural_context.type_label` (Wikidata).
        const cc = (enriched as any)?.cultural_context;
        if (cc?.type_label) {
          renderFamilyChips(
            [String(cc.type_label)],
            POPUP_TAG_CAPS.cultural,
            'cultural',
            'searchTerm',
          );
        }

        if (familyRows.length === 0) return '';

        // Separador entre familias (N-1 dividers para N familias).
        const divider = `<div style="border-top: 1px solid hsl(var(--border) / 0.6); margin: 0 8px;"></div>`;
        const composed = familyRows.join(divider);

        return `<div data-popup-taxonomy-block="v1" style="margin-bottom: ${CARD.sectionGap}px; text-align: center;">${composed}</div>`;
      }

      case 'datos_geograficos':
        if (!enriched.datos_geograficos) return '';
        return (() => {
          const geoEntries = Object.entries(enriched.datos_geograficos).filter(([, v]) => v);
          if (geoEntries.length === 0) return '';
          const half = Math.ceil(geoEntries.length / 2);
          const col1 = geoEntries.slice(0, half);
          const col2 = geoEntries.slice(half);
          const renderCol = (entries: [string, any][]) => entries.map(([k, v]) => 
            `<div style="display: flex; align-items: baseline; justify-content: space-between; padding: 4px 10px;">` +
              `<span style="font-size: ${FONT.micro}px; color: ${COLOR.muted}; line-height: 1.3;">${GEO_LABELS[k] || k.replace(/_/g, ' ')}</span>` +
              `<span style="font-size: ${FONT.label}px; color: ${COLOR.foreground}; font-weight: 500; text-align: right; margin-left: 4px; line-height: 1.3;">${v}</span>` +
            '</div>'
          ).join('');
          const headerHtml = svgIcon('map', { size: SECTION_HEADER.iconSize }) +
              `<span style="font-size: ${SECTION_HEADER.fontSize}px; color: ${COLOR.muted}; text-transform: ${SECTION_HEADER.textTransform}; letter-spacing: ${SECTION_HEADER.letterSpacing}; font-weight: ${SECTION_HEADER.fontWeight}; flex: 1;">Datos geográficos</span>`;
          const bodyHtml = '<div style="display: grid; grid-template-columns: 1fr 1fr;">' +
              `<div style="border-right: 1px solid ${COLOR.border};">` + renderCol(col1) + '</div>' +
              '<div>' + renderCol(col2) + '</div>' +
            '</div>';
          return wrapCollapsibleSection('datos_geograficos', headerHtml, bodyHtml, cardCfg);
        })();
      
      case 'datos_clave':
        if (!enriched.datos_clave) return '';
        return (() => {
          const KEY_ICON_MAP: Record<string, keyof typeof SVG_PATHS> = {
            tipo: 'landmark', dimension_principal: 'navigation', acceso: 'mapPin',
            estado_proteccion: 'shield', coordenadas: 'globe', web_referencia: 'link',
          };
          const items = [
            { key: 'tipo', label: KEY_DATA_LABELS.tipo, value: enriched.datos_clave.tipo },
            { key: 'dimension_principal', label: KEY_DATA_LABELS.dimension_principal, value: enriched.datos_clave.dimension_principal },
            { key: 'acceso', label: KEY_DATA_LABELS.acceso, value: enriched.datos_clave.acceso },
            { key: 'estado_proteccion', label: KEY_DATA_LABELS.estado_proteccion, value: enriched.datos_clave.estado_proteccion },
            { key: 'coordenadas', label: KEY_DATA_LABELS.coordenadas, value: enriched.datos_clave.coordenadas, mono: true },
            ...(cardCfg.include_web && enriched.datos_clave.web_referencia ? [{ key: 'web_referencia', label: KEY_DATA_LABELS.web_referencia, value: enriched.datos_clave.web_referencia, isLink: true }] : []),
          ].filter(item => item.value);
          if (items.length === 0) return '';
          const contactHtml = cardCfg.include_contact && (enriched.datos_clave as any).datos_contacto ? (() => {
            const c = (enriched.datos_clave as any).datos_contacto;
            const contactParts: string[] = [];
            if (c.telefono) contactParts.push(`<div style="display:flex;align-items:center;gap:4px;">${svgIcon('phone', { size: 10 })}<span style="font-size:${FONT.micro}px;color:${COLOR.muted};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.telefono}</span></div>`);
            if (c.horario) contactParts.push(`<div style="display:flex;align-items:center;gap:4px;">${svgIcon('clock', { size: 10 })}<span style="font-size:${FONT.micro}px;color:${COLOR.muted};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.horario}</span></div>`);
            if (c.precio) contactParts.push(`<div style="display:flex;align-items:center;gap:4px;">${svgIcon('dollarSign', { size: 10 })}<span style="font-size:${FONT.micro}px;color:${COLOR.muted};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.precio}</span></div>`);
            if (contactParts.length === 0) return '';
            return `<div style="border-top: 1px solid ${COLOR.border}; background: hsl(var(--muted) / 0.3); padding: 6px 10px;"><div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">${contactParts.join('')}</div></div>`;
          })() : '';
          const headerHtml = svgIcon('bookMarked', { size: SECTION_HEADER.iconSize }) +
              `<span style="font-size: ${SECTION_HEADER.fontSize}px; color: ${COLOR.muted}; text-transform: ${SECTION_HEADER.textTransform}; letter-spacing: ${SECTION_HEADER.letterSpacing}; font-weight: ${SECTION_HEADER.fontWeight}; flex: 1;">Datos clave</span>`;
          const bodyHtml = items.map(item => 
                `<div style="display: flex; align-items: flex-start; gap: 8px; padding: 6px 10px; border-bottom: 1px solid ${COLOR.border};">` +
                  svgIcon(KEY_ICON_MAP[item.key] || 'mapPin', { size: 12, extraStyle: 'flex-shrink: 0; margin-top: 2px;' }) +
                  `<span style="font-size: ${FONT.micro}px; color: ${COLOR.muted}; flex-shrink: 0; width: 64px; line-height: 1.3;">${item.label}</span>` +
                  ('isLink' in item && item.isLink
                    ? `<a href="${String(item.value).startsWith('http') ? item.value : 'https://' + item.value}" target="_blank" style="font-size: ${FONT.label}px; color: ${COLOR.primary}; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">${item.value}</a>`
                    : `<span style="font-size: ${FONT.label}px; color: ${COLOR.foreground}; font-weight: 500; text-align: right; flex: 1; line-height: 1.3;${'mono' in item && item.mono ? ' font-family: ui-monospace, monospace; font-size: 9px;' : ''}">${item.value}</span>`
                  ) +
                '</div>'
              ).join('') + (contactHtml || '');
          return wrapCollapsibleSection('datos_clave', headerHtml, bodyHtml, cardCfg);
        })();
      
      case 'fuentes':
        if (!cardCfg.show_sources || !enriched.fuentes || !Array.isArray(enriched.fuentes) || enriched.fuentes.length === 0) return '';
        return (() => {
          const headerHtml = `<span style="font-size: ${SECTION_HEADER.fontSize}px; color: ${COLOR.muted}; text-transform: ${SECTION_HEADER.textTransform}; letter-spacing: ${SECTION_HEADER.letterSpacing}; font-weight: ${SECTION_HEADER.fontWeight}; flex: 1;">Fuentes</span>`;
          const bodyHtml = `<ul style="margin: 0; padding: 6px 10px; list-style: none;">${enriched.fuentes.map((f: string) => {
            const urlMatch = f.match(/(https?:\/\/[^\s]+)/);
            if (urlMatch) {
              const url = urlMatch[1];
              const domain = url.replace(/^https?:\/\//, '').split('/')[0];
              return `<li style="margin-bottom: 2px; font-size: ${FONT.label}px; color: ${COLOR.muted};"><span>• </span><a href="${url}" target="_blank" rel="noopener noreferrer" style="color: ${COLOR.muted}; text-decoration: none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${domain}</a></li>`;
            }
            return `<li style="margin-bottom: 2px; font-size: ${FONT.label}px; color: ${COLOR.muted};">• ${f}</li>`;
          }).join('')}</ul>`;
          return wrapCollapsibleSection('fuentes', headerHtml, bodyHtml, cardCfg);
        })();
      
      case 'indice_interes':
        // Already rendered in the interaction section above
        return '';
      
      default:
        return '';
    }
  };

  // (2) Composición canónica: la jerarquía la decide el composer, NO el switch
  //     y NO `field_order`.
  //
  //     Bloque semántico congelado (transversal):
  //         descripcion → rating (personal state) → observacion
  //
  //     El resto de fields respeta `orderedKeys`. Si una de las claves canónicas
  //     no aparece en `orderedKeys` (admin la desactivó) o produce fragment vacío,
  //     se preserva el slot lógico para que el rating siga entre descripción y
  //     observación cuando ambas existan, y los fallbacks documentados se
  //     mantengan cuando alguna (o ambas) falten.
  const fragments = new Map<string, string>();
  for (const k of orderedKeys) fragments.set(k, renderFragment(k));



  const descFragment = fragments.get('descripcion') ?? '';
  const obsFragment = fragments.get('observacion') ?? '';


  // P-POPUP-7A.3 — Anclaje del bloque canónico (tripleta extendida):
  //     description → enrichmentRating → userPersonalState → observation
  //   Reducciones (compactar adyacentes preservando orden 1→2→3→4):
  //     - desc + enrich + personal + obs  → 1+2+3+4
  //     - desc + obs                       → 1   +4   (enrich/personal vacíos)
  //     - sólo obs                         → 2+3+4 (enrich/personal antes)
  //     - sólo desc                        → 1+2+3
  //     - ninguna desc/obs                 → 2+3 (fallback)
  const canonicalParts = [descFragment, enrichmentRatingFragment, personalStateFragment, obsFragment]
    .filter(Boolean);
  const canonicalBlock = canonicalParts.join('');

  // Posición del bloque canónico = posición del PRIMER fieldKey canónico
  // presente en `orderedKeys`. Los fields no canónicos conservan su slot
  // relativo en `field_order`. Si no hay claves canónicas en orderedKeys,
  // los slots semánticos (enrich + personal) se anclan al final.
  const firstCanonicalIdx = orderedKeys.findIndex((k) => CANONICAL_KEYS.has(k));
  let anchorEmitted = false;
  const composed: string[] = [];
  if (firstCanonicalIdx === -1) {
    for (const k of orderedKeys) composed.push(fragments.get(k) ?? '');
    composed.push(enrichmentRatingFragment, personalStateFragment);
  } else {
    orderedKeys.forEach((k) => {
      if (CANONICAL_KEYS.has(k)) {
        if (!anchorEmitted) {
          composed.push(canonicalBlock);
          anchorEmitted = true;
        }
        // Las claves canónicas no se emiten individualmente: viven en el bloque.
        return;
      }
      composed.push(fragments.get(k) ?? '');
    });
  }

  return composed.join('\n');


})()}
${(!isEnriched) ? (() => {
  // P-POPUP-13 — Fallback body (POI sin enriched.descripcion): customData
  // filtrado renderizado en lenguaje discreto. SIN overflow textual, SIN
  // bordes legacy grises, SIN eyebrow uppercase agresivo. Mismo registro
  // tipográfico que el resto del shell canónico.
  const filteredCustomData = Object.entries(location.customData || {})
    .filter(([key]) => !['user_image_url', 'user_image_visibility', 'has_notes', 'notes', 'visited', 'user_rating'].includes(key));
  if (filteredCustomData.length === 0) return '';
  const rowsHtml = filteredCustomData.map(([key, value]) => `
<div style="display: flex; gap: 8px; padding: 4px 0; border-bottom: 1px solid hsl(var(--border) / 0.4);">
<span style="color: hsl(var(--muted-foreground)); font-size: 12px; min-width: 80px; font-weight: 500;">${key}</span>
<span style="color: hsl(var(--foreground)); font-size: 12px; flex: 1;">${value}</span>
</div>`).join('');
  return `
<details data-popup-fallback-customdata="v1" style="margin: 8px 16px 12px 16px; border-top: 1px solid hsl(var(--border) / 0.6); padding-top: 8px;">
<summary style="cursor: pointer; font-size: 11px; color: hsl(var(--muted-foreground)); letter-spacing: 0.02em; padding: 4px 0; list-style: none;">Datos adicionales (${filteredCustomData.length})</summary>
<div style="margin-top: 6px;">${rowsHtml}</div>
</details>`;
})() : ''}
<!-- P-POI-CURATION-2.10 — Two-rail body. Cierra AQUÍ el wrapper editorial
     (padding: 16px) que envuelve prosa/hero/breadcrumb/ratings/descripción.
     Los slots interactivos (recovery-root, route-waypoint actions) se emiten
     como hijos DIRECTOS del popup-scroll-body, full-width, sin gutter
     editorial heredado y SIN márgenes negativos. Ver
     docs/contracts/popup-contract.md (Two-rail body) y
     mem://style/popup/two-rail-body. -->
</div>
<!-- Slot interactivo full-width: UnenrichedRecoveryBlock (hydrated by
     LocationMap on popupopen). Solo se monta si el POI no está enriquecido.
     Edge-to-edge del scroll-body; el NearbyPanel inline (padX=px-0,
     rootClass con border-t superior) está preparado para esta posición. -->
${curationVerdict.bodyBlocker === 'enrich-from-context' ? `<div data-recovery-root="${location.id}" style="margin: 0 8px 8px 8px;"></div>` : ''}
${(() => {
  const pt = (location.placeType ?? '').toString();
  const isRouteWaypoint = pt === 'route_waypoint' || pt.startsWith('route_') || location.customData?.is_route_waypoint === 'true';
  if (!(isOwn && canEditLocation && isRouteWaypoint)) return '';
  // P-POPUP-13 — Route-waypoint actions en lenguaje muted P-POPUP-11.1.
  // P-POI-CURATION-2.10 — Slot interactivo full-width: ya autocontenido con
  // `margin: 8px 16px` propio (su carril es de botones, no editorial).
  const btn = (action: string, label: string, title: string, svg: string, extra: string = '') => `
<button class="popup-action-btn" data-action="${action}" data-location-id="${location.id}" ${extra}
style="display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 30px; padding: 0 8px; background: hsl(var(--muted)); color: hsl(var(--foreground)); border: none; border-radius: 6px; font-size: 11px; font-weight: 500; cursor: pointer; transition: background 0.15s;"
onmouseover="this.style.background='hsl(var(--muted) / 0.7)'" onmouseout="this.style.background='hsl(var(--muted))'"
title="${title}">${svg}${label}</button>`;
  return `
<div data-route-waypoint-actions="v1" style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 8px 16px 8px 16px;">
${btn('view-nearby', 'Contexto cercano', 'Explorar puntos de interés cercanos', '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/></svg>')}
${btn('duplicate-point', 'Duplicar', 'Crear una copia de este punto', '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>', `data-location-name="${location.name}"`)}
${btn('merge-nearby', 'Fusionar', 'Fusionar con un punto cercano', '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m8 6 4-4 4 4"/><path d="M12 2v10.3a4 4 0 0 1-1.172 2.872L4 22"/><path d="m20 22-5-5"/></svg>')}
${btn('reclassify-type', 'Reclasificar', 'Cambiar el tipo de lugar', '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>')}
</div>`;
})()}
</div>

<!-- P-POPUP-11 — Footer persistente: estado IA + acciones técnicas. Sibling
     del hero y del scroll body, flex-shrink:0 → siempre visible aunque el
     body haga scroll. Estado IA único (no duplicado en el body). -->
<div data-popup-footer="v1" style="flex-shrink: 0; border-top: 1px solid hsl(var(--border)); background: hsl(var(--muted) / 0.4); padding: 8px 12px;">
${actionButtonsHtml}
</div>
</div>
`;
  }

  // P-POPUP-13 — La rama legacy visual fue eliminada. El shell canónico
  // (hero → scroll-body → footer persistente) aplica a TODOS los POIs.
  // Si llegamos aquí es por error de control de flujo: devolvemos string vacío.
  return '';
}

// P-POPUP-7B DEV AUTODIAGNOSIS — module-level, dev-only. Removed in fix commit.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (async () => {
    try {
      const mod = await import('@/domains/content/store/locations-store');
      const store: any = (mod as any).useLocationsStore;
      const run = () => {
        const locs: any[] = store.getState().locations || [];
        const visited = locs.filter(l => l?.customData?.visited === 'true');
        const enriched = visited.filter(l => !!l?.enrichedData?.descripcion);
        const ownership = { isOwn: true, isFollowing: false } as any;
        const rows = enriched.slice(0, 30).map((l: any) => {
          const st = resolveVisitedPresentationState(l, ownership, l.enrichedData);
          return {
            id: l.id, name: l.name,
            userImg: !!l.customData?.user_image_url,
            aiImg: !!l.enrichedData?.imagen,
            visibility: l.customData?.user_image_visibility ?? null,
            ...st,
          };
        });
        const summary = {
          totalLocations: locs.length,
          visitedCount: visited.length,
          visitedEnrichedCount: enriched.length,
          overlayActiveCount: rows.filter(r => r.showHeroOverlay).length,
          inlineActiveCount: rows.filter(r => r.showInlineVisited).length,
          sampleRows: rows,
        };
        (window as any).__diag7B = summary;
        // eslint-disable-next-line no-console
        console.log('[P-POPUP-7B autodiag]', JSON.stringify(summary));
      };
      let tries = 0;
      const tick = () => {
        const locs = store.getState().locations || [];
        if (locs.length > 0 || tries++ > 30) return run();
        setTimeout(tick, 1000);
      };
      tick();
    } catch (e) {
      console.warn('[P-POPUP-7B autodiag] failed', e);
    }
  })();
}
