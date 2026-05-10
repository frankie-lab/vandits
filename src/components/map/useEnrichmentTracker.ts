/**
 * useEnrichmentTracker.ts
 *
 * Event-driven enrichment feedback:
 *  - Escucha `location-realtime-update` con `kind === 'enrich'` (fuente de
 *    verdad emitida por `use-realtime-locations` a partir del payload Postgres).
 *  - Coalescer ráfagas en ventanas de 250ms.
 *  - Por cada POI enriquecido: pulse animation + toast.
 *  - Sonido único por ráfaga (el throttle interno de `playEnrichmentComplete`
 *    además garantiza ≤1 trino cada 400ms).
 *  - Tras la ráfaga, `flyTo + openPopup` SOLO al último POI, y SOLO si el
 *    usuario no ha interactuado con el mapa en los últimos 2s.
 *
 * Mantiene la API previa (`recentlyEnrichedIds`) para que LocationMap siga
 * aplicando la clase "pulse" en marcadores recién enriquecidos.
 */
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { GeoLocation } from '@/types/location';
import { toast } from 'sonner';
import { playEnrichmentComplete } from '@/lib/sounds';

interface UseEnrichmentTrackerParams {
  allLocations: GeoLocation[];
  /** Kept for API stability; no longer used as the primary signal. */
  enrichmentKey: string;
  mapRef: React.MutableRefObject<L.Map | null>;
  markersRef: React.MutableRefObject<Map<string, L.Marker>>;
}

const COALESCE_MS = 250;
const PULSE_MS = 4000;
const USER_INTERACT_GUARD_MS = 2000;

export function useEnrichmentTracker({
  allLocations,
  mapRef,
  markersRef,
}: UseEnrichmentTrackerParams) {
  const [recentlyEnrichedIds, setRecentlyEnrichedIds] = useState<Set<string>>(new Set());
  const allLocationsRef = useRef<GeoLocation[]>(allLocations);
  allLocationsRef.current = allLocations;

  // Track user interaction with the map so we don't yank them away during
  // active panning/zooming.
  const lastUserInteractAtRef = useRef<number>(0);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const mark = () => { lastUserInteractAtRef.current = Date.now(); };
    map.on('movestart', mark);
    map.on('zoomstart', mark);
    map.on('dragstart', mark);
    return () => {
      map.off('movestart', mark);
      map.off('zoomstart', mark);
      map.off('dragstart', mark);
    };
  }, [mapRef]);

  // Event-driven coalescer
  useEffect(() => {
    const pending = new Set<string>();
    let timer: number | null = null;

    const flush = () => {
      timer = null;
      if (pending.size === 0) return;
      const ids = Array.from(pending);
      pending.clear();

      // Resolve to locations (for toast titles + flyTo target)
      const locs = ids
        .map((id) => allLocationsRef.current.find((l) => l.id === id))
        .filter((x): x is GeoLocation => !!x);

      if (locs.length === 0) return;

      // Sound (throttled internally to 400ms)
      try { playEnrichmentComplete(); } catch {}

      // Toasts — one per POI, but cap at 3 to avoid spam during huge bursts.
      const toToast = locs.slice(0, 3);
      toToast.forEach((loc) => {
        toast.success(loc.name, {
          description: 'Enriquecimiento completado',
          duration: 3000,
        });
      });
      if (locs.length > toToast.length) {
        toast.success(`+${locs.length - toToast.length} más enriquecidos`, { duration: 2500 });
      }

      // Pulse animation for all ids
      setRecentlyEnrichedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });
      window.setTimeout(() => {
        setRecentlyEnrichedIds((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        });
      }, PULSE_MS);

      // FlyTo + openPopup for the last one, only if user is idle.
      const last = locs[locs.length - 1];
      const idleFor = Date.now() - lastUserInteractAtRef.current;
      if (last && mapRef.current && idleFor > USER_INTERACT_GUARD_MS) {
        try {
          mapRef.current.setView(
            [last.coordinates.lat, last.coordinates.lng],
            Math.max(mapRef.current.getZoom(), 10),
            { animate: true, duration: 0.5 },
          );
          window.setTimeout(() => {
            const marker = markersRef.current.get(last.id);
            if (marker) marker.openPopup();
          }, 600);
        } catch {}
      }
    };

    const schedule = () => {
      if (timer != null) return;
      timer = window.setTimeout(flush, COALESCE_MS);
    };

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { locationId?: string; kind?: string } | undefined;
      if (!detail || detail.kind !== 'enrich' || !detail.locationId) return;
      pending.add(detail.locationId);
      schedule();
    };

    window.addEventListener('location-realtime-update', handler);
    return () => {
      window.removeEventListener('location-realtime-update', handler);
      if (timer != null) window.clearTimeout(timer);
    };
  }, [mapRef, markersRef]);

  return { recentlyEnrichedIds };
}
