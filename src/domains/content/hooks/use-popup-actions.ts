/**
 * Hook: usePopupActions
 * Domain: Content
 * Handles all map popup actions (enrich, delete, visited, rating, photo, adopt).
 */
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLocationsStore } from '@/store/locations-store';
import { usePermissions } from '@/domains/identity';
import { GeoLocation } from '@/types/location';
import { toast } from 'sonner';

interface UsePopupActionsOptions {
  loadFromDatabase: () => Promise<void>;
  onOpenNotes: (location: GeoLocation) => void;
  onOpenPhotoUpload: (loc: { id: string; name: string; coordinates: { lat: number; lng: number } }) => void;
}

export function usePopupActions({ loadFromDatabase, onOpenNotes, onOpenPhotoUpload }: UsePopupActionsOptions) {
  const { isMaster } = usePermissions();
  const { documents, updateLocation } = useLocationsStore();

  const handleToggleVisited = useCallback(async (location: GeoLocation, newVisited: boolean, distance?: number) => {
    try {
      const { data: dbLocation, error: fetchError } = await supabase
        .from('locations')
        .select('custom_data')
        .eq('id', location.id)
        .single();

      if (fetchError) throw fetchError;

      const currentCustomData = (dbLocation?.custom_data as Record<string, string>) || {};
      const updatedCustomData: Record<string, string> = {
        ...currentCustomData,
        visited: newVisited ? 'true' : 'false',
      };

      if (newVisited && distance !== undefined) {
        updatedCustomData.visited_verified_at = new Date().toISOString();
        updatedCustomData.visited_distance_m = Math.round(distance).toString();
      }

      const { error: updateError } = await supabase
        .from('locations')
        .update({
          custom_data: updatedCustomData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', location.id);

      if (updateError) throw updateError;

      window.dispatchEvent(new CustomEvent('visited-updated', {
        detail: {
          locationId: location.id,
          visited: newVisited,
          distance,
          customData: updatedCustomData,
        }
      }));

      if (newVisited) {
        toast.success(`Visitado verificado${distance !== undefined ? ` (${Math.round(distance)}m)` : ''}`);
      } else {
        toast.success('Desmarcado como visitado');
      }
    } catch (error) {
      console.error('Toggle visited error:', error);
      toast.error('Error al actualizar estado');
    }
  }, []);

  const handlePopupAction = useCallback(async (event: CustomEvent<{ action: string; locationId: string; rating?: string }>) => {
    const { action, locationId } = event.detail;

    let location: GeoLocation | undefined;
    for (const doc of documents) {
      location = doc.locations.find(l => l.id === locationId);
      if (location) break;
    }

    if (!location) {
      toast.error('Ubicación no encontrada');
      return;
    }

    if (action === 'enrich' || action === 'quick-classify' || action === 'regenerate') {
      const toastId = toast.loading(`Enriqueciendo ${location.name}...`);

      try {
        const { data, error } = await supabase.functions.invoke('enrich-location', {
          body: { location, skipValidation: true }
        });

        if (error) throw error;
        if (!data?.success || !data?.data) {
          throw new Error(data?.error || data?.message || 'Sin datos de enriquecimiento');
        }

        const enrichedData = data.data;
        const geoData = enrichedData._geocoded || {};
        const { error: updateError } = await supabase
          .from('locations')
          .update({
            enriched_data: enrichedData,
            enrichment_status: 'enriched',
            place_type: enrichedData.clasificacion?.codigo || location.placeType || null,
            continent: geoData.continent || location.continent || null,
            country: geoData.country || location.country || null,
            region: geoData.region || location.region || null,
            zone: geoData.zone || location.zone || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', locationId);

        if (updateError) throw updateError;

        toast.success('Ficha enriquecida', { id: toastId });

        // In-place update instead of full reload to preserve map state
        updateLocation(locationId, {
          enrichedData: enrichedData,
          placeType: enrichedData.clasificacion?.codigo || location.placeType || undefined,
          continent: geoData.continent || location.continent || undefined,
          country: geoData.country || location.country || undefined,
          region: geoData.region || location.region || undefined,
          zone: geoData.zone || location.zone || undefined,
          updatedAt: new Date(),
        });

        useLocationsStore.getState().setFocusedLocation(locationId);
      } catch (error) {
        console.error('Enrich error:', error);
        toast.error('Error al enriquecer', { id: toastId });
      }
    } else if (action === 'delete-location') {
      const locationName = (event.detail as any).locationName || location.name;
      const toastId = toast.loading(`Moviendo "${locationName}" a la papelera...`);

      try {
        const { error } = await supabase
          .from('locations')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', locationId);

        if (error) throw error;

        toast.success(`"${locationName}" movido a la papelera`, { id: toastId });
        await loadFromDatabase();
        window.dispatchEvent(new CustomEvent('trash-updated'));
      } catch (error) {
        console.error('Delete location error:', error);
        toast.error('Error al eliminar', { id: toastId });
      }
    } else if (action === 'add-notes') {
      onOpenNotes(location);
    } else if (action === 'toggle-visited') {
      const currentVisited = location.customData?.visited === 'true';

      if (currentVisited) {
        await handleToggleVisited(location, false);
        return;
      }

      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        toast.error('Debes iniciar sesión');
        return;
      }

      const ownership = useLocationsStore.getState().getLocationOwnership(locationId, currentUser.id);

      if (!ownership.isOwn) {
        const adoptToastId = toast.loading(`Añadiendo "${location.name}" a tu colección...`);

        try {
          let userDocId: string;
          const { data: existingDoc } = await supabase
            .from('documents')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('name', 'Mi Colección')
            .single();

          if (existingDoc) {
            userDocId = existingDoc.id;
          } else {
            const { data: newDoc, error: docError } = await supabase
              .from('documents')
              .insert({
                name: 'Mi Colección',
                original_filename: 'mi-coleccion.kml',
                user_id: currentUser.id,
              })
              .select('id')
              .single();

            if (docError) throw docError;
            userDocId = newDoc.id;
          }

          const { data: existingAdoption } = await supabase
            .from('locations')
            .select('id, name, custom_data')
            .eq('document_id', userDocId)
            .contains('custom_data', { adopted_from: locationId })
            .single();

          let targetLocationId: string;
          let targetLocation: GeoLocation;

          if (existingAdoption) {
            toast.info(`Ya tienes "${existingAdoption.name}" en tu colección, marcando como visitado...`, { id: adoptToastId });
            targetLocationId = existingAdoption.id;
            targetLocation = {
              ...location,
              id: existingAdoption.id,
              customData: existingAdoption.custom_data as Record<string, string> | undefined,
            };
          } else {
            targetLocationId = crypto.randomUUID();
            const { error: insertError } = await supabase
              .from('locations')
              .insert({
                id: targetLocationId,
                document_id: userDocId,
                name: location.name,
                description: location.description,
                latitude: location.coordinates.lat,
                longitude: location.coordinates.lng,
                altitude: location.coordinates.altitude,
                continent: location.continent,
                country: location.country,
                region: location.region,
                zone: location.zone,
                place_type: location.placeType,
                enriched_data: location.enrichedData as any,
                custom_data: {
                  ...(location.customData || {}),
                  adopted_from: locationId,
                  adopted_at: new Date().toISOString(),
                },
                visibility: 'private',
                pioneer_user_id: currentUser.id,
              });

            if (insertError) throw insertError;

            toast.success(`"${location.name}" añadido a tu colección`, { id: adoptToastId });
            targetLocation = {
              ...location,
              id: targetLocationId,
              customData: {
                ...(location.customData || {}),
                adopted_from: locationId,
                adopted_at: new Date().toISOString(),
              },
            };
          }

          if (isMaster()) {
            await handleToggleVisited(targetLocation, true);
            toast.success('Marcado como visitado (Master)');
            await loadFromDatabase();
            setTimeout(() => {
              useLocationsStore.getState().setFocusedLocation(targetLocationId);
            }, 300);
            return;
          }

          const hasGeotaggedPhoto = location.customData?.verified_visit_photo === 'true';

          if (hasGeotaggedPhoto) {
            await handleToggleVisited(targetLocation, true);
            await loadFromDatabase();
            setTimeout(() => {
              useLocationsStore.getState().setFocusedLocation(targetLocationId);
            }, 300);
            return;
          }

          if (!navigator.geolocation) {
            toast.error('Tu navegador no soporta geolocalización. Sube una foto con datos GPS del lugar.');
            await loadFromDatabase();
            setTimeout(() => {
              useLocationsStore.getState().setFocusedLocation(targetLocationId);
            }, 300);
            return;
          }

          toast.loading('Verificando tu ubicación...', { id: 'verifying-location' });

          navigator.geolocation.getCurrentPosition(
            async (position) => {
              const userLat = position.coords.latitude;
              const userLng = position.coords.longitude;
              const locationLat = location.coordinates.lat;
              const locationLng = location.coordinates.lng;

              const R = 6371000;
              const dLat = (locationLat - userLat) * Math.PI / 180;
              const dLng = (locationLng - userLng) * Math.PI / 180;
              const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(userLat * Math.PI / 180) * Math.cos(locationLat * Math.PI / 180) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              const distance = R * c;

              toast.dismiss('verifying-location');

              const MAX_DISTANCE = 500;

              if (distance <= MAX_DISTANCE) {
                await handleToggleVisited(targetLocation, true, distance);
              } else {
                const distanceText = distance < 1000
                  ? Math.round(distance) + ' metros'
                  : (distance / 1000).toFixed(1) + ' km';
                toast.error(`Estás a ${distanceText} del punto. Acércate o sube una foto con GPS.`);
              }

              await loadFromDatabase();
              setTimeout(() => {
                useLocationsStore.getState().setFocusedLocation(targetLocationId);
              }, 300);
            },
            async (error) => {
              toast.dismiss('verifying-location');
              console.error('Geolocation error:', error);
              toast.error('No se pudo obtener tu ubicación. Sube una foto con datos GPS del lugar.');
              await loadFromDatabase();
              setTimeout(() => {
                useLocationsStore.getState().setFocusedLocation(targetLocationId);
              }, 300);
            },
            { enableHighAccuracy: true, timeout: 10000 }
          );
        } catch (error) {
          console.error('Adopt and visit error:', error);
          toast.error('Error al añadir a tu colección', { id: adoptToastId });
        }
        return;
      }

      // Own point — normal visited logic
      if (isMaster()) {
        await handleToggleVisited(location, true);
        toast.success('Marcado como visitado (Master)');
        return;
      }

      const hasGeotaggedPhoto = location.customData?.verified_visit_photo === 'true';

      if (hasGeotaggedPhoto) {
        await handleToggleVisited(location, true);
        return;
      }

      if (!navigator.geolocation) {
        toast.error('Tu navegador no soporta geolocalización. Sube una foto con datos GPS del lugar.');
        return;
      }

      toast.loading('Verificando tu ubicación...', { id: 'verifying-location' });

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const userLat = position.coords.latitude;
          const userLng = position.coords.longitude;
          const locationLat = location.coordinates.lat;
          const locationLng = location.coordinates.lng;

          const R = 6371000;
          const dLat = (locationLat - userLat) * Math.PI / 180;
          const dLng = (locationLng - userLng) * Math.PI / 180;
          const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(userLat * Math.PI / 180) * Math.cos(locationLat * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const distance = R * c;

          toast.dismiss('verifying-location');

          const MAX_DISTANCE = 500;

          if (distance <= MAX_DISTANCE) {
            await handleToggleVisited(location, true, distance);
          } else {
            const distanceText = distance < 1000
              ? Math.round(distance) + ' metros'
              : (distance / 1000).toFixed(1) + ' km';

            const warningEl = document.getElementById(`visit-validation-warning-${location.id}`);
            const distanceEl = document.getElementById(`visit-distance-text-${location.id}`);
            if (warningEl && distanceEl) {
              distanceEl.textContent = `Estás a ${distanceText} del punto.`;
              warningEl.style.display = 'block';
              setTimeout(() => {
                warningEl.style.display = 'none';
              }, 8000);
            }
          }
        },
        (error) => {
          toast.dismiss('verifying-location');
          console.error('Geolocation error:', error);
          toast.error('No se pudo obtener tu ubicación. Sube una foto con datos GPS del lugar.');
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else if (action === 'set-rating' || action === 'clear-rating') {
      const rating = action === 'clear-rating' ? '' : (event.detail as any).rating || '';

      try {
        const { data: dbLocation, error: fetchError } = await supabase
          .from('locations')
          .select('custom_data')
          .eq('id', location.id)
          .single();

        if (fetchError) throw fetchError;

        const currentCustomData = (dbLocation?.custom_data as Record<string, string>) || {};
        const updatedCustomData = {
          ...currentCustomData,
          user_rating: rating,
        };

        const { error: updateError } = await supabase
          .from('locations')
          .update({
            custom_data: updatedCustomData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', location.id);

        if (updateError) throw updateError;

        updateLocation(location.id, {
          customData: updatedCustomData,
          updatedAt: new Date(),
        });

        window.dispatchEvent(
          new CustomEvent('rating-updated', {
            detail: {
              locationId: location.id,
              rating,
              customData: updatedCustomData,
            },
          })
        );

        if (rating) {
          toast.success(`Valoración: ${'★'.repeat(parseInt(rating))}${'☆'.repeat(5 - parseInt(rating))}`);
        } else {
          toast.success('Valoración eliminada');
        }
      } catch (error) {
        console.error('Rating error:', error);
        toast.error('Error al guardar valoración');
      }
    } else if (action === 'upload-photo') {
      const locationName = (event.detail as any).locationName || location.name;
      onOpenPhotoUpload({
        id: locationId,
        name: locationName,
        coordinates: location.coordinates
      });
    } else if (action === 'delete-photo') {
      const toastId = toast.loading('Eliminando foto...');

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('Debes iniciar sesión', { id: toastId });
          return;
        }

        const currentImageUrl = location.customData?.user_image_url;

        if (currentImageUrl) {
          const urlParts = currentImageUrl.split('/location-photos/');
          if (urlParts.length > 1) {
            const filePath = urlParts[1];
            await supabase.storage.from('location-photos').remove([filePath]);
          }
        }

        await supabase
          .from('location_photos')
          .delete()
          .eq('location_id', locationId)
          .eq('user_id', user.id);

        const { error: updateError } = await supabase
          .from('locations')
          .update({
            user_image_url: null,
            user_image_visibility: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', locationId);

        if (updateError) throw updateError;

        const currentCustomData = { ...location.customData };
        delete currentCustomData.user_image_url;
        delete currentCustomData.user_image_visibility;

        updateLocation(locationId, {
          customData: Object.keys(currentCustomData).length ? currentCustomData : undefined,
          updatedAt: new Date(),
        });

        window.dispatchEvent(new CustomEvent('photo-updated', {
          detail: { locationId, imageUrl: null, visibility: null }
        }));
        toast.success('Foto eliminada, mostrando imagen IA', { id: toastId });
      } catch (error) {
        console.error('Delete photo error:', error);
        toast.error('Error al eliminar foto', { id: toastId });
      }
    } else if (action === 'add-to-collection') {
      const toastId = toast.loading(`Añadiendo "${location.name}" a tu colección...`);

      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (!currentUser) {
          toast.error('Debes iniciar sesión', { id: toastId });
          return;
        }

        let userDocId: string;
        const { data: existingDoc } = await supabase
          .from('documents')
          .select('id')
          .eq('user_id', currentUser.id)
          .eq('name', 'Mi Colección')
          .single();

        if (existingDoc) {
          userDocId = existingDoc.id;
        } else {
          const { data: newDoc, error: docError } = await supabase
            .from('documents')
            .insert({
              name: 'Mi Colección',
              original_filename: 'mi-coleccion.kml',
              user_id: currentUser.id,
            })
            .select('id')
            .single();

          if (docError) throw docError;
          userDocId = newDoc.id;
        }

        const { data: existingAdoption } = await supabase
          .from('locations')
          .select('id, name')
          .eq('document_id', userDocId)
          .contains('custom_data', { adopted_from: locationId })
          .single();

        if (existingAdoption) {
          toast.info(`Ya tienes "${existingAdoption.name}" en tu colección`, { id: toastId });
          useLocationsStore.getState().setFocusedLocation(existingAdoption.id);
          return;
        }

        const newLocationId = crypto.randomUUID();
        const { error: insertError } = await supabase
          .from('locations')
          .insert({
            id: newLocationId,
            document_id: userDocId,
            name: location.name,
            description: location.description,
            latitude: location.coordinates.lat,
            longitude: location.coordinates.lng,
            altitude: location.coordinates.altitude,
            continent: location.continent,
            country: location.country,
            region: location.region,
            zone: location.zone,
            place_type: location.placeType,
            enriched_data: location.enrichedData as any,
            custom_data: {
              ...(location.customData || {}),
              adopted_from: locationId,
              adopted_at: new Date().toISOString(),
            },
            visibility: 'private',
            pioneer_user_id: currentUser.id,
          });

        if (insertError) throw insertError;

        toast.success(`"${location.name}" añadido a tu colección`, { id: toastId });

        await loadFromDatabase();

        setTimeout(() => {
          useLocationsStore.getState().setFocusedLocation(newLocationId);
        }, 300);
      } catch (error) {
        console.error('Add to collection error:', error);
        toast.error('Error al añadir a tu colección', { id: toastId });
      }
    }
  }, [documents, updateLocation, isMaster, handleToggleVisited, loadFromDatabase, onOpenNotes, onOpenPhotoUpload]);

  return { handlePopupAction };
}
