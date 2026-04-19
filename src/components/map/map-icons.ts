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

export const createCustomIcon = (
  isSelected: boolean,
  isFocused: boolean,
  _isEnriched: boolean = false,
  location?: GeoLocation,
  _criteriaTimestamp: number = 0,
  isRecentlyEnriched: boolean = false,
) => {
  const sizeConfig = getMarkerSizeConfig();
  const stateRules = getMarkerStateRules();

  // Single transversal classification: enriched | imported | empty
  const configKey = getPointConfigKey(location);
  const entry = sizeConfig[configKey] || sizeConfig.empty || sizeConfig.imported;

  const size = getBaseSize(entry, isRecentlyEnriched, isFocused, isSelected);
  const hoverSize = getHoverSize(entry);

  const animationStyle = isRecentlyEnriched
    ? 'animation: enriched-celebrate 3.5s ease-out;'
    : isFocused
    ? 'animation: pulse 1s ease-in-out infinite;'
    : '';

  const currentState = isRecentlyEnriched ? 'recent' : isFocused ? 'focused' : isSelected ? 'selected' : 'normal';
  const shadow = currentState !== 'normal'
    ? getStateShadow(currentState, '#000000', stateRules)
    : 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))';
  const borderWidth = getStateBorderWidth(currentState, stateRules);

  const applyStateColor = (hex: string): string => {
    if (currentState === 'normal') return hex;
    return getStateColor(hex, currentState, stateRules);
  };

  const baseColor = entry.fill_color;
  const baseColorLight = entry.fill_color_light || adjustHslLightness(baseColor, 15);
  const scaleRatio = hoverSize ? hoverSize / size : 1;
  const hoverAttr = scaleRatio > 1
    ? `onmouseenter="this.style.transform='scale(${scaleRatio.toFixed(2)})'" onmouseleave="this.style.transform='scale(1)'"`
    : '';

  // Pin (teardrop) shape — only when explicitly configured for this state
  if (entry.marker_shape === 'pin') {
    const pinHeight = size;
    const pinWidth = pinHeight * 0.7;
    const dotSize = pinHeight * 0.25;

    return L.divIcon({
      className: `custom-marker${isRecentlyEnriched ? ' recently-enriched' : ''}`,
      html: `
      <div style="width: ${pinWidth}px; height: ${pinHeight}px; position: relative; filter: ${shadow}; ${animationStyle} transition: transform 0.15s ease-out; transform-origin: center bottom;" ${hoverAttr.replace("'1'", "'1'")}>
        <svg width="${pinWidth}" height="${pinHeight}" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="pinGrad-${location?.id || 'default'}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:${applyStateColor(baseColorLight)}" />
              <stop offset="100%" style="stop-color:${applyStateColor(baseColor)}" />
            </linearGradient>
          </defs>
          <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="url(#pinGrad-${location?.id || 'default'})" stroke="white" stroke-width="${borderWidth}"/>
          <circle cx="12" cy="12" r="${dotSize}" fill="white" fillOpacity="0.95"/>
        </svg>
      </div>
      `,
      iconSize: [pinWidth, pinHeight],
      iconAnchor: [pinWidth / 2, pinHeight],
      popupAnchor: [0, -pinHeight + 4],
    });
  }

  // Default: small circle (the norm for all three states)
  return L.divIcon({
    className: `custom-marker-dot${isRecentlyEnriched ? ' recently-enriched' : ''}`,
    html: `
    <div style="width: ${size}px; height: ${size}px; position: relative; filter: ${shadow}; ${animationStyle} transition: transform 0.15s ease-out; transform-origin: center center;" ${hoverAttr}>
      <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="dotGrad-${location?.id || 'default'}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${applyStateColor(baseColorLight)}" />
            <stop offset="100%" style="stop-color:${applyStateColor(baseColor)}" />
          </linearGradient>
        </defs>
        <circle cx="12" cy="12" r="11" fill="url(#dotGrad-${location?.id || 'default'})" stroke="white" stroke-width="${borderWidth}"/>
      </svg>
    </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
};
