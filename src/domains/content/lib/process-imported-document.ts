// Domain: Content — Background processor for imported documents
//
// IMPORT-FIRST FLOW (2026-05): después de que `saveDocumentToDatabase` guarda
// los puntos en crudo (is_approved=false, sin FKs, sin matches), este helper
// orquesta TODOS los pasos opcionales en background:
//
//   1. Geocoding   → puntos sin coordenadas válidas
//   2. FK resolve  → cadena administrativa (continent..sublocality + type)
//   3. Catalog match → marca matches <250m como is_approved=true; encola
//                      posibles duplicados (250m–1km) para revisión.
//   4. Auto-enrich (opcional, si el usuario lo pidió) → batch-enrich edge fn.
//
// Cada paso emite un evento `document:processing-step` con { docId, step, status }
// para que la UI (banner del documento) refleje el progreso.
// Al finalizar marca `documents.import_status = 'confirmed'` y emite
// `document:processed` con { docId }.
//
// Helper único transversal — no duplicar esta lógica en otros componentes.
import { supabase } from '@/integrations/supabase/client';
import type { GeoLocation, KMLDocument } from '@/types/location';
import { resolveAllFks } from '@/shared/geography/resolve-admin-fks';
import { geocodeLocations } from '@/shared/geography/geocode-batch';
import {
  deduplicateLocations,
  DEFAULT_DISTANCE_THRESHOLD,
  type DuplicateMatch,
} from '@/lib/duplicate-detection';
import { dbLocationToGeoLocation } from './db-transformers';
import { useLocationsStore } from '@/domains/content/store/locations-store';

export type ProcessingStep =
  | 'geocoding'
  | 'fk-resolve'
  | 'catalog-match'
  | 'enrich';

export type StepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';

export interface ProcessOptions {
  autoEnrich?: boolean;
  /** Enrichment scope when autoEnrich is true: 'all' (default) or 'matches' */
  enrichScope?: 'all' | 'matches';
  /** Distance threshold for catalog matching, defaults to 250m */
  matchThresholdMeters?: number;
  /** Curator id forwarded to batch-enrich */
  curatorId?: string;
}

function emitStep(docId: string, step: ProcessingStep, status: StepStatus, extra?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('document:processing-step', {
      detail: { docId, step, status, ...extra },
    }),
  );
}

function emitDone(docId: string, summary: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('document:processed', { detail: { docId, ...summary } }),
  );
}

/**
 * Run all background processors for a freshly imported document.
 * Fire-and-forget from the caller.
 */
export async function processImportedDocument(
  docId: string,
  options: ProcessOptions = {},
): Promise<void> {
  const summary = {
    geocoded: 0,
    fkResolved: 0,
    matched: 0,
    pendingDuplicates: 0,
    enrichQueued: 0,
  };

  try {
    // ─── 1. Geocoding ──────────────────────────────────────────────
    try {
      const { data: rawRows } = await supabase
        .from('locations')
        .select('*')
        .eq('document_id', docId);
      const docLocations = (rawRows || []).map(dbLocationToGeoLocation);

      const needsGeocode = docLocations.filter(
        (l) =>
          !Number.isFinite(l.coordinates.lat) ||
          !Number.isFinite(l.coordinates.lng) ||
          (l.coordinates.lat === 0 && l.coordinates.lng === 0),
      );

      const totalGeo = needsGeocode.length;
      emitStep(docId, 'geocoding', 'running', { total: totalGeo, processed: 0 });

      if (totalGeo > 0) {
        const { locations: geocoded, geocodedCount } = await geocodeLocations(needsGeocode);
        summary.geocoded = geocodedCount;
        let processed = 0;
        for (const loc of geocoded) {
          if (
            Number.isFinite(loc.coordinates.lat) &&
            Number.isFinite(loc.coordinates.lng) &&
            !(loc.coordinates.lat === 0 && loc.coordinates.lng === 0)
          ) {
            await supabase
              .from('locations')
              .update({
                latitude: loc.coordinates.lat,
                longitude: loc.coordinates.lng,
                custom_data: (loc.customData || {}) as never,
              })
              .eq('id', loc.id);
          }
          processed++;
          if (processed % 10 === 0 || processed === totalGeo) {
            emitStep(docId, 'geocoding', 'running', { total: totalGeo, processed });
          }
        }
      }
      emitStep(docId, 'geocoding', 'done', { count: summary.geocoded, total: totalGeo, processed: totalGeo });
    } catch (err) {
      console.warn('[processImportedDocument] geocoding failed:', err);
      emitStep(docId, 'geocoding', 'error');
    }

    // ─── 2. FK resolve ──────────────────────────────────────────────
    try {
      const { data: rows } = await supabase
        .from('locations')
        .select('id, continent, country, region, zone, place_type')
        .eq('document_id', docId)
        .is('country_id', null);

      const totalFk = rows?.length || 0;
      emitStep(docId, 'fk-resolve', 'running', { total: totalFk, processed: 0 });

      if (rows && rows.length > 0) {
        let processed = 0;
        for (const row of rows) {
          try {
            const fks = await resolveAllFks({
              continent: row.continent || undefined,
              country: row.country || undefined,
              region: row.region || undefined,
              zone: row.zone || undefined,
              placeTypeCode: (row.place_type as string | null) || undefined,
            });
            await supabase
              .from('locations')
              .update({
                continent_id: fks.continent_id,
                country_id: fks.country_id,
                region_id: fks.region_id,
                zone_id: fks.zone_id,
                admin3_id: fks.admin3_id,
                locality_id: fks.locality_id,
                sublocality_id: fks.sublocality_id,
                type_id: fks.type_id,
              })
              .eq('id', row.id);
            summary.fkResolved++;
          } catch (e) {
            // skip individual failures
          }
          processed++;
          if (processed % 25 === 0 || processed === totalFk) {
            emitStep(docId, 'fk-resolve', 'running', { total: totalFk, processed });
          }
        }
      }
      // Best-effort kick to backfill function for points that still lack country
      // (those that arrived as lat/lng only with no string hints).
      void supabase.functions.invoke('backfill-admin-fks', { body: { limit: 200 } });
      emitStep(docId, 'fk-resolve', 'done', { count: summary.fkResolved, total: totalFk, processed: totalFk });
    } catch (err) {
      console.warn('[processImportedDocument] fk-resolve failed:', err);
      emitStep(docId, 'fk-resolve', 'error');
    }

    // ─── 3. Catalog match (dedup against existing approved points) ──
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        emitStep(docId, 'catalog-match', 'running', { total: 0, processed: 0 });
        // Fetch this doc's points
        const { data: docRows } = await supabase
          .from('locations')
          .select('*')
          .eq('document_id', docId)
          .is('deleted_at', null);
        const docLocations: GeoLocation[] = (docRows || []).map(dbLocationToGeoLocation);

        const totalMatch = docLocations.length;
        emitStep(docId, 'catalog-match', 'running', { total: totalMatch, processed: 0 });

        // Fetch user's catalog (approved + outside this doc)
        const { data: catRows } = await supabase
          .from('locations')
          .select('*')
          .eq('owner_user_id', user.id)
          .eq('is_approved', true)
          .neq('document_id', docId)
          .is('deleted_at', null)
          .limit(5000);
        const catalog: GeoLocation[] = (catRows || []).map(dbLocationToGeoLocation);

        const threshold = options.matchThresholdMeters ?? DEFAULT_DISTANCE_THRESHOLD;
        const result = deduplicateLocations(docLocations, catalog, threshold);

        // Auto-link matches: copy canonical name, mark approved, inherit enrichedData if missing
        const matchIds: string[] = [];
        let processed = 0;
        for (const m of result.autoDiscarded) {
          matchIds.push(m.newLocation.id);
          const updates: Record<string, unknown> = {
            is_approved: true,
            name: m.existingLocation.name,
          };
          if (!m.newLocation.enrichedData && m.existingLocation.enrichedData) {
            updates.enriched_data = m.existingLocation.enrichedData as never;
          }
          await supabase.from('locations').update(updates as never).eq('id', m.newLocation.id);
          processed++;
          if (processed % 10 === 0) {
            emitStep(docId, 'catalog-match', 'running', { total: totalMatch, processed: matchIds.length });
          }
        }

        summary.matched = matchIds.length;
        summary.pendingDuplicates = result.possibleDuplicates.length;

        if (result.possibleDuplicates.length > 0) {
          // Push to in-memory queue for the user to review later
          try {
            useLocationsStore.getState().addPendingDuplicates(
              result.possibleDuplicates as DuplicateMatch[],
            );
          } catch {
            /* store may not be ready */
          }
        }
        emitStep(docId, 'catalog-match', 'done', {
          matched: summary.matched,
          pending: summary.pendingDuplicates,
          total: totalMatch,
          processed: totalMatch,
          count: summary.matched,
        });
      } else {
        emitStep(docId, 'catalog-match', 'done', { count: 0, total: 0, processed: 0 });
      }
    } catch (err) {
      console.warn('[processImportedDocument] catalog-match failed:', err);
      emitStep(docId, 'catalog-match', 'error');
    }

    // ─── 4. Auto-enrich (opcional) ──────────────────────────────────
    if (options.autoEnrich) {
      emitStep(docId, 'enrich', 'running');
      try {
        const { data: rows } = await supabase
          .from('locations')
          .select('id, enriched_data, place_type')
          .eq('document_id', docId)
          .is('deleted_at', null);

        const ids = (rows || [])
          .filter((r) => {
            const ed = r.enriched_data as { descripcion?: string } | null;
            return !ed?.descripcion && r.place_type !== 'route';
          })
          .map((r) => r.id);

        if (ids.length > 0) {
          await supabase.functions.invoke('batch-enrich', {
            body: {
              action: 'start',
              documentId: docId,
              locationIds: ids,
              curatorId: options.curatorId,
            },
          });
          summary.enrichQueued = ids.length;
        }
        emitStep(docId, 'enrich', 'done', { count: summary.enrichQueued });
      } catch (err) {
        console.warn('[processImportedDocument] enrich failed:', err);
        emitStep(docId, 'enrich', 'error');
      }
    } else {
      emitStep(docId, 'enrich', 'skipped');
    }
  } finally {
    // Mark document as confirmed regardless of partial failures
    await supabase
      .from('documents')
      .update({ import_status: 'confirmed' } as never)
      .eq('id', docId);

    emitDone(docId, summary);
  }
}
