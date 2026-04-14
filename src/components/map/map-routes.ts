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
      layer.setStyle({ opacity: 0.15, weight: layer._baseWeight });
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

  console.log('[showRoute] segments:', segments.length, 'hasMap:', !!mapRef.current, 'geom0:', segments[0]?.geometry?.type, 'coords0:', segments[0]?.geometry?.coordinates?.length);
  if (!segments || !Array.isArray(segments) || segments.length === 0 || !mapRef.current) return;

  // Ensure layer group exists
  if (!routeGroupRef.current) {
    routeGroupRef.current = L.layerGroup().addTo(mapRef.current);
  }

  const allBounds: L.LatLng[] = [];

  // Detect round trip
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

  const closesBackToOrigin = !!(firstPoint && finalPoint && firstPoint.distanceTo(finalPoint) < 2500);
  const isRoundTrip = segments.some((s: any) => s.isReturnLeg === true) || closesBackToOrigin;

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
          startMarker.bindTooltip(`${label} de salida`, { direction: 'top', offset: [0, -(epSize / 2 + 2)] });
          routeLayersRef.current.push(startMarker);

          const endIcon = L.divIcon({
            className: '',
            html: getMapMarkerHtml(iconKey, bgColor, { size: epSize, iconSize: epIconSize }),
            iconSize: [epSize, epSize],
            iconAnchor: [epSize / 2, epSize / 2],
          });
          const endMarker = L.marker([endLat, endLng], { icon: endIcon, interactive: true, zIndexOffset: 9100 }).addTo(routeGroupRef.current!);
          endMarker.bindTooltip(`${label} de llegada`, { direction: 'top', offset: [0, -(epSize / 2 + 2)] });
          routeLayersRef.current.push(endMarker);
        }
      }
    }

    // Stage label at midpoint
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

  // Junction markers between segments
  const drawnWaypointPositions: string[] = [];
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    if (seg.isAlternative) continue;
    if (!seg.geometry?.coordinates?.length) continue;

    if (si > 0) {
      const startCoord = seg.geometry.coordinates[0];
      if (startCoord && startCoord.length >= 2) {
        const posKey = `${startCoord[1].toFixed(3)},${startCoord[0].toFixed(3)}`;
        if (!drawnWaypointPositions.includes(posKey)) {
          drawnWaypointPositions.push(posKey);
          const wpPos = L.latLng(startCoord[1], startCoord[0]);
          const junctionName = seg.fromName || `Punto ${si}`;

          const prevSeg = segments[si - 1];
          const isPort = prevSeg?.transportMode === 'ferry' || seg.transportMode === 'ferry';
          const isAirport = prevSeg?.transportMode === 'flight' || seg.transportMode === 'flight';
          const iconKey = isPort ? 'anchor' : isAirport ? 'plane' : 'map-pin';
          const jColors = getRouteColors();
          const bgColor = isPort ? jColors.ferry : isAirport ? jColors.flight : 'hsl(var(--primary))';

          const wpIcon = L.divIcon({
            className: '',
            html: `<div style="
              display:flex;align-items:center;gap:3px;
              padding:2px 8px 2px 4px;border-radius:12px;
              background:${bgColor};color:white;
              font-size:9px;font-weight:600;
              white-space:nowrap;
              box-shadow:0 2px 6px rgba(0,0,0,0.3);
              border:2px solid white;
            ">${getLucideSvgString(iconKey, { size: 12, color: 'white', strokeWidth: 2.5 })} ${junctionName.length > 20 ? junctionName.slice(0, 18) + '…' : junctionName}</div>`,
            iconSize: [140, 22],
            iconAnchor: [12, 11],
          });
          if (mapRef.current) {
            const wpMarker = L.marker(wpPos, { icon: wpIcon, interactive: true, zIndexOffset: 8500 }).addTo(routeGroupRef.current!);
            wpMarker.bindTooltip(junctionName, { direction: 'top', offset: [0, -14] });
            routeLayersRef.current.push(wpMarker);
          }
        }
      }
    }

    if (si === segments.filter((s: any) => !s.isAlternative).length - 1 && seg.toName) {
      const endCoord = seg.geometry.coordinates[seg.geometry.coordinates.length - 1];
      if (endCoord && endCoord.length >= 2) {
        const posKey = `${endCoord[1].toFixed(3)},${endCoord[0].toFixed(3)}`;
        if (!drawnWaypointPositions.includes(posKey)) {
          drawnWaypointPositions.push(posKey);
        }
      }
    }
  }

  // Flag marker
  const flagPosition = isRoundTrip ? turningPoint : lastSegmentEndPoint;
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
