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
// Note: resolveAllFks no longer used here — backfill-admin-fks handles
// the full canonical normalization (double Nominatim pass + placeholders).
import { geocodeLocations } from '@/shared/geography/geocode-batch';
import {
  deduplicateLocations,
  DEFAULT_DISTANCE_THRESHOLD,
  type DuplicateMatch,
} from '@/lib/duplicate-detection';
import { dbLocationToGeoLocation } from './db-transformers';
import { useLocationsStore } from '@/domains/content/store/locations-store';

/** Fetch all rows from a Supabase query bypassing the 1000-row default limit. */
async function fetchAllPaginated<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // Hard safety cap to prevent infinite loops
  while (from < 200_000) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery(from, to);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export type ProcessingStep =
  | 'geo-normalize'
  // Legacy aliases kept for event-bus backward compatibility.
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
    // ─── 1. Normalizar geografía (coords + país/región/zona) ────────
    // Paso unificado: forward-geocode puntos sin coords + reverse-geocode
    // canonical (doble pasada Nominatim + placeholders) vía
    // backfill-admin-fks. Sustituye los antiguos pasos `geocoding` +
    // `fk-resolve` que generaban jerarquías inconsistentes.
    try {
      // 1.a — puntos sin coords válidas (forward-geocode).
      const rawRows = await fetchAllPaginated<any>((from, to) =>
        supabase.from('locations').select('*').eq('document_id', docId).order('id', { ascending: true }).range(from, to),
      );
      const docLocations = rawRows.map(dbLocationToGeoLocation);

      const needsForward = docLocations.filter(
        (l) =>
          !Number.isFinite(l.coordinates.lat) ||
          !Number.isFinite(l.coordinates.lng) ||
          (l.coordinates.lat === 0 && l.coordinates.lng === 0),
      );

      // 1.b — puntos pendientes de normalización admin.
      const { count: pendingAdminCount } = await supabase
        .from('locations')
        .select('id', { count: 'exact', head: true })
        .eq('document_id', docId)
        .or('country_id.is.null,continent_id.is.null')
        .is('deleted_at', null);

      const totalForward = needsForward.length;
      const totalAdmin = pendingAdminCount ?? 0;
      const totalGeo = totalForward + totalAdmin;

      emitStep(docId, 'geo-normalize', 'running', { total: totalGeo, processed: 0 });
      // Compat con clientes legacy escuchando los nombres antiguos.
      emitStep(docId, 'geocoding', 'running', { total: totalGeo, processed: 0 });
      emitStep(docId, 'fk-resolve', 'running', { total: totalGeo, processed: 0 });

      let processedGeo = 0;

      if (totalForward > 0) {
        const { locations: geocoded, geocodedCount } = await geocodeLocations(needsForward);
        summary.geocoded = geocodedCount;
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
          processedGeo++;
          if (processedGeo % 10 === 0 || processedGeo === totalGeo) {
            emitStep(docId, 'geo-normalize', 'running', { total: totalGeo, processed: processedGeo });
            emitStep(docId, 'geocoding', 'running', { total: totalGeo, processed: processedGeo });
          }
        }
      }

      // 1.c — Reverse-geocode canonical (única vía: doble pasada
      // Nominatim, placeholders, FKs + strings cache en una sola escritura).
      if (totalAdmin > 0) {
        let processedAdmin = 0;
        let zeroProgressStreak = 0;
        const MAX_ZERO_PROGRESS = 5;
        while (processedAdmin < totalAdmin) {
          const { data, error } = await supabase.functions.invoke('backfill-admin-fks', {
            body: { limit: 25, document_id: docId, force_renormalize: true },
          });
          if (error) {
            zeroProgressStreak++;
            if (zeroProgressStreak >= MAX_ZERO_PROGRESS) break;
            continue;
          }
          const d = data as { updated?: number; failed?: number; remaining?: number } | null;
          const upd = d?.updated ?? 0;
          const failed = d?.failed ?? 0;
          processedAdmin += upd;
          summary.fkResolved += upd;
          if (typeof d?.remaining === 'number' && d.remaining === 0) {
            processedAdmin = totalAdmin;
            break;
          }
          if (upd === 0 && failed === 0) {
            zeroProgressStreak++;
            if (zeroProgressStreak >= MAX_ZERO_PROGRESS) break;
          } else {
            zeroProgressStreak = 0;
          }
          const totalProcessed = Math.min(processedGeo + processedAdmin, totalGeo);
          emitStep(docId, 'geo-normalize', 'running', { total: totalGeo, processed: totalProcessed });
          emitStep(docId, 'fk-resolve', 'running', { total: totalGeo, processed: totalProcessed });
        }
      }

      emitStep(docId, 'geo-normalize', 'done', { count: summary.geocoded + summary.fkResolved, total: totalGeo, processed: totalGeo });
      emitStep(docId, 'geocoding', 'done', { count: summary.geocoded, total: totalGeo, processed: totalGeo });
      emitStep(docId, 'fk-resolve', 'done', { count: summary.fkResolved, total: totalGeo, processed: totalGeo });
    } catch (err) {
      console.warn('[processImportedDocument] geo-normalize failed:', err);
      emitStep(docId, 'geo-normalize', 'error');
      emitStep(docId, 'geocoding', 'error');
      emitStep(docId, 'fk-resolve', 'error');
    }


    // ─── 3. Catalog match (dedup against existing approved points) ──
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        emitStep(docId, 'catalog-match', 'running', { total: 0, processed: 0 });
        // Fetch this doc's points
        const docRows = await fetchAllPaginated<any>((from, to) =>
          supabase
            .from('locations')
            .select('*')
            .eq('document_id', docId)
            .is('deleted_at', null)
            .order('id', { ascending: true })
            .range(from, to),
        );
        const docLocations: GeoLocation[] = docRows.map(dbLocationToGeoLocation);

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

        // Auto-link matches: copy canonical name + inherit enrichedData if missing.
        // IMPORTANT: do NOT auto-approve. Importaciones quedan en workspace hasta
        // que el usuario decida (Aprobar / Añadir a colección). Marcamos
        // `custom_data.duplicate_of` para que la UI muestre el badge "ya en catálogo"
        // y `applyCatalog` los excluya al aprobar masivamente.
        // Ver mem://logic/map/visibility-rule-approval-gated
        const matchIds: string[] = [];
        let processed = 0;
        for (const m of result.autoDiscarded) {
          matchIds.push(m.newLocation.id);
          const mergedCustomData = {
            ...(m.newLocation.customData ?? {}),
            duplicate_of: m.existingLocation.id,
            duplicate_of_name: m.existingLocation.name,
          };
          const updates: Record<string, unknown> = {
            name: m.existingLocation.name,
            custom_data: mergedCustomData as never,
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
      try {
        const rows = await fetchAllPaginated<any>((from, to) =>
          supabase
            .from('locations')
            .select('id, enriched_data, place_type')
            .eq('document_id', docId)
            .is('deleted_at', null)
            .order('id', { ascending: true })
            .range(from, to),
        );

        const ids = rows
          .filter((r) => {
            const ed = r.enriched_data as { descripcion?: string } | null;
            return !ed?.descripcion && r.place_type !== 'route';
          })
          .map((r) => r.id);

        emitStep(docId, 'enrich', 'running', { total: ids.length, processed: 0 });

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
        emitStep(docId, 'enrich', 'done', { count: summary.enrichQueued, total: ids.length, processed: ids.length });
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
