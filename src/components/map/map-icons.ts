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
  RING_COLORS,
  RING_WIDTH,
} from '@/domains/content/lib/point-health-rings';
import { getPointHeroImage } from '@/domains/content/lib/point-hero-image';

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

export const getRenderModeForZoom = (zoom: number): MarkerRenderMode => {
  if (zoom <= 9) return 'micro';
  if (zoom <= 13) return 'compact';
  if (zoom <= 16) return 'standard';
  return 'rich';
};

export const setCurrentRenderMode = (mode: MarkerRenderMode): boolean => {
  if (currentRenderMode === mode) return false;
  currentRenderMode = mode;
  return true;
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
   * Fuente única: `getTintForLocation` (collection-visibility).
   */
  collectionTint: string | null = null,
  /**
   * Ownership (Ola 2). Cuando es true, el marker es del usuario actual y
   * recibe prioridad visual: tamaño mayor en `micro`, halo blanco sutil en
   * `compact`/`standard`/`rich`. No altera la paleta de los 3 estados.
   */
  isOwn: boolean = false,
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
  const renderMode = currentRenderMode;
  if (renderMode === 'micro' && !isFocused) {
    // Tamaño fijo en vista global para garantizar progresión monotónica
    // (micro 5px < compact ~8px < standard ~12px < rich ~14px). La pertenencia
    // (`isOwn`) se diferencia solo por halo más marcado y por `mine-pane`
    // (capa superior), nunca por diámetro. Ver `.lovable/plan.md`.
    const microSize = 5;
    const dot = entry.fill_color;
    const haloStyle = isOwn
      ? 'box-shadow:0 0 0 1.25px rgba(255,255,255,1),0 0 3px rgba(0,0,0,0.4);'
      : 'box-shadow:0 0 0 1px rgba(255,255,255,0.85);opacity:0.85;';
    return L.divIcon({
      className: `custom-marker-micro${isOwn ? ' is-own' : ''}`,
      html: `<div style="width:${microSize}px;height:${microSize}px;border-radius:50%;background:${dot};${haloStyle}"></div>`,
      iconSize: [microSize, microSize],
      iconAnchor: [microSize / 2, microSize / 2],
      popupAnchor: [0, -microSize / 2],
    });
  }
  // En `compact` (z10–13) saltamos los health rings y el gradiente: SVG
  // plano con `fill_color`. Tint de colección y borde se mantienen.
  const skipHealthRings = renderMode === 'compact';
  const skipGradient = renderMode === 'compact';


  // Factor de escala por render mode (Ola 1 — arquitectura visual por zoom).
  // El tamaño base sigue saliendo de la BD (`marker_size_config`), y se
  // multiplica por un factor según modo para que la progresión sea
  // perceptible al usuario entre zoom medio (compact) y cercano (rich).
  // `micro` no llega aquí (vuelve antes con divIcon plano).
  // Progresión perceptible entre bands. Ver `mem://style/map/zoom-driven-hero`.
  // compact ≈ tamaño base (claramente visible en vista regional), rich +35%.
  const modeScale = renderMode === 'compact' ? 0.9 : renderMode === 'rich' ? 1.35 : 1;
  const baseSize = getBaseSize(entry, isRecentlyEnriched, isFocused, isSelected);
  const baseHover = getHoverSize(entry);
  const size = Math.max(6, Math.round(baseSize * modeScale));
  const hoverSize = baseHover ? Math.max(size, Math.round(baseHover * modeScale)) : baseHover;

  // Anillos de salud (rojo error / amarillo cadena rota / naranja vacío),
  // apilados de dentro hacia fuera por orden de severidad. Helper único:
  // `getPointHealthRings`. La regla "verde nunca marca error" vive dentro
  // de `hasEnrichmentFailure` y aquí se respeta automáticamente.
  const healthRings = skipHealthRings ? [] : getPointHealthRings(location);
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
      : 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))') + ownHalo;
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

  // ── Rich (z≥17) — marker = imagen Hero ─────────────────────────────────
  // En modo rich, si el POI tiene imagen Hero (enrichedData.imagen o
  // user_image_url), el marker ES la foto: cuadrado redondeado 40px con
  // borde 2px en el color del estado. Se conservan health rings, collection
  // tint y ownership como capas alrededor. focused/selected añaden un halo
  // blanco — no sustituyen la foto. Sin imagen → cae al render estándar
  // (SVG dot/pin de abajo). Si `onerror` dispara, marcamos el id en
  // `heroFailedIds` y el próximo repaint usará el SVG.
  const heroId = location?.id;
  const heroUrl = renderMode === 'rich' && heroId && !heroFailedIds.has(heroId)
    ? getPointHeroImage(location)
    : null;
  if (heroUrl) {
    const heroSize = 40;
    let heroCumulative = 0;
    const heroRingShadow = healthRings
      .map((ring) => {
        heroCumulative += RING_WIDTH;
        return ` drop-shadow(0 0 0 ${heroCumulative}px ${RING_COLORS[ring]})`;
      })
      .join('');
    const hasErrorRing = healthRings.includes('error');
    const haloHtml = (isFocused || isSelected)
      ? '<div class="poi-hero-marker__halo"></div>'
      : '';
    const ownClass = isOwn ? ' is-own' : '';
    const safeUrl = heroUrl.replace(/"/g, '&quot;');
    const safeId = String(heroId).replace(/"/g, '&quot;');
    return L.divIcon({
      className: `poi-hero-marker${isRecentlyEnriched ? ' recently-enriched' : ''}${hasErrorRing ? ' has-enrichment-error' : ''}${ownClass}`,
      html: `
      <div class="poi-hero-marker__wrap" style="--marker-state-color:${entry.fill_color}; width:${heroSize}px; height:${heroSize}px; position:relative; filter:${shadow}${heroRingShadow}; ${animationStyle}">
        ${collectionTint ? `<div class="collection-tint-ring" style="--collection-tint:${collectionTint}"></div>` : ''}
        <img class="poi-hero-marker__img" src="${safeUrl}" alt="" referrerpolicy="no-referrer" onerror="window.__markHeroFailed && window.__markHeroFailed('${safeId}'); this.style.display='none';" />
        ${haloHtml}
      </div>
      `,
      iconSize: [heroSize, heroSize],
      iconAnchor: [heroSize / 2, heroSize / 2],
      popupAnchor: [0, -heroSize / 2],
    });
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
    const hasErrorRing = healthRings.includes('error');

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
  const hasErrorRing = healthRings.includes('error');
  const ringsHtml = healthRings
    .map((ring, idx) => {
      // idx 0 = el anillo más interno (justo fuera del marker base + tint).
      // idx N = el más externo (más severo). Cada anillo ocupa RING_WIDTH px
      // hacia afuera, sin gaps.
      const innerInset = (ringCount - 1 - idx) * RING_GAP;
      return `<div style="position:absolute; top:${innerInset}px; left:${innerInset}px; right:${innerInset}px; bottom:${innerInset}px; border-radius:50%; border:${RING_WIDTH}px solid ${RING_COLORS[ring]}; box-sizing:border-box; pointer-events:none;"></div>`;
    })
    .join('');

  return L.divIcon({
    className: `custom-marker-dot${isRecentlyEnriched ? ' recently-enriched' : ''}${hasErrorRing ? ' has-enrichment-error' : ''}`,
    html: `
    <div style="width: ${containerSize}px; height: ${containerSize}px; position: relative; filter: ${shadow}; ${animationStyle} transition: transform 0.15s ease-out; transform-origin: center center;" ${hoverAttr}>
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
          <circle cx="12" cy="12" r="11" fill="${skipGradient ? applyStateColor(baseColor) : `url(#dotGrad-${location?.id || 'default'})`}" stroke="white" stroke-width="${borderWidth}"/>
        </svg>
      </div>

    </div>
    `,
    iconSize: [containerSize, containerSize],
    iconAnchor: [containerSize / 2, containerSize / 2],
    popupAnchor: [0, -containerSize / 2],
  });
};
