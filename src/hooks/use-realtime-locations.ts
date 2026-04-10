import { useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLocationsStore } from '@/store/locations-store';
import { GeoLocation, EnrichedLocationData } from '@/types/location';

/**
 * Hook that listens to realtime changes in the locations table
 * and updates the store automatically when a location is modified.
 * Now listens to ALL documents for consolidated view.
 */
export function useRealtimeLocations() {
 const documents = useLocationsStore((state) => state.documents);
 const updateLocation = useLocationsStore((state) => state.updateLocation);

  // Memoize document IDs by value (not reference) to prevent unnecessary re-subscriptions
 const documentIdsString = useMemo(() => 
 documents.map(d => d.id).sort().join(','), 
 [documents]
 );
 const documentIds = useMemo(() => 
 documentIdsString ? documentIdsString.split(',') : [], 
 [documentIdsString]
 );
 
  // Track if channels are already set up to prevent duplicate subscriptions
 const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);
 const lastDocIdsRef = useRef<string>('');

 const handleLocationUpdate = useCallback(
 (payload: any) => {
 const updatedRecord = payload.new;
 const oldRecord = payload.old;

      // If this is a soft-delete, remove it from the store immediately.
      // (The GeoLocation type doesn't model deleted_at, so we can't just "update" it.)
 if (updatedRecord?.deleted_at) {
 try {
 console.log('Realtime delete received for location:', updatedRecord.name);

 const { documents, updateDocumentLocations } = useLocationsStore.getState();
 const docId: string | undefined = updatedRecord.document_id || undefined;

 if (docId) {
 const doc = documents.find((d) => d.id === docId);
 if (doc) {
 updateDocumentLocations(
 docId,
 doc.locations.filter((l) => l.id !== updatedRecord.id)
 );
 }
 } else {
            // Fallback: remove from all docs
 documents.forEach((doc) => {
 updateDocumentLocations(
 doc.id,
 doc.locations.filter((l) => l.id !== updatedRecord.id)
 );
 });
 }

 window.dispatchEvent(new CustomEvent('trash-updated'));
 window.dispatchEvent(new CustomEvent('location-realtime-update'));
 } catch (e) {
 console.warn('Failed to apply realtime delete locally', e);
 }
 return;
 }

 console.log('Realtime update received for location:', updatedRecord.name);

  const baseCustomData = (updatedRecord.custom_data as Record<string, string>) || {};
  const mergedCustomData: Record<string, string> = {
  ...baseCustomData,
  ...(updatedRecord.user_image_url ? { user_image_url: String(updatedRecord.user_image_url) } : {}),
  ...(updatedRecord.user_image_visibility ? { user_image_visibility: String(updatedRecord.user_image_visibility) } : {}),
  };

  const { documents } = useLocationsStore.getState();
  const currentLocation = documents
    .flatMap((doc) => doc.locations)
    .find((loc) => loc.id === updatedRecord.id);

  const updatedLocation: Partial<GeoLocation> = {
  ...(updatedRecord.name !== undefined ? { name: updatedRecord.name } : {}),
  ...(updatedRecord.description !== undefined ? { description: updatedRecord.description || undefined } : {}),
  ...(updatedRecord.latitude !== undefined && updatedRecord.longitude !== undefined
    ? {
        coordinates: {
          lat: updatedRecord.latitude,
          lng: updatedRecord.longitude,
          altitude: updatedRecord.altitude || undefined,
        },
      }
    : {}),
  ...(updatedRecord.continent !== undefined ? { continent: updatedRecord.continent || undefined } : {}),
  ...(updatedRecord.country !== undefined ? { country: updatedRecord.country || undefined } : {}),
  ...(updatedRecord.region !== undefined ? { region: updatedRecord.region || undefined } : {}),
  ...(updatedRecord.zone !== undefined ? { zone: updatedRecord.zone || undefined } : {}),
  ...(updatedRecord.place_type !== undefined ? { placeType: (updatedRecord.place_type as GeoLocation['placeType']) || undefined } : {}),
  ...(
    updatedRecord.custom_data !== undefined ||
    updatedRecord.user_image_url !== undefined ||
    updatedRecord.user_image_visibility !== undefined
      ? { customData: Object.keys(mergedCustomData).length ? mergedCustomData : undefined }
      : {}
  ),
  ...(updatedRecord.enriched_data !== undefined
    ? { enrichedData: (updatedRecord.enriched_data as unknown as EnrichedLocationData) || undefined }
    : currentLocation?.enrichedData
      ? { enrichedData: currentLocation.enrichedData }
      : {}),
  ...(updatedRecord.updated_at !== undefined ? { updatedAt: new Date(updatedRecord.updated_at) } : {}),
  };

      // Update the location in the store
  updateLocation(updatedRecord.id, updatedLocation);

      // Decide whether this update should trigger a full popup refresh on the map.
      // Personal updates (visited / rating / photo) are handled with dedicated events to avoid popup scroll resets.
 try {
 const oldCustomData = ((oldRecord?.custom_data as Record<string, string>) || {}) as Record<string, string>;

 const allKeys = new Set([...Object.keys(oldCustomData), ...Object.keys(baseCustomData)]);
 const changedCustomKeys = Array.from(allKeys).filter((k) => String(oldCustomData[k] ?? '') !== String(baseCustomData[k] ?? ''));

 // Detect photo-only changes (user_image_url is a top-level column, not in custom_data)
 const oldImageUrl = oldRecord?.user_image_url || null;
 const newImageUrl = updatedRecord.user_image_url || null;
 const oldImageVis = oldRecord?.user_image_visibility || null;
 const newImageVis = updatedRecord.user_image_visibility || null;
 const photoChanged = oldImageUrl !== newImageUrl || oldImageVis !== newImageVis;

 const personalKeys = new Set([
 'visited',
 'visited_verified_at',
 'visited_distance_m',
 'oldest_geotagged_photo_date',
 'user_rating',
 ]);

 const nonPersonalCustomKeys = changedCustomKeys.filter((k) => !personalKeys.has(k));
 const isOnlyPersonalChange =
 nonPersonalCustomKeys.length === 0 &&
 (changedCustomKeys.length > 0 || photoChanged);

 if (isOnlyPersonalChange) {
 if (photoChanged) {
 window.dispatchEvent(
 new CustomEvent('photo-updated', {
 detail: {
 locationId: updatedRecord.id,
 imageUrl: newImageUrl,
 visibility: newImageVis,
 },
 })
 );
 }

 if (
 changedCustomKeys.some((k) =>
 ['visited', 'visited_verified_at', 'visited_distance_m', 'oldest_geotagged_photo_date'].includes(k)
 )
 ) {
 window.dispatchEvent(
 new CustomEvent('visited-updated', {
 detail: {
 locationId: updatedRecord.id,
 visited: String(baseCustomData.visited || '') === 'true',
 distance: baseCustomData.visited_distance_m
 ? Number(baseCustomData.visited_distance_m)
 : undefined,
 customData: mergedCustomData,
 },
 })
 );
 }

 if (changedCustomKeys.includes('user_rating')) {
 window.dispatchEvent(
 new CustomEvent('rating-updated', {
 detail: {
 locationId: updatedRecord.id,
 rating: String(baseCustomData.user_rating || ''),
 customData: mergedCustomData,
 },
 })
 );
 }

 return; // avoid full popup regeneration
 }
 } catch (e) {
         // Fallback to default behavior
 console.warn('Realtime change classification failed, falling back to full refresh', e);
 }

      // Emit event to trigger stats refresh in toolbar and map re-render
 window.dispatchEvent(new CustomEvent('location-realtime-update'));
 },
 [updateLocation]
 );

 useEffect(() => {
 if (documentIds.length === 0) return;
 
    // Skip if document IDs haven't actually changed
 if (lastDocIdsRef.current === documentIdsString) {
 return;
 }
 lastDocIdsRef.current = documentIdsString;

 console.log('Setting up realtime subscription for documents:', documentIds);

    // Clean up existing channels first
 if (channelsRef.current.length > 0) {
 console.log('Cleaning up previous realtime subscriptions');
 channelsRef.current.forEach(channel => supabase.removeChannel(channel));
 channelsRef.current = [];
 }

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
 
 channelsRef.current = channels;

 return () => {
 console.log('Cleaning up realtime subscriptions');
 channels.forEach(channel => supabase.removeChannel(channel));
 channelsRef.current = [];
 lastDocIdsRef.current = '';
 };
 }, [documentIdsString, handleLocationUpdate]);
}
