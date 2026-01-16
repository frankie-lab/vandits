import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLocationsStore } from '@/store/locations-store';
import { GeoLocation, EnrichedLocationData } from '@/types/location';

/**
 * Hook that listens to realtime changes in the locations table
 * and updates the store automatically when a location is modified.
 */
export function useRealtimeLocations() {
  const { selectedDocument, updateLocation } = useLocationsStore();

  const handleLocationUpdate = useCallback((payload: any) => {
    if (!selectedDocument) return;
    
    const updatedRecord = payload.new;
    
    // Only process updates for the current document
    if (updatedRecord.document_id !== selectedDocument.id) return;

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
      placeType: updatedRecord.place_type as GeoLocation['placeType'] || undefined,
      customData: (updatedRecord.custom_data as Record<string, string>) || undefined,
      enrichedData: updatedRecord.enriched_data as unknown as EnrichedLocationData || undefined,
      updatedAt: new Date(updatedRecord.updated_at),
    };

    // Update the location in the store
    updateLocation(selectedDocument.id, updatedRecord.id, updatedLocation);
    
    // Emit event to trigger stats refresh in toolbar
    window.dispatchEvent(new CustomEvent('location-realtime-update'));
  }, [selectedDocument, updateLocation]);

  useEffect(() => {
    if (!selectedDocument) return;

    console.log('Setting up realtime subscription for document:', selectedDocument.id);

    // Subscribe to changes in the locations table for this document
    const channel = supabase
      .channel(`locations-${selectedDocument.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'locations',
          filter: `document_id=eq.${selectedDocument.id}`,
        },
        handleLocationUpdate
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
      });

    return () => {
      console.log('Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [selectedDocument?.id, handleLocationUpdate]);
}
