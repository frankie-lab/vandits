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
import { enrichmentFailureStore } from '@/domains/content/hooks/use-enrichment-failure';
import { parseEnrichmentError } from '@/domains/content/lib/enrichment-error-kind';
import { emitEnrichmentPhase } from '@/components/map/popup-enrichment-phase-bus';
import { inspectWgs84Coord } from '@/shared/geography/coord-validity';

export interface TriggerEnrichOptions {
  /** When true, force re-generation (semantically the popup's `regenerate`). */
  regenerate?: boolean;
  /**
   * When true, focus the location after enrichment succeeds.
   * Default: `false` — el refresco visual del popup NO depende del foco; lo
   * gestiona el contrato `location:enriched` que `LocationMap` escucha vía
   * `useCoalescedRealtimeTick`. Solo callers que realmente necesiten centrar
   * el mapa (lista general, panel de documento) deben pedir `focusAfter:true`.
   * Ver mem://logic/content/enrichment-trigger-unified.
   */
  focusAfter?: boolean;
  /** When true, bypass server-side name↔coordinate coherence validation. */
  skipValidation?: boolean;
  /**
   * P-POPUP-17: when true, do NOT emit `location:enrichment-phase` events.
   * Reserved for orchestrators (e.g. `advancePoiCurationUntilBlocked`) that
   * already own the popup operational state across multiple stages and must
   * prevent the overlay from flickering mid-pipeline.
   */
  silent?: boolean;
}

export async function triggerEnrichLocation(
  locationId: string,
  opts: TriggerEnrichOptions = {},
): Promise<{ success: boolean; error?: string }> {
  const { focusAfter = false, regenerate = false, skipValidation = false, silent = false } = opts;

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

  // P-POPUP-17 — broadcast start. Listener mounts the popup overlay only
  // if the popup of this id is currently in the DOM. `silent:true` callers
  // (orchestrators) skip this and own the operational state themselves.
  if (!silent) {
    emitEnrichmentPhase({
      id: locationId,
      phase: 'start',
      label: regenerate ? 'Re-enriqueciendo POI…' : 'Enriqueciendo POI…',
    });
  }

  try {
    let enrichedData: any = null;
    let trunkHit = false;

    // ─── 1) Tronco global: si NO es regenerate, intentar reusar ficha troncal fresca
    if (!regenerate) {
      const { data: trunkRows } = await supabase.rpc('lookup_trunk_place', {
        _latitude: location.coordinates.lat,
        _longitude: location.coordinates.lng,
        _place_type: location.placeType ?? null,
        _max_distance_meters: 250,
      });
      const trunk = Array.isArray(trunkRows) ? trunkRows[0] : null;
      if (trunk?.is_fresh && trunk?.enriched_data) {
        enrichedData = trunk.enriched_data;
        trunkHit = true;
      }
    }

    // ─── 2) Si no hubo hit (o es regenerate), llamar IA
    //
    // IMPORTANTE: NO enviamos `skipValidation: true` por defecto. El gate
    // bidireccional nombre⇄coordenadas y el detector de placeholders evasivos
    // del LLM deben correr SIEMPRE. Sólo se salta cuando ya hay un candidato
    // confirmado (Wikipedia/OSM) elegido por el usuario desde el bloque de
    // recuperación o el panel de Contexto cercano.
    if (!enrichedData) {
      const { data, error } = await supabase.functions.invoke('enrich-location', {
        body: { location, skipValidation },
      });

      if (error) throw error;

      // Helper local: persistir el fallo para que el anillo rojo se encienda
      // en el mapa y la ficha muestre el bloque de recuperación.
      const persistFailure = async (
        kind: 'coherence' | 'llm_unverifiable' | 'no_match',
        message: string,
        extras: Record<string, unknown> = {},
      ) => {
        const payload = { kind, message, ...extras };
        // 1) Marca local inmediata (anillo rojo sin esperar al servidor).
        try {
          enrichmentFailureStore.recordFailure(locationId, parseEnrichmentError(payload));
        } catch (e) {
          console.warn('[triggerEnrichLocation] failureStore.recordFailure failed', e);
        }
        // 2) Marca DB (enrichment_status='unresolved') para reflejar el estado.
        try {
          await supabase
            .from('locations')
            .update({ enrichment_status: 'unresolved', updated_at: new Date().toISOString() })
            .eq('id', locationId);
        } catch (e) {
          console.warn('[triggerEnrichLocation] mark unresolved failed', e);
        }
        // 3) Job sintético "manual single-click" para que prewarm/realtime lo
        //    reconcilien y otros tabs vean el anillo rojo.
        if (location?.documentId) {
          try {
            await supabase.from('enrichment_jobs').insert({
              document_id: location.documentId,
              status: 'completed',
              total_count: 1,
              processed_count: 0,
              error_count: 1,
              location_ids: [locationId],
              error_ids: [locationId],
              error_messages: { [locationId]: payload },
            });
          } catch (e) {
            console.warn('[triggerEnrichLocation] failure job insert failed', e);
          }
        }
      };

      if (data && data.success === false && data.reason === 'name_coordinate_mismatch') {
        toast.dismiss(toastId);
        const mismatchKind: 'name' | 'coordinate' = data.mismatchKind === 'coordinate' ? 'coordinate' : 'name';
        await persistFailure('coherence', data.message ?? 'Nombre y coordenadas no coinciden', {
          mismatchKind,
          candidates: data.nearbyCandidates ?? [],
          nameLocation: data.nameLocation ?? null,
          providedName: data.providedName ?? location.name,
        });
        // Solo abrimos el panel de contexto cercano si NO hay candidatos.
        // Si los hay, el usuario los resolverá desde el popup (UnenrichedRecoveryBlock).
        if (!Array.isArray(data.nearbyCandidates) || data.nearbyCandidates.length === 0) {
          window.dispatchEvent(new CustomEvent('open-nearby-context', {
            detail: {
              locationId,
              location,
              reason: 'name-coordinate-mismatch',
              providedName: data.providedName,
              nameLocation: data.nameLocation,
              nearbyCandidates: [],
            },
          }));
        }
        const km = data.nameLocation?.distanceKm ?? '?';
        toast.info(
          mismatchKind === 'coordinate'
            ? `"${data.providedName}" está a ${km} km. Revisa si las coordenadas son correctas.`
            : `"${data.providedName}" está a ${km} km de estas coordenadas. Selecciona la identidad correcta.`,
          { duration: 6000 },
        );
        return { success: false, error: 'name_coordinate_mismatch' };
      }

      if (data && data.success === false && data.reason === 'llm_unverifiable') {
        toast.dismiss(toastId);
        await persistFailure('llm_unverifiable', data.message ?? 'No verificable', {
          candidates: data.nearbyCandidates ?? [],
          providedName: data.providedName ?? location.name,
        });
        toast.warning(
          `No se pudo verificar la identidad de "${location.name}". Revísalo desde el bloque de recuperación.`,
          { duration: 6000 },
        );
        return { success: false, error: 'llm_unverifiable' };
      }

      if (!data?.success || !data?.data) {
        const message = data?.error || data?.message || 'Sin datos de enriquecimiento';
        await persistFailure('no_match', message);
        throw new Error(message);
      }

      enrichedData = data.data;
    }

    // Preserve user-controlled fields that the AI must never touch.
    // `etiquetas_personales` are owned by the user (manual import tags, bulk
    // actions). The IA prompt explicitly excludes them, so they would be lost
    // on every re-enrichment if we don't merge them back in.
    const existingEnriched = (location.enrichedData ?? {}) as Record<string, any>;
    const existingPersonalTags = Array.isArray(existingEnriched.etiquetas_personales)
      ? existingEnriched.etiquetas_personales
      : [];
    if (existingPersonalTags.length > 0) {
      const incoming = Array.isArray(enrichedData.etiquetas_personales)
        ? enrichedData.etiquetas_personales
        : [];
      const merged = Array.from(new Set([...existingPersonalTags, ...incoming]));
      enrichedData.etiquetas_personales = merged;
    }

    const geoData = enrichedData._geocoded || {};

    // Resolve FKs from strings so the point grows into the normalized model.
    const fks = await resolveAllFks({
      continent: geoData.continent || location.continent,
      country: geoData.country || location.country,
      region: geoData.region || location.region,
      zone: geoData.zone || location.zone,
      placeTypeCode: enrichedData.clasificacion?.codigo || location.placeType,
    });

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
        type_id: fks.type_id,
        continent_id: fks.continent_id,
        country_id: fks.country_id,
        region_id: fks.region_id,
        zone_id: fks.zone_id,
        admin3_id: fks.admin3_id,
        locality_id: fks.locality_id,
        sublocality_id: fks.sublocality_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', locationId);

    if (updateError) throw updateError;

    // ─── 3) Tronco: si se generó nuevo (o regenerate), upsert al tronco global
    if (!trunkHit) {
      try {
        await supabase.rpc('upsert_trunk_place', {
          _name: location.name,
          _latitude: location.coordinates.lat,
          _longitude: location.coordinates.lng,
          _place_type: enrichedData.clasificacion?.codigo || location.placeType || null,
          _enriched_data: enrichedData,
        });
      } catch (e) {
        console.warn('[triggerEnrichLocation] trunk upsert failed:', e);
      }
    }

    toast.success(trunkHit ? `${successMsg} (desde tronco)` : successMsg, { id: toastId });

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
  } finally {
    // P-POPUP-17 — always release the operational overlay paired with the
    // `start` we emitted above, regardless of success / failure / branch.
    if (!silent) {
      emitEnrichmentPhase({ id: locationId, phase: 'end' });
    }
  }
}
