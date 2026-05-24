/**
 * advance-poi-curation — P-POI-CURATION-3 (Fase 1)
 *
 * Single-source orchestrator that turns the footer "Validar geografía" action
 * into a continuous curation pipeline:
 *
 *   validate-geo → recompute → (enrich if needed) → recompute → STOP
 *
 * The popup mutates in-place via P-POPUP-16 (`setPopupOperationalState`); no
 * new UI, no popup remount, no wizard. The orchestrator stops only at REAL
 * blockers (geo-conflict / needs-identity / enrichment-ambiguous /
 * manual-rating) or sano final (POI-9 / POI-10).
 *
 * Heal-rings, _enqueue_geo_repair and repair batch are FUERA DE SCOPE de la
 * fase 1 — quedan para P-POI-CURATION-3.1.
 *
 * Ver `mem://logic/poi/curation-advance-pipeline` y `docs/contracts/poi-curation-levels.md`.
 */

import { supabase } from '@/integrations/supabase/client';
import { useLocationsStore } from '@/domains/content';
import { useGeocodingJobStore } from '@/stores/geocoding-job-store';
import {
  getPoiCurationLevel,
  type PoiCurationLevel,
} from '@/domains/content/lib/poi-curation-level';
import { isPointEnriched } from '@/domains/content/lib/point-visual-state';
import { triggerEnrichLocation } from '@/domains/content/lib/enrich-location';
import { dbLocationToGeoLocation } from '@/domains/content/lib/db-transformers';
import { setPopupOperationalState } from '@/components/map/popup-operational-state';
import type { GeoLocation } from '@/types/location';

export type CurationStage = 'validate-geo' | 'enrich' | 'recompute';

export type CurationBlocker =
  | 'geo-conflict'
  | 'needs-identity'
  | 'enrichment-ambiguous'
  | 'manual-rating'
  | 'none';

export type CurationTrigger = 'validate-geo';

export interface CurationAdvanceResult {
  startLevel: PoiCurationLevel;
  endLevel: PoiCurationLevel;
  stagesRun: CurationStage[];
  blocker: CurationBlocker;
  message: string;
}

const GEOCODING_TIMEOUT_MS = 45_000;

const MESSAGES = {
  validated: 'Geografía validada',
  enriched: 'POI enriquecido',
  fullyCurated: 'POI completamente curado',
  geoConflict: 'Se requiere resolución manual: conflicto geográfico',
  needsIdentity: 'Se requiere resolución manual: identificar el POI',
  ambiguous: 'Se requiere resolución manual: datos ambiguos',
  manualRating: 'Pendiente de tu valoración',
  noChange: 'Geografía validada',
} as const;

function findLocation(locationId: string): GeoLocation | undefined {
  const documents = useLocationsStore.getState().documents;
  for (const doc of documents) {
    const loc = doc.locations.find((l) => l.id === locationId);
    if (loc) return loc;
  }
  return undefined;
}

/**
 * Re-hydrate a single POI from `v_locations_resolved` and push it into the
 * store. Cheaper than `loadFromDatabase` and deterministic for the orchestrator.
 */
async function refetchAndApply(locationId: string): Promise<GeoLocation | undefined> {
  try {
    const { data, error } = await supabase
      .from('v_locations_resolved' as any)
      .select('*')
      .eq('id', locationId)
      .maybeSingle();
    if (error || !data) return findLocation(locationId);
    const fresh = dbLocationToGeoLocation(data);
    useLocationsStore.getState().updateLocation(locationId, {
      enrichedData: fresh.enrichedData,
      enrichmentStatus: fresh.enrichmentStatus,
      placeType: fresh.placeType,
      continent: fresh.continent,
      country: fresh.country,
      region: fresh.region,
      zone: fresh.zone,
      geoHealth: fresh.geoHealth,
      updatedAt: fresh.updatedAt,
    });
    return findLocation(locationId);
  } catch {
    return findLocation(locationId);
  }
}

/**
 * Resolve when the geocoding-job store's `lastResult` reflects the completion
 * of the job we just launched. Reuses the existing realtime + poll mechanism
 * in `useGeocodingJobStore` — no new channel, no new poll loop.
 */
function waitForGeocodingJobCompletion(timeoutMs = GEOCODING_TIMEOUT_MS): Promise<
  'completed' | 'failed' | 'canceled' | 'timeout'
> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let settled = false;
    const finish = (r: 'completed' | 'failed' | 'canceled' | 'timeout') => {
      if (settled) return;
      settled = true;
      unsub();
      clearTimeout(timer);
      resolve(r);
    };

    const unsub = useGeocodingJobStore.subscribe((state, prev) => {
      const lr = state.lastResult;
      if (!lr) return;
      if (lr.finishedAt <= startedAt) return; // stale
      if (prev?.lastResult?.finishedAt === lr.finishedAt) return;
      finish(lr.status);
    });

    const timer = setTimeout(() => finish('timeout'), timeoutMs);
  });
}

function classifyExisting(loc: GeoLocation | undefined): {
  level: PoiCurationLevel;
  blocker: CurationBlocker;
  message: string;
} {
  if (!loc) {
    return { level: 0, blocker: 'needs-identity', message: MESSAGES.needsIdentity };
  }
  const verdict = getPoiCurationLevel(loc);
  const level = verdict.level;

  if (loc.geoHealth === 'broken') {
    return { level: 3, blocker: 'geo-conflict', message: MESSAGES.geoConflict };
  }
  if (level === 0) {
    return { level, blocker: 'needs-identity', message: MESSAGES.needsIdentity };
  }
  if (level === 10) {
    return { level, blocker: 'none', message: MESSAGES.fullyCurated };
  }
  if (level === 9) {
    const visited = loc.customData?.visited === 'true';
    const rated = Number(loc.customData?.user_rating ?? 0) > 0;
    if (visited && !rated) {
      return { level, blocker: 'manual-rating', message: MESSAGES.manualRating };
    }
    return { level, blocker: 'none', message: MESSAGES.enriched };
  }
  // POI-1 / POI-5 — sin blocker definitivo aún; el caller decide si seguir.
  return { level, blocker: 'none', message: MESSAGES.validated };
}

/**
 * Orchestrate `validate-geo` → enrich → recompute, in-place over the popup.
 */
export async function advancePoiCurationUntilBlocked(
  locationId: string,
  trigger: CurationTrigger,
  popupId: string,
): Promise<CurationAdvanceResult> {
  void trigger; // fase 1: único trigger soportado

  const stagesRun: CurationStage[] = [];

  // Pre-recompute: nivel inicial.
  let loc = findLocation(locationId);
  const startLevel = loc ? getPoiCurationLevel(loc).level : 0;

  // Si el POI ya está en un estado terminal/bloqueante, devolver sin trabajo.
  const preCheck = classifyExisting(loc);
  if (
    preCheck.level === 10 ||
    preCheck.level === 9 ||
    preCheck.blocker !== 'none'
  ) {
    return {
      startLevel,
      endLevel: preCheck.level,
      stagesRun,
      blocker: preCheck.blocker,
      message: preCheck.message,
    };
  }

  // ── Stage 1: validate-geo ──
  setPopupOperationalState(popupId, 'loading', { label: 'Validando geografía…' });
  stagesRun.push('validate-geo');

  try {
    useGeocodingJobStore.getState().clearLastResult();
    const waiter = waitForGeocodingJobCompletion();
    await useGeocodingJobStore.getState().start(1, {
      label: `Validar geografía · ${loc?.name ?? ''}`.trim(),
      mode: 'reconcile',
      locationIds: [locationId],
      source: 'popup_validate_geo',
    });
    const outcome = await waiter;
    if (outcome === 'failed') {
      return {
        startLevel,
        endLevel: startLevel,
        stagesRun,
        blocker: 'enrichment-ambiguous',
        message: MESSAGES.ambiguous,
      };
    }
    if (outcome === 'canceled' || outcome === 'timeout') {
      return {
        startLevel,
        endLevel: startLevel,
        stagesRun,
        blocker: 'enrichment-ambiguous',
        message: MESSAGES.ambiguous,
      };
    }
  } catch {
    return {
      startLevel,
      endLevel: startLevel,
      stagesRun,
      blocker: 'enrichment-ambiguous',
      message: MESSAGES.ambiguous,
    };
  }

  // ── Stage 2: recompute ──
  stagesRun.push('recompute');
  loc = await refetchAndApply(locationId);
  const afterGeo = classifyExisting(loc);

  // Bloqueos duros que aparecen tras validate-geo.
  if (afterGeo.blocker === 'geo-conflict' || afterGeo.blocker === 'needs-identity') {
    return {
      startLevel,
      endLevel: afterGeo.level,
      stagesRun,
      blocker: afterGeo.blocker,
      message: afterGeo.message,
    };
  }

  // Ya enriquecido + sano → no hay nada más que hacer en fase 1.
  if (loc && isPointEnriched(loc) && (afterGeo.level === 9 || afterGeo.level === 10)) {
    return {
      startLevel,
      endLevel: afterGeo.level,
      stagesRun,
      blocker: afterGeo.blocker,
      message: afterGeo.message,
    };
  }

  // Geo no quedó OK → fase 1 no encadena enrich automático sobre geografía
  // parcial/empty/stale_name (heal-rings es 3.1). Stop con mensaje neutro.
  if (loc?.geoHealth !== 'ok') {
    return {
      startLevel,
      endLevel: afterGeo.level,
      stagesRun,
      blocker: 'none',
      message: MESSAGES.validated,
    };
  }

  // Geo OK + no enriquecido → encadenar enrich.
  if (loc && !isPointEnriched(loc)) {
    setPopupOperationalState(popupId, 'loading', { label: 'Curando POI…' });
    stagesRun.push('enrich');
    let enrichResult: { success: boolean; error?: string };
    try {
      enrichResult = await triggerEnrichLocation(locationId, { regenerate: false, silent: true });
    } catch {
      enrichResult = { success: false, error: 'unknown' };
    }

    if (!enrichResult.success) {
      const ambiguous = new Set([
        'name_coordinate_mismatch',
        'llm_unverifiable',
        'no_match',
        'unknown',
      ]);
      const errKey = enrichResult.error ?? 'unknown';
      if (ambiguous.has(errKey) || errKey === 'not_found') {
        return {
          startLevel,
          endLevel: afterGeo.level,
          stagesRun,
          blocker: 'enrichment-ambiguous',
          message: MESSAGES.ambiguous,
        };
      }
      return {
        startLevel,
        endLevel: afterGeo.level,
        stagesRun,
        blocker: 'enrichment-ambiguous',
        message: MESSAGES.ambiguous,
      };
    }

    // ── Stage 3: recompute final ──
    stagesRun.push('recompute');
    loc = findLocation(locationId); // triggerEnrichLocation ya hizo updateLocation in-place
    const final = classifyExisting(loc);
    let message = final.message;
    if (final.blocker === 'none') {
      if (final.level === 10) message = MESSAGES.fullyCurated;
      else if (final.level === 9) message = MESSAGES.enriched;
      else message = MESSAGES.validated;
    }
    return {
      startLevel,
      endLevel: final.level,
      stagesRun,
      blocker: final.blocker,
      message,
    };
  }

  // Fallback defensivo.
  return {
    startLevel,
    endLevel: afterGeo.level,
    stagesRun,
    blocker: afterGeo.blocker,
    message: afterGeo.message,
  };
}
