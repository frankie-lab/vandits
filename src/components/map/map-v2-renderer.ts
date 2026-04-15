/**
 * map-v2-renderer.ts — Renders MapFeature[] as Leaflet markers.
 * Used when Phase D flag (v2_map_features) is active.
 */

import L from 'leaflet';
import type { MapFeature } from '@/domains/v2';
import { getMarkerSizeConfig } from './useMarkerSizeConfig';
import { getLucideSvgString, getMapMarkerHtml } from '@/lib/icon-utils';

// Shape → SVG path mapping
function getShapeSvg(
  feature: MapFeature,
  size: number,
): string {
  const { shape, fillColor, borderColor, decoration } = feature;
  const half = size / 2;

  // Decorations overlay
  let decorationHtml = '';
  if (decoration?.includes('halo')) {
    decorationHtml += `<div style="position:absolute;inset:-4px;border-radius:50%;border:3px solid #facc15;pointer-events:none;"></div>`;
  }
  if (decoration?.includes('warning')) {
    decorationHtml += `<div style="position:absolute;top:-6px;right:-6px;width:14px;height:14px;background:#ef4444;border-radius:50%;border:2px solid white;display:flex;align-items:center;justify-content:center;">
      <span style="color:white;font-size:8px;font-weight:bold;">!</span>
    </div>`;
  }
  if (decoration?.includes('star')) {
    decorationHtml += `<div style="position:absolute;bottom:-6px;right:-6px;width:14px;height:14px;background:#facc15;border-radius:50%;border:2px solid white;display:flex;align-items:center;justify-content:center;">
      <span style="font-size:8px;">★</span>
    </div>`;
  }
  if (decoration?.includes('check')) {
    decorationHtml += `<div style="position:absolute;bottom:-6px;left:-6px;width:14px;height:14px;background:#22c55e;border-radius:50%;border:2px solid white;display:flex;align-items:center;justify-content:center;">
      <span style="color:white;font-size:8px;">✓</span>
    </div>`;
  }

  const border = borderColor || 'white';

  if (shape === 'teardrop') {
    // Pin-shaped marker
    return `<div style="position:relative;display:inline-block;">
      ${decorationHtml}
      <svg width="${size}" height="${Math.round(size * 1.5)}" viewBox="0 0 24 36">
        <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" 
              fill="${fillColor}" stroke="${border}" stroke-width="2"/>
        <circle cx="12" cy="12" r="4" fill="white" fill-opacity="0.9"/>
      </svg>
    </div>`;
  }

  if (shape === 'circle-solid') {
    return `<div style="position:relative;display:inline-block;">
      ${decorationHtml}
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${fillColor};border:2px solid ${border};box-shadow:0 2px 4px rgba(0,0,0,0.2);"></div>
    </div>`;
  }

  if (shape === 'circle-hollow') {
    return `<div style="position:relative;display:inline-block;">
      ${decorationHtml}
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:transparent;border:3px solid ${fillColor};box-shadow:0 2px 4px rgba(0,0,0,0.2);"></div>
    </div>`;
  }

  // circle-dashed
  return `<div style="position:relative;display:inline-block;">
    ${decorationHtml}
    <div style="width:${size}px;height:${size}px;border-radius:50%;background:transparent;border:3px dashed ${fillColor};box-shadow:0 2px 4px rgba(0,0,0,0.15);"></div>
  </div>`;
}

function createV2Icon(feature: MapFeature): L.DivIcon {
  const cfg = getMarkerSizeConfig();
  const isSelected = feature.state.isSelected;
  const baseSize = isSelected
    ? (cfg.default?.base_selected ?? 20)
    : (cfg.default?.base_normal ?? 14);

  const size = feature.shape === 'teardrop' ? baseSize + 6 : baseSize;
  const html = getShapeSvg(feature, size);

  const anchor = feature.shape === 'teardrop'
    ? [size / 2, Math.round(size * 1.5)]
    : [size / 2, size / 2];

  return L.divIcon({
    className: `v2-marker ${feature.state.isSelected ? 'v2-marker-selected' : ''}`,
    html,
    iconSize: [size, feature.shape === 'teardrop' ? Math.round(size * 1.5) : size],
    iconAnchor: anchor as [number, number],
  });
}

/**
 * Renders V2 MapFeature[] onto a Leaflet map, returning the created markers.
 */
export function renderV2Features(
  map: L.Map,
  features: MapFeature[],
  onFeatureClick?: (feature: MapFeature) => void,
): Map<string, L.Marker> {
  const markers = new Map<string, L.Marker>();

  for (const feature of features) {
    const icon = createV2Icon(feature);
    const marker = L.marker([feature.latitude, feature.longitude], { icon });

    // Simple popup with feature name
    marker.bindPopup(`
      <div style="padding:8px;min-width:150px;">
        <div style="font-weight:600;font-size:13px;">${feature.name}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;">
          ${feature.entityType === 'waypoint' ? 'Waypoint' : 'Place'} · ${feature.ownershipSource}
        </div>
      </div>
    `, {
      maxWidth: 300,
      className: 'custom-popup',
    });

    if (onFeatureClick) {
      marker.on('click', () => onFeatureClick(feature));
    }

    marker.addTo(map);
    markers.set(feature.id, marker);
  }

  return markers;
}

/**
 * Clears V2 markers from the map.
 */
export function clearV2Features(
  map: L.Map,
  markers: Map<string, L.Marker>,
): void {
  markers.forEach(marker => map.removeLayer(marker));
  markers.clear();
}
