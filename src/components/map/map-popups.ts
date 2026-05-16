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
import { buildGeoHeaderHtml } from '@/shared/popup/geo-header';
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

/**
 * P2-FIX-B — Temporary deployment signal visible in preview/staging.
 * `import.meta.env.DEV` is false in Lovable preview (built like prod), so the
 * earlier badge never showed. This gate stays true on lovable.app + localhost
 * (where rollout is being validated) and on opt-in `?diag=1`. Will be
 * retired once P-POPUP-2 is fully ratified in production.
 */
function isPopupDiagBadgeVisible(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const host = window.location?.hostname ?? '';
    if (host.includes('lovable.app') || host === 'localhost' || host === '127.0.0.1') return true;
    if (window.location?.search?.includes('diag=1')) return true;
  } catch { /* noop */ }
  return false;
}

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

  if (!isCollapsible) {
    return `<div style="border: 1px solid ${COLOR.border}; border-radius: ${CARD.sectionRadius}px; overflow: hidden; margin-bottom: ${CARD.sectionGap}px;">` +
      `<div style="display: flex; align-items: center; gap: 6px; padding: ${SECTION_HEADER.padding}; background: ${SECTION_HEADER.bgColor}; border-bottom: 1px solid ${COLOR.border};">` +
        headerHtml +
      '</div>' +
      bodyHtml +
    '</div>';
  }

  return `<details${defaultOpen ? ' open' : ''} style="border: 1px solid ${COLOR.border}; border-radius: ${CARD.sectionRadius}px; overflow: hidden; margin-bottom: ${CARD.sectionGap}px;">` +
    `<summary style="display: flex; align-items: center; gap: 6px; padding: ${SECTION_HEADER.padding}; background: ${SECTION_HEADER.bgColor}; cursor: pointer; list-style: none; user-select: none;">` +
      headerHtml +
      `<span style="font-size: 10px; color: ${COLOR.muted}; transition: transform 0.2s;">▶</span>` +
    '</summary>' +
    `<div style="border-top: 1px solid ${COLOR.border};">` + bodyHtml + '</div>' +
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
    return `<span class="collection-filter-chip" data-collection-id="${safeId}" data-collection-name="${safeName}" title="Colección: ${safeName}">${safeName}</span>`;
  }).join(', ');
  let overflowHtml = '';
  if (overflow.length > 0) {
    const overflowNames = overflow.map((c) => String(c.name ?? '')).join(', ').replace(/"/g, '&quot;');
    overflowHtml = ` <span title="${overflowNames}" style="opacity: 0.8;">+${overflow.length}</span>`;
  }
  return `<span data-popup-collections-meta="${location.id}" style="display: inline-flex; align-items: center; gap: 4px; color: hsl(var(--foreground));">${BOOKMARK_SVG}<span>${nameSpans}${overflowHtml}</span></span>`;
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
  ctx: { isOwn: boolean; isCuratorPoint: boolean; canEditLocation: boolean },
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
  const canRate = !!visitRelevance || ctx.canEditLocation;

  // Visited toggle (con copy variable según ownership).
  const visitedLabel = isVisited
    ? 'Visitado'
    : (!ctx.isOwn ? '+ Adoptar y Visitar' : 'Visitado');
  const visitedTitle = isVisited
    ? 'Click para desmarcar'
    : (!ctx.isOwn ? 'Se añadirá a tu colección automáticamente' : 'Marcar como visitado');
  const visitedBg = isVisited
    ? 'hsl(var(--state-success) / 0.10)'
    : (!ctx.isOwn ? 'hsl(var(--state-loading) / 0.10)' : 'transparent');
  const visitedFg = isVisited
    ? 'hsl(var(--state-success))'
    : (!ctx.isOwn ? 'hsl(var(--state-loading))' : 'hsl(var(--text-secondary))');
  const visitedBorder = isVisited
    ? 'hsl(var(--state-success) / 0.35)'
    : (!ctx.isOwn ? 'hsl(var(--state-loading) / 0.35)' : 'hsl(var(--surface-border))');
  const visitedBtn = `<button class="popup-action-btn" data-action="toggle-visited" data-location-id="${location.id}" title="${visitedTitle}" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; background: ${visitedBg}; color: ${visitedFg}; border: 1px solid ${visitedBorder}; border-radius: 9999px; font-size: 10px; font-weight: 500; cursor: pointer; transition: all 0.15s;">${svgIcon('check', { size: 10, color: 'currentColor' })}<span>${visitedLabel}</span></button>`;

  // Badge de verificación inline (sustituye 📷/📍 por iconos Lucide).
  const verifiedBadge = (isVisited && visitRelevance)
    ? (() => {
        const iconKey: keyof typeof SVG_PATHS = visitRelevance.verificationType === 'photo' ? 'camera' : 'mapPin';
        return `<span title="${visitRelevance.label} · ${formatTimeAgo(visitRelevance.daysAgo)}" style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; font-size: 9px; color: hsl(var(--text-secondary)); border: 1px solid hsl(var(--surface-border)); border-radius: 9999px;">${svgIcon(iconKey, { size: 9, color: 'currentColor' })}<span>${formatTimeAgo(visitRelevance.daysAgo)}</span></span>`;
      })()
    : '';

  // Stars helper (compacto, sin glow).
  const starsControl = (ratingValue: number) => [1, 2, 3, 4, 5].map((star) => {
    const active = ratingValue >= star;
    const color = active ? 'hsl(var(--state-warning))' : 'hsl(var(--surface-border))';
    return `<button class="popup-action-btn" data-action="set-rating" data-location-id="${location.id}" data-rating="${star}" title="Valorar ${star} estrella${star > 1 ? 's' : ''}" style="background: none; border: none; padding: 0; cursor: pointer; font-size: 13px; line-height: 1; color: ${color};">${active ? '\u2605' : '\u2606'}</button>`;
  }).join('');

  // Rating block — colapsado por defecto si user_rating=0 y se permite valorar.
  let ratingHtml = '';
  if (canRate) {
    if (userRating > 0) {
      // Modo expandido: 5★ + botón clear.
      ratingHtml = `<span data-personal-rating-state="expanded" style="display: inline-flex; align-items: center; gap: 2px;" title="Tu valoración personal">${starsControl(userRating)}<button class="popup-action-btn" data-action="clear-rating" data-location-id="${location.id}" title="Quitar valoración" style="background: none; border: none; padding: 0 0 0 4px; cursor: pointer; font-size: 10px; color: hsl(var(--text-secondary));">\u2715</button></span>`;
    } else {
      // Modo colapsado: affordance textual "Valorar" + control oculto que se
      // revela inline al click (sin re-render, sin sacudida visual).
      const expandJs = "var p=this.parentNode;this.style.display='none';var x=p.querySelector('[data-personal-rating-state=\\'expanded\\']');if(x){x.style.display='inline-flex';}";
      ratingHtml = `<span style="display: inline-flex; align-items: center; gap: 6px;">`
        + `<button type="button" data-personal-rating-state="collapsed" onclick="${expandJs}" style="background: none; border: none; padding: 0; cursor: pointer; font-size: 10px; color: hsl(var(--text-secondary)); text-decoration: underline; text-underline-offset: 2px;">Valorar</button>`
        + `<span data-personal-rating-state="expanded" style="display: none; align-items: center; gap: 2px;" title="Tu valoración personal">${starsControl(0)}</span>`
        + `</span>`;
    }
  }

  const row = [verifiedBadge, visitedBtn, ratingHtml].filter(Boolean).join('');
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
      datePart = `Añadido ${dd}/${mm}/${yyyy}`;
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

  return `<div data-popup-own-added="${location.id}"${prov.type ? ` data-popup-source-metadata="${location.id}" data-source-metadata-type="${prov.type}"` : ''} style="display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 0 0 ${CARD.sectionGap}px 0; font-size: 11px; line-height: 1.3; color: hsl(var(--muted-foreground));" title="${prov.type ? 'Añadido a tu red — incluye fuente original' : 'Fecha en que añadiste este punto a tu red'}">
<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<circle cx="12" cy="12" r="10"/>
<polyline points="12 6 12 12 16 14"/>
</svg>
<span>${inner}</span>
</div>`;
}

// ─── Image Section ───────────────────────────────────────────────────────────

export function buildImageSection(
  location: GeoLocation,
  enriched: any,
  ownership: PopupOwnership,
): string {
  // For curator points: prioritize enriched image, then curator avatar, then icon
  if (ownership.curatorId) {
    const curatorIcon = ownership.curatorIcon || 'map-pin';
    const curatorColor = ownership.curatorColor || '#14b8a6';
    const iconPath = CURATOR_ICON_PATHS[curatorIcon] || CURATOR_ICON_PATHS['map-pin'];

    // Priority: 1) AI enriched image 2) Curator avatar 3) Icon only
    const imageUrl = enriched?.imagen || ownership.curatorAvatar;

    if (imageUrl) {
      return `<div style="margin: 0 -12px 0 -12px; position: relative;">
<div style="width: 100%; height: 160px; position: relative; overflow: hidden;">
<img src="${imageUrl}" alt="${enriched?.imagen ? 'Ubicación' : 'Curador'}" style="width: 100%; height: 100%; object-fit: cover;" />
<!-- Curator icon overlay in corner -->
<div style="
position: absolute;
bottom: 8px;
right: 8px;
width: 40px;
height: 40px;
background: rgba(255,255,255,0.95);
border-radius: 50%;
display: flex;
align-items: center;
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

  // Regular locations: user/followed logic
  const userImageUrl = location.customData?.user_image_url as string | undefined;
  const userImageVisibility = (location.customData?.user_image_visibility as string) || 'private';
  const aiImage = enriched?.imagen;

  const canSeeUserImage = userImageUrl && (
    ownership.isOwn ||
    userImageVisibility === 'public' ||
    (userImageVisibility === 'followers' && ownership.isFollowing)
  );

  const displayImage = canSeeUserImage ? userImageUrl : aiImage;
  const fallbackImage = aiImage || '';
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
<div style="position: absolute; bottom: 12px; right: 16px; display: flex; gap: 8px;">
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

  return `<div style="margin: 0 -12px 0 -12px; position: relative;">
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
  const enriched = location.enrichedData;
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

  const actionButtonsHtml = `
${progressBarHtml}
${(canEditLocation && !isOwn && !isCuratorPoint) ? adminEditWarning : ''}
<div style="display: flex; gap: 4px; margin-top: 8px; padding-top: 8px; padding-bottom: 6px; border-top: 1px solid #e5e7eb;">
${isCuratorPoint ? `
<div style="flex: 2; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 6px 10px; background: #f0fdf4; color: #166534; border: none; border-radius: 4px; font-size: 11px; font-weight: 500;">
<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<circle cx="12" cy="12" r="10"/>
<polyline points="12 6 12 12 16 14"/>
</svg>
Enriquecido ${location.updatedAt ? formatRegistrationDate(location.updatedAt) : ''}
</div>
` : `
${canEditLocation ? `
${isEnriched ? `
<!-- Enriched: date label + re-enrich button -->
<div style="flex: 2; display: flex; align-items: center; gap: 4px;">
<div style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 6px 8px; background: #f0fdf4; color: #166534; border-radius: 4px; font-size: 10px; font-weight: 500;">
<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
<polyline points="20 6 9 17 4 12"></polyline>
</svg>
Enriquecido ${location.updatedAt ? formatRegistrationDate(location.updatedAt) : ''}
</div>
<button 
class="popup-action-btn" 
data-action="enrich" 
data-location-id="${location.id}"
style="display: flex; align-items: center; justify-content: center; gap: 3px; padding: 6px 10px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; border: none; border-radius: 4px; font-size: 10px; font-weight: 600; cursor: pointer; transition: all 0.15s; white-space: nowrap;"
onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 12px rgba(139, 92, 246, 0.4)'"
onmouseout="this.style.transform='none';this.style.boxShadow='none'"
title="Regenerar ficha completa con IA"
>
<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/>
</svg>
Re-enriquecer
</button>
</div>
` : `
<!-- Not enriched: NO duplicate enrich button here.
     The single CTA "Enriquecer" lives in <UnenrichedRecoveryBlock>, mounted in
     [data-recovery-root] by popup-recovery-mount.ts. Avoiding the duplicate
     keeps the contract single-source-of-truth and prevents divergent UX
     (different focusAfter, different refresh behavior). See
     mem://logic/content/enrichment-trigger-unified. -->
`}
` : ''}
`}
${canEditOwn ? `
<button 
class="popup-action-btn" 
data-action="add-notes" 
data-location-id="${location.id}"
style="flex: ${canEditLocation ? '1' : '1'}; display: flex; align-items: center; justify-content: center; gap: 3px; padding: 4px 6px; background: ${hasNotes ? '#fef3c7' : '#f3f4f6'}; color: ${hasNotes ? '#92400e' : '#374151'}; border: none; border-radius: 3px; font-size: 10px; font-weight: 500; cursor: pointer; transition: all 0.15s;"
onmouseover="this.style.background='${hasNotes ? '#fde68a' : '#e5e7eb'}';this.style.transform='translateY(-1px)'"
onmouseout="this.style.background='${hasNotes ? '#fef3c7' : '#f3f4f6'}';this.style.transform='none'"
title="${hasNotes ? 'Editar notas' : 'Añadir notas'}"
>
<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
<polyline points="14 2 14 8 20 8"/>
<line x1="16" y1="13" x2="8" y2="13"/>
<line x1="16" y1="17" x2="8" y2="17"/>
<line x1="10" y1="9" x2="8" y2="9"/>
</svg>
Notas
</button>
<button 
class="popup-action-btn" 
data-action="delete-location" 
data-location-id="${location.id}"
data-location-name="${location.name}"
style="display: flex; align-items: center; justify-content: center; padding: 4px 8px; background: #fef2f2; color: #dc2626; border: none; border-radius: 3px; cursor: pointer; transition: all 0.15s;"
onmouseover="this.style.background='#fee2e2';this.style.transform='translateY(-1px)'"
onmouseout="this.style.background='#fef2f2';this.style.transform='none'"
title="Mover a la papelera"
>
<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
</svg>
</button>
` : ''}
</div>
`;

  const addToCollectionBtnHtml = (!isOwn && !isCuratorPoint) ? `
<button 
class="popup-action-btn" 
data-action="add-to-collection" 
data-location-id="${location.id}"
data-location-name="${location.name}"
style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 16px; background: linear-gradient(135deg, #16a34a, #22c55e); color: white; border: none; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(22, 163, 74, 0.3);"
onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 12px rgba(22, 163, 74, 0.4)'"
onmouseout="this.style.transform='none';this.style.boxShadow='0 2px 8px rgba(22, 163, 74, 0.3)'"
title="Añadir este punto a tu colección personal"
>
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
<path d="M12 5v14M5 12h14"/>
</svg>
Añadir a mi colección
</button>
` : '';

  // Si tiene ficha enriquecida (descripcion IA real), mostrarla.
  if (isEnriched && enriched) {
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

    return `
<div id="${popupId}" data-popup-version="${isPopupGeoCanonicalV1On() ? 'geo-canonical-v1' : 'legacy'}" data-popup-geo-canonical="${isPopupGeoCanonicalV1On() ? 'true' : 'false'}" data-popup-ownership-strip="${(isOwn && isPopupOwnershipStripV1On()) ? 'v1' : 'legacy'}" style="width: ${CARD.maxWidth}px; font-family: ${CARD_FONT_FAMILY}; position: relative; display: flex; flex-direction: column; max-height: ${POPUP_MAX_HEIGHT}; overflow: hidden;">${isPopupDiagBadgeVisible() && isPopupGeoCanonicalV1On() ? `<div style="position: absolute; top: 4px; left: 4px; z-index: 10; padding: 2px 6px; border-radius: 4px; background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); font-size: 9px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; opacity: 0.85; pointer-events: none;" title="P-POPUP-2 canonical geo header + 4-bucket tag dedupe ACTIVE (preview/staging signal — will retire after ratification)">P-POPUP-2 ON</div>` : ''}${isPopupDiagBadgeVisible() && isOwn && isPopupOwnershipStripV1On() ? `<div style="position: absolute; top: 4px; left: 88px; z-index: 10; padding: 2px 6px; border-radius: 4px; background: hsl(var(--accent)); color: hsl(var(--accent-foreground)); font-size: 9px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; opacity: 0.85; pointer-events: none;" title="P-POPUP-3A ownership-strip ACTIVE (own enriched only; preview/staging signal — will retire after ratification)">P-POPUP-3 ON</div>` : ''}
${statusBarHtml}

<!-- Hero (fija, no participa en el scroll) -->
<div style="flex-shrink: 0;">
${buildImageSection(location, enriched, ownershipInfo)}
</div>

<!-- Cuerpo desplazable -->
<div class="popup-scroll-body" style="flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain;">
<div style="padding: 16px 16px 8px 16px;">
<!-- Nombre + Badge propiedad -->
<div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
<h3 style="margin: 0; font-size: ${FONT.title}px; font-weight: 700; color: ${COLOR.foreground}; line-height: 1.3; flex: 1;">
${locationName || 'Sin nombre'}
</h3>
${(isOwn && isPopupOwnershipStripV1On()) ? '' : ownershipBadgeHtml}
</div>

<!-- Geo header (P-POPUP-2: canonical chips bajo flag, fallback a localizacionLinks italic legacy) -->
${isPopupGeoCanonicalV1On()
  ? `<div style="margin: 0 0 12px 0;">${buildGeoHeaderHtml(location, { background: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' })}</div>`
  : `<p style="margin: 0 0 12px 0; font-size: ${FONT.subtitle}px; line-height: 1.4; color: ${COLOR.muted}; font-style: italic;">${localizacionLinks}</p>`}

<!-- Botón para añadir a colección (solo para puntos de seguidos) -->
${addToCollectionBtnHtml}

<!-- Índice IA + Botones de interacción -->
<div style="display: flex; flex-direction: column; align-items: center; gap: 6px; margin-bottom: 10px; padding: 8px; background: ${tk('hsl(var(--surface-muted))', '#f9fafb')}; border-radius: 8px;">
${!isCuratorPoint ? `
<!-- Warning de validación (oculto por defecto) -->
<div id="visit-validation-warning-${location.id}" style="display: none; width: 100%; padding: 8px; background: ${tk('hsl(var(--state-warning) / 0.2)', 'linear-gradient(135deg, #fef3c7, #fde68a)')}; border: 1px solid ${tk('hsl(var(--state-warning) / 0.5)', '#fcd34d')}; border-radius: 8px; margin-bottom: 4px;">
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
` : ''}

<div style="display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap;">
${isCuratorPoint ? `
<!-- Rating ponderado para puntos de curador -->
<div 
class="weighted-rating-container" 
data-location-id="${location.id}" 
data-ai-rating="${enriched.indice_interes || 0}"
style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: ${tk('hsl(var(--state-success) / 0.12)', 'linear-gradient(135deg, #f0fdf4, #dcfce7)')}; border: 1px solid ${tk('hsl(var(--state-success) / 0.4)', '#86efac')}; border-radius: 12px;"
title="Rating ponderado: 50% IA + 50% Comunidad"
>
<span style="font-size: 10px; font-weight: 500; color: ${tk('hsl(var(--state-success))', '#166534')};">Valoración</span>
<span class="weighted-rating-stars" style="display: inline-flex; gap: 1px;">
${[1, 2, 3, 4, 5].map(star => `<span style="font-size: 14px; line-height: 1; color: ${star <= (enriched.indice_interes || 0) ? tk('hsl(var(--state-success))', '#16a34a') : tk('hsl(var(--surface-border))', '#d1d5db')};">${star <= (enriched.indice_interes || 0) ? '★' : '☆'}</span>`).join('')}
</span>
<span class="weighted-rating-value" style="font-size: 10px; font-weight: 600; color: ${tk('hsl(var(--state-success))', '#166534')};">${enriched.indice_interes ? enriched.indice_interes.toFixed(1) : '-'}</span>
<span class="weighted-rating-breakdown" style="font-size: 9px; color: ${tk('hsl(var(--text-secondary))', '#6b7280')}; display: none;">(IA: ${enriched.indice_interes || '-'} | Com: -)</span>
</div>
` : `
${enriched.indice_interes ? `
<div style="display: inline-flex; align-items: center; gap: 2px; padding: 3px 8px; background: ${tk('hsl(var(--state-warning) / 0.2)', 'linear-gradient(135deg, #fef3c7, #fde68a)')}; border-radius: 12px;" title="${enriched.indice_interes_notas || 'Índice de interés IA'}">
${[1, 2, 3, 4, 5].map(star => `<span style="font-size: 14px; line-height: 1; color: ${star <= enriched.indice_interes ? tk('hsl(var(--state-warning))', '#b45309') : tk('hsl(var(--surface-border))', '#d1d5db')};">${star <= enriched.indice_interes ? '★' : '☆'}</span>`).join('')}
</div>
` : ''}
`}

<!-- P-POPUP-7A: Visited + personal rating bajados al slot post-descripción.
     Aquí permanece SOLO el rating IA (POI metadata, no user state). -->

</div>
</div>

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
  // Render enriched sections following the order/enablement persisted in the
  // editor (Configuración de fichas) — single source of truth.
  const orderedKeys = cardCfg.orderedKeys;

  // P-POPUP-7A — flag para insertar el bloque de estado personal una sola vez,
  // justo debajo de `descripcion`. Si la card config no incluye `descripcion`,
  // el bloque se emite al final (fallback).
  const personalStateCtx = { isOwn, isCuratorPoint, canEditLocation };
  let personalStateRendered = false;
  const personalStateOnce = () => {
    if (personalStateRendered) return '';
    personalStateRendered = true;
    return buildPersonalStateBlock(location, personalStateCtx);
  };

  const mappedBody = orderedKeys.map(fieldKey => {
    switch (fieldKey) {
      case 'nombre_lugar':
      case 'localizacion':
        // Already rendered above
        return '';
      
      case 'clasificacion': {
        // P-POPUP-6A — taxonomy canonical representation = chips (see `case 'etiquetas'`).
        // The textual breadcrumb (codigo + categoria + separator + subcategoria) is removed to avoid
        // duplicating taxonomy in two formats. The catalog code (e.g. "2.5.x") is also
        // dropped — internal catalog metadata with no value for a human viewer.
        // This slot now renders ONLY the cultural_context (Wikidata) chip. If absent,
        // the block is omitted entirely (no empty container).
        const cc = (enriched as any)?.cultural_context;
        if (!cc?.type_label) return '';
        const culturalChip = `<span title="${cc.type_label} (Wikidata)" style="display: inline-flex; align-items: center; gap: 4px; background: ${tk('hsl(270 60% 95%)', '#ede9fe')}; color: ${tk('hsl(270 70% 35%)', '#5b21b6')}; padding: ${CARD.tagPadding}; border-radius: ${CARD.tagRadius}; font-size: ${FONT.badge}px; font-weight: 500;">${cc.type_label}</span>`;
        return `
<div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: ${CARD.sectionGap}px;">
  ${culturalChip}
</div>`;
      }

      
      case 'punto_destacado':
        if (!enriched.punto_destacado) return '';
        return `
<div style="clear: both; display: block; margin: 0 0 ${CARD.sectionGap}px 0; background: ${HIGHLIGHT.bgColor}; border-left: ${HIGHLIGHT.borderWidth}px solid ${HIGHLIGHT.borderColor}; padding: ${HIGHLIGHT.padding}; border-radius: ${HIGHLIGHT.borderRadius};">
  <p style="margin: 0; font-size: ${FONT.body}px; font-weight: 500; color: ${COLOR.foreground}; line-height: 1.45;">${enriched.punto_destacado}</p>
</div>`;
      
      case 'descripcion': {
        const desc = enriched.descripcion
          ? `
<div style="clear: both; display: block; margin: 0 0 ${CARD.sectionGap}px 0;">
  <div style="font-size: ${FONT.label}px; text-transform: ${SECTION_HEADER.textTransform}; letter-spacing: ${SECTION_HEADER.letterSpacing}; color: ${COLOR.muted}; margin-bottom: 4px;">Descripción</div>
  <div class="vandits-description-body">
    ${descriptionToHtmlParagraphs(enriched.descripcion, `margin: 0 0 8px 0; font-size: ${FONT.body}px; color: ${COLOR.bodyText}; line-height: 1.625;`)}
  </div>
  <span style="font-size: ${FONT.charCount}px; color: ${COLOR.muted};">${enriched.descripcion?.length || 0} caracteres</span>
</div>`
          : '';
        // P-POPUP-7A — bloque de estado personal SIEMPRE bajo `descripcion`.
        return desc + personalStateOnce();
      }
      
      case 'observacion':
        if (!enriched.observacion) return '';
        return `
<div style="clear: both; display: block; margin: 0 0 ${CARD.sectionGap}px 0; background: ${OBSERVATION.bgColor}; padding: ${OBSERVATION.padding}; border-radius: ${OBSERVATION.borderRadius};">
  <div style="font-size: ${FONT.label}px; text-transform: ${SECTION_HEADER.textTransform}; letter-spacing: ${SECTION_HEADER.letterSpacing}; color: ${COLOR.muted}; margin-bottom: 2px;">Observación</div>
  <p style="margin: 0; font-size: ${FONT.body}px; color: ${COLOR.obsText}; line-height: 1.5;">${enriched.observacion}</p>
</div>`;
      
      case 'etiquetas_personales':
        // Renderizado fuera del switch para garantizar visibilidad siempre.
        return '';

      case 'etiquetas': {
        if (!cardCfg.include_tags) return '';

        // P-POPUP-2 — canonical 4-bucket dedupe path (flag-gated).
        // - Removes `etiquetas_geograficas` from chips (covered by geo header).
        // - Dedupes taxonomy ↔ semantic ↔ user by slug.
        // - Caps overflow per `POPUP_TAG_CAPS`.
        if (isPopupGeoCanonicalV1On()) {
          const collectionSlugsForLoc = getCollectionsForLocation(location.id)
            .map(c => tagSlug(c.name ?? ''))
            .filter(Boolean);
          const userPreFiltered = filterPersonalTags(location.id, enriched?.etiquetas_personales);
          const buckets = getCanonicalPopupTags(location, collectionSlugsForLoc, userPreFiltered);
          const parts: string[] = [];

          const renderBucket = (
            items: string[],
            cap: number,
            type: 'classification' | 'thematic' | 'personal',
            filterType: 'searchTerm' | 'tag',
          ) => {
            if (!items.length) return;
            const visible = items.slice(0, cap);
            const overflow = items.length - visible.length;
            const chips = visible.map(t => inlineTagBadge(
              `#${String(t).replace('#', '').replace(/\s+/g, '')}`,
              type,
              { filterType, filterValue: String(t).replace('#', '') },
            )).join('');
            const overflowChip = overflow > 0
              ? `<span title="+${overflow} más" style="padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 500; background: ${COLOR.secondary}; color: ${COLOR.muted};">+${overflow}</span>`
              : '';
            parts.push(`<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px;">${chips}${overflowChip}</div>`);
          };

          if (!isCuratorPoint) {
            renderBucket(buckets.taxonomy, POPUP_TAG_CAPS.taxonomy, 'classification', 'searchTerm');
            renderBucket(buckets.semantic, POPUP_TAG_CAPS.semantic, 'thematic', 'tag');
            renderBucket(buckets.user, POPUP_TAG_CAPS.user, 'personal', 'tag');
          }

          if (parts.length === 0) return '';
          return `<div style="margin-bottom: ${CARD.sectionGap}px;">` + parts.join('') + '</div>';
        }

        // ── Legacy path (flag OFF, default in prod) ───────────────────────
        const parts: string[] = [];

        // Geographic tags
        if (enriched.etiquetas_geograficas?.length) {
          parts.push('<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px;">' +
            enriched.etiquetas_geograficas.map((tag: string) => 
              inlineTagBadge(`#${tag.replace('#', '').replace(/\s+/g, '')}`, 'geo', { filterType: 'tag', filterValue: tag.replace('#', '') })
            ).join('') + '</div>');
        }
        
        // Classification tags
        if (!isCuratorPoint && enriched.clasificacion?.codigo) {
          const classTags: string[] = [];
          if (enriched.clasificacion.categoria_principal) classTags.push(inlineTagBadge(`#${enriched.clasificacion.categoria_principal.replace(/^\d+\.\s*/, '').replace(/\s+/g, '')}`, 'classification', { filterType: 'searchTerm', filterValue: enriched.clasificacion.categoria_principal.replace(/^\d+\.\s*/, '') }));
          if (enriched.clasificacion.subcategoria) classTags.push(inlineTagBadge(`#${enriched.clasificacion.subcategoria.replace(/^\d+\.\d+\s*/, '').replace(/\s+/g, '')}`, 'classification', { filterType: 'searchTerm', filterValue: enriched.clasificacion.subcategoria.replace(/^\d+\.\d+\s*/, '') }));
          if (enriched.clasificacion.tipo_especifico) classTags.push(inlineTagBadge(`#${enriched.clasificacion.tipo_especifico.replace(/^\d+\.\d+\.\d+\s*/, '').replace(/\s+/g, '')}`, 'classification', { filterType: 'searchTerm', filterValue: enriched.clasificacion.tipo_especifico.replace(/^\d+\.\d+\.\d+\s*/, '') }));
          if (classTags.length) parts.push('<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px;">' + classTags.join('') + '</div>');
        }
        
        // Thematic hashtags
        if (!isCuratorPoint && enriched.etiquetas?.length) {
          const filteredTags = enriched.etiquetas.filter((tag: string) => !enriched.etiquetas_geograficas?.some((gt: string) => gt.toLowerCase() === tag.toLowerCase()));
          if (filteredTags.length) {
            parts.push('<div style="display: flex; gap: 4px; flex-wrap: wrap;">' +
              filteredTags.map((tag: string) => 
                inlineTagBadge(`#${tag.replace('#', '').replace(/\s+/g, '')}`, 'thematic', { filterType: 'tag', filterValue: tag.replace('#', '') })
              ).join('') + '</div>');
          }
        }
        
        if (parts.length === 0) return '';
        return `<div style="margin-bottom: ${CARD.sectionGap}px;">` + parts.join('') + '</div>';
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
  }).join('\n');
})()}

${locationUpdatedAt > 0 ? `
<div style="display: flex; align-items: center; gap: 4px; font-size: 9px; color: ${tk('hsl(var(--text-secondary))', '#9ca3af')}; margin-top: 8px; padding-top: 8px; border-top: 1px dashed ${tk('hsl(var(--surface-border))', '#e5e7eb')};">
<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<circle cx="12" cy="12" r="10"/>
<polyline points="12 6 12 12 16 14"/>
</svg>
<span>Ficha IA actualizada: ${new Date(locationUpdatedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
</div>
` : ''}

<!-- Botones de acción -->
${actionButtonsHtml}
</div>
</div>
</div>
`;
  }

  // Fallback: mostrar datos originales
  const ownershipInfo: PopupOwnership = {
    isOwn,
    ownerName,
    isFollowing: ownership?.isFollowing,
    curatorId: ownership?.curatorId,
    curatorIcon: ownership?.curatorIcon,
    curatorColor: ownership?.curatorColor,
    curatorAvatar: ownership?.curatorAvatar,
  };

  const filteredCustomData = Object.entries(location.customData || {})
    .filter(([key]) => !['user_image_url', 'user_image_visibility', 'has_notes', 'notes', 'visited', 'user_rating'].includes(key));

  const customDataHtml = filteredCustomData
    .slice(0, 6)
    .map(([key, value]) => `
<div style="display: flex; gap: 8px; padding: 4px 0; border-bottom: 1px solid #f0f0f0;">
<span style="color: #666; font-size: 12px; min-width: 80px; font-weight: 500;">${key}</span>
<span style="color: #333; font-size: 12px; flex: 1;">${value}</span>
</div>
`).join('');

  const moreDataCount = filteredCustomData.length - 6;

  return `
<div data-popup-version="${isPopupGeoCanonicalV1On() ? 'geo-canonical-v1' : 'legacy'}" data-popup-geo-canonical="${isPopupGeoCanonicalV1On() ? 'true' : 'false'}" style="width: ${CARD.maxWidth}px; font-family: ${CARD_FONT_FAMILY}; position: relative; display: flex; flex-direction: column; max-height: ${POPUP_MAX_HEIGHT}; overflow: hidden;">${isPopupDiagBadgeVisible() && isPopupGeoCanonicalV1On() ? `<div style="position: absolute; top: 4px; left: 4px; z-index: 10; padding: 2px 6px; border-radius: 4px; background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); font-size: 9px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; opacity: 0.85; pointer-events: none;" title="P-POPUP-2 canonical geo header + 4-bucket tag dedupe ACTIVE (preview/staging signal — will retire after ratification)">P-POPUP-2 ON</div>` : ''}
${statusBarHtml}

<div style="flex-shrink: 0;">
${buildImageSection(location, null, ownershipInfo)}
</div>

<div class="popup-scroll-body" style="flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain;">
<div style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
<div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
<h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #1a1a1a; line-height: 1.3; flex: 1;">
${location.name}
</h3>
${ownershipBadgeHtml}
</div>
${isPopupGeoCanonicalV1On()
  ? buildGeoHeaderHtml(location, { background: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' })
  : `<div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px;">
${location.continent ? `<span class="filter-link" data-filter-type="continent" data-filter-value="${location.continent}" style="background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#bae6fd'" onmouseout="this.style.background='#e0f2fe'">${location.continent}</span>` : ''}
${location.country ? `<span class="filter-link" data-filter-type="country" data-filter-value="${location.country}" style="background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#bbf7d0'" onmouseout="this.style.background='#dcfce7'">${location.country}</span>` : ''}
${location.region ? `<span class="filter-link" data-filter-type="region" data-filter-value="${location.region}" style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#fde68a'" onmouseout="this.style.background='#fef3c7'">${location.region}</span>` : ''}
${location.zone ? `<span class="filter-link" data-filter-type="zone" data-filter-value="${location.zone}" style="background: #f3e8ff; color: #7c3aed; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#e9d5ff'" onmouseout="this.style.background='#f3e8ff'">${location.zone}</span>` : ''}
</div>`}

${(!isOwn && !isCuratorPoint) ? `
<button 
class="popup-action-btn" 
data-action="add-to-collection" 
data-location-id="${location.id}"
data-location-name="${location.name}"
style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 16px; background: linear-gradient(135deg, #16a34a, #22c55e); color: white; border: none; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; margin-top: 12px; box-shadow: 0 2px 8px rgba(22, 163, 74, 0.3);"
onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 12px rgba(22, 163, 74, 0.4)'"
onmouseout="this.style.transform='none';this.style.boxShadow='0 2px 8px rgba(22, 163, 74, 0.3)'"
title="Añadir este punto a tu colección personal"
>
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
<path d="M12 5v14M5 12h14"/>
</svg>
Añadir a mi colección
</button>
` : ''}

${(!isCuratorPoint && !isNearbyPopupContext(location.id)) ? `
<div style="display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 10px; padding: 8px; background: #f9fafb; border-radius: 8px;">
<div style="display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap;">
${isVisited && visitRelevance ? `
<span 
style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; background: ${visitRelevance.bgColor}; color: ${visitRelevance.color}; border: 1px solid ${visitRelevance.borderColor}; border-radius: 10px; font-size: 9px; font-weight: 500;"
title="${visitRelevance.label}"
>
${visitRelevance.label}
</span>
` : ''}
<button 
class="popup-action-btn" 
data-action="toggle-visited" 
data-location-id="${location.id}"
style="display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; background: ${isVisited ? '#dcfce7' : (!isOwn ? '#eff6ff' : '#fff')}; color: ${isVisited ? '#166534' : (!isOwn ? '#1d4ed8' : '#6b7280')}; border: 1px solid ${isVisited ? '#86efac' : (!isOwn ? '#93c5fd' : '#e5e7eb')}; border-radius: 12px; font-size: 10px; font-weight: 500; cursor: pointer; transition: all 0.15s;"
title="${isVisited ? 'Click para desmarcar' : (!isOwn ? 'Se añadirá a tu colección automáticamente' : 'Marcar como visitado')}"
>
<svg width="10" height="10" viewBox="0 0 24 24" fill="${isVisited ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
<path d="M20 6 9 17l-5-5"/>
</svg>
${isVisited ? 'Visitado' : (!isOwn ? '+ Adoptar y Visitar' : 'Visitado')}
</button>

${(visitRelevance || canEditLocation) ? `
<div style="display: inline-flex; align-items: center; gap: 2px;" title="Tu valoración personal${!visitRelevance && canEditLocation ? ' (Admin)' : ''}">
${[1, 2, 3, 4, 5].map(star => `
<button 
class="popup-action-btn" 
data-action="set-rating" 
data-location-id="${location.id}"
data-rating="${star}"
style="background: none; border: none; padding: 0; cursor: pointer; font-size: 14px; transition: transform 0.1s; color: ${parseInt(location.customData?.user_rating || '0') >= star ? '#f59e0b' : '#d1d5db'};"
title="Valorar ${star} estrella${star > 1 ? 's' : ''}"
>${parseInt(location.customData?.user_rating || '0') >= star ? '★' : '☆'}</button>
`).join('')}
${location.customData?.user_rating ? `
<button 
class="popup-action-btn" 
data-action="clear-rating" 
data-location-id="${location.id}"
style="background: none; border: none; padding: 0 0 0 3px; cursor: pointer; font-size: 10px; color: #9ca3af;"
title="Quitar valoración"
>✕</button>
` : ''}
</div>
` : ''}
</div>
</div>
` : ''}
</div>

${location.description ? `
<div style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; background: #fafafa;">
<p style="margin: 0; font-size: 13px; color: #4b5563; line-height: 1.5; white-space: pre-wrap; max-height: 150px; overflow-y: auto;">
${location.description}
</p>
</div>
` : ''}

${isNearbyPopupContext(location.id) ? '' : buildSourceHashtagsBlock(location, ownership)}
${isNearbyPopupContext(location.id) ? '' : buildCollectionChipsPlaceholder(location)}
${isNearbyPopupContext(location.id) ? '' : buildPersonalTagsBlock(location)}

<div style="padding: 12px 16px;">
${isNearbyPopupContext(location.id) ? '' : `
<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2">
<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
<circle cx="12" cy="10" r="3"></circle>
</svg>
<span style="font-size: 12px; color: #6b7280;">
${location.coordinates.lat.toFixed(6)}, ${location.coordinates.lng.toFixed(6)}
</span>
</div>

${customDataHtml ? `
<div style="margin-top: 12px;">
<div style="font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
Datos adicionales
</div>
${customDataHtml}
${moreDataCount > 0 ? `<div style="font-size: 11px; color: #9ca3af; padding-top: 8px;">+${moreDataCount} campos más</div>` : ''}
</div>
` : ''}
`}

${(() => {
  const pt = (location.placeType ?? '').toString();
  const isRouteWaypoint = pt === 'route_waypoint' || pt.startsWith('route_') || location.customData?.is_route_waypoint === 'true';
  return (isOwn && canEditLocation && isRouteWaypoint);
})() ? `
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 10px; margin-bottom: 6px;">
<button 
class="popup-action-btn" 
data-action="view-nearby" 
data-location-id="${location.id}"
style="display: flex; align-items: center; justify-content: center; gap: 4px; padding: 7px 6px; background: linear-gradient(135deg, #fef3c7, #fde68a); color: #92400e; border: 1px solid #fcd34d; border-radius: 6px; font-size: 10px; font-weight: 600; cursor: pointer; transition: all 0.15s;"
onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 2px 8px rgba(245,158,11,0.3)'"
onmouseout="this.style.transform='none';this.style.boxShadow='none'"
title="Explorar puntos de interés cercanos"
>
<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/>
</svg>
Contexto cercano
</button>
<button 
class="popup-action-btn" 
data-action="duplicate-point" 
data-location-id="${location.id}"
data-location-name="${location.name}"
style="display: flex; align-items: center; justify-content: center; gap: 4px; padding: 7px 6px; background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 10px; font-weight: 500; cursor: pointer; transition: all 0.15s;"
onmouseover="this.style.transform='translateY(-1px)';this.style.background='#e5e7eb'"
onmouseout="this.style.transform='none';this.style.background='#f3f4f6'"
title="Crear una copia de este punto"
>
<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
</svg>
Duplicar
</button>
<button 
class="popup-action-btn" 
data-action="merge-nearby" 
data-location-id="${location.id}"
style="display: flex; align-items: center; justify-content: center; gap: 4px; padding: 7px 6px; background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 10px; font-weight: 500; cursor: pointer; transition: all 0.15s;"
onmouseover="this.style.transform='translateY(-1px)';this.style.background='#e5e7eb'"
onmouseout="this.style.transform='none';this.style.background='#f3f4f6'"
title="Fusionar con un punto cercano"
>
<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<path d="m8 6 4-4 4 4"/><path d="M12 2v10.3a4 4 0 0 1-1.172 2.872L4 22"/><path d="m20 22-5-5"/>
</svg>
Fusionar
</button>
<button 
class="popup-action-btn" 
data-action="reclassify-type" 
data-location-id="${location.id}"
style="display: flex; align-items: center; justify-content: center; gap: 4px; padding: 7px 6px; background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 10px; font-weight: 500; cursor: pointer; transition: all 0.15s;"
onmouseover="this.style.transform='translateY(-1px)';this.style.background='#e5e7eb'"
onmouseout="this.style.transform='none';this.style.background='#f3f4f6'"
title="Cambiar el tipo de lugar"
>
<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/>
</svg>
Reclasificar
</button>
</div>
` : ''}

<!-- Mount point for UnenrichedRecoveryBlock (hydrated by LocationMap on popupopen).
     Helper único: per-POI recovery block. Solo se monta si el POI no está enriquecido. -->
<div data-recovery-root="${location.id}" style="margin: 0 0 8px 0;"></div>

${actionButtonsHtml}
</div>
</div>
</div>
`;
}
