/**
 * map-icons — single source for the on-map marker SVG.
 *
 * Norma transversal (2026-04-19):
 *  - Three visual states only: enriched (green), imported (grey), empty (orange).
 *  - Catálogo común heredado/vinculado = imported (grey). No "azul cielo".
 *  - Followed-user paleta removed: every point follows the same visual rule.
 *  - Doc status only governs visibility (handled elsewhere), never paleta.
 */
import L from 'leaflet';
import { GeoLocation } from '@/types/location';
import { adjustHslLightness } from './map-utils';
import { getMarkerSizeConfig, getBaseSize, getHoverSize } from './useMarkerSizeConfig';
import { getMarkerStateRules, getStateColor, getStateShadow, getStateBorderWidth } from './useMarkerStateRules';
import { getPointConfigKey } from '@/domains/content/lib/point-visual-state';
import {
  getPointHealthRings,
  getCoherenceGlyph,
  getCoherenceGlyphPath,
  RING_COLORS,
  RING_WIDTH,
} from '@/domains/content/lib/point-health-rings';
import { getPointHeroImage } from '@/domains/content/lib/point-hero-image';
import { ZOOM_THRESHOLDS } from '@/design-system/map/rules/zoom-thresholds';
import { tokens } from '@/design-system/tokens';
import { getOwnerStrokeColor } from './owner-stroke';

/**
 * Helper único: factor de escala por zoom (no solo por banda).
 * Lee `poi.renderScale.byZoom.zNN` con fallback a la escala por banda.
 * Garantiza una rampa continua z11→z16 sin saltos de >2× entre niveles.
 */
const getModeScaleForZoom = (zoom: number, mode: MarkerRenderMode): number => {
  const byZoom = (tokens as any)?.poi?.renderScale?.byZoom;
  const zKey = `z${Math.round(zoom)}`;
  const v = byZoom?.[zKey];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  // Fallback por banda (valores históricos).
  if (mode === 'compact') return 0.9;
  if (mode === 'standard') return 1.0;
  if (mode === 'rich') return 1.1;
  return 1.0;
};

/**
 * Sombra base por modo. Doble capa SOLO en standard/rich; compact mantiene
 * sombra simple para no ensuciar vistas de densidad. Tokenizado en
 * `poi.shadow.{compact,standard,rich}`.
 */
const getShadowForMode = (mode: MarkerRenderMode): string => {
  const shadowTokens = (tokens as any)?.poi?.shadow;
  if (mode === 'rich') return shadowTokens?.rich ?? 'drop-shadow(0 1px 1px rgba(0,0,0,0.35)) drop-shadow(0 3px 6px rgba(0,0,0,0.22))';
  if (mode === 'standard') return shadowTokens?.standard ?? 'drop-shadow(0 1px 1px rgba(0,0,0,0.35)) drop-shadow(0 3px 6px rgba(0,0,0,0.22))';
  return shadowTokens?.compact ?? 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))';
};

/**
 * IDs cuya hero image ha fallado en runtime. Como un divIcon no puede
 * re-pintarse a sí mismo desde `onerror`, marcamos el ID aquí; la siguiente
 * llamada a `createCustomIcon` salta la rama hero y devuelve el SVG estándar.
 * El refresh natural por `zoomend` / `map-render-mode-changed` los repinta.
 */
const heroFailedIds = new Set<string>();
if (typeof window !== 'undefined') {
  (window as any).__markHeroFailed = (id: string) => {
    if (id) heroFailedIds.add(id);
  };
}

// Anillos de salud (5px) apilados POR FUERA del marker y del collection-tint.
// Helper único: `getPointHealthRings`. No sustituyen al stroke blanco ni al
// tinte de colección — son una capa aditiva. Ver
// `mem://style/map/health-rings-rule`.
const RING_GAP = RING_WIDTH;

/**
 * Modo de render por zoom (Ola 1 — arquitectura visual por zoom).
 * Single source of truth: `currentRenderMode` se actualiza desde `LocationMap`
 * en cada `zoomend`. `createCustomIcon` lo lee internamente — los call-sites
 * no cambian. Las invariantes (3 estados, health rings, collection tint) se
 * mantienen en `standard`/`rich`; se simplifican en `compact` y desaparecen
 * en `micro` para soportar zoom global con miles de puntos.
 */
export type MarkerRenderMode = 'micro' | 'compact' | 'standard' | 'rich';

let currentRenderMode: MarkerRenderMode = 'standard';
let currentZoom = 12;

export const getRenderModeForZoom = (zoom: number): MarkerRenderMode => {
  // Fuente única: tokens/map.json (ZOOM_THRESHOLDS). NO hardcodear umbrales aquí.
  // Bandas: micro ≤ microMax · compact ≤ compactMax · standard ≤ standardMax · rich ≥ richMin.
  // standard existe como banda real (z12–14) — la polaroid solo entra en z≥15 (rich).
  const { microMax, compactMax, standardMax, richMin } = ZOOM_THRESHOLDS;
  if (zoom <= microMax) return 'micro';
  if (zoom <= compactMax) return 'compact';
  if (zoom <= standardMax) return 'standard';
  if (zoom >= richMin) return 'rich';
  return 'rich';
};

export const setCurrentRenderMode = (mode: MarkerRenderMode): boolean => {
  if (currentRenderMode === mode) return false;
  currentRenderMode = mode;
  return true;
};

export const setCurrentZoom = (zoom: number): void => {
  currentZoom = zoom;
};

/**
 * Sincroniza `currentZoom` (y por tanto el render mode derivado) leyendo
 * directamente del mapa. Llamar SIEMPRE desde cualquier call-site que cree
 * markers fuera del effect principal de `LocationMap` (preview, photo,
 * route, etc.) para evitar que entren con el default `standard` y rompan
 * la regla canónica de bandas por zoom.
 */
export const syncRenderModeFromMap = (map: L.Map | null | undefined): void => {
  if (!map) return;
  try {
    const z = map.getZoom();
    if (typeof z === 'number' && Number.isFinite(z)) {
      currentZoom = z;
      currentRenderMode = getRenderModeForZoom(z);
    }
  } catch { /* noop */ }
};

export const getCurrentRenderMode = (): MarkerRenderMode => currentRenderMode;

export const createCustomIcon = (
  isSelected: boolean,
  isFocused: boolean,
  _isEnriched: boolean = false,
  location?: GeoLocation,
  _criteriaTimestamp: number = 0,
  isRecentlyEnriched: boolean = false,
  /**
   * Color del anillo de colección. Si se pasa, el anillo se renderiza dentro
   * del divIcon — sobrevive a cluster, realtime y force-update.
   * Fuente única: `getTintForLocation` (collection-visibility). Los call-sites
   * deben pasar `null` si el POI no es del caller (PR-1 curated sharing).
   */
  collectionTint: string | null = null,
  /**
   * Ownership (Ola 2). Cuando es true, el marker es del usuario actual y
   * recibe prioridad visual: tamaño mayor en `micro`, halo blanco sutil en
   * `compact`/`standard`/`rich`. No altera la paleta de los 3 estados.
   */
  isOwn: boolean = false,
  /**
   * Caller actual (PR-1 curated sharing boundary). Cuando se pasa, los
   * health rings se omiten para POIs ajenos (helper único `getPointHealthRings`).
   * Sin singleton — argumento explícito para mantener trazabilidad.
   */
  currentUserId: string | null = null,
) => {
  const sizeConfig = getMarkerSizeConfig();
  const stateRules = getMarkerStateRules();

  // Single transversal classification: enriched | imported | empty
  const configKey = getPointConfigKey(location);
  const entry = sizeConfig[configKey] || sizeConfig.empty || sizeConfig.imported;

  // ── Render mode por zoom (Ola 1) ───────────────────────────────────────
  // En `micro` (z≤9) devolvemos un divIcon plano — sin SVG, gradiente, tint
  // ni health rings — para soportar miles de puntos en vista global sin
  // saturación visual ni coste DOM por marker. Los 3 estados (verde/gris/
  // naranja) se preservan: la paleta canónica vive en `entry.fill_color`.
  // Ola 2: en `micro`, los puntos propios (`isOwn`) son mayores y con halo
  // más visible para distinguirlos sobre el ruido global.
  // Regla única: el zoom manda. `isFocused` (1 punto, click directo) puede
  // escapar para destacar, pero la selección masiva NO — si no, al filtrar
  // miles de puntos en vista global se romperían los 5px del modo micro.
  // Excepción conservadora: `isFocused` (click directo, 1 punto) puede
  // escapar de su banda y entrar en `rich` para destacar. `isSelected` NO
  // escapa — selección masiva (filtros, ruta) no debe disparar polaroids.
  //
  // FIX TRANSVERSAL: derivamos el modo desde `currentZoom` directamente, no
  // desde el singleton `currentRenderMode`. Antes ambos singletons podían
  // desincronizarse: si un call-site creaba un marker fuera del flujo
  // principal antes del primer `zoomend`, `currentRenderMode` quedaba en su
  // default (`standard`) y el marker entraba en la rama SVG aunque el zoom
  // real fuera 8 (banda micro). Resultado: POIs grandes con tinte de
  // colección mezclados con micro-dots correctos al mismo zoom. Single
  // source of truth = `currentZoom` (actualizado en cada `zoomend` y por
  // sync defensivo desde call-sites paralelos).
  const renderMode: MarkerRenderMode = isFocused ? 'rich' : getRenderModeForZoom(currentZoom);

  // ── Followed-user gate (PR-SOCIAL-2A) ──────────────────────────────────
  // Norma canónica: POIs propios = círculo (con todas sus variables).
  //                 POIs de seguidos = triángulo invertido (sin rings,
  //                 sin tint, stroke fino = identidad del owner).
  // Helper único: getOwnerStrokeColor(uid). Ver mem://style/map/followed-poi-grammar.
  const ownerUid = (location as any)?.userId ?? null;
  const isFollowedPoi = !isOwn && !!currentUserId && !!ownerUid && ownerUid !== currentUserId;
  if (isFollowedPoi) {
    // Para seguidos, anular tint y currentUserId-driven rings: dominio privado del owner.
    collectionTint = null;
  }
  if (renderMode === 'micro') {
    // Rampa explícita por zoom (z≤3→2, z4→3, z5→4). Cap micro = 4px en
    // z5 antes de saltar a SVG compact en z6. La pertenencia (`isOwn`)
    // se diferencia solo por halo más marcado, nunca por diámetro.
    const microSize =
      currentZoom <= 3 ? 2 :
      currentZoom === 4 ? 3 :
      4; // z5 — último escalón micro antes de compact
    const dot = entry.fill_color;
    const haloStyle = isOwn ? '' : 'opacity:0.85;';
    // Followed micro: triángulo invertido CSS (clip-path) en lugar de círculo.
    if (isFollowedPoi) {
      const stroke = getOwnerStrokeColor(ownerUid);
      return L.divIcon({
        className: `custom-marker-micro is-followed`,
        html: `<div style="width:${microSize + 2}px;height:${microSize + 2}px;background:${dot};clip-path:polygon(0 0,100% 0,50% 100%);border:0.5px solid ${stroke};opacity:0.9;"></div>`,
        iconSize: [microSize + 2, microSize + 2],
        iconAnchor: [(microSize + 2) / 2, (microSize + 2) / 2],
        popupAnchor: [0, -(microSize + 2) / 2],
      });
    }
    return L.divIcon({
      className: `custom-marker-micro${isOwn ? ' is-own' : ''}`,
      html: `<div style="width:${microSize}px;height:${microSize}px;border-radius:50%;background:${dot};${haloStyle}"></div>`,
      iconSize: [microSize, microSize],
      iconAnchor: [microSize / 2, microSize / 2],
      popupAnchor: [0, -microSize / 2],
    });
  }
  // En `compact` (z6–8) saltamos solo el gradiente: SVG plano con
  // `fill_color`. Tint de colección, borde y health rings se mantienen
  // (los aros entran desde z6 para detectar problemas pronto — micro
  // sigue sin rings porque ya retornó arriba con dots de 2–4px).
  // En `standard` (z9–11) vuelven gradiente + doble sombra.
  // En `rich` (z≥12) se añade polaroid hero.
  // Followed: NUNCA muestra rings ni tint (curated-only sharing boundary).
  const skipHealthRings = isFollowedPoi;
  const skipGradient = renderMode === 'compact' || isFollowedPoi;


  // Factor de escala por render mode (Ola 1 — arquitectura visual por zoom).
  // El tamaño base sigue saliendo de la BD (`marker_size_config`), y se
  // multiplica por un factor según modo para que el dot crezca de forma
  // perceptible al acercarse. `rich` > `standard` > `compact` para que la
  // polaroid (z≥14) descanse sobre un dot pleno, no aplastado.
  // Factor de escala por zoom (no solo por banda). Lookup tokenizado en
  // `poi.renderScale.byZoom` con fallback a la escala por banda. Garantiza
  // rampa continua z9→z16 (0.85 → 0.95 → 1.00 → 1.05 → 1.10 → 1.15) sin
  // saltos perceptibles entre niveles consecutivos.
  const modeScale = getModeScaleForZoom(currentZoom, renderMode);
  const baseSize = getBaseSize(entry, isRecentlyEnriched, isFocused, isSelected);
  const baseHover = getHoverSize(entry);
  const size = Math.max(6, Math.round(baseSize * modeScale));
  const hoverSize = baseHover ? Math.max(size, Math.round(baseHover * modeScale)) : baseHover;

  // Anillos de salud (rojo error / amarillo cadena rota / naranja vacío),
  // apilados de dentro hacia fuera por orden de severidad. Helper único:
  // `getPointHealthRings`. La regla "verde nunca marca error" vive dentro
  // de `hasEnrichmentFailure` y aquí se respeta automáticamente.
  const healthRings = skipHealthRings ? [] : getPointHealthRings(location, currentUserId);
  const ringCount = healthRings.length;
  const ringPad = ringCount > 0 ? ringCount * RING_GAP + 2 : 0;
  const containerSize = size + ringPad * 2;

  const animationStyle = isRecentlyEnriched
    ? 'animation: enriched-celebrate 3.5s ease-out;'
    : isFocused
    ? 'animation: pulse 1s ease-in-out infinite;'
    : '';

  const currentState = isRecentlyEnriched ? 'recent' : isFocused ? 'focused' : isSelected ? 'selected' : 'normal';
  // Selección masiva (filtros): NO altera la paleta de estado verde/gris/naranja.
  // Solo aporta un halo blanco sutil + borde algo más grueso. Focused/recent
  // siguen pudiendo modular color porque actúan sobre 1 punto puntual.
  const isMassSelect = currentState === 'selected';
  // Halo de propiedad (Ola 2): los puntos del usuario reciben un drop-shadow
  // blanco fino (~1px) que se acumula con el shadow base. No altera color ni
  // tamaño en compact/standard/rich — solo da prioridad visual sutil.
  const ownHalo = isOwn && !isMassSelect ? ' drop-shadow(0 0 0 1px rgba(255,255,255,0.9))' : '';
  const shadow = (isMassSelect
    ? 'drop-shadow(0 0 0 1.5px rgba(255,255,255,0.95)) drop-shadow(0 1px 3px rgba(0,0,0,0.35))'
    : currentState !== 'normal'
      ? getStateShadow(currentState, '#000000', stateRules)
      : getShadowForMode(renderMode)) + ownHalo;
  const baseBorderWidth = getStateBorderWidth(currentState, stateRules);
  const borderWidth = isMassSelect ? Math.max(2, baseBorderWidth) : baseBorderWidth;

  const applyStateColor = (hex: string): string => {
    if (currentState === 'normal' || isMassSelect) return hex;
    return getStateColor(hex, currentState, stateRules);
  };

  // Regla canónica por zoom (ver `mem://style/map/zoom-driven-hero`):
  //   • La imagen Hero aparece SOLO en el hover Polaroid (z≥14) y como
  //     marker en `rich` (z≥17, rama heroUrl más abajo).
  //   • NO se pinta miniatura circular sobre el marker focused/selected.
  //   La antigua `focused-thumbnail-rule` queda deprecada.


  const baseColor = entry.fill_color;
  const baseColorLight = entry.fill_color_light || adjustHslLightness(baseColor, 15);
  const scaleRatio = hoverSize ? hoverSize / size : 1;
  const hoverAttr = scaleRatio > 1
    ? `onmouseenter="this.style.transform='scale(${scaleRatio.toFixed(2)})'" onmouseleave="this.style.transform='scale(1)'"`
    : '';

  // ── Rich (z≥richMin) — polaroid SIEMPRE encima del dot canónico ─────────
  // Regla canónica: TODO POI muestra polaroid en `rich`. Con foto Hero real
  // → `<img>`. Sin foto (o tras fallo `onerror`) → placeholder con icono
  // imagen sobre fondo muted. El dot canónico debajo no cambia: sigue
  // siendo la coordenada real, el área clicable y el host de health rings
  // + collection tint. Ver `mem://style/map/zoom-driven-hero`.
  let polaroidHtml = '';
  if (renderMode === 'rich') {
    const heroId = location?.id;
    const heroUrl = heroId && !heroFailedIds.has(heroId)
      ? getPointHeroImage(location, { isOwn })
      : null;
    const cardSize = 50;
    const pointerH = 6;
    const polaroidW = cardSize;
    const polaroidH = cardSize + pointerH;
    const ownClass = isOwn ? ' is-own' : '';
    const safeId = heroId ? String(heroId).replace(/"/g, '&quot;') : '';
    const safeUrl = heroUrl ? heroUrl.replace(/"/g, '&quot;') : '';
    // `onerror` solo marca el fallo y oculta el `<img>` — el placeholder
    // hermano queda visible automáticamente (está debajo, mismo `inset:0`).
    const onerror = `window.__markHeroFailed && window.__markHeroFailed('${safeId}'); this.style.display='none';`;
    // Lucide `image` icon inline (placeholder). Se renderiza SIEMPRE; si
    // hay `<img>` válido, queda tapado. Al fallar el `<img>` (display:none)
    // emerge sin re-render del divIcon.
    const placeholderSvg = `<svg class="poi-hero-marker__placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`;
    const imgHtml = heroUrl
      ? `<img class="poi-hero-marker__img" src="${safeUrl}" alt="" referrerpolicy="no-referrer" onerror="${onerror}" />`
      : '';
    // Coherence glyph (Health Rings v2): solo cuando bucket=review y kind
    // original=coherence con mismatchKind. Badge magenta circular 14×14
    // en esquina superior derecha de la polaroid. SVG path estático
    // (Lucide MapPin/Type) — cero React per marker.
    const glyph = getCoherenceGlyph(location);
    const glyphHtml = glyph
      ? `<div style="position:absolute; top:-4px; right:-4px; width:14px; height:14px; border-radius:50%; background:hsl(var(--poi-health-review) / 0.95); display:flex; align-items:center; justify-content:center; pointer-events:none; box-shadow:0 0 0 1.5px hsl(var(--background));"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${getCoherenceGlyphPath(glyph)}</svg></div>`
      : '';
    polaroidHtml = `
      <div class="poi-hero-marker poi-hero-marker--addon${ownClass}" style="position:absolute; left:50%; bottom:calc(100% + 8px); transform:translateX(-50%); width:${polaroidW}px; height:${polaroidH}px; pointer-events:none; --marker-state-color:${entry.fill_color};">
        <div class="poi-hero-marker__card">
          <div class="poi-hero-marker__photo">
            <div class="poi-hero-marker__placeholder">${placeholderSvg}</div>
            ${imgHtml}
          </div>
          ${glyphHtml}
        </div>
        <svg class="poi-hero-marker__pointer" width="14" height="${pointerH + 1}" viewBox="0 0 14 7" aria-hidden="true">
          <path d="M0 0 H14 L7 7 Z" fill="hsl(var(--background))" stroke="var(--marker-state-color)" stroke-width="1" stroke-linejoin="miter"/>
          <path d="M1 0 H13" stroke="hsl(var(--background))" stroke-width="1.4"/>
        </svg>
      </div>`;
  }

  // Pin (teardrop) shape — only when explicitly configured for this state
  if (entry.marker_shape === 'pin') {
    const pinHeight = size;
    const pinWidth = pinHeight * 0.7;
    const dotSize = pinHeight * 0.25;

    // Para pin (lágrima), cada anillo de salud se simula con un drop-shadow
    // plano que respeta la silueta. Se apilan de dentro a fuera. La regla
    // "verde nunca marca error" vive en `hasEnrichmentFailure` → ya filtrada.
    let cumulativeOffset = 0;
    const ringShadow = healthRings
      .map((ring) => {
        cumulativeOffset += RING_WIDTH;
        return ` drop-shadow(0 0 0 ${cumulativeOffset}px ${RING_COLORS[ring]})`;
      })
      .join('');
    const hasErrorRing = healthRings.includes('hardError') || healthRings.includes('review');

    return L.divIcon({
      className: `custom-marker${isRecentlyEnriched ? ' recently-enriched' : ''}${hasErrorRing ? ' has-enrichment-error' : ''}`,
      html: `
      <div style="width: ${pinWidth}px; height: ${pinHeight}px; position: relative; filter: ${shadow}${ringShadow}; ${animationStyle} transition: transform 0.15s ease-out; transform-origin: center bottom;" ${hoverAttr.replace("'1'", "'1'")}>
        ${collectionTint ? `<div class="collection-tint-ring" style="--collection-tint:${collectionTint}"></div>` : ''}
        <svg width="${pinWidth}" height="${pinHeight}" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          ${skipGradient ? '' : `<defs>
            <linearGradient id="pinGrad-${location?.id || 'default'}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:${applyStateColor(baseColorLight)}" />
              <stop offset="100%" style="stop-color:${applyStateColor(baseColor)}" />
            </linearGradient>
          </defs>`}
          <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="${skipGradient ? applyStateColor(baseColor) : `url(#pinGrad-${location?.id || 'default'})`}" stroke="white" stroke-width="${borderWidth}"/>
          <circle cx="12" cy="12" r="${dotSize}" fill="white" fillOpacity="0.95"/>
        </svg>

      </div>
      `,
      iconSize: [pinWidth, pinHeight],
      iconAnchor: [pinWidth / 2, pinHeight],
      popupAnchor: [0, -pinHeight + 4],
    });
  }

  // Default: small circle (the norm for all three states).
  // Los anillos de salud se renderizan como divs absolutos concéntricos
  // alrededor del SVG base, apilados de dentro hacia fuera por severidad.
  // El stroke blanco interior y el `collection-tint-ring` no se tocan: la
  // capa de salud va SIEMPRE por fuera de ambos. `containerSize` se expande
  // para que el icono siga centrado y el popupAnchor sea correcto.
  // En modo `rich` se inyecta además la polaroid como capa flotante encima
  // del dot (pointer-events: none, no afecta al click ni al anchor).
  const hasErrorRing = healthRings.includes('hardError') || healthRings.includes('review');
  const ringsHtml = healthRings
    .map((ring, idx) => {
      const innerInset = (ringCount - 1 - idx) * RING_GAP;
      return `<div style="position:absolute; top:${innerInset}px; left:${innerInset}px; right:${innerInset}px; bottom:${innerInset}px; border-radius:50%; border:${RING_WIDTH}px solid ${RING_COLORS[ring]}; box-sizing:border-box; pointer-events:none;"></div>`;
    })
    .join('');

  return L.divIcon({
    className: `custom-marker-dot${isRecentlyEnriched ? ' recently-enriched' : ''}${hasErrorRing ? ' has-enrichment-error' : ''}${polaroidHtml ? ' has-polaroid' : ''}`,
    html: `
    <div style="width: ${containerSize}px; height: ${containerSize}px; position: relative; filter: ${shadow}; ${animationStyle} transition: transform 0.15s ease-out; transform-origin: center center; overflow: visible;" ${hoverAttr}>
      ${polaroidHtml}
      ${ringsHtml}
      <div style="position:absolute; left:${ringPad}px; top:${ringPad}px; width:${size}px; height:${size}px;">
        ${collectionTint ? `<div class="collection-tint-ring" style="--collection-tint:${collectionTint}"></div>` : ''}
        <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          ${skipGradient ? '' : `<defs>
            <linearGradient id="dotGrad-${location?.id || 'default'}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:${applyStateColor(baseColorLight)}" />
              <stop offset="100%" style="stop-color:${applyStateColor(baseColor)}" />
            </linearGradient>
          </defs>`}
          ${isFollowedPoi
            ? `<polygon points="2,3 22,3 12,22" fill="${applyStateColor(baseColor)}" stroke="${getOwnerStrokeColor(ownerUid)}" stroke-width="1.5" stroke-linejoin="round"/>`
            : `<circle cx="12" cy="12" r="11" fill="${skipGradient ? applyStateColor(baseColor) : `url(#dotGrad-${location?.id || 'default'})`}" stroke="white" stroke-width="${borderWidth}"/>`
          }
        </svg>
      </div>

    </div>
    `,
    iconSize: [containerSize, containerSize],
    iconAnchor: [containerSize / 2, containerSize / 2],
    popupAnchor: [0, -containerSize / 2],
  });
};
