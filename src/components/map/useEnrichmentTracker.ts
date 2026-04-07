/**
 * useEnrichmentTracker.ts
 * Detects newly enriched locations, triggers celebration animations,
 * plays sounds, and opens popups for the latest enrichment.
 */
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { GeoLocation } from '@/types/location';
import { toast } from 'sonner';
import { playEnrichmentComplete } from '@/lib/sounds';

interface UseEnrichmentTrackerParams {
  allLocations: GeoLocation[];
  enrichmentKey: string;
  mapRef: React.MutableRefObject<L.Map | null>;
  markersRef: React.MutableRefObject<Map<string, L.Marker>>;
}

export function useEnrichmentTracker({
  allLocations,
  enrichmentKey,
  mapRef,
  markersRef,
}: UseEnrichmentTrackerParams) {
  const [recentlyEnrichedIds, setRecentlyEnrichedIds] = useState<Set<string>>(new Set());
  const previousEnrichmentStateRef = useRef<Map<string, number>>(new Map());
  const isInitializedRef = useRef(false);

  // Initialize on first load (prevent false positives)
  useEffect(() => {
    if (!isInitializedRef.current && allLocations.length > 0) {
      allLocations.forEach((loc) => {
        previousEnrichmentStateRef.current.set(loc.id, loc.enrichedData?.descripcion?.length || 0);
      });
      isInitializedRef.current = true;
      console.log('Initialized enrichment state tracking for', allLocations.length, 'locations');
    }
  }, [allLocations]);

  // Detect newly enriched locations
  useEffect(() => {
    if (!isInitializedRef.current) return;

    const newlyEnriched: string[] = [];

    allLocations.forEach((loc) => {
      const prevDescLength = previousEnrichmentStateRef.current.get(loc.id) ?? -1;
      const currentDescLength = loc.enrichedData?.descripcion?.length || 0;

      if (prevDescLength === -1) {
        previousEnrichmentStateRef.current.set(loc.id, currentDescLength);
        return;
      }

      const wasNotEnriched = prevDescLength === 0;
      const isNowEnriched = currentDescLength > 0;
      const hasSignificantChange = currentDescLength > prevDescLength + 50;

      if ((wasNotEnriched && isNowEnriched) || hasSignificantChange) {
        newlyEnriched.push(loc.id);
        console.log(
          'Newly enriched location detected:',
          loc.name,
          loc.id,
          'prev:',
          prevDescLength,
          'current:',
          currentDescLength,
        );
      }

      previousEnrichmentStateRef.current.set(loc.id, currentDescLength);
    });

    if (newlyEnriched.length > 0) {
      console.log('🎉 Triggering celebration for:', newlyEnriched.length, 'locations');

      playEnrichmentComplete();

      newlyEnriched.forEach((id) => {
        const loc = allLocations.find((l) => l.id === id);
        if (loc) {
          toast.success(`${loc.name}`, {
            description: 'Enriquecimiento completado',
            duration: 3000,
          });
        }
      });

      setRecentlyEnrichedIds((prev) => {
        const next = new Set(prev);
        newlyEnriched.forEach((id) => next.add(id));
        return next;
      });

      // Pan to and open popup for the last enriched location
      const lastEnrichedId = newlyEnriched[newlyEnriched.length - 1];
      const location = allLocations.find((l) => l.id === lastEnrichedId);

      if (location && mapRef.current) {
        mapRef.current.setView(
          [location.coordinates.lat, location.coordinates.lng],
          Math.max(mapRef.current.getZoom(), 10),
          { animate: true, duration: 0.5 },
        );

        setTimeout(() => {
          const marker = markersRef.current.get(lastEnrichedId);
          if (marker) {
            marker.openPopup();
            console.log('Opened popup for enriched location:', location.name);
          }
        }, 600);
      }

      // Clear animation after 4 seconds
      setTimeout(() => {
        setRecentlyEnrichedIds((prev) => {
          const next = new Set(prev);
          newlyEnriched.forEach((id) => next.delete(id));
          return next;
        });
      }, 4000);
    }
  }, [allLocations, enrichmentKey]);

  return { recentlyEnrichedIds };
}
