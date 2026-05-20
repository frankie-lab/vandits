/**
 * MaturityBadgeLayer — Capa diagnóstica Leaflet (admin-gated, OFF por defecto).
 *
 * Mantiene un `L.layerGroup` paralelo a la capa de markers canónicos. NO
 * sustituye markers, NO captura clics (`interactive:false` +
 * `pointer-events:none`), NO toca el SVG del POI ni `createCustomIcon`.
 *
 * El padre (`LocationMap`) controla cuándo montar este componente; si el
 * toggle/capability están OFF, este componente no se monta y el layer
 * group nunca se crea.
 */

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { GeoLocation } from '@/types/location';
import type { MarkerRenderMode } from './map-icons';
import { computePoiMaturity } from '@/domains/content/lib/poi-maturity';
import {
  resolveMaturityBadgeStyle,
  shouldRenderMaturityBadge,
} from '@/shared/diagnostics/poi-maturity-overlay';

interface Props {
  map: L.Map | null;
  locations: GeoLocation[];
  viewerUid: string | null;
  renderMode: MarkerRenderMode;
  enabled: boolean;
}

function buildBadgeIcon(level: number): L.DivIcon {
  const { bg, label } = resolveMaturityBadgeStyle(level as 0);
  // Chip circular 16px, blanco con text-shadow, anclado arriba-derecha del marker.
  const html = `
    <div
      data-poi-maturity-badge="${label}"
      style="
        width: 18px; height: 18px;
        border-radius: 9999px;
        background: ${bg};
        color: #fff;
        font: 700 10px/18px system-ui, -apple-system, sans-serif;
        text-align: center;
        box-shadow: 0 1px 2px rgba(0,0,0,0.45);
        text-shadow: 0 1px 1px rgba(0,0,0,0.55);
        pointer-events: none;
        transform: translate(10px, -22px);
      "
    >${label}</div>
  `;
  return L.divIcon({
    className: 'poi-maturity-badge',
    html,
    iconSize: [18, 18],
    iconAnchor: [0, 0],
  });
}

export default function MaturityBadgeLayer({
  map,
  locations,
  viewerUid,
  renderMode,
  enabled,
}: Props) {
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!map) return;
    if (!enabled) return;

    const group = L.layerGroup().addTo(map);
    layerRef.current = group;

    for (const loc of locations) {
      if (!shouldRenderMaturityBadge({ enabled, renderMode, viewerUid, loc })) {
        continue;
      }
      const lat = loc.coordinates?.lat;
      const lng = loc.coordinates?.lng;
      if (typeof lat !== 'number' || typeof lng !== 'number') continue;
      const level = computePoiMaturity({
        name: loc.name,
        latitude: lat,
        longitude: lng,
        country: loc.country ?? null,
        continent: loc.continent ?? null,
        region: loc.region ?? null,
        zone: loc.zone ?? null,
        description: loc.description ?? null,
        enrichedData: loc.enrichedData ?? null,
        enrichmentStatus: loc.enrichmentStatus ?? null,
        geoHealth: loc.geoHealth ?? null,
        placeType: loc.placeType ?? null,
      });
      const marker = L.marker([lat, lng], {
        icon: buildBadgeIcon(level),
        interactive: false,
        keyboard: false,
        zIndexOffset: 1000,
      });
      group.addLayer(marker);
    }

    return () => {
      if (layerRef.current) {
        layerRef.current.clearLayers();
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, locations, viewerUid, renderMode, enabled]);

  return null;
}
