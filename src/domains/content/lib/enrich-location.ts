/**
 * triggerEnrichLocation — Single source of truth for the "Enrich" action.
 *
 * Used by all 3 entry points (map popup, document waypoint list, general
 * location list) so behavior is identical: same edge function call, same
 * `skipValidation: true`, same in-place store update, same `location:enriched`
 * event, same focus + toast UX.
 *
 * See:
 *  - mem://logic/content/in-place-enrichment-update
 *  - mem://logic/enrichment/force-generation-skip-validation
 */
import { supabase } from '@/integrations/supabase/client';
import { useLocationsStore } from '@/domains/content';
import { GeoLocation } from '@/types/location';
import { toast } from 'sonner';
import { resolveAllFks } from '@/shared/geography/resolve-admin-fks';

export interface TriggerEnrichOptions {
  /** When true, force re-generation (semantically the popup's `regenerate`). */
  regenerate?: boolean;
  /** When true, focus the location after enrichment succeeds. Default true. */
  focusAfter?: boolean;
}

export async function triggerEnrichLocation(
  locationId: string,
  opts: TriggerEnrichOptions = {},
): Promise<{ success: boolean; error?: string }> {
  const { focusAfter = true, regenerate = false } = opts;

  // 1. Resolve the location from the store.
  const documents = useLocationsStore.getState().documents;
  let location: GeoLocation | undefined;
  for (const doc of documents) {
    location = doc.locations.find((l) => l.id === locationId);
    if (location) break;
  }

  if (!location) {
    toast.error('Ubicación no encontrada');
    return { success: false, error: 'not_found' };
  }

  // If the point lacks a usable name AND description, IA-only enrichment will
  // produce poor cards. Redirect to the "Contexto cercano" panel so the user
  // can pick a real identity (OSM / nearby owned point) before enriching.
  const rawName = (location.name ?? '').trim();
  const rawDesc = (location.description ?? '').trim();
  const nameMissing = !rawName || /^(unnamed|sin nombre|punto|waypoint|placemark|point\s*\d*)$/i.test(rawName);
  const descMissing = rawDesc.length < 8;
  if (!regenerate && nameMissing && descMissing) {
    window.dispatchEvent(new CustomEvent('open-nearby-context', {
      detail: { locationId, location, reason: 'enrich-needs-identity' },
    }));
    toast.info('Selecciona un punto cercano para identificar este lugar');
    return { success: true };
  }

  const verb = regenerate ? 'Re-enriqueciendo' : 'Enriqueciendo';
  const successMsg = regenerate ? 'Ficha re-enriquecida' : 'Ficha enriquecida';
  const toastId = toast.loading(`${verb} ${location.name}...`);

  try {
    const { data, error } = await supabase.functions.invoke('enrich-location', {
      body: { location, skipValidation: true },
    });

    if (error) throw error;

    // Coherencia nombre ↔ coordenadas: el edge function detectó que el nombre
    // del punto pertenece a un lugar que NO está en estas coordenadas. No
    // generamos ficha; abrimos el panel de Contexto cercano con los candidatos
    // ya cargados para que el usuario decida (cambiar nombre o mover punto).
    if (data && data.success === false && data.reason === 'name_coordinate_mismatch') {
      toast.dismiss(toastId);
      window.dispatchEvent(new CustomEvent('open-nearby-context', {
        detail: {
          locationId,
          location,
          reason: 'name-coordinate-mismatch',
          providedName: data.providedName,
          nameLocation: data.nameLocation,
          nearbyCandidates: data.nearbyCandidates ?? [],
        },
      }));
      toast.info(
        `"${data.providedName}" está a ${data.nameLocation?.distanceKm} km de estas coordenadas. Selecciona la identidad correcta.`,
        { duration: 6000 },
      );
      return { success: false, error: 'name_coordinate_mismatch' };
    }

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

    toast.success(successMsg, { id: toastId });

    // In-place store update — preserves map state, no full reload.
    useLocationsStore.getState().updateLocation(locationId, {
      enrichedData,
      placeType: enrichedData.clasificacion?.codigo || location.placeType || undefined,
      continent: geoData.continent || location.continent || undefined,
      country: geoData.country || location.country || undefined,
      region: geoData.region || location.region || undefined,
      zone: geoData.zone || location.zone || undefined,
      updatedAt: new Date(),
    });

    // Notify document panels so they re-classify the point into the correct tab.
    window.dispatchEvent(
      new CustomEvent('location:enriched', {
        detail: {
          id: locationId,
          patch: {
            enriched_data: enrichedData,
            enrichment_status: 'enriched',
            place_type: enrichedData.clasificacion?.codigo || location.placeType || null,
            continent: geoData.continent || location.continent || null,
            country: geoData.country || location.country || null,
            region: geoData.region || location.region || null,
          },
        },
      }),
    );

    if (focusAfter) {
      useLocationsStore.getState().setFocusedLocation(locationId);
    }

    return { success: true };
  } catch (error) {
    console.error('[triggerEnrichLocation] error:', error);
    toast.error('Error al enriquecer', { id: toastId });
    return { success: false, error: error instanceof Error ? error.message : 'unknown' };
  }
}
