import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLocationsStore } from '@/store/locations-store';
import { GeoLocation, EnrichedLocationData } from '@/types/location';

/**
 * Hook that listens to realtime changes in the locations table
 * and updates the store automatically when a location is modified.
 * Now listens to ALL documents for consolidated view.
 */
export function useRealtimeLocations() {
  const documents = useLocationsStore(state => state.documents);
  const updateLocation = useLocationsStore(state => state.updateLocation);

  const handleLocationUpdate = useCallback(
    (payload: any) => {
      const updatedRecord = payload.new;

      console.log('Realtime update received for location:', updatedRecord.name);

      // Convert database record to GeoLocation format
      const updatedLocation: Partial<GeoLocation> = {
        name: updatedRecord.name,
        description: updatedRecord.description || undefined,
        coordinates: {
          lat: updatedRecord.latitude,
          lng: updatedRecord.longitude,
          altitude: updatedRecord.altitude || undefined,
        },
        continent: updatedRecord.continent || undefined,
        country: updatedRecord.country || undefined,
        region: updatedRecord.region || undefined,
        zone: updatedRecord.zone || undefined,
        placeType: (updatedRecord.place_type as GeoLocation['placeType']) || undefined,
        customData: (updatedRecord.custom_data as Record<string, string>) || undefined,
        enrichedData:
          (updatedRecord.enriched_data as unknown as EnrichedLocationData) || undefined,
        updatedAt: new Date(updatedRecord.updated_at),
      };

      // Update the location in the store
      updateLocation(updatedRecord.id, updatedLocation);

      // Emit event to trigger stats refresh in toolbar and map re-render
      window.dispatchEvent(new CustomEvent('location-realtime-update'));
    },
    [updateLocation]
  );

  useEffect(() => {
    if (documents.length === 0) return;

    // Get all document IDs
    const documentIds = documents.map(doc => doc.id);
    console.log('Setting up realtime subscription for documents:', documentIds);

    // Create channels for each document
    const channels = documentIds.map(docId => {
      return supabase
        .channel(`locations-${docId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'locations',
            filter: `document_id=eq.${docId}`,
          },
          handleLocationUpdate
        )
        .subscribe((status) => {
          console.log(`Realtime subscription for ${docId}:`, status);
        });
    });

    return () => {
      console.log('Cleaning up realtime subscriptions');
      channels.forEach(channel => supabase.removeChannel(channel));
    };
  }, [documents.map(d => d.id).join(','), handleLocationUpdate]);
}
