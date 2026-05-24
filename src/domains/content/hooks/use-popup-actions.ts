/**
 * Hook: usePopupActions
 * Domain: Content
 * Handles all map popup actions (enrich, delete, visited, rating, photo, adopt).
 */
import { useCallback, useEffect } from 'react';
import { dispatchGlobalEvent } from '@/lib/global-events';
import { supabase } from '@/integrations/supabase/client';
import { useLocationsStore } from '@/domains/content';
import { usePermissions } from '@/domains/identity';
import { useAuth } from '@/domains/identity/hooks/use-auth';
import { GeoLocation } from '@/types/location';
import { toast } from 'sonner';
import { dualWriteVisited, dualWriteRating, dualWriteAdopt } from '@/domains/v2/dual-write-user-place';
import { userPlaceService } from '@/services/user-place.service';
import { getV2Flags } from '@/hooks/use-v2-flags';
import { triggerEnrichLocation } from '@/domains/content/lib/enrich-location';
import { useGeocodingJobStore } from '@/stores/geocoding-job-store';
import {
  setPopupOperationalState,
  clearPopupOperationalState,
  isPopupOperational,
  getPopupIdForLocation,
} from '@/components/map/popup-operational-state';
import { subscribePopupEnrichmentPhase } from '@/components/map/popup-enrichment-phase-bus';
import {
  openPopupOverflowMenu,
  type OverflowMenuItem,
} from '@/components/map/popup-overflow-menu';
import { openGoogleMaps, openAppleMaps } from '@/domains/sharing/lib/channel-adapters';
import { buildExternalMapLink } from '@/domains/sharing/lib/external-maps-url';
import { exportToKML } from '@/lib/kml-parser';
import { evaluatePoiExport } from '@/domains/content/lib/poi-export-eligibility';

interface UsePopupActionsOptions {
  loadFromDatabase: () => Promise<void>;
  onOpenNotes: (location: GeoLocation) => void;
  onOpenPhotoUpload: (loc: { id: string; name: string; coordinates: { lat: number; lng: number } }) => void;
}

export function usePopupActions({ loadFromDatabase, onOpenNotes, onOpenPhotoUpload }: UsePopupActionsOptions) {
  const { hasPermission } = usePermissions();
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  // PR-ADMIN-AUDIT Step 3: visited-verification bypass gated by master-only capability
  // (`delete_any_location` is the only existing master-only operational cap; semantic
  // mismatch documented — revisit in PR-ADMIN-AUDIT-4 if a dedicated cap is added).
  const canBypassVisitVerification = () => hasPermission('delete_any_location');
  const { documents, updateLocation } = useLocationsStore();

  // P-POPUP-17 — single global listener that drives popup operational
  // overlay (P-POPUP-16) for ANY enrichment mutation over the open POI,
  // regardless of entry point (batch, document tab, general list, retry,
  // realtime, in-popup action, adopt-nearby orchestrator).
  useEffect(() => {
    const unsub = subscribePopupEnrichmentPhase();
    return () => {
      try { unsub?.(); } catch { /* noop */ }
    };
  }, []);



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

      // V2: use service when write flag is active, otherwise dual-write bridge
      supabase.auth.getUser().then(async ({ data: { user } }) => {
        if (!user) return;
        try {
          const flags = await getV2Flags();
          if (flags.v2DataWriteUserPlaces) {
            // Full V2 service path
            if (newVisited) {
              await userPlaceService.markVisited(user.id, location.id);
            } else {
              await userPlaceService.setVisitStatus(user.id, location.id, 'not_visited');
            }
          } else {
            // Dual-write bridge (fire-and-forget)
            dualWriteVisited({ userId: user.id, placeId: location.id, visited: newVisited });
          }
        } catch (e) {
          console.warn('[V2] visited sync error:', e);
        }
      });

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
      // P-POPUP-16: operational loading state (in-place, no remount).
      const popupId = getPopupIdForLocation(locationId);
      if (isPopupOperational(popupId)) return;
      setPopupOperationalState(popupId, 'loading', {
        label: action === 'regenerate' ? 'Re-enriqueciendo POI…' : 'Enriqueciendo POI…',
      });
      try {
        // Delegate to the centralized helper so popup, doc-list and general-list
        // all share identical behavior. See src/domains/content/lib/enrich-location.ts
        await triggerEnrichLocation(locationId, { regenerate: action === 'regenerate' });
      } finally {
        clearPopupOperationalState(popupId);
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
        dispatchGlobalEvent('trash-updated');
      } catch (error) {
        console.error('Delete location error:', error);
        toast.error('Error al eliminar', { id: toastId });
      }
    } else if (action === 'popup-overflow') {
      // Footer overflow menu (Re-enriquecer · Notas · ...).
      // Items: Abrir en Google Maps, Abrir en Apple Maps, Exportar este POI,
      // Borrar POI (destructive, separator). `Borrar` solo visible para owner.
      const trigger = document.querySelector<HTMLElement>(
        `button[data-action="popup-overflow"][data-location-id="${locationId}"]`,
      );
      if (!trigger) return;

      const coords = location.coordinates;
      const hasCoords = !!coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng);
      const ownership = useLocationsStore.getState().getLocationOwnership(locationId, currentUserId);
      const isOwn = ownership?.isOwn === true;
      const canEditOwn = isOwn;

      // Export gating: internal (owner) o public (POI compartible).
      const exportScope: 'internal' | 'public' = isOwn ? 'internal' : 'public';
      const exportEval = evaluatePoiExport(location, exportScope, { currentUserId });
      const canExport = exportEval.eligible;

      const icon = (svg: string) =>
        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">${svg}</svg>`;

      // PR-SHARE-EXT-MAPS-2: labels dinámicos según confidence
      // (high="Abrir", medium="Buscar", low="Abrir coordenadas").
      const googleLink = buildExternalMapLink(location, 'google');
      const appleLink = buildExternalMapLink(location, 'apple');

      const items: OverflowMenuItem[] = [
        {
          action: 'open-google-maps',
          label: googleLink.label ?? 'Abrir en Google Maps',
          icon: icon('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'),
          visible: !!googleLink.url,
        },
        {
          action: 'open-apple-maps',
          label: appleLink.label ?? 'Abrir en Apple Maps',
          icon: icon('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'),
          visible: !!appleLink.url,
        },
        {
          action: 'export-poi',
          label: 'Exportar este POI',
          icon: icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
          visible: canExport,
        },
        {
          action: 'delete-location',
          label: 'Borrar POI',
          icon: icon('<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
          visible: canEditOwn,
          destructive: true,
          separatorBefore: true,
        },
      ];

      openPopupOverflowMenu({
        trigger,
        items,
        locationId,
        locationName: location.name,
      });
    } else if (action === 'open-google-maps') {
      openGoogleMaps(location);
    } else if (action === 'open-apple-maps') {
      openAppleMaps(location);
    } else if (action === 'export-poi') {
      try {
        const isOwn = useLocationsStore.getState().getLocationOwnership(locationId, currentUserId)?.isOwn === true;
        const exportScope: 'internal' | 'public' = isOwn ? 'internal' : 'public';
        const ctx = { currentUserId };
        const evalRes = evaluatePoiExport(location, exportScope, ctx);
        if (!evalRes.eligible) {
          toast.error('Este POI no es exportable en este modo');
          return;
        }
        const content = exportToKML([location], location.name || 'poi', 'general', exportScope, ctx, { scopeProvided: true });
        const blob = new Blob([content], { type: 'application/vnd.google-earth.kml+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const safeName = (location.name || 'poi').replace(/[^\w\-]+/g, '_').slice(0, 40);
        const ts = new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = `${safeName}_${exportScope}_${ts}.kml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('POI exportado a KML');
      } catch (err) {
        console.error('Export POI error:', err);
        toast.error('Error al exportar');
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

          if (canBypassVisitVerification()) {
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
      if (canBypassVisitVerification()) {
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

        // V2: use service when write flag is active, otherwise dual-write
        if (rating) {
          supabase.auth.getUser().then(async ({ data: { user } }) => {
            if (!user) return;
            try {
              const flags = await getV2Flags();
              if (flags.v2DataWriteUserPlaces) {
                await userPlaceService.rate(user.id, location.id, parseInt(rating));
              } else {
                dualWriteRating({ userId: user.id, placeId: location.id, rating: parseInt(rating) });
              }
            } catch (e) {
              console.warn('[V2] rating sync error:', e);
            }
          });
        }

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
    } else if (action === 'view-nearby' || action === 'merge-nearby') {
      // Dispatch event to open nearby context panel in DocumentFocusView
      window.dispatchEvent(new CustomEvent('open-nearby-context', {
        detail: { locationId, location }
      }));
    } else if (action === 'duplicate-point') {
      const toastId = toast.loading(`Duplicando "${location.name}"...`);
      try {
        const { error } = await supabase
          .from('locations')
          .insert({
            document_id: location.documentId,
            name: `${location.name} (copia)`,
            description: location.description,
            latitude: location.coordinates.lat + 0.0002,
            longitude: location.coordinates.lng + 0.0002,
            place_type: location.placeType,
            continent: location.continent,
            country: location.country,
            region: location.region,
          });

        if (error) throw error;
        toast.success(`Punto duplicado: "${location.name} (copia)"`, { id: toastId });
        await loadFromDatabase();
      } catch (error) {
        console.error('Duplicate point error:', error);
        toast.error('Error al duplicar', { id: toastId });
      }
    } else if (action === 'reclassify-type') {
      // Dispatch event to open reclassify panel
      window.dispatchEvent(new CustomEvent('open-reclassify', {
        detail: { locationId, location }
      }));
    } else if (action === 'curation-primary') {
      // P-POI-CURATION-2 — Real wiring for the unified curation primary button.
      // Sub-action comes from `data-curation-action` propagated by the
      // dispatcher in `setupActionClickHandler` (map-popup-handlers.ts).
      // No silent no-op: every branch produces real work or explicit feedback.
      const curationAction = (event.detail as any).curationAction as string | undefined;
      const popupId = getPopupIdForLocation(locationId);
      if (isPopupOperational(popupId)) return;

      if (curationAction === 'validate-geo') {
        // P-POI-CURATION-3 (Fase 1): el botón "Validar geografía" arranca el
        // pipeline continuo validate-geo → recompute → enrich → recompute
        // hasta el siguiente bloqueo real o estado sano. El overlay
        // P-POPUP-16 cubre TODO el pipeline; el orquestador muta el `label`
        // in-place ("Validando geografía…" → "Curando POI…"). El toast final
        // es el ÚNICO mensaje que ve el usuario para este flujo.
        setPopupOperationalState(popupId, 'loading', { label: 'Validando geografía…' });
        try {
          const { advancePoiCurationUntilBlocked } = await import(
            '@/domains/content/lib/advance-poi-curation'
          );
          const result = await advancePoiCurationUntilBlocked(
            locationId,
            'validate-geo',
            popupId,
          );
          if (result.blocker === 'none') {
            toast.success(result.message);
          } else {
            toast.message(result.message);
          }
        } catch (err) {
          console.error('[advance-poi-curation] error:', err);
          toast.error('No se pudo curar el POI');
        } finally {
          clearPopupOperationalState(popupId);
        }
        return;
      }

      if (curationAction === 'rate-experience') {
        // Scroll/focus visible ratings block when present; otherwise prompt
        // user to mark as visited first.
        const visited = location.customData?.visited === 'true';
        const block = document.querySelector<HTMLElement>(
          `[data-popup-ratings-block="v1"][data-popup-enrichment-rating="${locationId}"]`,
        ) ?? document.querySelector<HTMLElement>('[data-popup-ratings-block="v1"]');
        if (block) {
          try {
            block.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } catch { /* jsdom */ }
          block.setAttribute('data-popup-ratings-focus', 'pulse');
          setTimeout(() => block.removeAttribute('data-popup-ratings-focus'), 1500);
          if (!visited) {
            toast.message('Primero marca el POI como visitado para valorar tu experiencia.');
          }
        } else {
          toast.message(
            visited
              ? 'Bloque de valoración no disponible en este popup.'
              : 'Primero marca el POI como visitado para valorar tu experiencia.',
          );
        }
        return;
      }

      const pendingLabels: Record<string, string> = {
        'resolve-conflict': 'Resolver conflicto: acción pendiente de implementar',
        'heal-poi': 'Sanar POI: acción pendiente de implementar',
      };
      toast.message(
        pendingLabels[curationAction ?? ''] ?? 'Acción de curación pendiente de implementar',
      );
    }
  }, [documents, updateLocation, hasPermission, handleToggleVisited, loadFromDatabase, onOpenNotes, onOpenPhotoUpload]);

  return { handlePopupAction };
}
