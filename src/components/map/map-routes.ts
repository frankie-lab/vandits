/**
 * Map Routes — Route rendering, advisor preview, and journey preview.
 * Extracted from LocationMap.tsx for maintainability.
 */

import L from 'leaflet';
import { createFlightArcCoords, calculateSegmentBearing } from './map-utils';
import { getLucideSvgString, getMapMarkerHtml, getStopTypeIconKey } from '@/lib/icon-utils';
import { getMarkerSizeConfig } from './useMarkerSizeConfig';

/** Resolve route colors from the marker size config (Back Office). */
function getRouteColors() {
  const cfg = getMarkerSizeConfig();
  return {
    forward: cfg.own_enriched?.fill_color || '#22c55e',
    returnLeg: cfg.own_empty?.fill_color || '#f97316',
    flight: cfg.druid_enriched?.fill_color || '#a855f7',
    ferry: cfg.followed_enriched?.fill_color || '#3b82f6',
  };
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RouteRefs {
  mapRef: React.MutableRefObject<L.Map | null>;
  routeLayersRef: React.MutableRefObject<L.Layer[]>;
  routeGroupRef: React.MutableRefObject<L.LayerGroup | null>;
  advisorPreviewGroupRef: React.MutableRefObject<L.LayerGroup | null>;
  journeyPreviewGroupRef: React.MutableRefObject<L.LayerGroup | null>;
}

// ─── Route group selection ───────────────────────────────────────────────────

export function highlightSelectedRouteGroup(routeLayers: L.Layer[], groupId: string) {
  (window as any).__selectedRouteGroup = groupId;

  routeLayers.forEach((layer: any) => {
    if (!layer._routeGroup || layer._baseOpacity == null || typeof layer.setStyle !== 'function') return;

    if (layer._routeGroup === groupId) {
      layer.setStyle({ opacity: 1, weight: layer._baseWeight + 2 });
    } else {
      layer.setStyle({ opacity: 0, weight: 0 });
    }
  });
}

export function dispatchRouteLayerSelection(routeLayers: L.Layer[], layer: any) {
  if (layer._routeGroup) {
    highlightSelectedRouteGroup(routeLayers, layer._routeGroup);
  }

  if (layer._alternativeMode) {
    window.dispatchEvent(new CustomEvent('route-alternative-selected', {
      detail: { mode: layer._alternativeMode, label: layer._alternativeLabel },
    }));
    return;
  }

  if (layer._routeId) {
    window.dispatchEvent(new CustomEvent('map-route-selected', { detail: { routeId: layer._routeId } }));
    return;
  }
}

// ─── Route click handler ─────────────────────────────────────────────────────

export function handleMapRouteClick(routeLayers: L.Layer[], map: L.Map, e: L.LeafletMouseEvent) {
  const clickPoint = map.latLngToContainerPoint(e.latlng);
  let bestAlternativeLayer: any = null;
  let bestAlternativeDistance = Infinity;
  let bestOtherLayer: any = null;
  let bestOtherDistance = Infinity;

  routeLayers.forEach((layer: any) => {
    const routeLayer = layer as any;
    if (!routeLayer || typeof routeLayer.closestLayerPoint !== 'function') return;
    if (!routeLayer._routeGroup && !routeLayer._alternativeMode && !routeLayer._routeId) return;

    const closestPoint = routeLayer.closestLayerPoint(clickPoint);
    if (!closestPoint) return;

    const distance = clickPoint.distanceTo(closestPoint);
    const hitTargetWeight = Number(routeLayer._hitTargetWeight || routeLayer._baseWeight || 0);
    const threshold = Math.max(hitTargetWeight / 2 + 4, 12);
    if (distance > threshold) return;

    if (routeLayer._alternativeMode) {
      if (distance < bestAlternativeDistance) {
        bestAlternativeDistance = distance;
        bestAlternativeLayer = routeLayer;
      }
      return;
    }

    if (distance < bestOtherDistance) {
      bestOtherDistance = distance;
      bestOtherLayer = routeLayer;
    }
  });

  const bestLayer = bestAlternativeLayer || bestOtherLayer;
  if (bestLayer) {
    dispatchRouteLayerSelection(routeLayers, bestLayer);
  }
}

// ─── Show route ──────────────────────────────────────────────────────────────

export function showRoute(
  refs: RouteRefs,
  segments: any[],
  routeStops: any[] | undefined,
  isNewRoute: boolean,
) {
  const { mapRef, routeLayersRef, routeGroupRef } = refs;

  // Remove previous route layers
  if (routeGroupRef.current) {
    routeGroupRef.current.clearLayers();
  }
  routeLayersRef.current = [];

  if (!segments || !Array.isArray(segments) || segments.length === 0 || !mapRef.current) return;

  // Ensure layer group exists
  if (!routeGroupRef.current) {
    routeGroupRef.current = L.layerGroup().addTo(mapRef.current);
  }

  const allBounds: L.LatLng[] = [];

  // Only detect round trip for RouteBuilder segments (no routeId)
  const hasImportedSegments = segments.some((s: any) => s.routeId);
  let firstPoint: L.LatLng | null = null;
  let finalPoint: L.LatLng | null = null;

  for (const seg of segments) {
    if (!seg.geometry?.coordinates || seg.geometry.coordinates.length === 0) continue;
    const firstCoord = seg.geometry.coordinates[0];
    firstPoint = L.latLng(firstCoord[1], firstCoord[0]);
    break;
  }

  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (!seg.geometry?.coordinates || seg.geometry.coordinates.length === 0) continue;
    const lastCoord = seg.geometry.coordinates[seg.geometry.coordinates.length - 1];
    finalPoint = L.latLng(lastCoord[1], lastCoord[0]);
    break;
  }

  const closesBackToOrigin = !hasImportedSegments && !!(firstPoint && finalPoint && firstPoint.distanceTo(finalPoint) < 2500);
  const isRoundTrip = !hasImportedSegments && (segments.some((s: any) => s.isReturnLeg === true) || closesBackToOrigin);

  let turningPoint: L.LatLng | null = null;
  let turningStageNumber: number | null = null;
  let lastSegmentEndPoint: L.LatLng | null = finalPoint;

  // Group segments by stage
  const segmentsByStage: Map<number, { seg: any; idx: number }[]> = new Map();
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    if (!seg.geometry?.coordinates) continue;
    const stageNum = seg.stageNumber || 1;
    if (!segmentsByStage.has(stageNum)) segmentsByStage.set(stageNum, []);
    segmentsByStage.get(stageNum)!.push({ seg, idx: si });
  }

  const stageKeys = Array.from(segmentsByStage.keys()).sort((a, b) => a - b);
  const stageSummaries = stageKeys.map((stageNum) => {
    const stageSegs = segmentsByStage.get(stageNum)!;
    let distance = 0;
    let endPoint: L.LatLng | null = null;

    for (const { seg } of stageSegs) {
      distance += Number(seg.distance || 0);
      const coords = seg.geometry.coordinates;
      if (coords?.length) {
        const lastCoord = coords[coords.length - 1];
        endPoint = L.latLng(lastCoord[1], lastCoord[0]);
      }
    }

    return {
      stageNumber: stageNum,
      distance,
      endPoint,
      explicitReturn: stageSegs[0]?.seg.isReturnLeg === true,
    };
  });

  if (isRoundTrip && stageSummaries.length > 0) {
    const totalRouteDistance = stageSummaries.reduce((sum, stage) => sum + stage.distance, 0);
    let cumulativeDistance = 0;
    let maxRouteDistanceFromOrigin = -1;

    for (const stage of stageSummaries) {
      cumulativeDistance += stage.distance;
      const routeDistanceFromOrigin = totalRouteDistance > 0
        ? Math.min(cumulativeDistance, totalRouteDistance - cumulativeDistance)
        : cumulativeDistance;

      if (routeDistanceFromOrigin > maxRouteDistanceFromOrigin && stage.endPoint) {
        maxRouteDistanceFromOrigin = routeDistanceFromOrigin;
        turningPoint = stage.endPoint;
        turningStageNumber = stage.stageNumber;
      }
    }

    if (!turningPoint) {
      const explicitReturnIdx = stageSummaries.findIndex((stage) => stage.explicitReturn);
      const fallbackStage = explicitReturnIdx > 0
        ? stageSummaries[explicitReturnIdx - 1]
        : stageSummaries[stageSummaries.length - 1];
      turningPoint = fallbackStage?.endPoint || null;
      turningStageNumber = fallbackStage?.stageNumber ?? null;
    }
  }

  // Draw each stage
  for (const stageNum of stageKeys) {
    const stageSegs = segmentsByStage.get(stageNum)!;

    for (const { seg } of stageSegs) {
      const rawCoords: L.LatLngExpression[] = seg.geometry.coordinates.map((c: number[]) => [c[1], c[0]]);

      const isFlightSeg = seg.transportMode === 'flight';
      const isFerrySeg = seg.transportMode === 'ferry';
      const coords = isFlightSeg && mapRef.current
        ? createFlightArcCoords(mapRef.current, rawCoords)
        : rawCoords;

      coords.forEach((c: any) => allBounds.push(L.latLng(c[0], c[1])));

      if (coords.length > 0) {
        const lc = coords[coords.length - 1] as any;
        lastSegmentEndPoint = L.latLng(lc[0] ?? lc.lat, lc[1] ?? lc.lng);
      }

      const isReturn = isRoundTrip && turningStageNumber !== null
        ? stageNum > turningStageNumber
        : seg.isReturnLeg === true;
      const routeColors = getRouteColors();
      const defaultColor = isReturn ? routeColors.returnLeg : routeColors.forward;
      const color = seg.routeColor || (isFlightSeg ? routeColors.flight : isFerrySeg ? routeColors.ferry : defaultColor);

      if (coords.length > 0 && mapRef.current) {
        const isAlternative = seg.isAlternative === true;
        const isAltDrivingLeg = isAlternative && !isFlightSeg && !isFerrySeg;
        const baseWeight = isAlternative ? (isAltDrivingLeg ? 2.5 : 3) : isFlightSeg ? 3 : isReturn ? 3.5 : 4;
        const baseOpacity = isAlternative ? 0.55 : isFlightSeg ? 0.7 : isReturn ? 0.8 : 0.95;
        const altGroupId = seg.alternativeMode || seg.alternativeLabel || null;
        const segGroupId = isAlternative ? (altGroupId || `alt-${stageNum}`) : 'primary';

        // Wide hit area polyline
        const hitAreaWeight = Math.max(baseWeight + 14, 18);
        const hitArea = L.polyline(coords, {
          color,
          weight: hitAreaWeight,
          opacity: 0.01,
          lineCap: 'round',
          lineJoin: 'round',
          className: 'leaflet-route-hit-area',
          interactive: true,
        }).addTo(routeGroupRef.current!);

        const polyline = L.polyline(coords, {
          color,
          weight: baseWeight,
          opacity: baseOpacity,
          lineCap: 'round',
          lineJoin: 'round',
          dashArray: isFlightSeg ? '6, 8' : isFerrySeg ? '4, 6' : isAltDrivingLeg ? '3, 5' : isReturn ? '8, 6' : undefined,
          interactive: true,
        }).addTo(routeGroupRef.current!);

        // Store metadata for group selection
        (polyline as any)._routeGroup = segGroupId;
        (polyline as any)._baseWeight = baseWeight;
        (polyline as any)._baseOpacity = baseOpacity;
        (polyline as any)._altLabel = isAlternative ? (seg.alternativeLabel || null) : null;
        (polyline as any)._alternativeMode = isAlternative ? (seg.alternativeMode || null) : null;
        (polyline as any)._alternativeLabel = isAlternative ? (seg.alternativeLabel || null) : null;
        (polyline as any)._routeId = seg.routeId || null;
        (polyline as any)._hitTargetWeight = hitAreaWeight;

        (hitArea as any)._routeGroup = segGroupId;
        (hitArea as any)._baseWeight = baseWeight;
        (hitArea as any)._baseOpacity = baseOpacity;
        (hitArea as any)._altLabel = isAlternative ? (seg.alternativeLabel || null) : null;
        (hitArea as any)._alternativeMode = isAlternative ? (seg.alternativeMode || null) : null;
        (hitArea as any)._alternativeLabel = isAlternative ? (seg.alternativeLabel || null) : null;
        (hitArea as any)._routeId = seg.routeId || null;
        (hitArea as any)._hitTargetWeight = hitAreaWeight;

        // Hover highlight
        const onMouseOver = () => {
          polyline.setStyle({ opacity: 1, weight: baseWeight + 3 });
          if (isAlternative && seg.alternativeLabel) {
            window.dispatchEvent(new CustomEvent('route-alternative-hover', { detail: { label: seg.alternativeLabel } }));
          }
        };
        const onMouseOut = () => {
          if (isAlternative && seg.alternativeLabel) {
            window.dispatchEvent(new CustomEvent('route-alternative-hover', { detail: { label: null } }));
          }
          const selected = (window as any).__selectedRouteGroup;
          if (selected && selected !== segGroupId) {
            polyline.setStyle({ opacity: 0.15, weight: baseWeight });
          } else if (selected === segGroupId) {
            polyline.setStyle({ opacity: 1, weight: baseWeight + 2 });
          } else {
            polyline.setStyle({ opacity: baseOpacity, weight: baseWeight });
          }
        };
        polyline.on('mouseover', onMouseOver);
        polyline.on('mouseout', onMouseOut);
        hitArea.on('mouseover', onMouseOver);
        hitArea.on('mouseout', onMouseOut);

        // Click to select
        const onRouteClick = (evt?: any) => {
          if (evt?.originalEvent) {
            L.DomEvent.stop(evt.originalEvent);
          }
          dispatchRouteLayerSelection(routeLayersRef.current, polyline as any);
        };
        polyline.on('click', onRouteClick);
        hitArea.on('click', onRouteClick);
        hitArea.bringToFront();

        if (isAlternative && seg.alternativeMode) {
          const altLabel = seg.alternativeLabel || seg.alternativeMode;
          polyline.bindTooltip(`${altLabel} — clic para seleccionar`, { sticky: true, direction: 'top' });
          hitArea.bindTooltip(`${altLabel} — clic para seleccionar`, { sticky: true, direction: 'top' });
        }

        routeLayersRef.current.push(hitArea);
        routeLayersRef.current.push(polyline);

        // Transport mode icon at midpoint of flight/ferry arcs
        if ((isFlightSeg || isFerrySeg) && coords.length >= 2) {
          const midIdx = Math.floor(coords.length / 2);
          const midCoord = coords[midIdx] as any;
          const prevCoord = coords[Math.max(midIdx - 1, 0)] as any;
          const nextCoord = coords[Math.min(midIdx + 1, coords.length - 1)] as any;
          if (midCoord && prevCoord && nextCoord) {
            const midLat = midCoord[0] ?? midCoord.lat;
            const midLng = midCoord[1] ?? midCoord.lng;
            const bearing = calculateSegmentBearing(prevCoord, nextCoord);
            const iconKey = isFlightSeg ? 'plane' : 'ship';
            const rotation = bearing - 90;
            const svgSize = isAlternative ? 14 : 18;
            const svgStr = getLucideSvgString(iconKey, { size: svgSize, color, strokeWidth: 2.5 });

            const modeIcon = L.divIcon({
              className: '',
              html: `<div style="
                transform: rotate(${rotation}deg);
                line-height: 1;
                opacity: ${isAlternative ? '0.6' : '1'};
                filter: drop-shadow(0 1px 2px rgba(0,0,0,0.4));
              ">${svgStr}</div>`,
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            });
            const marker = L.marker([midLat, midLng], { icon: modeIcon, interactive: isAlternative }).addTo(routeGroupRef.current!);
            if (isAlternative && seg.alternativeMode) {
              marker.on('click', () => {
                window.dispatchEvent(new CustomEvent('route-alternative-selected', { detail: { mode: seg.alternativeMode, label: seg.alternativeLabel } }));
              });
            }
            routeLayersRef.current.push(marker);
          }
        }

        // Port/airport endpoint markers
        if ((isFlightSeg || isFerrySeg) && !isAlternative && coords.length >= 2) {
          const startCoord = rawCoords[0] as any;
          const endCoord = rawCoords[rawCoords.length - 1] as any;
          const startLat = startCoord[0] ?? startCoord.lat;
          const startLng = startCoord[1] ?? startCoord.lng;
          const endLat = endCoord[0] ?? endCoord.lat;
          const endLng = endCoord[1] ?? endCoord.lng;

          const iconKey = isFlightSeg ? 'plane' : 'anchor';
          const epCfg = getMarkerSizeConfig();
          const epEntry = isFlightSeg
            ? (epCfg.route_stop_airport || { base_normal: 26, fill_color: '#9333ea' })
            : (epCfg.route_stop_port || { base_normal: 26, fill_color: '#0891b2' });
          const bgColor = epEntry.fill_color;
          const epSize = epEntry.base_normal;
          const epIconSize = Math.round(epSize * 0.5);
          const label = isFlightSeg ? 'Aeropuerto' : 'Puerto';

          const startIcon = L.divIcon({
            className: '',
            html: getMapMarkerHtml(iconKey, bgColor, { size: epSize, iconSize: epIconSize }),
            iconSize: [epSize, epSize],
            iconAnchor: [epSize / 2, epSize / 2],
          });
          const startMarker = L.marker([startLat, startLng], { icon: startIcon, interactive: true, zIndexOffset: 9100 }).addTo(routeGroupRef.current!);
          
          routeLayersRef.current.push(startMarker);

          const endIcon = L.divIcon({
            className: '',
            html: getMapMarkerHtml(iconKey, bgColor, { size: epSize, iconSize: epIconSize }),
            iconSize: [epSize, epSize],
            iconAnchor: [epSize / 2, epSize / 2],
          });
          const endMarker = L.marker([endLat, endLng], { icon: endIcon, interactive: true, zIndexOffset: 9100 }).addTo(routeGroupRef.current!);
          
          routeLayersRef.current.push(endMarker);
        }
      }
    }

    // Stage label at midpoint (multi-stage)
    if (stageKeys.length > 1 && mapRef.current) {
      const allStageCoords: L.LatLngExpression[] = [];
      for (const { seg: s } of stageSegs) {
        if (s.geometry?.coordinates) {
          allStageCoords.push(...s.geometry.coordinates.map((c: number[]) => [c[1], c[0]] as L.LatLngExpression));
        }
      }
      const isReturn = isRoundTrip && turningStageNumber !== null
        ? stageNum > turningStageNumber
        : stageSegs[0]?.seg.isReturnLeg === true;
      const stageRouteColors = getRouteColors();
      const stageColor = stageSegs[0]?.seg.routeColor || (isReturn ? stageRouteColors.returnLeg : stageRouteColors.forward);

      if (allStageCoords.length > 0) {
        const midIdx = Math.floor(allStageCoords.length / 2);
        const midCoord = allStageCoords[midIdx] as any;
        if (midCoord) {
          const midPos = L.latLng(midCoord[0] ?? midCoord.lat, midCoord[1] ?? midCoord.lng);
          const labelIcon = L.divIcon({
            className: '',
            html: `<div style="
              display:flex;align-items:center;gap:2px;
              padding:1px 6px;border-radius:10px;
              background:${stageColor};color:white;
              font-size:9px;font-weight:700;
              white-space:nowrap;
              box-shadow:0 1px 3px rgba(0,0,0,0.3);
              border:1.5px solid white;
            ">${isReturn ? '↩' : '→'} E${stageNum}</div>`,
            iconSize: [40, 18],
            iconAnchor: [20, 9],
          });
          const labelMarker = L.marker(midPos, { icon: labelIcon, interactive: false, zIndexOffset: 8000 }).addTo(routeGroupRef.current!);
          routeLayersRef.current.push(labelMarker);
        }
      }
    }
  }

  // Junction markers removed — route line is sufficient

  // Flag marker — only for RouteBuilder routes, not imported ones
  const flagPosition = !hasImportedSegments ? (isRoundTrip ? turningPoint : lastSegmentEndPoint) : null;
  if (flagPosition && mapRef.current) {
    const flagCfg = getMarkerSizeConfig().route_flag || { base_normal: 36, fill_color: '#dc2626' };
    const flagSize = flagCfg.base_normal;
    const flagIconSize = Math.round(flagSize * 0.5);
    const flagIcon = L.divIcon({
      className: '',
      html: `<div style="
        display:flex;align-items:center;justify-content:center;
        width:${flagSize}px;height:${flagSize}px;border-radius:50%;
        background:${flagCfg.fill_color};border:3px solid white;
        box-shadow:0 2px 8px rgba(0,0,0,0.4);
        z-index:9999;
      ">
        <svg width="${flagIconSize}" height="${flagIconSize}" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
          <line x1="4" y1="22" x2="4" y2="15"/>
        </svg>
      </div>`,
      iconSize: [flagSize, flagSize],
      iconAnchor: [flagSize / 2, flagSize / 2],
    });
    const marker = L.marker(flagPosition, { icon: flagIcon, interactive: false, zIndexOffset: 9999 }).addTo(routeGroupRef.current!);
    routeLayersRef.current.push(marker);
  }

  // Stage break markers
  const stageBreaks = (segments as any)._stageBreaks;
  if (stageBreaks && Array.isArray(stageBreaks) && mapRef.current) {
    for (const sb of stageBreaks) {
      const pos = sb.lat != null && sb.lng != null
        ? L.latLng(sb.lat, sb.lng)
        : (() => {
          const seg = segments[sb.segmentIndex];
          if (!seg?.geometry?.coordinates?.length) return null;
          const lastCoord = seg.geometry.coordinates[seg.geometry.coordinates.length - 1];
          return L.latLng(lastCoord[1], lastCoord[0]);
        })();
      if (!pos) continue;
      const hours = Math.round(sb.cumulativeDuration / 3600 * 10) / 10;
      const isReturn = isRoundTrip && turningStageNumber !== null
        ? sb.stageNumber > turningStageNumber
        : sb.isReturnLeg === true;
      const sbCfg = getMarkerSizeConfig().route_stage_break || { base_normal: 28, fill_color: '#f59e0b' };
      const bgColor = isReturn ? (getMarkerSizeConfig().own_empty?.fill_color || '#ea580c') : sbCfg.fill_color;
      const sbSize = sbCfg.base_normal;
      const sbIconSize = Math.round(sbSize * 0.5);
      const stageIcon = L.divIcon({
        className: '',
        html: getMapMarkerHtml('home', bgColor, { size: sbSize, iconSize: sbIconSize }),
        iconSize: [sbSize, sbSize],
        iconAnchor: [sbSize / 2, sbSize / 2],
      });
      const label = isReturn ? 'Vuelta' : 'Ida';
      const stageMarker = L.marker(pos, { icon: stageIcon, interactive: true, zIndexOffset: 9000 }).addTo(routeGroupRef.current!);
      stageMarker.bindTooltip(`Parada ${label} · Etapa ${sb.stageNumber} · ${hours}h conducción`, { direction: 'top', offset: [0, -16] });
      routeLayersRef.current.push(stageMarker);
    }
  }

  // Persisted route stops
  if (routeStops && Array.isArray(routeStops) && routeStops.length > 0 && mapRef.current) {
    const sizeCfg = getMarkerSizeConfig();
    const stopConfigMap: Record<string, string> = {
      overnight: 'route_stop_overnight',
      port: 'route_stop_port',
      airport: 'route_stop_airport',
      refuel: 'route_stop_refuel',
      rest: 'route_stop_custom',
      scenic: 'route_stop_custom',
      custom: 'route_stop_custom',
      route_waypoint: 'route_waypoint',
    };

    for (const stop of routeStops) {
      const pos = L.latLng(stop.latitude, stop.longitude);
      const cfgKey = stopConfigMap[stop.stopType] || 'route_stop_custom';
      const stopEntry = sizeCfg[cfgKey] || { base_normal: 32, fill_color: '#6b7280' };
      const color = stopEntry.fill_color;
      const stopSize = stopEntry.base_normal;
      const stopIconSize = Math.round(stopSize * 0.5);
      const iconKey = getStopTypeIconKey(stop.stopType, stop.icon);
      allBounds.push(pos);

      const stopIcon = L.divIcon({
        className: '',
        html: getMapMarkerHtml(iconKey, color, { size: stopSize, iconSize: stopIconSize }),
        iconSize: [stopSize, stopSize],
        iconAnchor: [stopSize / 2, stopSize / 2],
      });

      const stopMarker = L.marker(pos, { icon: stopIcon, interactive: true, zIndexOffset: 9200 }).addTo(routeGroupRef.current!);
      const tooltipParts = [stop.name];
      if (stop.arrivalEstimate) tooltipParts.push(`Llegada: ${stop.arrivalEstimate}`);
      if (stop.departureEstimate) tooltipParts.push(`Salida: ${stop.departureEstimate}`);
      stopMarker.bindTooltip(tooltipParts.join(' · '), { direction: 'top', offset: [0, -(stopSize / 2 + 2)] });
      routeLayersRef.current.push(stopMarker);
    }
  }

  if (allBounds.length > 0 && mapRef.current && isNewRoute) {
    mapRef.current.fitBounds(L.latLngBounds(allBounds), { padding: [60, 60], animate: true });
  }
}

// ─── Clear route ─────────────────────────────────────────────────────────────

export function clearRoute(refs: RouteRefs) {
  if (refs.routeGroupRef.current) {
    refs.routeGroupRef.current.clearLayers();
  }
  refs.routeLayersRef.current = [];
}

// ─── Advisor preview ─────────────────────────────────────────────────────────

export function showAdvisorPreview(refs: RouteRefs, segments: any[]) {
  const { mapRef, advisorPreviewGroupRef } = refs;
  if (!mapRef.current) return;

  if (!advisorPreviewGroupRef.current) {
    advisorPreviewGroupRef.current = L.layerGroup().addTo(mapRef.current);
  }
  advisorPreviewGroupRef.current.clearLayers();

  if (!segments || !Array.isArray(segments) || segments.length === 0) return;

  const modeColors: Record<string, string> = {
    driving: '#3b82f6',
    car: '#3b82f6',
    camper_van: '#3b82f6',
    motorhome: '#3b82f6',
    ferry: '#0891b2',
    flight: '#9333ea',
    walking: '#22c55e',
    bicycle: '#f59e0b',
    train: '#6366f1',
  };

  const allBounds: L.LatLng[] = [];

  for (const seg of segments) {
    if (!seg.fromLat || !seg.toLat) continue;

    const from = L.latLng(seg.fromLat, seg.fromLng);
    const to = L.latLng(seg.toLat, seg.toLng);
    allBounds.push(from, to);

    const numPoints = 30;
    const coords: L.LatLngExpression[] = [];
    for (let i = 0; i <= numPoints; i++) {
      const f = i / numPoints;
      const lat = seg.fromLat + (seg.toLat - seg.fromLat) * f;
      const lng = seg.fromLng + (seg.toLng - seg.fromLng) * f;
      coords.push([lat, lng]);
    }

    const modeKey = (seg.mode || 'driving').toLowerCase().replace(/[^a-z_]/g, '');
    const color = modeColors[modeKey] || '#6b7280';
    const isSea = modeKey === 'ferry' || modeKey === 'flight';

    L.polyline(coords, {
      color,
      weight: 3.5,
      opacity: 0.7,
      dashArray: isSea ? '8, 8' : undefined,
      lineCap: 'round',
      interactive: false,
    }).addTo(advisorPreviewGroupRef.current!);

    const midIdx = Math.floor(coords.length / 2);
    const midCoord = coords[midIdx] as [number, number];
    if (midCoord && seg.modeLabel) {
      const icon = L.divIcon({
        className: 'advisor-preview-label',
        html: `<div style="background:${color};color:white;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:600;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.3)">${seg.modeLabel}</div>`,
        iconAnchor: [0, 0],
      });
      L.marker(midCoord, { icon, interactive: false }).addTo(advisorPreviewGroupRef.current!);
    }
  }

  if (allBounds.length > 0) {
    mapRef.current.fitBounds(L.latLngBounds(allBounds), { padding: [80, 80], animate: true });
  }
}

export function clearAdvisorPreview(refs: RouteRefs) {
  if (refs.advisorPreviewGroupRef.current) {
    refs.advisorPreviewGroupRef.current.clearLayers();
  }
}

// ─── Journey preview ─────────────────────────────────────────────────────────

export function showJourneyPreview(refs: RouteRefs, days: any[]) {
  const { mapRef, journeyPreviewGroupRef } = refs;
  if (!mapRef.current) return;

  if (!journeyPreviewGroupRef.current) {
    journeyPreviewGroupRef.current = L.layerGroup().addTo(mapRef.current);
  }
  journeyPreviewGroupRef.current.clearLayers();

  if (!days || !Array.isArray(days) || days.length === 0) return;

  const allBounds: L.LatLng[] = [];
  const dayColors = ['#f59e0b', '#ef4444', '#3b82f6', '#22c55e', '#9333ea', '#ec4899', '#0891b2', '#6366f1'];

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    if (!day.overnightLat || !day.overnightLng) continue;

    const pos = L.latLng(day.overnightLat, day.overnightLng);
    allBounds.push(pos);
    const color = dayColors[i % dayColors.length];

    const icon = L.divIcon({
      className: '',
      html: getMapMarkerHtml('moon', color, { size: 30, iconSize: 14 }),
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });

    const marker = L.marker(pos, { icon, interactive: true, zIndexOffset: 9500 })
      .addTo(journeyPreviewGroupRef.current!);

    const tooltipText = `Día ${day.dayNumber}: ${day.overnightStop || 'Pernocta'}`;
    marker.bindTooltip(tooltipText, { direction: 'top', offset: [0, -18] });
  }

  if (allBounds.length > 0) {
    mapRef.current.fitBounds(L.latLngBounds(allBounds), { padding: [80, 80], maxZoom: 10, animate: true });
  }
}

export function clearJourneyPreview(refs: RouteRefs) {
  if (refs.journeyPreviewGroupRef.current) {
    refs.journeyPreviewGroupRef.current.clearLayers();
  }
}

// ─── Alternative hover handler ───────────────────────────────────────────────

export function handleAlternativeHover(routeLayers: L.Layer[], label: string | null) {
  routeLayers.forEach((layer: any) => {
    if (layer._routeGroup == null || layer._baseOpacity == null) return;
    if (!label) {
      layer.setStyle({ opacity: layer._baseOpacity, weight: layer._baseWeight });
    } else if (layer._routeGroup === 'primary') {
      layer.setStyle({ opacity: 0.2, weight: layer._baseWeight });
    } else if (layer._altLabel === label) {
      layer.setStyle({ opacity: 1, weight: layer._baseWeight + 3 });
    } else {
      layer.setStyle({ opacity: 0.15, weight: layer._baseWeight });
    }
  });
}

// ─── Editable waypoints (drag + insert) ──────────────────────────────────────

export interface EditableWaypoint {
  type: 'origin' | 'destination' | 'intermediate';
  index: number; // 0 for origin, N for intermediates, -1 for destination
  name: string;
  latitude: number;
  longitude: number;
}

let editWaypointsGroup: L.LayerGroup | null = null;
let editSegmentClickHandlers: Array<() => void> = [];

export function showEditableWaypoints(
  map: L.Map,
  waypoints: EditableWaypoint[],
  routeLayers: L.Layer[],
) {
  clearEditableWaypoints(map);

  editWaypointsGroup = L.layerGroup().addTo(map);

  const colors: Record<string, string> = {
    origin: '#16a34a',
    destination: '#dc2626',
    intermediate: '#2563eb',
  };

  const icons: Record<string, string> = {
    origin: 'home',
    destination: 'flag',
    intermediate: 'map-pin',
  };

  // Render draggable markers for each waypoint
  for (const wp of waypoints) {
    const color = colors[wp.type] || '#6b7280';
    const iconKey = icons[wp.type] || 'map-pin';
    const size = wp.type === 'intermediate' ? 28 : 32;
    const iconSize = Math.round(size * 0.5);

    const divIcon = L.divIcon({
      className: '',
      html: `<div style="
        cursor: grab;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));
      ">${getMapMarkerHtml(iconKey, color, { size, iconSize })}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });

    const marker = L.marker([wp.latitude, wp.longitude], {
      icon: divIcon,
      draggable: true,
      zIndexOffset: 10000,
    }).addTo(editWaypointsGroup);

    const label = wp.type === 'origin' ? 'Origen' : wp.type === 'destination' ? 'Destino' : `Waypoint ${wp.index + 1}`;
    marker.bindTooltip(`${label}: ${wp.name}\nArrastra para mover`, {
      direction: 'top',
      offset: [0, -(size / 2 + 4)],
    });

    marker.on('dragstart', () => {
      (marker.getElement() as any)?.style?.setProperty('cursor', 'grabbing');
    });

    marker.on('dragend', () => {
      (marker.getElement() as any)?.style?.setProperty('cursor', 'grab');
      const pos = marker.getLatLng();
      window.dispatchEvent(new CustomEvent('map-waypoint-dragged', {
        detail: {
          type: wp.type,
          index: wp.index,
          latitude: pos.lat,
          longitude: pos.lng,
        },
      }));
    });
  }

  // Add click-to-insert behavior on route segments
  // We add invisible wider polylines that dispatch an insert event
  const segmentClickHandler = (e: L.LeafletMouseEvent) => {
    // Only handle if editing mode is active
    if (!editWaypointsGroup) return;

    const clickLat = e.latlng.lat;
    const clickLng = e.latlng.lng;

    // Find which segment pair this click belongs to
    let bestSegmentIndex = 0;
    let bestDistance = Infinity;

    for (let i = 0; i < waypoints.length - 1; i++) {
      const a = waypoints[i];
      const b = waypoints[i + 1];
      // Distance from click to midpoint of segment
      const midLat = (a.latitude + b.latitude) / 2;
      const midLng = (a.longitude + b.longitude) / 2;
      const d = Math.sqrt((clickLat - midLat) ** 2 + (clickLng - midLng) ** 2);
      if (d < bestDistance) {
        bestDistance = d;
        bestSegmentIndex = i;
      }
    }

    // Insert index in the intermediates array
    // waypoints[0] = origin, waypoints[1..n-1] = intermediates, waypoints[n] = destination
    // If clicking between waypoints[i] and waypoints[i+1], insert at intermediate index = i
    // (since intermediates start after origin, insertIndex = bestSegmentIndex for the intermediates array)
    const insertIndex = bestSegmentIndex;

    window.dispatchEvent(new CustomEvent('map-waypoint-insert', {
      detail: {
        insertIndex,
        latitude: clickLat,
        longitude: clickLng,
      },
    }));
  };

  // Register a double-click handler on route polylines for inserting waypoints
  routeLayers.forEach((layer: any) => {
    if (typeof layer.on !== 'function') return;
    if (layer._routeGroup !== 'primary' && !layer._routeId) return;
    // Only non-alternative primary route layers
    if (layer._alternativeMode) return;

    const handler = (e: any) => {
      L.DomEvent.stop(e);
      segmentClickHandler(e);
    };
    layer.on('dblclick', handler);
    editSegmentClickHandlers.push(() => layer.off('dblclick', handler));
  });
}

export function clearEditableWaypoints(map: L.Map) {
  if (editWaypointsGroup) {
    editWaypointsGroup.clearLayers();
    map.removeLayer(editWaypointsGroup);
    editWaypointsGroup = null;
  }
  // Remove segment click handlers
  editSegmentClickHandlers.forEach(fn => fn());
  editSegmentClickHandlers = [];
}

// ─── Segment correction mode ────────────────────────────────────────────────

let correctionGroup: L.LayerGroup | null = null;
let correctionClickHandler: ((e: L.LeafletMouseEvent) => void) | null = null;
let correctionFirstPoint: { latlng: L.LatLng; coordIndex: number; segmentIndex: number } | null = null;

/** Bearing between two [lng, lat] coords in degrees */
function bearing(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => d * Math.PI / 180;
  const toDeg = (r: number) => r * 180 / Math.PI;
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Haversine distance in meters between two [lng, lat] coords */
function haversineDist(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => d * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

interface StraightSegment {
  segmentIndex: number;
  startIdx: number;
  endIdx: number;
  distance: number; // meters
}

/**
 * Detect suspiciously straight sub-segments within a route's coordinate array.
 * Uses two strategies:
 * 1. Bearing consistency: consecutive points with nearly constant bearing (< threshold°)
 * 2. Low density: single hops covering large distances (GPS signal loss gaps)
 */
function detectStraightSegments(coords: [number, number][], minDistance = 200, minPoints = 2, bearingThreshold = 5): StraightSegment[] {
  if (coords.length < 2) return [];

  const straights: StraightSegment[] = [];

  // ── Strategy 1: bearing consistency (relaxed: 2+ points, 5° threshold) ──
  let runStart = 0;
  let prevBearing: number | null = null;
  let runDistance = 0;

  for (let i = 1; i < coords.length; i++) {
    const b = bearing(coords[i - 1], coords[i]);
    const d = haversineDist(coords[i - 1], coords[i]);

    if (prevBearing !== null) {
      let diff = Math.abs(b - prevBearing);
      if (diff > 180) diff = 360 - diff;

      if (diff > bearingThreshold) {
        if (i - runStart >= minPoints && runDistance >= minDistance) {
          straights.push({ segmentIndex: 0, startIdx: runStart, endIdx: i - 1, distance: runDistance });
        }
        runStart = i - 1;
        runDistance = d;
      } else {
        runDistance += d;
      }
    } else {
      runDistance += d;
    }
    prevBearing = b;
  }

  if (coords.length - runStart >= minPoints && runDistance >= minDistance) {
    straights.push({ segmentIndex: 0, startIdx: runStart, endIdx: coords.length - 1, distance: runDistance });
  }

  // ── Strategy 2: detect single long hops (GPS signal loss) ──
  // Calculate median hop distance to identify outliers
  const hopDistances: number[] = [];
  for (let i = 1; i < coords.length; i++) {
    hopDistances.push(haversineDist(coords[i - 1], coords[i]));
  }
  if (hopDistances.length > 5) {
    const sorted = [...hopDistances].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const threshold = Math.max(median * 10, 200); // 10x median or 200m minimum

    for (let i = 0; i < hopDistances.length; i++) {
      if (hopDistances[i] >= threshold) {
        // Check this hop isn't already covered by a bearing-based detection
        const alreadyCovered = straights.some(s => i >= s.startIdx && i < s.endIdx);
        if (!alreadyCovered) {
          straights.push({ segmentIndex: 0, startIdx: i, endIdx: i + 1, distance: hopDistances[i] });
        }
      }
    }
  }

  // Sort by startIdx
  straights.sort((a, b) => a.startIdx - b.startIdx);

  return straights;
}

function findClosestCoordOnRoute(
  routeLayers: L.Layer[],
  latlng: L.LatLng,
): { segmentIndex: number; coordIndex: number; coord: [number, number] } | null {
  const segments = (window as any).__currentRouteSegments;
  if (!segments || !Array.isArray(segments)) return null;

  let bestDist = Infinity;
  let bestResult: { segmentIndex: number; coordIndex: number; coord: [number, number] } | null = null;

  for (let si = 0; si < segments.length; si++) {
    const coords = segments[si]?.geometry?.coordinates;
    if (!coords) continue;
    for (let ci = 0; ci < coords.length; ci++) {
      const [lng, lat] = coords[ci];
      const dist = latlng.distanceTo(L.latLng(lat, lng));
      if (dist < bestDist) {
        bestDist = dist;
        bestResult = { segmentIndex: si, coordIndex: ci, coord: [lng, lat] };
      }
    }
  }

  return bestResult;
}

export function setupCorrectionMode(map: L.Map, routeLayers: L.Layer[], transportMode: string) {
  clearCorrectionMode(map);

  correctionGroup = L.layerGroup().addTo(map);
  correctionFirstPoint = null;

  const segments = (window as any).__currentRouteSegments;

  // ── Visual segmentation: detect and highlight straight segments ──
  if (segments && Array.isArray(segments)) {
    for (let si = 0; si < segments.length; si++) {
      const coords: [number, number][] = segments[si]?.geometry?.coordinates;
      if (!coords || coords.length < 2) continue;

      const straights = detectStraightSegments(coords);
      if (straights.length === 0) continue;

      // Build a set of "straight" coordinate index ranges
      const straightRanges = straights.map(s => ({ start: s.startIdx, end: s.endIdx }));

      // Render normal sub-segments in green, straight ones in red
      let cursor = 0;
      for (const range of straightRanges) {
        // Normal section before this straight
        if (cursor < range.start) {
          const normalCoords = coords.slice(cursor, range.start + 1).map(c => [c[1], c[0]] as L.LatLngExpression);
          if (normalCoords.length > 1) {
            L.polyline(normalCoords, {
              color: '#22c55e',
              weight: 6,
              opacity: 0.5,
              dashArray: '2, 6',
              interactive: false,
            }).addTo(correctionGroup!);
          }
        }

        // Straight/suspicious section in red — clickable
        const straightCoords = coords.slice(range.start, range.end + 1).map(c => [c[1], c[0]] as L.LatLngExpression);
        if (straightCoords.length > 1) {
          const straightLine = L.polyline(straightCoords, {
            color: '#ef4444',
            weight: 7,
            opacity: 0.7,
            interactive: true,
            className: 'leaflet-correction-straight',
          }).addTo(correctionGroup!);

          const distKm = (haversineDist(coords[range.start], coords[range.end]) / 1000).toFixed(1);
          straightLine.bindTooltip(`Tramo recto sospechoso (${distKm} km) — clic para corregir`, {
            sticky: true,
            direction: 'top',
          });

          // Markers at endpoints of straight segment
          L.circleMarker(L.latLng(coords[range.start][1], coords[range.start][0]), {
            radius: 6, color: '#ef4444', fillColor: '#fca5a5', fillOpacity: 1, weight: 2, interactive: false,
          }).addTo(correctionGroup!);
          L.circleMarker(L.latLng(coords[range.end][1], coords[range.end][0]), {
            radius: 6, color: '#ef4444', fillColor: '#fca5a5', fillOpacity: 1, weight: 2, interactive: false,
          }).addTo(correctionGroup!);

          // Click on red segment → auto-correct
          straightLine.on('click', (e: any) => {
            L.DomEvent.stop(e);

            const startCoord = coords[range.start];
            const endCoord = coords[range.end];

            window.dispatchEvent(new CustomEvent('map-segment-correction-start'));

            const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
            const supabaseKey = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || '';
            const orsMode = transportMode === 'walking' ? 'walking' : 'driving';

            fetch(`${supabaseUrl}/functions/v1/correct-segment`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
                'apikey': supabaseKey,
              },
              body: JSON.stringify({
                startLat: startCoord[1],
                startLng: startCoord[0],
                endLat: endCoord[1],
                endLng: endCoord[0],
                transportMode: orsMode,
              }),
            })
              .then(r => r.json())
              .then(data => {
                if (data.error) {
                  window.dispatchEvent(new CustomEvent('map-segment-correction-error', { detail: { error: data.error } }));
                  return;
                }
                window.dispatchEvent(new CustomEvent('map-segment-corrected', {
                  detail: {
                    correctedGeometry: data.geometry,
                    startCoordIndex: range.start,
                    endCoordIndex: range.end,
                    segmentIndex: si,
                  },
                }));
              })
              .catch(err => {
                window.dispatchEvent(new CustomEvent('map-segment-correction-error', { detail: { error: err.message } }));
              });
          });
        }

        cursor = range.end;
      }

      // Remaining normal section after last straight
      if (cursor < coords.length - 1) {
        const normalCoords = coords.slice(cursor).map(c => [c[1], c[0]] as L.LatLngExpression);
        if (normalCoords.length > 1) {
          L.polyline(normalCoords, {
            color: '#22c55e',
            weight: 6,
            opacity: 0.5,
            dashArray: '2, 6',
            interactive: false,
          }).addTo(correctionGroup!);
        }
      }
    }
  }

  // ── Manual click mode (fallback for segments not auto-detected) ──
  map.getContainer().style.cursor = 'crosshair';

  correctionClickHandler = (e: L.LeafletMouseEvent) => {
    const closest = findClosestCoordOnRoute(routeLayers, e.latlng);
    if (!closest) return;

    const clickDist = e.latlng.distanceTo(L.latLng(closest.coord[1], closest.coord[0]));
    if (clickDist > 200) return;

    if (!correctionFirstPoint) {
      correctionFirstPoint = {
        latlng: L.latLng(closest.coord[1], closest.coord[0]),
        coordIndex: closest.coordIndex,
        segmentIndex: closest.segmentIndex,
      };

      const marker = L.circleMarker(correctionFirstPoint.latlng, {
        radius: 8, color: '#f59e0b', fillColor: '#fbbf24', fillOpacity: 1, weight: 3,
      }).addTo(correctionGroup!);
      marker.bindTooltip('Inicio del tramo — clic en el otro extremo', { permanent: true, direction: 'top', offset: [0, -12] });
    } else {
      if (closest.segmentIndex !== correctionFirstPoint.segmentIndex) {
        correctionFirstPoint = null;
        correctionGroup?.clearLayers();
        // Re-setup to redraw visual analysis
        setupCorrectionMode(map, routeLayers, transportMode);
        return;
      }

      const startIdx = Math.min(correctionFirstPoint.coordIndex, closest.coordIndex);
      const endIdx = Math.max(correctionFirstPoint.coordIndex, closest.coordIndex);

      if (endIdx - startIdx < 2) {
        correctionFirstPoint = null;
        correctionGroup?.clearLayers();
        setupCorrectionMode(map, routeLayers, transportMode);
        return;
      }

      L.circleMarker(L.latLng(closest.coord[1], closest.coord[0]), {
        radius: 8, color: '#f59e0b', fillColor: '#fbbf24', fillOpacity: 1, weight: 3,
      }).addTo(correctionGroup!);

      const segs = (window as any).__currentRouteSegments;
      const segCoords = segs[closest.segmentIndex].geometry.coordinates;
      const startCoord = segCoords[startIdx];
      const endCoord = segCoords[endIdx];

      window.dispatchEvent(new CustomEvent('map-segment-correction-start'));

      const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
      const supabaseKey = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || '';
      const orsMode = transportMode === 'walking' ? 'walking' : 'driving';

      fetch(`${supabaseUrl}/functions/v1/correct-segment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
        body: JSON.stringify({
          startLat: startCoord[1],
          startLng: startCoord[0],
          endLat: endCoord[1],
          endLng: endCoord[0],
          transportMode: orsMode,
        }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.error) {
            window.dispatchEvent(new CustomEvent('map-segment-correction-error', { detail: { error: data.error } }));
            return;
          }
          window.dispatchEvent(new CustomEvent('map-segment-corrected', {
            detail: {
              correctedGeometry: data.geometry,
              startCoordIndex: startIdx,
              endCoordIndex: endIdx,
              segmentIndex: closest.segmentIndex,
            },
          }));
        })
        .catch(err => {
          window.dispatchEvent(new CustomEvent('map-segment-correction-error', { detail: { error: err.message } }));
        });

      correctionFirstPoint = null;
    }
  };

  map.on('click', correctionClickHandler);
}

export function clearCorrectionMode(map: L.Map) {
  if (correctionGroup) {
    correctionGroup.clearLayers();
    map.removeLayer(correctionGroup);
    correctionGroup = null;
  }
  if (correctionClickHandler) {
    map.off('click', correctionClickHandler);
    correctionClickHandler = null;
  }
  correctionFirstPoint = null;
  map.getContainer().style.cursor = '';
}
